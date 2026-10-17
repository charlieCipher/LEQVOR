-- PREPARED ONLY: production application requires separate approval.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Match the existing UI rule: enrolled, verified MFA requires aal2. No-MFA
-- accounts retain aal1 access. Factor status is read from the database, not UI.
create function public.v5_customer_mfa_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
   coalesce(auth.jwt()->>'aal'='aal2',false) or not exists(
     select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'
   )
 );
$$;
revoke all on function public.v5_customer_mfa_allowed() from public,anon;
grant execute on function public.v5_customer_mfa_allowed() to authenticated,service_role;

create function public.v5_require_customer_mfa() returns trigger
language plpgsql set search_path='' as $$
begin
 -- Service-role maintenance has no customer sub. Existing privileged writers
 -- must continue verifying their explicit verified_user/aal independently.
 if auth.jwt()->>'role' is distinct from 'service_role' and auth.uid() is not null and not public.v5_customer_mfa_allowed() then
   raise exception 'MFA required' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
revoke all on function public.v5_require_customer_mfa() from public,anon,authenticated;

-- Restrictive RLS covers ordinary access; mutation triggers ALSO run inside
-- SECURITY DEFINER RPCs, whose table-owner privileges can bypass RLS.
do $$ declare t record;begin
 for t in select c.relname,c.relrowsecurity from pg_catalog.pg_class c
 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r'
 and (c.relname='profiles' or exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname in ('owner_id','user_id') and not a.attisdropped))
 loop
  if t.relrowsecurity then
   execute format('create policy customer_mfa_boundary on public.%I as restrictive for all to authenticated using(public.v5_customer_mfa_allowed()) with check(public.v5_customer_mfa_allowed())',t.relname);
  end if;
  execute format('create trigger customer_mfa_mutation before insert or update or delete on public.%I for each row execute function public.v5_require_customer_mfa()',t.relname);
 end loop;
end $$;
create policy customer_mfa_boundary on storage.objects as restrictive for all to authenticated
 using(bucket_id not in ('vault-v5','vault') or public.v5_customer_mfa_allowed())
 with check(bucket_id not in ('vault-v5','vault') or public.v5_customer_mfa_allowed());

-- Definer read RPCs are not protected by ordinary table RLS.
create or replace function public.read_v5_share(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.record_grants;
begin
 if not public.v5_customer_mfa_allowed() then raise exception 'MFA required' using errcode='42501';end if;
 select * into g from public.record_grants where id=target and recipient_id=auth.uid() and status='active' and expires_at>now() and crypto_version='leqvor-v5';
 if g.id is null then raise exception 'Share unavailable' using errcode='42501';end if;
 return jsonb_build_object('grant',jsonb_build_object('id',g.id,'record_id',g.record_id,'owner_id',g.owner_id,'vault_id',g.vault_id,'recipient_id',g.recipient_id,'encrypted_record_key',g.encrypted_record_key,'sender_public_material',g.sender_public_material,'salt',g.salt,'permissions',g.permissions,'grant_version',g.grant_version,'crypto_version',g.crypto_version),'record',g.record_snapshot);
end $$;

create or replace function public.read_v5_trigger_review(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.v5_customer_mfa_allowed() then raise exception 'MFA required' using errcode='42501';end if;
 select jsonb_build_object('record',p.record_snapshot,'grant',p.recipient_grant) into result
 from public.trigger_review_packets p join public.trigger_review_requests q on q.id=p.request_id join public.record_grants g on g.id=q.grant_id
 where q.id=target and q.reviewer_id=auth.uid() and q.cancelled_at is null and q.expires_at>clock_timestamp()
 and g.status='active' and g.expires_at>clock_timestamp() and g.recipient_id=auth.uid();
 if result is null then raise exception 'Review context unavailable' using errcode='42501';end if;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
