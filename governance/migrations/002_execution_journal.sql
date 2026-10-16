-- Separate governance datastore only; no production/customer grants.
begin;
create table founder_governance.execution_reservations(
 execution_key text primary key check(execution_key ~ '^[a-f0-9]{64}$'),
 request_id uuid not null unique,
 document jsonb not null check(jsonb_typeof(document)='object')
);
create table founder_governance.execution_events(
 execution_key text not null references founder_governance.execution_reservations(execution_key),
 sequence integer not null check(sequence>0),
 document jsonb not null check(jsonb_typeof(document)='object'),
 primary key(execution_key,sequence)
);
revoke all on founder_governance.execution_reservations,founder_governance.execution_events from public;
create trigger execution_reservations_immutable before update or delete or truncate on founder_governance.execution_reservations for each statement execute function founder_governance.reject_audit_mutation();
create trigger execution_events_immutable before update or delete or truncate on founder_governance.execution_events for each statement execute function founder_governance.reject_audit_mutation();
commit;
