begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Selected, immutable record revisions. No recipient policy is added to the
-- owner's vault, records, files, people, graph or revision-history tables.
alter table public.record_grants add column crypto_version text;
alter table public.record_grants add column salt text;
alter table public.record_grants add column record_revision bigint;
alter table public.record_grants add column record_snapshot jsonb;
alter table public.record_grants add column expires_at timestamptz;

create function public.v5_recent_sharing_auth() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method
   where method->>'method' in ('password','totp')
   and (method->>'timestamp')::bigint between extract(epoch from now())::bigint-300 and extract(epoch from now())::bigint+30)
 and (not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') or coalesce(auth.jwt()->>'aal'='aal2',false));
$$;
revoke all on function public.v5_recent_sharing_auth() from public,anon,authenticated;

create function public.invite_v5_record(grant_data jsonb, expected_revision bigint, recipient_key jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare source public.records; recipient uuid; pub jsonb; invitation uuid;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 select * into source from public.records where id=(grant_data->>'record_id')::uuid and owner_id=auth.uid() for update;
 if source.id is null or source.revision is distinct from expected_revision then raise exception 'Record changed or unavailable' using errcode='40001';end if;
 -- Serialize an owner's invitation creation and bound outstanding snapshots.
 perform 1 from public.vaults where id=source.vault_id and owner_id=auth.uid() for update;
 if (select count(*) from public.record_grants where owner_id=auth.uid() and status in ('pending','active') and expires_at>now())>=100 then
  raise exception 'Outstanding share limit reached' using errcode='22023';end if;
 recipient:=(grant_data->>'recipient_id')::uuid;
 if recipient is null or recipient=auth.uid() then raise exception 'Invalid recipient' using errcode='22023';end if;
 select public_key into pub from public.user_sharing_keys where owner_id=recipient;
 if pub is null or pub->>'kty' is distinct from recipient_key->>'kty' or pub->>'crv' is distinct from recipient_key->>'crv'
 or pub->>'x' is distinct from recipient_key->>'x' or pub->>'y' is distinct from recipient_key->>'y' then
  raise exception 'Recipient key unavailable or changed' using errcode='22023';end if;
 if grant_data->>'owner_id' is distinct from auth.uid()::text or grant_data->>'vault_id' is distinct from source.vault_id::text
 or grant_data->>'permissions' is distinct from 'view' or grant_data->>'grant_version' is distinct from '1'
 or grant_data->>'crypto_version' is distinct from 'leqvor-v5'
 or coalesce(grant_data->>'salt','') !~ '^[A-Za-z0-9+/]{22}==$'
 or not public.v5_valid_ciphertext(grant_data->'encrypted_record_key')
 or grant_data->'sender_public_material'->>'kty' is distinct from 'EC'
 or grant_data->'sender_public_material'->>'crv' is distinct from 'P-256'
 or grant_data->'sender_public_material' ? 'd'
 or (grant_data->'sender_public_material') - array['kty','crv','x','y','key_ops','ext'] <> '{}'::jsonb
 or coalesce(grant_data->'sender_public_material'->>'x','') !~ '^[A-Za-z0-9_-]{43}$'
 or coalesce(grant_data->'sender_public_material'->>'y','') !~ '^[A-Za-z0-9_-]{43}$'
 then raise exception 'Invalid encrypted grant' using errcode='22023';end if;
 invitation:=(grant_data->>'id')::uuid;
 insert into public.record_grants(id,record_id,owner_id,vault_id,recipient_id,encrypted_record_key,sender_public_material,permissions,grant_version,status,crypto_version,salt,record_revision,record_snapshot,expires_at)
 values(invitation,source.id,auth.uid(),source.vault_id,recipient,grant_data->'encrypted_record_key',grant_data->'sender_public_material','view',1,'pending','leqvor-v5',grant_data->>'salt',source.revision,
 jsonb_build_object('id',source.id,'owner_id',source.owner_id,'vault_id',source.vault_id,'crypto_version',source.crypto_version,'revision',source.revision,'encrypted_metadata',source.encrypted_metadata,'encrypted_payload',source.encrypted_payload),now()+interval '30 days');
 return invitation;
end $$;

create function public.list_v5_shares() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'record_id',g.record_id,'owner_id',g.owner_id,'vault_id',g.vault_id,'recipient_id',g.recipient_id,'status',case when g.expires_at<=now() and g.status<>'revoked' then 'expired' else g.status end,'record_revision',g.record_revision,'expires_at',g.expires_at,'permissions',g.permissions,'grant_version',g.grant_version,'crypto_version',g.crypto_version,'created_at',g.created_at)), '[]'::jsonb)
 from (select * from public.record_grants where (owner_id=auth.uid() or recipient_id=auth.uid()) and crypto_version='leqvor-v5' order by case when status in ('pending','active') and expires_at>now() then 0 else 1 end,created_at desc limit 100) g;
$$;

create function public.accept_v5_share(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 update public.record_grants set status='active' where id=target and recipient_id=auth.uid() and status='pending' and expires_at>now() and crypto_version='leqvor-v5';
 if not found then raise exception 'Invitation unavailable' using errcode='42501';end if;
end $$;

create function public.revoke_v5_share(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 update public.record_grants set status='revoked',revoked_at=now() where id=target and owner_id=auth.uid() and status in ('pending','active') and crypto_version='leqvor-v5';
 if not found then raise exception 'Share unavailable' using errcode='42501';end if;
end $$;

create function public.read_v5_share(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.record_grants;
begin
 select * into g from public.record_grants where id=target and recipient_id=auth.uid() and status='active' and expires_at>now() and crypto_version='leqvor-v5';
 if g.id is null then raise exception 'Share unavailable' using errcode='42501';end if;
 return jsonb_build_object('grant',jsonb_build_object('id',g.id,'record_id',g.record_id,'owner_id',g.owner_id,'vault_id',g.vault_id,'recipient_id',g.recipient_id,'encrypted_record_key',g.encrypted_record_key,'sender_public_material',g.sender_public_material,'salt',g.salt,'permissions',g.permissions,'grant_version',g.grant_version,'crypto_version',g.crypto_version),'record',g.record_snapshot);
end $$;

revoke all on function public.invite_v5_record(jsonb,bigint,jsonb),public.list_v5_shares(),public.accept_v5_share(uuid),public.revoke_v5_share(uuid),public.read_v5_share(uuid) from public,anon;
grant execute on function public.invite_v5_record(jsonb,bigint,jsonb),public.list_v5_shares(),public.accept_v5_share(uuid),public.revoke_v5_share(uuid),public.read_v5_share(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
