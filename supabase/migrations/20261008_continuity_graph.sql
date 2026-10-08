-- Additive vNext index. Existing records and trusted_people remain authoritative.
-- Graph membership does NOT grant access or activate record_grants.
begin;
alter table public.trusted_people add constraint trusted_people_graph_identity unique(id,owner_id,vault_id);
create table public.continuity_entities (
 id uuid primary key,
 owner_id uuid not null,
 vault_id uuid not null,
 entity_type text not null check(entity_type in ('PERSON','ASSET','DOCUMENT','POLICY','INSTRUCTION','OTHER')),
 record_id uuid,
 person_id uuid,
 created_at timestamptz not null default now(),
 unique(id,owner_id,vault_id),
 foreign key(vault_id,owner_id) references public.vaults(id,owner_id) on delete cascade,
 foreign key(record_id,owner_id,vault_id) references public.records(id,owner_id,vault_id) on delete cascade,
 foreign key(person_id,owner_id,vault_id) references public.trusted_people(id,owner_id,vault_id) on delete cascade,
 check ((entity_type='PERSON' and person_id is not null and record_id is null and id=person_id)
     or (entity_type<>'PERSON' and record_id is not null and person_id is null and id=record_id))
);
create table public.continuity_edges (
 id uuid primary key,
 owner_id uuid not null,
 vault_id uuid not null,
 from_entity_id uuid not null,
 to_entity_id uuid not null,
 encrypted_metadata jsonb not null check(public.v5_valid_ciphertext(encrypted_metadata)),
 encrypted_payload jsonb not null check(public.v5_valid_ciphertext(encrypted_payload)),
 wrapped_dek jsonb not null check(public.v5_valid_ciphertext(wrapped_dek)),
 crypto_version text not null check(crypto_version='leqvor-v5'),
 created_at timestamptz not null default now(),
 foreign key(from_entity_id,owner_id,vault_id) references public.continuity_entities(id,owner_id,vault_id) on delete cascade,
 foreign key(to_entity_id,owner_id,vault_id) references public.continuity_entities(id,owner_id,vault_id) on delete cascade,
 check(from_entity_id<>to_entity_id)
);
create index continuity_entities_vault on public.continuity_entities(owner_id,vault_id);
create index continuity_edges_from on public.continuity_edges(from_entity_id,owner_id,vault_id);
create index continuity_edges_to on public.continuity_edges(to_entity_id,owner_id,vault_id);
-- Relationships are immutable: replace an edge rather than rewriting its identity.
do $$ declare t text; begin
 foreach t in array array['continuity_entities','continuity_edges'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('create policy owner_access on public.%I for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid())',t);
  execute format('create policy owner_boundary on public.%I as restrictive for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid())',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,delete on public.%I to authenticated',t);
 end loop;
end $$;
commit;
