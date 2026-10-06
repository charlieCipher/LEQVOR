begin;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000099','sharing-fixture@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
do $$
declare
 v uuid:=gen_random_uuid();
 e jsonb:='{"crypto_version":"leqvor-v5","algorithm":"AES-256-GCM","aad_version":1,"nonce":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}';
 k jsonb; saved public.user_sharing_keys;
begin
 insert into public.vaults(id,owner_id,wrapped_vmk_password,wrapped_vmk_recovery,kdf_salt,kdf_parameters,recovery_salt,crypto_version,recovery_verified_at)
 values(v,auth.uid(),e,e,'fixture','{}','fixture','leqvor-v5',now());
 k:=jsonb_build_object('crypto_version','leqvor-v5','encrypted_private_key',e,'public_key',jsonb_build_object('kty','EC','crv','P-256','x',repeat('A',43),'y',repeat('B',43)));
 saved:=public.register_v5_sharing_identity(v,k);
 if saved.owner_id<>auth.uid() or saved.vault_id<>v then raise exception 'FAIL binding'; end if;
 saved:=public.register_v5_sharing_identity(v,jsonb_set(k,'{public_key,x}',to_jsonb(repeat('C',43))));
 if saved.public_key->>'x'<>repeat('A',43) then raise exception 'FAIL replacement allowed'; end if;
 begin
  perform public.register_v5_sharing_identity(gen_random_uuid(),k);
  raise exception 'FAIL foreign vault';
 exception when insufficient_privilege then null; end;
 begin
  perform public.register_v5_sharing_identity(v,jsonb_set(k,'{public_key,d}','"private"'));
  raise exception 'FAIL plaintext private key accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.register_v5_sharing_identity(v,jsonb_set(k,'{encrypted_private_key}','{}'));
  raise exception 'FAIL missing encryption';
 exception when invalid_parameter_value then null; end;
 begin
  delete from public.user_sharing_keys where owner_id=auth.uid();
  raise exception 'FAIL client deletion';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
