-- Encrypted owner-authored planning only. No activation or recipient permissions.
begin;
create table public.verification_policies (
 id uuid primary key,
 owner_id uuid not null,
 vault_id uuid not null,
 encrypted_metadata jsonb not null check(public.v5_valid_ciphertext(encrypted_metadata)),
 encrypted_payload jsonb not null check(public.v5_valid_ciphertext(encrypted_payload)),
 wrapped_dek jsonb not null check(public.v5_valid_ciphertext(wrapped_dek)),
 crypto_version text not null check(crypto_version='leqvor-v5'),
 created_at timestamptz not null default now(),
 unique(id,owner_id,vault_id),
 foreign key(vault_id,owner_id) references public.vaults(id,owner_id) on delete cascade
);
create table public.trigger_rules (
 id uuid primary key,
 owner_id uuid not null,
 vault_id uuid not null,
 policy_id uuid not null,
 record_id uuid not null,
 status text not null default 'DRAFT' check(status='DRAFT'),
 encrypted_metadata jsonb not null check(public.v5_valid_ciphertext(encrypted_metadata)),
 encrypted_payload jsonb not null check(public.v5_valid_ciphertext(encrypted_payload)),
 wrapped_dek jsonb not null check(public.v5_valid_ciphertext(wrapped_dek)),
 crypto_version text not null check(crypto_version='leqvor-v5'),
 created_at timestamptz not null default now(),
 unique(id,owner_id,vault_id),
 foreign key(policy_id,owner_id,vault_id) references public.verification_policies(id,owner_id,vault_id) on delete cascade,
 foreign key(record_id,owner_id,vault_id) references public.records(id,owner_id,vault_id) on delete cascade
);
create table public.trigger_review_entries (
 id uuid primary key,
 owner_id uuid not null,
 vault_id uuid not null,
 rule_id uuid not null,
 evidence_record_id uuid,
 encrypted_metadata jsonb not null check(public.v5_valid_ciphertext(encrypted_metadata)),
 encrypted_payload jsonb not null check(public.v5_valid_ciphertext(encrypted_payload)),
 wrapped_dek jsonb not null check(public.v5_valid_ciphertext(wrapped_dek)),
 crypto_version text not null check(crypto_version='leqvor-v5'),
 created_at timestamptz not null default now(),
 foreign key(rule_id,owner_id,vault_id) references public.trigger_rules(id,owner_id,vault_id) on delete cascade,
 -- History follows the referenced vault/record lifecycle, including deletion.
 foreign key(evidence_record_id,owner_id,vault_id) references public.records(id,owner_id,vault_id) on delete cascade
);
do $$ declare t text; begin
 foreach t in array array['verification_policies','trigger_rules','trigger_review_entries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('create policy owner_access on public.%I for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid())',t);
  execute format('create policy owner_boundary on public.%I as restrictive for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid())',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  -- Append-only for application clients, not tamper-proof against administrators.
  execute format('grant select,insert on public.%I to authenticated',t);
  execute format('create index on public.%I(owner_id,vault_id,created_at)',t);
 end loop;
end $$;
commit;
