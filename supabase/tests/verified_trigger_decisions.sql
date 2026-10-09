begin;
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();v uuid:=gen_random_uuid();bv uuid:=gen_random_uuid();k uuid:=gen_random_uuid();r uuid:=gen_random_uuid();p uuid:=gen_random_uuid();t uuid:=gen_random_uuid();g uuid:=gen_random_uuid();q uuid:=gen_random_uuid();q2 uuid:=gen_random_uuid();expected jsonb;amr jsonb;sig text:=repeat('A',86)||'==';
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
 pub jsonb:=jsonb_build_object('kty','EC','crv','P-256','x',repeat('A',43),'y',repeat('B',43));
begin
 insert into auth.users(id) values(a),(b);
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at) values(v,a,e,e,'fixture','{}','fixture','leqvor-v5',now()),(bv,b,e,e,'fixture','{}','fixture','leqvor-v5',now());
 insert into public.user_sharing_keys(owner_id,vault_id,public_key,encrypted_private_key,crypto_version) values(b,bv,pub,e,'leqvor-v5');
 insert into public.review_signing_keys(id,owner_id,vault_id,public_key,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(k,b,bv,pub,e,e,e,'leqvor-v5');
 insert into public.records(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(r,a,v,e,e,e,'leqvor-v5');
 insert into public.verification_policies(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(p,a,v,e,e,e,'leqvor-v5');
 insert into public.trigger_rules(id,owner_id,vault_id,policy_id,record_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(t,a,v,p,r,e,e,e,'leqvor-v5');
 insert into public.record_grants(id,owner_id,vault_id,record_id,recipient_id,encrypted_record_key,sender_public_material,permissions,grant_version,status,crypto_version,record_revision,expires_at) values(g,a,v,r,b,e,pub,'view',1,'active','leqvor-v5',1,now()+interval '1 day');
 insert into public.trigger_review_requests(id,owner_id,vault_id,rule_id,grant_id,reviewer_id,record_revision,expires_at,signing_key_id,signing_public_key) values(q,a,v,t,g,b,1,now()+interval '1 day',k,pub),(q2,a,v,t,g,b,1,now()+interval '1 day',k,pub);
 select to_jsonb(x) into expected from public.trigger_review_requests x where id=q;
 amr:=jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint));
 perform set_config('request.jwt.claim.sub',b::text,true);perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aal','aal1','amr',amr)::text,true);execute 'set local role authenticated';
 begin perform public.decide_v5_trigger_review(q,'APPROVED',sig);raise exception 'FAIL direct signed route';exception when insufficient_privilege then null;end;
 begin perform public.record_verified_v5_trigger_decision(b,amr,'aal1',expected,'APPROVED',sig);raise exception 'FAIL client writer';exception when insufficient_privilege then null;end;
 execute 'reset role';perform set_config('request.jwt.claims','{"role":"service_role"}',true);execute 'set local role service_role';
 begin perform public.record_verified_v5_trigger_decision(b,amr,'aal1',jsonb_set(expected,'{record_revision}','2'),'APPROVED',sig);raise exception 'FAIL changed revision';exception when insufficient_privilege then null;end;
 begin perform public.record_verified_v5_trigger_decision(a,amr,'aal1',expected,'APPROVED',sig);raise exception 'FAIL wrong actor';exception when insufficient_privilege then null;end;
 begin perform public.record_verified_v5_trigger_decision(b,'[]','aal1',expected,'APPROVED',sig);raise exception 'FAIL stale auth';exception when insufficient_privilege then null;end;
 execute 'reset role';insert into auth.mfa_factors(id,user_id,status) values(gen_random_uuid(),b,'verified');execute 'set local role service_role';
 begin perform public.record_verified_v5_trigger_decision(b,amr,'aal1',expected,'APPROVED',sig);raise exception 'FAIL MFA bypass';exception when insufficient_privilege then null;end;
 -- Signature shape fixture: the API's real ECDSA verification is separately tested.
 perform public.record_verified_v5_trigger_decision(b,amr,'aal2',expected,'APPROVED',sig);
 if auth.jwt()->>'role'<>'service_role' then raise exception 'FAIL leaked session claims';end if;
 begin perform public.record_verified_v5_trigger_decision(b,amr,'aal2',expected,'APPROVED',sig);raise exception 'FAIL replay';exception when invalid_parameter_value then null;end;
 execute 'reset role';
 if not exists(select 1 from public.trigger_reviewer_decisions where request_id=q and server_signature_verified) then raise exception 'FAIL verified attribution';end if;
 update public.record_grants set status='revoked' where id=g;
 select to_jsonb(x) into expected from public.trigger_review_requests x where id=q2;
 execute 'set local role service_role';
 begin perform public.record_verified_v5_trigger_decision(b,amr,'aal2',expected,'APPROVED',sig);raise exception 'FAIL revoked in flight';exception when insufficient_privilege then null;end;
 execute 'reset role';
 if (select status from public.trigger_rules where id=t)<>'DRAFT' then raise exception 'FAIL activation';end if;
 if has_function_privilege('authenticated','public.decide_v5_trigger_review(uuid,text,text)','execute') or has_function_privilege('anon','public.record_verified_v5_trigger_decision(uuid,jsonb,text,jsonb,text,text)','execute') then raise exception 'FAIL writer privileges';end if;
end $$;
rollback;
