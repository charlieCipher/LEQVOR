begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table public.shared_file_keys (
 grant_id uuid not null references public.record_grants(id) on delete cascade,
 file_id uuid not null references public.record_files(id) on delete cascade,
 file_snapshot jsonb not null,
 recipient_wrapper jsonb not null,
 primary key(grant_id,file_id)
);
alter table public.shared_file_keys enable row level security;
alter table public.shared_file_keys force row level security;
revoke all on public.shared_file_keys from public,anon,authenticated;

-- Only the owner can attach explicitly selected files to a pending invitation.
-- A failed attachment transaction leaves no invitation: both are one RPC.
create function public.invite_v5_record_with_files(grant_data jsonb,expected_revision bigint,recipient_key jsonb,file_keys jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation uuid; entry jsonb; source public.record_files; pub jsonb;
begin
 if jsonb_typeof(file_keys) is distinct from 'array' or jsonb_array_length(file_keys)>20 then
  raise exception 'Invalid selected file list' using errcode='22023';end if;
 invitation:=public.invite_v5_record(grant_data,expected_revision,recipient_key);
 for entry in select * from jsonb_array_elements(file_keys) loop
  select * into source from public.record_files where id=(entry->>'file_id')::uuid and record_id=(grant_data->>'record_id')::uuid and owner_id=auth.uid() and vault_id=(grant_data->>'vault_id')::uuid for share;
  if source.id is null then raise exception 'Selected file unavailable' using errcode='42501';end if;
  pub:=entry->'sender_public_material';
  if entry->>'grant_id' is distinct from invitation::text or entry->>'record_id' is distinct from source.record_id::text
  or entry->>'owner_id' is distinct from auth.uid()::text or entry->>'vault_id' is distinct from source.vault_id::text
  or entry->>'recipient_id' is distinct from grant_data->>'recipient_id' or entry->>'crypto_version' is distinct from 'leqvor-v5'
  or entry - array['grant_id','file_id','record_id','owner_id','vault_id','recipient_id','crypto_version','salt','sender_public_material','encrypted_file_key'] <> '{}'::jsonb
  or coalesce(entry->>'salt','') !~ '^[A-Za-z0-9+/]{22}==$' or not public.v5_valid_ciphertext(entry->'encrypted_file_key')
  or jsonb_typeof(pub) is distinct from 'object' or pub->>'kty' is distinct from 'EC' or pub->>'crv' is distinct from 'P-256'
  or pub - array['kty','crv','x','y','key_ops','ext'] <> '{}'::jsonb
  or coalesce(pub->>'x','') !~ '^[A-Za-z0-9_-]{43}$' or coalesce(pub->>'y','') !~ '^[A-Za-z0-9_-]{43}$'
  then raise exception 'Invalid file wrapper' using errcode='22023';end if;
  insert into public.shared_file_keys(grant_id,file_id,file_snapshot,recipient_wrapper)
  values(invitation,source.id,jsonb_build_object('id',source.id,'record_id',source.record_id,'owner_id',source.owner_id,'vault_id',source.vault_id,'crypto_version',source.crypto_version,'encrypted_filename',source.encrypted_filename,'storage_path',source.storage_path),entry);
 end loop;
 return invitation;
end $$;

create function public.read_v5_shared_file(target uuid,selected_file uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item public.shared_file_keys; bundle jsonb;
begin
 bundle:=public.read_v5_share(target);
 select * into item from public.shared_file_keys where grant_id=target and file_id=selected_file;
 if item.grant_id is null then raise exception 'Selected file unavailable' using errcode='42501';end if;
 return jsonb_build_object('grant',bundle->'grant','file',item.file_snapshot,'file_grant',item.recipient_wrapper);
end $$;

create function public.list_v5_shared_files(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.read_v5_share(target);
 return (select coalesce(jsonb_agg(jsonb_build_object('file_id',file_id)), '[]'::jsonb) from public.shared_file_keys where grant_id=target);
end $$;

revoke all on function public.invite_v5_record_with_files(jsonb,bigint,jsonb,jsonb),public.read_v5_shared_file(uuid,uuid),public.list_v5_shared_files(uuid) from public,anon;
grant execute on function public.invite_v5_record_with_files(jsonb,bigint,jsonb,jsonb),public.read_v5_shared_file(uuid,uuid),public.list_v5_shared_files(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
