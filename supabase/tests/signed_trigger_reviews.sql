begin;
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();v uuid:=gen_random_uuid();bv uuid:=gen_random_uuid();k uuid:=gen_random_uuid();r uuid:=gen_random_uuid();p uuid:=gen_random_uuid();t uuid:=gen_random_uuid();g uuid:=gen_random_uuid();q uuid;
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
 pub jsonb:=jsonb_build_object('kty','EC','crv','P-256','x',repeat('A',43),'y',repeat('B',43));data jsonb;expected jsonb;
begin
 insert into auth.users(id) values(a),(b);
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at) values(v,a,e,e,'fixture','{}','fixture','leqvor-v5',now()),(bv,b,e,e,'fixture','{}','fixture','leqvor-v5',now());
 insert into public.user_sharing_keys(owner_id,vault_id,public_key,encrypted_private_key,crypto_version) values(b,bv,pub,e,'leqvor-v5');
 insert into public.records(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(r,a,v,e,e,e,'leqvor-v5');
 insert into public.verification_policies(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(p,a,v,e,e,e,'leqvor-v5');
 insert into public.trigger_rules(id,owner_id,vault_id,policy_id,record_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(t,a,v,p,r,e,e,e,'leqvor-v5');
 insert into public.record_grants(id,owner_id,vault_id,record_id,recipient_id,encrypted_record_key,sender_public_material,permissions,grant_version,status,crypto_version,record_revision,expires_at) values(g,a,v,r,b,e,pub,'view',1,'active','leqvor-v5',1,now()+interval '1 day');
 data:=jsonb_build_object('id',k,'owner_id',b,'vault_id',bv,'public_key',pub,'encrypted_metadata',e,'encrypted_payload',e,'wrapped_dek',e,'crypto_version','leqvor-v5');expected:=pub||jsonb_build_object('id',k);
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
 perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 begin perform public.register_v5_review_signing_key(data);raise exception 'FAIL foreign key registration';exception when insufficient_privilege then null;end;
 begin perform public.request_v5_trigger_review(t,g,expected);raise exception 'FAIL missing signer';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform public.register_v5_review_signing_key(jsonb_set(data,'{public_key,d}','"PRIVATE_KEY"'));raise exception 'FAIL private key transport';exception when invalid_parameter_value then null;end;
 begin perform public.register_v5_review_signing_key(data||'{"private_notes":"plaintext"}');raise exception 'FAIL extra plaintext';exception when invalid_parameter_value then null;end;
 perform public.register_v5_review_signing_key(data);
 begin perform public.register_v5_review_signing_key(jsonb_set(data,'{id}',to_jsonb(gen_random_uuid())));raise exception 'FAIL signer replacement';exception when unique_violation then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 if exists(select 1 from public.review_signing_keys where id=k) then raise exception 'FAIL private identity read';end if;
 begin perform public.request_v5_trigger_review(t,g,jsonb_set(expected,'{id}',to_jsonb(gen_random_uuid())));raise exception 'FAIL unpinned key';exception when insufficient_privilege then null;end;
 begin perform public.request_v5_trigger_review(t,g,jsonb_set(expected,'{x}',to_jsonb(repeat('C',43))));raise exception 'FAIL substituted key';exception when insufficient_privilege then null;end;
 q:=public.request_v5_trigger_review(t,g,expected);
 perform set_config('request.jwt.claim.sub',b::text,true);
 if not exists(select 1 from public.trigger_review_requests where id=q and signing_key_id=k and signing_public_key=pub) then raise exception 'FAIL signer snapshot';end if;
 begin perform public.decide_v5_trigger_review(q,'APPROVED',null);raise exception 'FAIL unsigned decision';exception when invalid_parameter_value then null;end;
 begin perform public.v5_decide_trigger_review_internal(q,'APPROVED');raise exception 'FAIL unsigned helper';exception when insufficient_privilege then null;end;
 begin perform public.v5_request_trigger_review_internal(t,g);raise exception 'FAIL unpinned helper';exception when insufficient_privilege then null;end;
 -- Shape fixture only. Real ECDSA validation is tested separately on the client.
 perform public.decide_v5_trigger_review(q,'APPROVED',repeat('A',86)||'==');
 if not exists(select 1 from public.trigger_reviewer_decisions where request_id=q and signing_key_id=k and signature is not null) then raise exception 'FAIL signature retention';end if;
 if exists(select 1 from public.trigger_rules where id=t) then raise exception 'FAIL recipient access';end if;
 execute 'reset role';
 if has_function_privilege('authenticated','public.v5_decide_trigger_review_internal(uuid,text)','execute') or has_table_privilege('authenticated','public.review_signing_keys','update') then raise exception 'FAIL privilege';end if;
end $$;
rollback;
