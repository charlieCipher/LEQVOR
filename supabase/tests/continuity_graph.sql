begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 va uuid:=gen_random_uuid(); vb uuid:=gen_random_uuid();
 r1 uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); rb uuid:=gen_random_uuid(); edge uuid:=gen_random_uuid();
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
begin
 insert into auth.users(id) values(a),(b);
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at)
 values(va,a,e,e,'fixture','{}','fixture','leqvor-v5',now()),(vb,b,e,e,'fixture','{}','fixture','leqvor-v5',now());
 insert into public.records(id,owner_id,vault_id,encrypted_metadata,encrypted_payload,wrapped_dek,crypto_version)
 values(r1,a,va,e,e,e,'leqvor-v5'),(r2,a,va,e,e,e,'leqvor-v5'),(rb,b,vb,e,e,e,'leqvor-v5');
 insert into public.continuity_entities(id,owner_id,vault_id,entity_type,record_id) values(rb,b,vb,'ASSET',rb);
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 insert into public.continuity_entities(id,owner_id,vault_id,entity_type,record_id) values(r1,a,va,'ASSET',r1),(r2,a,va,'DOCUMENT',r2);
 insert into public.continuity_edges values(edge,a,va,r1,r2,e,e,e,'leqvor-v5',now());
 if not exists(select 1 from public.continuity_edges where id=edge) then raise exception 'FAIL own graph';end if;
 begin
  insert into public.continuity_edges values(gen_random_uuid(),a,va,r1,rb,e,e,e,'leqvor-v5',now());
  raise exception 'FAIL cross vault edge';
 exception when foreign_key_violation then null;end;
 begin
  insert into public.continuity_entities(id,owner_id,vault_id,entity_type,record_id) values(rb,a,va,'ASSET',rb);
  raise exception 'FAIL foreign source';
 exception when foreign_key_violation or unique_violation then null;end;
 begin
  insert into public.continuity_edges values(gen_random_uuid(),a,va,r1,r2,'{"plaintext":"secret"}',e,e,'leqvor-v5',now());
  raise exception 'FAIL plaintext';
 exception when check_violation then null;end;
 begin
  update public.continuity_edges set to_entity_id=r1 where id=edge;
  raise exception 'FAIL mutable edge';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 if exists(select 1 from public.continuity_entities where id=r1) or exists(select 1 from public.continuity_edges where id=edge) then raise exception 'FAIL foreign graph read';end if;
 delete from public.continuity_edges where id=edge;
 begin
  insert into public.continuity_edges values(gen_random_uuid(),a,va,r1,r2,e,e,e,'leqvor-v5',now());
  raise exception 'FAIL forged owner';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 if not exists(select 1 from public.continuity_edges where id=edge) then raise exception 'FAIL foreign graph delete';end if;
 perform public.delete_v5_record(r1,1);
 if exists(select 1 from public.continuity_edges where id=edge) or exists(select 1 from public.continuity_entities where id=r1) then raise exception 'FAIL cascade';end if;
 if not exists(select 1 from public.records where id=r2) then raise exception 'FAIL unrelated source changed';end if;
 execute 'reset role';
 if has_table_privilege('anon','public.continuity_edges','select') or has_table_privilege('authenticated','public.continuity_edges','update') then raise exception 'FAIL privileges';end if;
end $$;
rollback;
