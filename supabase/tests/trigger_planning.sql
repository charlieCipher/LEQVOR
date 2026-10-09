begin;
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();va uuid:=gen_random_uuid();vb uuid:=gen_random_uuid();
 r uuid:=gen_random_uuid();rb uuid:=gen_random_uuid();p uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();t uuid:=gen_random_uuid();n uuid:=gen_random_uuid();
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
begin
 insert into auth.users(id) values(a),(b);
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at)
 values(va,a,e,e,'fixture','{}','fixture','leqvor-v5',now()),(vb,b,e,e,'fixture','{}','fixture','leqvor-v5',now());
 insert into public.records(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(r,a,va,e,e,e,'leqvor-v5'),(rb,b,vb,e,e,e,'leqvor-v5');
 insert into public.verification_policies(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(pb,b,vb,e,e,e,'leqvor-v5');
 perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 insert into public.verification_policies(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(p,a,va,e,e,e,'leqvor-v5');
 insert into public.trigger_rules(id,owner_id,vault_id,policy_id,record_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(t,a,va,p,r,e,e,e,'leqvor-v5');
 insert into public.trigger_review_entries(id,owner_id,vault_id,rule_id,evidence_record_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(n,a,va,t,r,e,e,e,'leqvor-v5');
 if not exists(select 1 from public.trigger_rules where id=t and status='DRAFT') then raise exception 'FAIL draft';end if;
 if exists(select 1 from public.record_grants where record_id=r) then raise exception 'FAIL planning granted access';end if;
 begin
  insert into public.trigger_rules(id,owner_id,vault_id,policy_id,record_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(gen_random_uuid(),a,va,p,rb,e,e,e,'leqvor-v5');
  raise exception 'FAIL foreign record';exception when foreign_key_violation then null;end;
 begin
  insert into public.trigger_rules(id,owner_id,vault_id,policy_id,record_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(gen_random_uuid(),a,va,pb,r,e,e,e,'leqvor-v5');
  raise exception 'FAIL foreign policy';exception when foreign_key_violation then null;end;
 begin
  insert into public.trigger_review_entries(id,owner_id,vault_id,rule_id,evidence_record_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(gen_random_uuid(),a,va,t,rb,e,e,e,'leqvor-v5');
  raise exception 'FAIL foreign evidence';exception when foreign_key_violation then null;end;
 begin
  update public.trigger_rules set status='ACTIVE' where id=t;
  raise exception 'FAIL activation';exception when insufficient_privilege then null;end;
 begin
  delete from public.trigger_review_entries where id=n;
  raise exception 'FAIL mutable history';exception when insufficient_privilege then null;end;
 begin
  insert into public.verification_policies(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(gen_random_uuid(),a,va,e,'{"plaintext":"secret"}',e,'leqvor-v5');
  raise exception 'FAIL plaintext';exception when check_violation then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 if exists(select 1 from public.trigger_rules where id=t) or exists(select 1 from public.trigger_review_entries where id=n) or exists(select 1 from public.verification_policies where id=p) then raise exception 'FAIL foreign read';end if;
 begin
  insert into public.verification_policies(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version) values(gen_random_uuid(),a,va,e,e,e,'leqvor-v5');
  raise exception 'FAIL forged owner';exception when insufficient_privilege then null;end;
 execute 'reset role';
 if has_table_privilege('anon','public.trigger_rules','select') or has_table_privilege('authenticated','public.verification_policies','update') then raise exception 'FAIL privileges';end if;
 delete from public.vaults where id=va;
 if exists(select 1 from public.trigger_review_entries where id=n) then raise exception 'FAIL vault lifecycle';end if;
end $$;
rollback;
