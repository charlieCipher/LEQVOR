begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- An expected stale head is not a transient serialization failure. Keep the
-- function, owner and EXECUTE privileges intact; change only this error code.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.append_verified_v5_security_event(uuid,jsonb,text,jsonb,jsonb)'::regprocedure) into definition;
 if position('errcode=''40001''' in definition)=0 then raise exception 'Unexpected history function definition';end if;
 execute replace(definition,'errcode=''40001''','errcode=''PT409''');
end $$;
commit;
