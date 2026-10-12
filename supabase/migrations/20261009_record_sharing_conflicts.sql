begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Stale revisions are deterministic business conflicts, not retryable
-- PostgreSQL serialization failures. Preserve all authorization and grants.
do $$
declare target regprocedure;definition text;before_row pg_proc;after_row pg_proc;
 needle text:='errcode=''40001''';
begin
 foreach target in array array[
  'public.update_v5_record(uuid,bigint,jsonb)'::regprocedure,
  'public.delete_v5_record(uuid,bigint)'::regprocedure,
  'public.invite_v5_record(jsonb,bigint,jsonb)'::regprocedure
 ] loop
  select * into strict before_row from pg_proc where oid=target;
  select pg_get_functiondef(target) into definition;
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
   raise exception 'Unexpected conflict function definition';
  end if;
  execute replace(definition,needle,'errcode=''PT409''');
  select * into strict after_row from pg_proc where oid=target;
  if after_row.proowner is distinct from before_row.proowner
   or after_row.proacl is distinct from before_row.proacl
   or after_row.prosecdef is distinct from before_row.prosecdef
   or after_row.proconfig is distinct from before_row.proconfig then
   raise exception 'Conflict correction changed security attributes';
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
