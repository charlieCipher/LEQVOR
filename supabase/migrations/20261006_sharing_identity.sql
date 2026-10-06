begin;
-- Registration does not verify a recipient or authorize any record access.
-- No public key directory and no replace/update path: pins must not silently change.
create function public.register_v5_sharing_identity(target_vault uuid, key_data jsonb)
returns public.user_sharing_keys language plpgsql security definer set search_path='' as $$
declare saved public.user_sharing_keys; pub jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.vaults where id=target_vault and owner_id=auth.uid()) then
  raise exception 'Vault unavailable' using errcode='42501';
 end if;
 pub := key_data->'public_key';
 if key_data->>'crypto_version' is distinct from 'leqvor-v5'
    or not public.v5_valid_ciphertext(key_data->'encrypted_private_key')
    or jsonb_typeof(pub) is distinct from 'object'
    or pub->>'kty' is distinct from 'EC' or pub->>'crv' is distinct from 'P-256'
    or pub ? 'd' or coalesce(pub->>'x','') !~ '^[A-Za-z0-9_-]{43}$'
    or coalesce(pub->>'y','') !~ '^[A-Za-z0-9_-]{43}$'
    or pub - array['kty','crv','x','y','key_ops','ext'] <> '{}'::jsonb then
  raise exception 'Invalid encrypted identity' using errcode='22023';
 end if;
 insert into public.user_sharing_keys(owner_id,vault_id,public_key,encrypted_private_key,crypto_version)
 values(auth.uid(),target_vault,pub,key_data->'encrypted_private_key','leqvor-v5')
 on conflict(owner_id) do nothing;
 select * into saved from public.user_sharing_keys where owner_id=auth.uid();
 return saved;
end $$;
revoke all on function public.register_v5_sharing_identity(uuid,jsonb) from public,anon;
grant execute on function public.register_v5_sharing_identity(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
