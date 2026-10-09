begin;
set local lock_timeout='5s';
create table public.review_signing_keys (
 id uuid primary key,
 owner_id uuid not null unique,
 vault_id uuid not null,
 public_key jsonb not null,
 encrypted_metadata jsonb not null check(public.v5_valid_ciphertext(encrypted_metadata)),
 encrypted_payload jsonb not null check(public.v5_valid_ciphertext(encrypted_payload)),
 wrapped_dek jsonb not null check(public.v5_valid_ciphertext(wrapped_dek)),
 crypto_version text not null check(crypto_version='leqvor-v5'),
 foreign key(vault_id,owner_id) references public.vaults(id,owner_id) on delete cascade
);
alter table public.review_signing_keys enable row level security;
alter table public.review_signing_keys force row level security;
create policy owner_read on public.review_signing_keys for select to authenticated using(owner_id=auth.uid());
create policy owner_boundary on public.review_signing_keys as restrictive for select to authenticated using(owner_id=auth.uid());
revoke all on public.review_signing_keys from public,anon,authenticated;
grant select on public.review_signing_keys to authenticated;
alter table public.trigger_review_requests add column signing_key_id uuid;
alter table public.trigger_review_requests add column signing_public_key jsonb;
alter table public.trigger_reviewer_decisions add column signing_key_id uuid;
alter table public.trigger_reviewer_decisions add column signature text;

create function public.register_v5_review_signing_key(key_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pub jsonb:=key_data->'public_key';result uuid;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 if key_data->>'owner_id' is distinct from auth.uid()::text
 or not exists(select 1 from public.vaults where id=(key_data->>'vault_id')::uuid and owner_id=auth.uid()) then raise exception 'Vault unavailable' using errcode='42501';end if;
 if key_data - array['id','owner_id','vault_id','public_key','encrypted_metadata','encrypted_payload','wrapped_dek','crypto_version'] <> '{}'::jsonb
 or pub->>'kty' is distinct from 'EC' or pub->>'crv' is distinct from 'P-256' or pub ? 'd'
 or pub - array['kty','crv','x','y','key_ops','ext'] <> '{}'::jsonb
 or coalesce(pub->>'x','') !~ '^[A-Za-z0-9_-]{43}$' or coalesce(pub->>'y','') !~ '^[A-Za-z0-9_-]{43}$'
 or key_data->>'crypto_version' is distinct from 'leqvor-v5'
 or not public.v5_valid_ciphertext(key_data->'encrypted_metadata') or not public.v5_valid_ciphertext(key_data->'encrypted_payload') or not public.v5_valid_ciphertext(key_data->'wrapped_dek')
 then raise exception 'Invalid encrypted signing identity' using errcode='22023';end if;
 insert into public.review_signing_keys(id,owner_id,vault_id,public_key,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version)
 values((key_data->>'id')::uuid,auth.uid(),(key_data->>'vault_id')::uuid,pub,key_data->'encrypted_metadata',key_data->'encrypted_payload',key_data->'wrapped_dek','leqvor-v5') returning id into result;
 return result;
end $$;
-- Retain validated authorization checks as private helpers, remove unsigned routes.
alter function public.request_v5_trigger_review(uuid,uuid) rename to v5_request_trigger_review_internal;
alter function public.decide_v5_trigger_review(uuid,text) rename to v5_decide_trigger_review_internal;
revoke all on function public.v5_request_trigger_review_internal(uuid,uuid),public.v5_decide_trigger_review_internal(uuid,text) from public,anon,authenticated;

create function public.request_v5_trigger_review(target_rule uuid,selected_grant uuid,expected_key jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare signer public.review_signing_keys;result uuid;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 select k.* into signer from public.review_signing_keys k join public.record_grants g on g.recipient_id=k.owner_id where g.id=selected_grant and g.owner_id=auth.uid();
 if signer.id is null or expected_key->>'id' is distinct from signer.id::text
 or expected_key->>'x' is distinct from signer.public_key->>'x' or expected_key->>'y' is distinct from signer.public_key->>'y'
 or expected_key->>'kty' is distinct from 'EC' or expected_key->>'crv' is distinct from 'P-256'
 or expected_key - array['id','kty','crv','x','y'] <> '{}'::jsonb then raise exception 'Verified signing key required' using errcode='42501';end if;
 result:=public.v5_request_trigger_review_internal(target_rule,selected_grant);
 update public.trigger_review_requests set signing_key_id=signer.id,signing_public_key=signer.public_key where id=result;
 return result;
end $$;

create function public.decide_v5_trigger_review(target uuid,decision text,decision_signature text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.trigger_review_requests;
begin
 select * into r from public.trigger_review_requests where id=target and reviewer_id=auth.uid();
 if r.id is null or r.signing_key_id is null or not exists(select 1 from public.review_signing_keys where id=r.signing_key_id and owner_id=auth.uid() and public_key=r.signing_public_key)
 then raise exception 'Signing identity unavailable' using errcode='42501';end if;
 if decision_signature is null or decision_signature !~ '^[A-Za-z0-9+/]{86}==$' then raise exception 'Invalid decision signature' using errcode='22023';end if;
 -- PostgreSQL stores the signature; clients verify ECDSA before accepting it.
 -- This is NOT a server-verified authorization for activation.
 perform public.v5_decide_trigger_review_internal(target,decision);
 update public.trigger_reviewer_decisions set signing_key_id=r.signing_key_id,signature=decision_signature where request_id=target;
end $$;
revoke all on function public.register_v5_review_signing_key(jsonb),public.request_v5_trigger_review(uuid,uuid,jsonb),public.decide_v5_trigger_review(uuid,text,text) from public,anon;
grant execute on function public.register_v5_review_signing_key(jsonb),public.request_v5_trigger_review(uuid,uuid,jsonb),public.decide_v5_trigger_review(uuid,text,text) to authenticated;
commit;
