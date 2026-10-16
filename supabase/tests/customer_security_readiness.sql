-- Read-only catalog checks. Does not inspect customer rows, change roles or grants.
-- Run after approval/application of 20261016_customer_mfa_boundary.sql.
select c.relname as table_name,c.relrowsecurity as rls,c.relforcerowsecurity as forced_rls,
 exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid and p.polname='customer_mfa_boundary' and not p.polpermissive) as restrictive_mfa,
 exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=c.oid and t.tgname='customer_mfa_mutation' and t.tgenabled='O') as mutation_guard
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
and (c.relname='profiles' or exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname in ('owner_id','user_id') and not a.attisdropped))
order by c.relname;

select n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
 p.prosecdef,p.proconfig,
 pg_catalog.has_function_privilege('anon',p.oid,'execute') as anon_execute,
 pg_catalog.has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.prosecdef or p.proname in ('v5_require_customer_mfa','v5_customer_mfa_allowed'))
order by p.proname,arguments;

select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='vault-v5';
select policyname,permissive,roles,cmd,qual,with_check from pg_catalog.pg_policies
where schemaname='storage' and tablename='objects' order by policyname;
