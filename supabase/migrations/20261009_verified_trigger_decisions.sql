begin;
alter table public.trigger_reviewer_decisions add column server_signature_verified boolean not null default false;
-- Clients cannot bypass server signature verification through the old RPC.
revoke all on function public.decide_v5_trigger_review(uuid,text,text) from public,anon,authenticated,service_role;
create function public.record_verified_v5_trigger_decision(verified_user uuid,verified_amr jsonb,verified_aal text,expected_request jsonb,decision text,decision_signature text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.trigger_review_requests;old_claims text;old_sub text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted writer required' using errcode='42501';end if;
 if verified_user is null or verified_aal is null or verified_aal not in ('aal1','aal2') or jsonb_typeof(verified_amr) is distinct from 'array' then raise exception 'Invalid verified session' using errcode='42501';end if;
 select * into r from public.trigger_review_requests where id=(expected_request->>'id')::uuid and reviewer_id=verified_user;
 if r.id is null then raise exception 'Review unavailable' using errcode='42501';end if;
 -- Same lock order as decision/cancellation: grant, then request.
 perform 1 from public.record_grants where id=r.grant_id for update;
 select * into r from public.trigger_review_requests where id=(expected_request->>'id')::uuid and reviewer_id=verified_user for update;
 if r.expires_at<=clock_timestamp() or not exists(select 1 from public.record_grants where id=r.grant_id and expires_at>clock_timestamp()) then raise exception 'Review expired' using errcode='42501';end if;
 if r.id is null or expected_request->>'owner_id' is distinct from r.owner_id::text or expected_request->>'vault_id' is distinct from r.vault_id::text
 or expected_request->>'rule_id' is distinct from r.rule_id::text or expected_request->>'grant_id' is distinct from r.grant_id::text
 or expected_request->>'reviewer_id' is distinct from verified_user::text or (expected_request->>'record_revision')::bigint is distinct from r.record_revision
 or (expected_request->>'expires_at')::timestamptz is distinct from r.expires_at or expected_request->>'signing_key_id' is distinct from r.signing_key_id::text
 or expected_request->'signing_public_key' is distinct from r.signing_public_key then raise exception 'Review context changed' using errcode='42501';end if;
 old_claims:=current_setting('request.jwt.claims',true);old_sub:=current_setting('request.jwt.claim.sub',true);
 -- The service writer passes only claims from a token verified by Supabase Auth.
 perform set_config('request.jwt.claim.sub',verified_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',verified_user,'role','authenticated','amr',verified_amr,'aal',verified_aal)::text,true);
 perform public.decide_v5_trigger_review(r.id,decision,decision_signature);
 update public.trigger_reviewer_decisions set server_signature_verified=true where request_id=r.id;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
end $$;
revoke all on function public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text) to service_role;
commit;
