begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();v uuid:=gen_random_uuid();saved public.vaults;claims jsonb;change jsonb;
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
begin
 insert into auth.users(id) values(a),(b);
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at) values(v,a,e,e,'fixture','{}','fixture','leqvor-v5',now());
 change:=jsonb_build_object('wrapped_vmk_password',e||'{"nonce":"BBBBBBBBBBBBBBBB"}','kdf_salt',repeat('A',22)||'==','kdf_parameters','{"algorithm":"Argon2id","t":3,"m":65536,"p":1,"dkLen":32}'::jsonb);
 claims:=jsonb_build_object('role','authenticated','aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)));
 if has_table_privilege('authenticated','public.vaults','update') or has_function_privilege('anon','public.replace_v5_vault_password(uuid,text,jsonb)','execute') then raise exception 'FAIL direct update available';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims',claims::text,true);execute 'set local role authenticated';
 begin update public.vaults set wrapped_vmk_recovery=e;raise exception 'FAIL recovery overwrite';exception when insufficient_privilege then null;end;
 begin perform public.replace_v5_vault_password(v,'CHANGED',change);raise exception 'FAIL stale wrapper';exception when sqlstate 'PT409' then null;end;
 begin perform public.replace_v5_vault_password(v,'AAAAAAAAAAAAAAAA',change||jsonb_build_object('wrapped_vmk_password',e));raise exception 'FAIL unchanged version nonce';exception when invalid_parameter_value then null;end;
 begin perform public.replace_v5_vault_password(v,'AAAAAAAAAAAAAAAA',change||jsonb_build_object('wrapped_vmk_recovery',e));raise exception 'FAIL recovery field injection';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claims',(claims||'{"amr":[]}'::jsonb)::text,true);
 begin perform public.replace_v5_vault_password(v,'AAAAAAAAAAAAAAAA',change);raise exception 'FAIL stale auth';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',claims::text,true);perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform public.replace_v5_vault_password(v,'AAAAAAAAAAAAAAAA',change);raise exception 'FAIL foreign wrapper update';exception when insufficient_privilege then null;end;
 execute 'reset role';insert into auth.mfa_factors(id,user_id,status) values(gen_random_uuid(),a,'verified');perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 begin perform public.replace_v5_vault_password(v,'AAAAAAAAAAAAAAAA',change);raise exception 'FAIL MFA bypass';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',(claims||'{"aal":"aal2"}')::text,true);
 saved:=public.replace_v5_vault_password(v,'AAAAAAAAAAAAAAAA',change);
 if saved.wrapped_vmk_recovery<>e or saved.recovery_salt<>'fixture' or saved.wrapped_vmk_password->>'nonce'<>'BBBBBBBBBBBBBBBB' then raise exception 'FAIL wrapper preservation';end if;
 begin perform public.replace_v5_vault_password(v,'AAAAAAAAAAAAAAAA',change);raise exception 'FAIL stale retry';exception when sqlstate 'PT409' then null;end;
 execute 'reset role';
end $$;
rollback;
