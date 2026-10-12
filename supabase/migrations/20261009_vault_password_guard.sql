begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- All existing clients must use the guarded wrapper update after rollout.
revoke update on public.vaults from authenticated;
create function public.replace_v5_vault_password(target_vault uuid,expected_nonce text,password_data jsonb)
returns public.vaults language plpgsql security definer set search_path='' as $$
declare saved public.vaults;
begin
 if not public.v5_recent_sharing_auth() or not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) m where m->>'method'='password' and (m->>'timestamp')::bigint between extract(epoch from clock_timestamp())::bigint-300 and extract(epoch from clock_timestamp())::bigint+30)
 then raise exception 'Recent account authentication required' using errcode='42501';end if;
 if jsonb_typeof(password_data) is distinct from 'object' or not password_data ?& array['kdf_salt','kdf_parameters','wrapped_vmk_password']
 or password_data-array['kdf_salt','kdf_parameters','wrapped_vmk_password']<>'{}'::jsonb
 or not public.v5_valid_ciphertext(password_data->'wrapped_vmk_password')
 or password_data->'wrapped_vmk_password'->>'nonce'=expected_nonce
 or coalesce(password_data->>'kdf_salt','') !~ '^[A-Za-z0-9+/]{22}==$'
 or jsonb_typeof(password_data->'kdf_parameters') is distinct from 'object'
 or password_data->'kdf_parameters' is distinct from '{"algorithm":"Argon2id","t":3,"m":65536,"p":1,"dkLen":32}'::jsonb
 then raise exception 'Invalid password wrapper' using errcode='22023';end if;
 select * into saved from public.vaults where id=target_vault and owner_id=auth.uid() for update;
 if saved.id is null then raise exception 'Vault unavailable' using errcode='42501';end if;
 if expected_nonce is null or saved.wrapped_vmk_password->>'nonce' is distinct from expected_nonce then raise exception 'Vault changed' using errcode='PT409';end if;
 update public.vaults set wrapped_vmk_password=password_data->'wrapped_vmk_password',kdf_salt=password_data->>'kdf_salt',kdf_parameters=password_data->'kdf_parameters',updated_at=clock_timestamp() where id=saved.id returning * into saved;
 return saved;
end $$;
revoke all on function public.replace_v5_vault_password(uuid,text,jsonb) from public,anon;
grant execute on function public.replace_v5_vault_password(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
