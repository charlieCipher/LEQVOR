begin;
create table public.record_revision_history (
 record_id uuid not null, owner_id uuid not null, vault_id uuid not null,
 revision bigint not null check(revision>0), captured_at timestamptz not null default now(),
 snapshot jsonb not null, files jsonb not null default '[]',
 primary key(record_id,revision),
 foreign key(record_id,owner_id,vault_id) references public.records(id,owner_id,vault_id) on delete cascade
);
alter table public.record_revision_history enable row level security;
alter table public.record_revision_history force row level security;
revoke all on public.record_revision_history from public,anon,authenticated;
grant select on public.record_revision_history to authenticated;
create policy owner_read on public.record_revision_history for select to authenticated using(owner_id=auth.uid());
-- The trigger alone appends revisions. Clients cannot insert, rewrite or delete history.
create function public.capture_record_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.records where id=new.id) then
 insert into public.record_revision_history(record_id,owner_id,vault_id,revision,snapshot,files)
 values(new.id,new.owner_id,new.vault_id,new.revision,to_jsonb(new),
 coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.record_files f where f.record_id=new.id),'[]'));
 end if;
 return null;
end $$;
revoke all on function public.capture_record_revision() from public,anon,authenticated;
-- Deferred capture includes attachments committed with the record in the same transaction.
create constraint trigger capture_record_revision after insert or update on public.records
 deferrable initially deferred for each row execute function public.capture_record_revision();
-- Only the current revision can be preserved for records predating this migration.
insert into public.record_revision_history(record_id,owner_id,vault_id,revision,snapshot,files)
select r.id,r.owner_id,r.vault_id,r.revision,to_jsonb(r),coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.record_files f where f.record_id=r.id),'[]') from public.records r;
create function public.save_vnext_document(record_data jsonb, expected_revision bigint, file_data jsonb, entity_data jsonb, edge_data jsonb)
returns public.records language plpgsql security invoker set search_path='' as $$
declare saved public.records; f public.record_files; n public.continuity_entities; e public.continuity_edges; item jsonb;
begin
 if auth.uid() is null or (record_data->>'owner_id')::uuid is distinct from auth.uid() then raise exception 'Owner mismatch' using errcode='42501';end if;
 if jsonb_typeof(entity_data) is distinct from 'array' or jsonb_typeof(edge_data) is distinct from 'array' or jsonb_array_length(entity_data)>251 or jsonb_array_length(edge_data)>250 then raise exception 'Invalid graph bundle';end if;
 if expected_revision is null then
  saved:=public.save_v5_record_bundle(record_data,file_data);
 else
  saved:=public.update_v5_record((record_data->>'id')::uuid,expected_revision,record_data);
  if file_data is not null then
   f:=jsonb_populate_record(null::public.record_files,file_data);
   if f.owner_id is distinct from auth.uid() or f.record_id is distinct from saved.id or f.vault_id is distinct from saved.vault_id then raise exception 'File mismatch' using errcode='42501';end if;
   insert into public.record_files(id,record_id,owner_id,vault_id,encrypted_filename,wrapped_file_dek,storage_path,crypto_version)
   values(f.id,f.record_id,f.owner_id,f.vault_id,f.encrypted_filename,f.wrapped_file_dek,f.storage_path,f.crypto_version);
  end if;
 end if;
 for item in select value from jsonb_array_elements(entity_data) loop
  n:=jsonb_populate_record(null::public.continuity_entities,item);
  if n.owner_id is distinct from auth.uid() or n.vault_id is distinct from saved.vault_id then raise exception 'Entity mismatch' using errcode='42501';end if;
  insert into public.continuity_entities(id,owner_id,vault_id,entity_type,record_id,person_id)
  values(n.id,n.owner_id,n.vault_id,n.entity_type,n.record_id,n.person_id) on conflict(id) do nothing;
  if not exists(select 1 from public.continuity_entities x where x.id=n.id and x.owner_id=n.owner_id and x.vault_id=n.vault_id and x.entity_type=n.entity_type) then raise exception 'Entity unavailable or type conflict' using errcode='42501';end if;
 end loop;
 if not exists(select 1 from public.continuity_entities where id=saved.id and owner_id=auth.uid() and vault_id=saved.vault_id and entity_type='DOCUMENT') then raise exception 'Document entity required';end if;
 delete from public.continuity_edges where managed_record_id=saved.id and owner_id=auth.uid();
 for item in select value from jsonb_array_elements(edge_data) loop
  e:=jsonb_populate_record(null::public.continuity_edges,item);
  if e.owner_id is distinct from auth.uid() or e.vault_id is distinct from saved.vault_id or e.managed_record_id is distinct from saved.id or (e.from_entity_id is distinct from saved.id and e.to_entity_id is distinct from saved.id) then raise exception 'Edge mismatch' using errcode='42501';end if;
  insert into public.continuity_edges(id,owner_id,vault_id,from_entity_id,to_entity_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version,managed_record_id)
  values(e.id,e.owner_id,e.vault_id,e.from_entity_id,e.to_entity_id,e.encrypted_metadata,e.encrypted_payload,e.wrapped_dek,e.crypto_version,e.managed_record_id);
 end loop;
 return saved;
end $$;
revoke all on function public.save_vnext_document(jsonb,bigint,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_vnext_document(jsonb,bigint,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
