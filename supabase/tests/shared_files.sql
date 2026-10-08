begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); bv uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); omitted uuid:=gen_random_uuid(); invitation uuid:=gen_random_uuid(); failed uuid:=gen_random_uuid();
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
 pub jsonb:=jsonb_build_object('kty','EC','crv','P-256','x',repeat('A',43),'y',repeat('B',43)); g jsonb; wrapper jsonb; bundle jsonb;
begin
 insert into auth.users(id) values(a),(b),(c);
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at) values(v,a,e,e,'fixture','{}','fixture','leqvor-v5',now()),(bv,b,e,e,'fixture','{}','fixture','leqvor-v5',now());
 insert into public.records(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(r,a,v,e,e,e,'leqvor-v5');
 insert into public.record_files(id,record_id,owner_id,vault_id,encrypted_filename,wrapped_file_dek,storage_path,crypto_version)
 select x,r,a,v,e,e,a::text||'/'||r::text||'/'||x::text,'leqvor-v5' from unnest(array[f,omitted]) x;
 insert into public.user_sharing_keys(owner_id,vault_id,public_key,encrypted_private_key,crypto_version) values(b,bv,pub,e,'leqvor-v5');
 g:=jsonb_build_object('id',invitation,'record_id',r,'owner_id',a,'vault_id',v,'recipient_id',b,'permissions','view','grant_version',1,'crypto_version','leqvor-v5','salt','AAAAAAAAAAAAAAAAAAAAAA==','sender_public_material',pub,'encrypted_record_key',e);
 wrapper:=jsonb_build_object('grant_id',invitation,'file_id',f,'record_id',r,'owner_id',a,'vault_id',v,'recipient_id',b,'crypto_version','leqvor-v5','salt','AAAAAAAAAAAAAAAAAAAAAA==','sender_public_material',pub,'encrypted_file_key',e);
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
 execute 'set local role authenticated';
 begin
  perform public.invite_v5_record_with_files(jsonb_set(g,'{id}',to_jsonb(failed)),1,pub,jsonb_build_array(jsonb_set(jsonb_set(wrapper,'{grant_id}',to_jsonb(failed)),'{file_id}',to_jsonb(gen_random_uuid()))));
  raise exception 'FAIL unowned selected file';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
 if exists(select 1 from public.record_grants where id=failed) then raise exception 'FAIL partial invitation persisted';end if;
 execute 'set local role authenticated';
 begin perform public.invite_v5_record_with_files(g,1,pub,jsonb_build_array(wrapper,wrapper));raise exception 'FAIL duplicate selection';exception when unique_violation then null;end;
 begin perform public.invite_v5_record_with_files(g,1,pub,jsonb_build_array(wrapper||'{"plaintext":"secret"}'::jsonb));raise exception 'FAIL plaintext wrapper';exception when invalid_parameter_value then null;end;
 perform public.invite_v5_record_with_files(g,1,pub,jsonb_build_array(wrapper));
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform public.read_v5_shared_file(invitation,f);raise exception 'FAIL pending file';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.shared_file_keys;raise exception 'FAIL direct key read';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.record_files where id=f) then raise exception 'FAIL recipient owner file read';end if;
 perform public.accept_v5_share(invitation);
 if jsonb_array_length(public.list_v5_shared_files(invitation))<>1 then raise exception 'FAIL selected file list';end if;
 bundle:=public.read_v5_shared_file(invitation,f);
 if bundle->'file' ? 'wrapped_file_dek' or bundle->'file_grant'->>'file_id'<>f::text then raise exception 'FAIL file key boundary';end if;
 begin perform public.read_v5_shared_file(invitation,omitted);raise exception 'FAIL unselected file';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform public.read_v5_shared_file(invitation,f);raise exception 'FAIL unrelated recipient';exception when insufficient_privilege then null;end;
 execute 'reset role';update public.record_grants set expires_at=now()-interval '1 minute' where id=invitation;
 perform set_config('request.jwt.claim.sub',b::text,true);execute 'set local role authenticated';
 begin perform public.read_v5_shared_file(invitation,f);raise exception 'FAIL expired file';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);perform public.revoke_v5_share(invitation);
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform public.read_v5_shared_file(invitation,f);raise exception 'FAIL revoked file';exception when insufficient_privilege then null;end;
 execute 'reset role';delete from public.record_files where id=f;
 if exists(select 1 from public.shared_file_keys where grant_id=invitation) then raise exception 'FAIL deleted file key retained';end if;
end $$;
reset role;
rollback;
