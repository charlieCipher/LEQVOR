-- PREPARED ONLY. Requires explicit approval before applying to Neon neondb.
-- Never execute on customer Supabase. Does not initialize root_state or keys.
begin;
do $$begin
 if current_database()<>'neondb' or exists(select 1 from pg_namespace where nspname in ('auth','storage','supabase_functions')) then
  raise exception 'Separate governance database required';
 end if;
 if (select count(*) from founder_governance.root_state)<>0 or (select count(*) from founder_governance.audit_events)<>0 then
  raise exception 'Permission bootstrap requires an empty, inactive governance store';
 end if;
end$$;
-- SQL-created basic roles: provider-created roles may inherit neon_superuser.
-- NOLOGIN until a separate approved private credential provisioning step.
create role leqvor_governance_control nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role leqvor_governance_executor nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role leqvor_governance_auditor nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
revoke all on database neondb from public;
grant connect on database neondb to leqvor_governance_control,leqvor_governance_executor,leqvor_governance_auditor;
revoke all on schema public from public;
revoke all on schema founder_governance from public;
revoke all on all tables in schema founder_governance from public;
revoke all on all functions in schema founder_governance from public;
grant usage on schema founder_governance to leqvor_governance_control,leqvor_governance_executor,leqvor_governance_auditor;
grant select on founder_governance.root_state,founder_governance.audit_events to leqvor_governance_control;
grant update(document) on founder_governance.root_state to leqvor_governance_control;
grant insert on founder_governance.audit_events to leqvor_governance_control;
grant select on all tables in schema founder_governance to leqvor_governance_auditor;
grant select on founder_governance.root_state,founder_governance.audit_events,founder_governance.execution_reservations,founder_governance.execution_events to leqvor_governance_executor;
grant insert on founder_governance.execution_reservations,founder_governance.execution_events to leqvor_governance_executor;
-- PostgreSQL FOR UPDATE requires an UPDATE privilege. The immutable statement
-- trigger still rejects every actual UPDATE of reservations, including no-ops.
grant update(execution_key) on founder_governance.execution_reservations to leqvor_governance_executor;
alter function founder_governance.reject_audit_mutation() set search_path=pg_catalog;
alter default privileges in schema founder_governance revoke execute on functions from public;
alter default privileges in schema founder_governance revoke all on tables from public;
alter default privileges in schema founder_governance revoke all on sequences from public;
alter role leqvor_governance_control set search_path=pg_catalog,founder_governance;
alter role leqvor_governance_executor set search_path=pg_catalog,founder_governance;
alter role leqvor_governance_auditor set search_path=pg_catalog,founder_governance;
alter role leqvor_governance_auditor set default_transaction_read_only=on;
commit;
