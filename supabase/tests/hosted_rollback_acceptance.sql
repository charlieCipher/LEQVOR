-- Hosted PostgreSQL authorization acceptance, NOT browser/Auth/Storage API E2E.
-- Synthetic, random identities only. All fixtures are rolled back.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
do $$
declare
 a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
 v uuid := gen_random_uuid(); r uuid := gen_random_uuid(); f uuid := gen_random_uuid();
 e jsonb := '{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
 row_data jsonb; saved public.records; affected integer;
begin
 insert into auth.users(id,email) values(a,'leqvor-test-'||a||'@example.invalid'),(b,'leqvor-test-'||b||'@example.invalid');
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if current_user <> 'authenticated' or auth.uid() <> a then raise exception 'FAIL test role'; end if;
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at)
 values(v,a,e,e,'fixture','{}','fixture','leqvor-v5',now());
 row_data := jsonb_build_object('id',r,'owner_id',a,'vault_id',v,'encrypted_metadata',e,'encrypted_payload',e,'wrapped_dek',e,'crypto_version','leqvor-v5');
 saved := public.save_v5_record_bundle(row_data,jsonb_build_object('id',f,'record_id',r,'owner_id',a,'vault_id',v,'encrypted_filename',e,'wrapped_file_dek',e,'storage_path',a::text||'/'||r::text||'/'||f::text,'crypto_version','leqvor-v5'));
 if saved.revision <> 1 or not exists(select 1 from public.record_files where id=f) then raise exception 'FAIL create bundle'; end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 if exists(select 1 from public.vaults where id=v) or exists(select 1 from public.records where id=r) or exists(select 1 from public.record_files where id=f) then raise exception 'FAIL cross account read'; end if;
 begin
  perform public.update_v5_record(r,1,row_data);
  raise exception 'FAIL cross account update';
 exception when insufficient_privilege or no_data_found then null; end;
 begin
  perform public.delete_v5_record(r,1);
  raise exception 'FAIL cross account delete';
 exception when insufficient_privilege or no_data_found then null; end;
 begin
  insert into public.records(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(gen_random_uuid(),a,v,e,e,e,'leqvor-v5');
  raise exception 'FAIL forged owner';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 saved := public.update_v5_record(r,1,row_data);
 if saved.revision <> 2 then raise exception 'FAIL update revision'; end if;
 begin
  perform public.update_v5_record(r,1,row_data);
  raise exception 'FAIL stale revision';
 exception when serialization_failure then null; end;
 perform public.delete_v5_record(r,2);
 if exists(select 1 from public.records where id=r) or exists(select 1 from public.record_files where id=f) then raise exception 'FAIL deletion'; end if;
 execute 'reset role';
 select count(*) into affected from public.ciphertext_cleanup_jobs where owner_id=a;
 if affected <> 1 then raise exception 'FAIL cleanup queued'; end if;
end $$;
rollback;
select 'PASS: hosted vault and record/file-metadata transactions, two-identity isolation, stale revisions, queued cleanup. Fixtures rolled back. Auth login, real object storage and client decryption not tested.' as acceptance_result;
