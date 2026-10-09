begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); f uuid:=gen_random_uuid();
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
 rd jsonb; nodes jsonb; edges jsonb; fd jsonb; saved public.records;
begin
 insert into auth.users(id) values(a),(b);
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at) values(v,a,e,e,'fixture','{}','fixture','leqvor-v5',now());
 insert into public.records(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(d,a,v,e,e,e,'leqvor-v5');
 rd:=jsonb_build_object('id',r,'owner_id',a,'vault_id',v,'encrypted_metadata',e,'encrypted_payload',e,'wrapped_dek',e,'crypto_version','leqvor-v5');
 nodes:=jsonb_build_array(jsonb_build_object('id',r,'owner_id',a,'vault_id',v,'entity_type','POLICY','record_id',r),jsonb_build_object('id',d,'owner_id',a,'vault_id',v,'entity_type','DOCUMENT','record_id',d));
 edges:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'owner_id',a,'vault_id',v,'from_entity_id',r,'to_entity_id',d,'managed_record_id',r,'encrypted_metadata',e,'encrypted_payload',e,'wrapped_dek',e,'crypto_version','leqvor-v5'));
 fd:=jsonb_build_object('id',f,'record_id',r,'owner_id',a,'vault_id',v,'encrypted_filename',e,'wrapped_file_dek',e,'storage_path',a::text||'/'||r::text||'/'||f::text,'crypto_version','leqvor-v5');
 perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 saved:=public.save_vnext_policy(rd,null,fd,nodes,edges);
 if saved.revision<>1 or not exists(select 1 from public.record_files where id=f) or not exists(select 1 from public.continuity_edges where managed_record_id=r) then raise exception 'FAIL policy creation';end if;
 begin
  perform public.save_vnext_policy(rd,1,null,nodes,jsonb_set(edges,'{0,to_entity_id}',to_jsonb(gen_random_uuid())));
  raise exception 'FAIL invalid endpoint accepted';
 exception when foreign_key_violation then null;end;
 if (select revision from public.records where id=r)<>1 or not exists(select 1 from public.continuity_edges where managed_record_id=r) then raise exception 'FAIL rollback';end if;
 saved:=public.save_vnext_policy(rd,1,null,nodes,'[]');
 if saved.revision<>2 or exists(select 1 from public.continuity_edges where managed_record_id=r) then raise exception 'FAIL graph replacement';end if;
 begin
  perform public.save_vnext_policy(rd,1,null,nodes,edges);raise exception 'FAIL stale write';
 exception when serialization_failure then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin
  perform public.save_vnext_policy(rd,2,null,nodes,edges);raise exception 'FAIL foreign save';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;

