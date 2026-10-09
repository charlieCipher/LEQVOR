begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();v uuid:=gen_random_uuid();k uuid:=gen_random_uuid();event jsonb;amr jsonb;
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
 pub jsonb:=jsonb_build_object('kty','EC','crv','P-256','x',repeat('A',43),'y',repeat('B',43));
begin
 insert into auth.users(id) values(a),(b);
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at) values(v,a,e,e,'fixture','{}','fixture','leqvor-v5',now());
 insert into public.review_signing_keys(id,owner_id,vault_id,public_key,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(k,a,v,pub,e,e,e,'leqvor-v5');
 event:=jsonb_build_object('id',gen_random_uuid(),'owner_id',a,'sequence',1,'event_type','SECURITY_HISTORY_REVIEWED','severity','INFO','device_id',null,'previous_hash',null,'created_at',clock_timestamp(),'signing_key_id',k,'event_hash',repeat('A',43)||'=','signature',repeat('A',86)||'==');
 amr:=jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint));
 if has_function_privilege('authenticated','public.append_verified_v5_security_event(uuid,jsonb,text,jsonb,jsonb)','execute') or has_function_privilege('anon','public.append_verified_v5_security_event(uuid,jsonb,text,jsonb,jsonb)','execute') then raise exception 'FAIL client permission';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);execute 'set local role service_role';
 begin perform public.append_verified_v5_security_event(a,'[]','aal1',event,pub);raise exception 'FAIL stale auth';exception when insufficient_privilege then null;end;
 begin perform public.append_verified_v5_security_event(a,amr,null,event,pub);raise exception 'FAIL missing assurance';exception when insufficient_privilege then null;end;
 begin perform public.append_verified_v5_security_event(a,amr,'aal1',event,pub||'{"x":"changed"}');raise exception 'FAIL changed signer';exception when insufficient_privilege then null;end;
 begin perform public.append_verified_v5_security_event(a,amr,'aal1',event||'{"notes":"SECRET_CANARY"}',pub);raise exception 'FAIL plaintext';exception when invalid_parameter_value then null;end;
 begin perform public.append_verified_v5_security_event(a,amr,'aal1',event-'signature',pub);raise exception 'FAIL missing signature';exception when invalid_parameter_value then null;end;
 execute 'reset role';insert into auth.mfa_factors(id,user_id,status) values(gen_random_uuid(),a,'verified');execute 'set local role service_role';
 begin perform public.append_verified_v5_security_event(a,amr,'aal1',event,pub);raise exception 'FAIL MFA bypass';exception when insufficient_privilege then null;end;
 -- Shape fixtures only: real ECDSA verification is separately exercised at the API.
 perform public.append_verified_v5_security_event(a,amr,'aal2',event,pub);
 begin perform public.append_verified_v5_security_event(a,amr,'aal2',event,pub);raise exception 'FAIL replay';exception when serialization_failure then null;end;
 event:=event||jsonb_build_object('id',gen_random_uuid(),'sequence',2,'previous_hash',repeat('B',43)||'=');
 begin perform public.append_verified_v5_security_event(a,amr,'aal2',event,pub);raise exception 'FAIL fork';exception when serialization_failure then null;end;
 event:=event||jsonb_build_object('previous_hash',repeat('A',43)||'=');perform public.append_verified_v5_security_event(a,amr,'aal2',event,pub);
 execute 'reset role';perform set_config('request.jwt.claim.sub',b::text,true);execute 'set local role authenticated';
 if exists(select 1 from public.security_events) then raise exception 'FAIL foreign read';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 if (select count(*) from public.security_events)<>2 then raise exception 'FAIL owner read';end if;
 begin update public.security_events set severity='CHANGED';raise exception 'FAIL update';exception when insufficient_privilege then null;end;
 begin delete from public.security_events;raise exception 'FAIL delete';exception when insufficient_privilege then null;end;
 execute 'reset role';
 -- Existing unsigned histories are not silently blessed by an account signature.
 update public.security_events set signature='{}' where owner_id=a and sequence=2;
 event:=event||jsonb_build_object('id',gen_random_uuid(),'sequence',3);execute 'set local role service_role';
 begin perform public.append_verified_v5_security_event(a,amr,'aal2',event,pub);raise exception 'FAIL legacy head';exception when insufficient_privilege then null;end;
 execute 'reset role';
 -- Account deletion removes the history even when vault-independent events exist.
 delete from public.security_events where owner_id=a;delete from public.review_signing_keys where owner_id=a;delete from public.vaults where owner_id=a;
 insert into public.security_events(id,owner_id,sequence,event_type,severity,event_hash) values(gen_random_uuid(),b,1,'FIXTURE','INFO','fixture');
 delete from auth.users where id=b;
 if exists(select 1 from public.security_events where owner_id=b) then raise exception 'FAIL deletion lifecycle';end if;
end $$;
rollback;
