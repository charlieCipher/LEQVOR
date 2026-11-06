-- PREPARED ONLY: explicit approval and SEPARATE authorization database/operator.
-- NOT part of the governance Neon migration batch. No default users/sessions.
begin;
do $$begin
 if current_database()<>'leqvor_authorization' or exists(select 1 from pg_namespace where nspname in ('founder_governance','auth','storage','supabase_functions')) then
  raise exception 'Independent authorization database required';
 end if;
end$$;
create schema control_authorization;
revoke all on schema control_authorization from public;
create role leqvor_authorization_reader nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role leqvor_authorization_operator nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
revoke all on database leqvor_authorization from public;
revoke all on schema public from public;
grant connect on database leqvor_authorization to leqvor_authorization_reader,leqvor_authorization_operator;
grant usage on schema control_authorization to leqvor_authorization_reader,leqvor_authorization_operator;
create table control_authorization.principals(
 identity_issuer text not null check(length(identity_issuer) between 1 and 256),
 subject text not null check(length(subject) between 1 and 256),
 role text not null check(role in ('FOUNDER','SECURITY_ADMIN','OPERATIONS_ADMIN','SUPPORT_ADMIN','BILLING_ADMIN','AUDITOR')),
 enabled boolean not null default false,
 revision bigint not null default 1 check(revision>0),
 primary key(identity_issuer,subject)
);
create table control_authorization.sessions(
 identity_issuer text not null, subject text not null,
 token_id text not null check(length(token_id) between 1 and 256),
 expires_at bigint not null, revoked boolean not null default false,
 revision bigint not null default 1 check(revision>0),
 primary key(identity_issuer,subject,token_id),
 foreign key(identity_issuer,subject) references control_authorization.principals(identity_issuer,subject)
);
create table control_authorization.operator_events(
 sequence bigint generated always as identity primary key,
 at timestamptz not null default clock_timestamp(),
 operator_name text not null, operation text not null, object_type text not null,
 before_row jsonb, after_row jsonb
);
create function control_authorization.reject_mutation() returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception 'Authorization history cannot be rewritten';end$$;
create trigger immutable_history before update or delete or truncate on control_authorization.operator_events for each statement execute function control_authorization.reject_mutation();
create function control_authorization.change_record() returns trigger language plpgsql security definer set search_path=pg_catalog as $$begin
 if TG_OP='UPDATE' then NEW.revision:=OLD.revision+1;end if;
 if TG_TABLE_NAME='sessions' then
  if TG_OP='INSERT' then
   if NEW.expires_at<=extract(epoch from clock_timestamp())*1000 or NEW.expires_at>extract(epoch from clock_timestamp())*1000+300000 then raise exception 'Session lease must expire within five minutes';end if;
  end if;
 end if;
 insert into control_authorization.operator_events(operator_name,operation,object_type,before_row,after_row)
 values(session_user,TG_OP,TG_TABLE_NAME,case when TG_OP='UPDATE' then to_jsonb(OLD) else null end,to_jsonb(NEW));
 return NEW;
end$$;
create trigger principal_changes before insert or update on control_authorization.principals for each row execute function control_authorization.change_record();
create trigger session_changes before insert or update on control_authorization.sessions for each row execute function control_authorization.change_record();
create trigger no_principal_delete before delete or truncate on control_authorization.principals for each statement execute function control_authorization.reject_mutation();
create trigger no_session_delete before delete or truncate on control_authorization.sessions for each statement execute function control_authorization.reject_mutation();
revoke all on all tables in schema control_authorization from public;
revoke all on all functions in schema control_authorization from public;
grant select on control_authorization.principals,control_authorization.sessions to leqvor_authorization_reader;
grant select,insert on control_authorization.principals,control_authorization.sessions to leqvor_authorization_operator;
grant update(role,enabled) on control_authorization.principals to leqvor_authorization_operator;
grant update(revoked) on control_authorization.sessions to leqvor_authorization_operator;
grant select on control_authorization.operator_events to leqvor_authorization_operator;
alter role leqvor_authorization_reader set default_transaction_read_only=on;
alter role leqvor_authorization_reader set search_path=pg_catalog,control_authorization;
alter role leqvor_authorization_operator set search_path=pg_catalog,control_authorization;
alter default privileges in schema control_authorization revoke execute on functions from public;
alter default privileges in schema control_authorization revoke all on tables from public;
alter default privileges in schema control_authorization revoke all on sequences from public;
commit;
