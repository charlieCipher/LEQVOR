-- Immutable operational commitments. Readiness is not activation or legal eligibility.
begin;
create table public.trigger_manifests (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,vault_id uuid not null,rule_id uuid not null,
 minimum_approvals integer not null check(minimum_approvals between 1 and 20),
 expires_at timestamptz not null,manifest_hash text not null check(manifest_hash ~ '^[0-9a-f]{64}$'),
 snapshot jsonb not null,created_at timestamptz not null default now(),
 foreign key(rule_id,owner_id,vault_id) references public.trigger_rules(id,owner_id,vault_id) on delete cascade
);
alter table public.trigger_manifests enable row level security;
alter table public.trigger_manifests force row level security;
create policy owner_read on public.trigger_manifests for select to authenticated using(owner_id=auth.uid());
create policy owner_boundary on public.trigger_manifests as restrictive for select to authenticated using(owner_id=auth.uid());
revoke all on public.trigger_manifests from public,anon,authenticated;
grant select on public.trigger_manifests to authenticated;
alter table public.trigger_review_requests add column manifest_id uuid references public.trigger_manifests(id) on delete cascade;
alter table public.trigger_review_requests add column manifest_hash text;

create function public.create_v5_trigger_manifest(target_rule uuid,required_approvals integer,evidence_days integer,required_evidence_count integer,reviewers jsonb,evidence_refs jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.trigger_rules;p public.verification_policies;s public.records;g public.record_grants;k public.review_signing_keys;
 item jsonb;e public.records;review_rows jsonb:='[]';evidence_rows jsonb:='[]';seen uuid[]:='{}';seen_evidence uuid[]:='{}';slots integer[]:='{}';deadline timestamptz:=now()+interval '7 days';observed timestamptz;slot integer;commitment jsonb;m public.trigger_manifests;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 if jsonb_typeof(reviewers) is distinct from 'array' or jsonb_typeof(evidence_refs) is distinct from 'array' then raise exception 'Invalid manifest references' using errcode='22023';end if;
 if required_approvals is null or required_approvals<1 or required_approvals>jsonb_array_length(reviewers) or jsonb_array_length(reviewers)>20
 or evidence_days is null or evidence_days not between 1 and 365 or required_evidence_count is null or required_evidence_count not between 1 and 20
 or jsonb_array_length(evidence_refs)<>required_evidence_count then raise exception 'Invalid manifest threshold' using errcode='22023';end if;
 select * into r from public.trigger_rules where id=target_rule and owner_id=auth.uid();
 if r.id is null then raise exception 'Rule unavailable' using errcode='42501';end if;
 select * into p from public.verification_policies where id=r.policy_id and owner_id=auth.uid();
 select * into s from public.records where id=r.record_id and owner_id=auth.uid();
 if p.id is null or s.id is null then raise exception 'Planning source unavailable' using errcode='42501';end if;
 -- Consistent grant order for concurrent manifests; immutable snapshots are checked again below.
 for item in select value from jsonb_array_elements(reviewers) order by value->>'grant_id' loop
  if item - array['grant_id','signing_key_id','public_key'] <> '{}'::jsonb then raise exception 'Unsupported reviewer fields' using errcode='22023';end if;
  select * into g from public.record_grants where id=(item->>'grant_id')::uuid for update;
  select * into k from public.review_signing_keys where id=(item->>'signing_key_id')::uuid and owner_id=g.recipient_id;
  if g.id is null or g.owner_id<>auth.uid() or g.vault_id<>r.vault_id or g.record_id<>r.record_id or g.record_revision is distinct from s.revision
  or g.status<>'active' or g.crypto_version is distinct from 'leqvor-v5' or g.expires_at is null or g.expires_at<=clock_timestamp()
  or k.id is null or k.public_key is distinct from item->'public_key' or g.recipient_id=any(seen) then raise exception 'Verified current reviewer share required' using errcode='42501';end if;
  seen:=array_append(seen,g.recipient_id);deadline:=least(deadline,g.expires_at);
  review_rows:=review_rows||jsonb_build_array(jsonb_build_object('reviewer_id',g.recipient_id,'grant_id',g.id,'signing_key_id',k.id,'public_key',k.public_key));
 end loop;
 for item in select value from jsonb_array_elements(evidence_refs) order by (value->>'requirement_index')::integer loop
  if item - array['record_id','record_revision','observed_at','requirement_index'] <> '{}'::jsonb then raise exception 'Unsupported evidence fields' using errcode='22023';end if;
  select * into e from public.records where id=(item->>'record_id')::uuid and owner_id=auth.uid() and vault_id=r.vault_id;
  observed:=(item->>'observed_at')::timestamptz;slot:=(item->>'requirement_index')::integer;
  if e.id is null or e.revision is distinct from (item->>'record_revision')::bigint or observed is null or observed>clock_timestamp() or observed+make_interval(days=>evidence_days)<=clock_timestamp()
  or slot is null or slot<0 or slot>=required_evidence_count or slot=any(slots) or e.id=any(seen_evidence) then raise exception 'Current evidence references required' using errcode='42501';end if;
  slots:=array_append(slots,slot);seen_evidence:=array_append(seen_evidence,e.id);deadline:=least(deadline,observed+make_interval(days=>evidence_days));
  evidence_rows:=evidence_rows||jsonb_build_array(jsonb_build_object('record_id',e.id,'record_revision',e.revision,'observed_at',observed,'requirement_index',slot,'encrypted_metadata',e.encrypted_metadata,'encrypted_payload',e.encrypted_payload));
 end loop;
 perform 1 from public.vaults where id=r.vault_id and owner_id=auth.uid() for update;
 if (select count(*) from public.trigger_manifests where owner_id=auth.uid() and expires_at>clock_timestamp())>=100 then raise exception 'Outstanding manifest limit reached' using errcode='22023';end if;
 commitment:=jsonb_build_object('domain','leqvor-trigger-manifest-v1','owner_id',auth.uid(),'vault_id',r.vault_id,'rule_id',r.id,'policy_id',p.id,
 'minimum_approvals',required_approvals,'evidence_days',evidence_days,'required_evidence_count',required_evidence_count,'expires_at',deadline,
 'policy_payload',p.encrypted_payload,'rule_payload',r.encrypted_payload,'record',jsonb_build_object('id',s.id,'revision',s.revision,'encrypted_metadata',s.encrypted_metadata,'encrypted_payload',s.encrypted_payload),'reviewers',review_rows,'evidence',evidence_rows);
 if octet_length(commitment::text)>4000000 then raise exception 'Manifest snapshot too large' using errcode='22023';end if;
 insert into public.trigger_manifests(owner_id,vault_id,rule_id,minimum_approvals,expires_at,manifest_hash,snapshot)
 values(auth.uid(),r.vault_id,r.id,required_approvals,deadline,encode(sha256(convert_to(commitment::text,'UTF8')),'hex'),commitment) returning * into m;
 return to_jsonb(m);
end $$;

alter function public.request_v5_trigger_review(uuid,uuid,jsonb) rename to v5_request_pinned_trigger_review_internal;
revoke all on function public.v5_request_pinned_trigger_review_internal(uuid,uuid,jsonb) from public,anon,authenticated;
create function public.request_v5_trigger_review(target_rule uuid,selected_grant uuid,expected_key jsonb,target_manifest uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.trigger_manifests;result uuid;
begin
 select * into m from public.trigger_manifests where id=target_manifest and owner_id=auth.uid() and rule_id=target_rule;
 if m.id is null or m.expires_at<=clock_timestamp() or not exists(select 1 from jsonb_array_elements(m.snapshot->'reviewers') x where x->>'grant_id'=selected_grant::text and x->>'signing_key_id'=expected_key->>'id') then raise exception 'Manifest unavailable' using errcode='42501';end if;
 result:=public.v5_request_pinned_trigger_review_internal(target_rule,selected_grant,expected_key);
 update public.trigger_review_requests set manifest_id=m.id,manifest_hash=m.manifest_hash,expires_at=least(expires_at,m.expires_at) where id=result;
 return result;
end $$;

alter function public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text) rename to v5_record_verified_decision_internal;
revoke all on function public.v5_record_verified_decision_internal(uuid,jsonb,text,jsonb,text,text) from public,anon,authenticated,service_role;
create function public.record_verified_v5_trigger_decision(verified_user uuid,verified_amr jsonb,verified_aal text,expected_request jsonb,decision text,decision_signature text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.trigger_review_requests;m public.trigger_manifests;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted writer required' using errcode='42501';end if;
 select * into r from public.trigger_review_requests where id=(expected_request->>'id')::uuid and reviewer_id=verified_user;
 select * into m from public.trigger_manifests where id=r.manifest_id;
 if r.id is null or m.id is null or m.expires_at<=clock_timestamp() or r.manifest_hash is distinct from m.manifest_hash
 or m.manifest_hash is distinct from encode(sha256(convert_to(m.snapshot::text,'UTF8')),'hex')
 or m.minimum_approvals is distinct from (m.snapshot->>'minimum_approvals')::integer or m.expires_at is distinct from (m.snapshot->>'expires_at')::timestamptz
 or expected_request->>'manifest_id' is distinct from m.id::text or expected_request->>'manifest_hash' is distinct from m.manifest_hash then raise exception 'Manifest context changed' using errcode='42501';end if;
 perform public.v5_record_verified_decision_internal(verified_user,verified_amr,verified_aal,expected_request,decision,decision_signature);
end $$;

create function public.v5_trigger_manifest_readiness(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.trigger_manifests;s public.records;r public.trigger_rules;p public.verification_policies;item jsonb;e public.records;approvals integer;rejected boolean;
begin
 select * into m from public.trigger_manifests where id=target and owner_id=auth.uid();
 if m.id is null then raise exception 'Manifest unavailable' using errcode='42501';end if;
 if m.manifest_hash is distinct from encode(sha256(convert_to(m.snapshot::text,'UTF8')),'hex') or m.minimum_approvals is distinct from (m.snapshot->>'minimum_approvals')::integer
 or m.expires_at is distinct from (m.snapshot->>'expires_at')::timestamptz or m.rule_id::text is distinct from m.snapshot->>'rule_id' or m.owner_id::text is distinct from m.snapshot->>'owner_id' or m.vault_id::text is distinct from m.snapshot->>'vault_id' then return jsonb_build_object('state','STALE','activation_enabled',false);end if;
 if m.expires_at<=clock_timestamp() then return jsonb_build_object('state','EXPIRED','activation_enabled',false);end if;
 select * into r from public.trigger_rules where id=m.rule_id;select * into p from public.verification_policies where id=r.policy_id;
 select * into s from public.records where id=(m.snapshot->'record'->>'id')::uuid;
 if s.id is null or s.revision is distinct from (m.snapshot->'record'->>'revision')::bigint
 or s.encrypted_metadata is distinct from m.snapshot->'record'->'encrypted_metadata' or s.encrypted_payload is distinct from m.snapshot->'record'->'encrypted_payload'
 or p.encrypted_payload is distinct from m.snapshot->'policy_payload' or r.encrypted_payload is distinct from m.snapshot->'rule_payload' then return jsonb_build_object('state','STALE','activation_enabled',false);end if;
 for item in select value from jsonb_array_elements(m.snapshot->'evidence') loop
  select * into e from public.records where id=(item->>'record_id')::uuid;
  if e.id is null or e.revision is distinct from (item->>'record_revision')::bigint or e.encrypted_metadata is distinct from item->'encrypted_metadata' or e.encrypted_payload is distinct from item->'encrypted_payload' then return jsonb_build_object('state','STALE','activation_enabled',false);end if;
 end loop;
 select count(distinct q.reviewer_id) filter(where d.outcome='APPROVED'),coalesce(bool_or(d.outcome='REJECTED'),false) into approvals,rejected
 from public.trigger_review_requests q join public.trigger_reviewer_decisions d on d.request_id=q.id
 join public.record_grants g on g.id=q.grant_id join public.review_signing_keys k on k.id=q.signing_key_id join public.user_sharing_keys sharing_identity on sharing_identity.owner_id=q.reviewer_id
 where q.manifest_id=m.id and q.manifest_hash=m.manifest_hash and q.cancelled_at is null and q.expires_at>clock_timestamp() and d.server_signature_verified and d.reviewer_id=q.reviewer_id and d.signing_key_id=q.signing_key_id
 and g.status='active' and g.expires_at>clock_timestamp() and g.recipient_id=q.reviewer_id and g.record_revision=q.record_revision and q.record_revision=s.revision
 and k.owner_id=q.reviewer_id and k.public_key=q.signing_public_key
 and exists(select 1 from jsonb_array_elements(m.snapshot->'reviewers') x where x->>'reviewer_id'=q.reviewer_id::text and x->>'grant_id'=q.grant_id::text and x->>'signing_key_id'=q.signing_key_id::text);
 return jsonb_build_object('state',case when rejected then 'BLOCKED' when approvals>=m.minimum_approvals then 'READY_FOR_OWNER_REVIEW' else 'NEEDS_REVIEW' end,'approvals',approvals,'required',m.minimum_approvals,'activation_enabled',false);
end $$;
revoke all on function public.create_v5_trigger_manifest(uuid,integer,integer,integer,jsonb,jsonb),public.request_v5_trigger_review(uuid,uuid,jsonb,uuid),public.v5_trigger_manifest_readiness(uuid) from public,anon;
grant execute on function public.create_v5_trigger_manifest(uuid,integer,integer,integer,jsonb,jsonb),public.request_v5_trigger_review(uuid,uuid,jsonb,uuid),public.v5_trigger_manifest_readiness(uuid) to authenticated;
revoke all on function public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text) to service_role;
commit;
