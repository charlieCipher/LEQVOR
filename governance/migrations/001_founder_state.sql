-- Separate governance datastore only. Do not apply to customer production.
begin;
create schema founder_governance;
revoke all on schema founder_governance from public;
create table founder_governance.root_state(
 singleton boolean primary key default true check(singleton),
 document jsonb not null check(jsonb_typeof(document)='object')
);
create table founder_governance.audit_events(
 sequence bigint primary key check(sequence>0),
 event_hash text not null unique check(event_hash ~ '^[a-f0-9]{64}$'),
 document jsonb not null
);
revoke all on all tables in schema founder_governance from public;
create function founder_governance.reject_audit_mutation() returns trigger language plpgsql as $$begin raise exception 'Governance audit is append-only';end$$;
revoke all on function founder_governance.reject_audit_mutation() from public;
create trigger founder_audit_append_only before update or delete or truncate on founder_governance.audit_events for each statement execute function founder_governance.reject_audit_mutation();
-- No initial keys, admin role grants, public API or customer-table changes.
commit;
