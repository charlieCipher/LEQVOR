begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- An independently encrypted context copy, wrapped for one confirmed reviewer.
-- No VMK, owner DEK wrapper, plaintext policy or evidence is stored here.
create table public.trigger_review_packets (
 request_id uuid primary key references public.trigger_review_requests(id) on delete cascade,
 owner_id uuid not null, vault_id uuid not null, record_snapshot jsonb not null, recipient_grant jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(vault_id,owner_id) references public.vaults(id,owner_id) on delete cascade
);
alter table public.trigger_review_packets enable row level security;
alter table public.trigger_review_packets force row level security;
revoke all on public.trigger_review_packets from public,anon,authenticated;
create function public.deliver_v5_trigger_review(target uuid,record_data jsonb,grant_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare q public.trigger_review_requests;g public.record_grants;snapshot jsonb;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 select * into q from public.trigger_review_requests where id=target and owner_id=auth.uid();
 select * into g from public.record_grants where id=q.grant_id for update;
 select * into q from public.trigger_review_requests where id=target and owner_id=auth.uid() for update;
 if q.id is null or q.manifest_id is null or q.cancelled_at is not null or q.expires_at<=clock_timestamp() or g.status<>'active' or g.expires_at<=clock_timestamp() then raise exception 'Review unavailable' using errcode='42501';end if;
 if record_data - array['id','owner_id','vault_id','crypto_version','revision','encrypted_metadata','encrypted_payload']<>'{}'::jsonb
 or record_data->>'owner_id' is distinct from q.owner_id::text or record_data->>'vault_id' is distinct from q.vault_id::text
 or record_data->>'revision' is distinct from '1' or record_data->>'crypto_version' is distinct from 'leqvor-v5'
 or not public.v5_valid_ciphertext(record_data->'encrypted_metadata') or not public.v5_valid_ciphertext(record_data->'encrypted_payload')
 or grant_data - array['id','record_id','owner_id','vault_id','recipient_id','permissions','grant_version','crypto_version','salt','sender_public_material','encrypted_record_key']<>'{}'::jsonb
 or grant_data->>'record_id' is distinct from record_data->>'id' or grant_data->>'owner_id' is distinct from q.owner_id::text
 or grant_data->>'vault_id' is distinct from q.vault_id::text or grant_data->>'recipient_id' is distinct from q.reviewer_id::text
 or grant_data->>'permissions' is distinct from 'view' or grant_data->>'grant_version' is distinct from '1' or grant_data->>'crypto_version' is distinct from 'leqvor-v5'
 or coalesce(grant_data->>'salt','') !~ '^[A-Za-z0-9+/]{22}==$' or not public.v5_valid_ciphertext(grant_data->'encrypted_record_key')
 or grant_data->'sender_public_material'->>'kty' is distinct from 'EC' or grant_data->'sender_public_material'->>'crv' is distinct from 'P-256'
 or (grant_data->'sender_public_material') - array['kty','crv','x','y','ext','key_ops']<>'{}'::jsonb
 or coalesce(grant_data->'sender_public_material'->>'x','') !~ '^[A-Za-z0-9_-]{43}$' or coalesce(grant_data->'sender_public_material'->>'y','') !~ '^[A-Za-z0-9_-]{43}$'
 then raise exception 'Invalid encrypted review context' using errcode='22023';end if;
 perform (record_data->>'id')::uuid;perform (grant_data->>'id')::uuid;
 snapshot:=jsonb_build_object('record',record_data,'grant',grant_data);
 if octet_length(snapshot::text)>4000000 then raise exception 'Review context too large' using errcode='22023';end if;
 insert into public.trigger_review_packets(request_id,owner_id,vault_id,record_snapshot,recipient_grant) values(q.id,q.owner_id,q.vault_id,record_data,grant_data);
end $$;
create function public.read_v5_trigger_review(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('record',p.record_snapshot,'grant',p.recipient_grant) into result
 from public.trigger_review_packets p join public.trigger_review_requests q on q.id=p.request_id join public.record_grants g on g.id=q.grant_id
 where q.id=target and q.reviewer_id=auth.uid() and q.cancelled_at is null and q.expires_at>clock_timestamp()
 and g.status='active' and g.expires_at>clock_timestamp() and g.recipient_id=auth.uid();
 if result is null then raise exception 'Review context unavailable' using errcode='42501';end if;
 return result;
end $$;
-- The trusted signature writer also requires that context was actually delivered.
alter function public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text) rename to v5_record_manifest_decision_internal;
revoke all on function public.v5_record_manifest_decision_internal(uuid,jsonb,text,jsonb,text,text) from public,anon,authenticated,service_role;
create function public.record_verified_v5_trigger_decision(verified_user uuid,verified_amr jsonb,verified_aal text,expected_request jsonb,decision text,decision_signature text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' or not exists(select 1 from public.trigger_review_packets where request_id=(expected_request->>'id')::uuid) then raise exception 'Delivered context required' using errcode='42501';end if;
 perform public.v5_record_manifest_decision_internal(verified_user,verified_amr,verified_aal,expected_request,decision,decision_signature);
end $$;
revoke all on function public.deliver_v5_trigger_review(uuid,jsonb,jsonb),public.read_v5_trigger_review(uuid) from public,anon;
grant execute on function public.deliver_v5_trigger_review(uuid,jsonb,jsonb),public.read_v5_trigger_review(uuid) to authenticated;
revoke all on function public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text) to service_role;
create table public.trigger_authorizations (
 manifest_id uuid primary key references public.trigger_manifests(id) on delete cascade,
 grant_id uuid not null unique references public.record_grants(id) on delete cascade,
 owner_id uuid not null, created_at timestamptz not null default now()
);
alter table public.trigger_authorizations enable row level security;
alter table public.trigger_authorizations force row level security;
revoke all on public.trigger_authorizations from public,anon,authenticated;
grant select on public.trigger_authorizations to authenticated;
create policy owner_read on public.trigger_authorizations for select to authenticated using(owner_id=auth.uid());
-- Pin the proposed final recipient inside the signed manifest, before reviews.
alter function public.create_v5_trigger_manifest(uuid,integer,integer,integer,jsonb,jsonb) rename to v5_create_manifest_internal;
revoke all on function public.v5_create_manifest_internal(uuid,integer,integer,integer,jsonb,jsonb) from public,anon,authenticated;
create function public.create_v5_trigger_manifest(target_rule uuid,required_approvals integer,evidence_days integer,required_evidence_count integer,reviewers jsonb,evidence_refs jsonb,recipient jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;pub jsonb;updated public.trigger_manifests;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 if recipient - array['account_id','public_key']<>'{}'::jsonb or recipient->>'account_id' is null or recipient->>'account_id'=auth.uid()::text then raise exception 'Selected recipient required' using errcode='22023';end if;
 select public_key into pub from public.user_sharing_keys where owner_id=(recipient->>'account_id')::uuid;
 if pub is null or pub->>'kty' is distinct from recipient->'public_key'->>'kty' or pub->>'crv' is distinct from recipient->'public_key'->>'crv' or pub->>'x' is distinct from recipient->'public_key'->>'x' or pub->>'y' is distinct from recipient->'public_key'->>'y' or (recipient->'public_key') - array['kty','crv','x','y']<>'{}'::jsonb then raise exception 'Recipient key changed' using errcode='42501';end if;
 result:=public.v5_create_manifest_internal(target_rule,required_approvals,evidence_days,required_evidence_count,reviewers,evidence_refs);
 update public.trigger_manifests set snapshot=snapshot||jsonb_build_object('recipient',recipient) where id=(result->>'id')::uuid returning * into updated;
 update public.trigger_manifests set manifest_hash=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') where id=updated.id returning * into updated;
 return to_jsonb(updated);
end $$;
revoke all on function public.create_v5_trigger_manifest(uuid,integer,integer,integer,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_v5_trigger_manifest(uuid,integer,integer,integer,jsonb,jsonb,jsonb) to authenticated;
-- Explicit owner authorization only. A review never automatically grants access.
create function public.authorize_v5_reviewed_invitation(target_manifest uuid,grant_data jsonb,recipient_key jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.trigger_manifests;item jsonb;result uuid;ready jsonb;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 select * into m from public.trigger_manifests where id=target_manifest and owner_id=auth.uid();
 if m.id is null then raise exception 'Manifest unavailable' using errcode='42501';end if;
 -- Match the writer/revocation lock order, then hold all source revisions.
 perform 1 from public.record_grants where id in (select (value->>'grant_id')::uuid from jsonb_array_elements(m.snapshot->'reviewers')) order by id for update;
 perform 1 from public.trigger_review_requests where manifest_id=m.id order by id for update;
 perform 1 from public.records where id=(m.snapshot->'record'->>'id')::uuid or id in (select (value->>'record_id')::uuid from jsonb_array_elements(m.snapshot->'evidence')) order by id for update;
 select * into m from public.trigger_manifests where id=target_manifest and owner_id=auth.uid() for update;
 ready:=public.v5_trigger_manifest_readiness(m.id);
 if ready->>'state' is distinct from 'READY_FOR_OWNER_REVIEW' or grant_data->>'record_id' is distinct from m.snapshot->'record'->>'id'
 or grant_data->>'recipient_id' is distinct from m.snapshot->'recipient'->>'account_id' or recipient_key is distinct from m.snapshot->'recipient'->'public_key'
 then raise exception 'Current verified approvals and selected recipient required' using errcode='42501';end if;
 if exists(select 1 from public.trigger_authorizations where manifest_id=m.id) then raise exception 'Authorization already used' using errcode='42501';end if;
 result:=public.invite_v5_record(grant_data,(m.snapshot->'record'->>'revision')::bigint,recipient_key);
 insert into public.trigger_authorizations(manifest_id,grant_id,owner_id) values(m.id,result,auth.uid());
 return result;
end $$;
revoke all on function public.authorize_v5_reviewed_invitation(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.authorize_v5_reviewed_invitation(uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

