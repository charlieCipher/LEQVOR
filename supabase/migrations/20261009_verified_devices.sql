begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table public.vault_devices (
 id uuid primary key, owner_id uuid not null, vault_id uuid not null,
 public_key jsonb not null, created_at timestamptz not null default clock_timestamp(),
 last_verified_at timestamptz not null default clock_timestamp(), revoked_at timestamptz,
 foreign key(vault_id,owner_id) references public.vaults(id,owner_id) on delete cascade,
 unique(id,owner_id,vault_id),
 check(public_key ?& array['kty','crv','x','y'] and public_key-array['kty','crv','x','y']='{}'::jsonb
  and public_key->>'kty'='EC' and public_key->>'crv'='P-256'
  and public_key->>'x' ~ '^[A-Za-z0-9_-]{43}$' and public_key->>'y' ~ '^[A-Za-z0-9_-]{43}$')
);
create table public.device_challenges (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, vault_id uuid not null,
 device_id uuid not null, session_id uuid not null, purpose text not null check(purpose in ('enroll','verify')),
 nonce text not null default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
 public_key jsonb not null, expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 consumed_at timestamptz,
 foreign key(vault_id,owner_id) references public.vaults(id,owner_id) on delete cascade
);
do $$declare t text;begin
 foreach t in array array['vault_devices','device_challenges'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=auth.uid())',t);
  execute format('create policy owner_boundary on public.%I as restrictive for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid())',t);
 end loop;
end $$;

create function public.begin_v5_device_challenge(target_vault uuid,target_device uuid,operation text,key_data jsonb)
returns public.device_challenges language plpgsql security definer set search_path='' as $$
declare saved public.device_challenges;existing public.vault_devices;current_session uuid;
begin
 current_session:=(auth.jwt()->>'session_id')::uuid;
 if current_session is null or not public.v5_recent_sharing_auth()
 or not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) m where m->>'method'='password' and (m->>'timestamp')::bigint between extract(epoch from clock_timestamp())::bigint-300 and extract(epoch from clock_timestamp())::bigint+30)
 then raise exception 'Recent account authentication required' using errcode='42501';end if;
 perform 1 from auth.users where id=auth.uid() for update;
 perform 1 from public.vaults where id=target_vault and owner_id=auth.uid() for update;
 if not found or operation is null or operation not in ('enroll','verify') or target_device is null then raise exception 'Device unavailable' using errcode='42501';end if;
 if jsonb_typeof(key_data) is distinct from 'object' or not key_data ?& array['kty','crv','x','y']
 or key_data-array['kty','crv','x','y']<>'{}'::jsonb or key_data->>'kty' is distinct from 'EC' or key_data->>'crv' is distinct from 'P-256'
 or coalesce(key_data->>'x','') !~ '^[A-Za-z0-9_-]{43}$' or coalesce(key_data->>'y','') !~ '^[A-Za-z0-9_-]{43}$'
 then raise exception 'Invalid device key' using errcode='22023';end if;
 select * into existing from public.vault_devices where id=target_device;
 if operation='enroll' and existing.id is not null then raise exception 'Device already registered' using errcode='PT409';end if;
 if operation='verify' and (existing.id is null or existing.owner_id<>auth.uid() or existing.vault_id<>target_vault or existing.revoked_at is not null or existing.public_key<>key_data) then raise exception 'Device unavailable' using errcode='42501';end if;
 delete from public.device_challenges where owner_id=auth.uid() and expires_at<clock_timestamp()-interval '1 day';
 if (select count(*) from public.device_challenges where owner_id=auth.uid() and expires_at>clock_timestamp() and consumed_at is null)>=10 then raise exception 'Too many pending challenges' using errcode='PT429';end if;
 insert into public.device_challenges(owner_id,vault_id,device_id,session_id,purpose,public_key)
 values(auth.uid(),target_vault,target_device,current_session,operation,key_data) returning * into saved;
 return saved;
end $$;
revoke all on function public.begin_v5_device_challenge(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.begin_v5_device_challenge(uuid,uuid,text,jsonb) to authenticated;

-- Only the fixed-project API may invoke this after verifying the signature over
-- the exact challenge. No client can enroll itself through a direct table write.
create function public.complete_verified_v5_device(verified_user uuid,verified_session uuid,verified_amr jsonb,verified_aal text,expected_challenge jsonb,event_data jsonb,expected_signer jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare challenge public.device_challenges;device public.vault_devices;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' or current_user not in ('postgres','supabase_admin') then raise exception 'Privileged writer required' using errcode='42501';end if;
 if verified_user is null or verified_session is null or verified_aal is null or verified_aal not in ('aal1','aal2') or jsonb_typeof(verified_amr) is distinct from 'array'
 or not exists(select 1 from jsonb_array_elements(verified_amr) m where m->>'method'='password' and (m->>'timestamp')::bigint between extract(epoch from clock_timestamp())::bigint-300 and extract(epoch from clock_timestamp())::bigint+30)
 or (exists(select 1 from auth.mfa_factors where user_id=verified_user and status='verified') and verified_aal<>'aal2') then raise exception 'Recent account authentication required' using errcode='42501';end if;
 perform 1 from auth.users where id=verified_user for update;
 select * into challenge from public.device_challenges where id=(expected_challenge->>'id')::uuid and owner_id=verified_user;
 if challenge.id is null then raise exception 'Challenge unavailable' using errcode='PT409';end if;
 -- The vault row serializes enrollment and revocation, including an in-flight
 -- verification racing with owner revocation.
 perform 1 from public.vaults where id=challenge.vault_id and owner_id=verified_user for update;
 if not found then raise exception 'Vault unavailable' using errcode='42501';end if;
 select * into challenge from public.device_challenges where id=(expected_challenge->>'id')::uuid and owner_id=verified_user for update;
 if challenge.id is null or challenge.session_id<>verified_session or to_jsonb(challenge) is distinct from expected_challenge or challenge.consumed_at is not null or challenge.expires_at<=clock_timestamp() then raise exception 'Challenge unavailable' using errcode='PT409';end if;
 if event_data->>'device_id' is distinct from challenge.device_id::text or event_data->>'event_type' is distinct from (case when challenge.purpose='enroll' then 'DEVICE_ENROLLED' else 'DEVICE_PROOF_VERIFIED' end) then raise exception 'Event mismatch' using errcode='22023';end if;
 if challenge.purpose='enroll' then
  if exists(select 1 from public.vault_devices where id=challenge.device_id) then raise exception 'Device already registered' using errcode='PT409';end if;
  insert into public.vault_devices(id,owner_id,vault_id,public_key) values(challenge.device_id,verified_user,challenge.vault_id,challenge.public_key);
 else
  select * into device from public.vault_devices where id=challenge.device_id and owner_id=verified_user and vault_id=challenge.vault_id for update;
  if device.id is null or device.revoked_at is not null or device.public_key<>challenge.public_key then raise exception 'Device unavailable' using errcode='42501';end if;
  update public.vault_devices set last_verified_at=clock_timestamp() where id=device.id;
 end if;
 update public.device_challenges set consumed_at=clock_timestamp() where id=challenge.id;
 perform public.append_v5_device_history(verified_user,event_data,expected_signer);
 return challenge.device_id;
end $$;
revoke all on function public.complete_verified_v5_device(uuid,uuid,jsonb,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_verified_v5_device(uuid,uuid,jsonb,text,jsonb,jsonb,jsonb) to service_role;

create function public.revoke_verified_v5_device(verified_user uuid,verified_amr jsonb,verified_aal text,target_device uuid,event_data jsonb,expected_signer jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_vault uuid;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' or current_user not in ('postgres','supabase_admin') then raise exception 'Privileged writer required' using errcode='42501';end if;
 if verified_user is null or verified_aal is null or verified_aal not in ('aal1','aal2') or jsonb_typeof(verified_amr) is distinct from 'array'
 or not exists(select 1 from jsonb_array_elements(verified_amr) m where m->>'method'='password' and (m->>'timestamp')::bigint between extract(epoch from clock_timestamp())::bigint-300 and extract(epoch from clock_timestamp())::bigint+30)
 or (exists(select 1 from auth.mfa_factors where user_id=verified_user and status='verified') and verified_aal<>'aal2') then raise exception 'Recent account authentication required' using errcode='42501';end if;
 if event_data->>'device_id' is distinct from target_device::text or event_data->>'event_type' is distinct from 'DEVICE_REVOKED' then raise exception 'Event mismatch' using errcode='22023';end if;
 perform 1 from auth.users where id=verified_user for update;
 select vault_id into target_vault from public.vault_devices where id=target_device and owner_id=verified_user;
 perform 1 from public.vaults where id=target_vault and owner_id=verified_user for update;
 if not found then raise exception 'Device unavailable' using errcode='42501';end if;
 update public.vault_devices set revoked_at=clock_timestamp() where id=target_device and vault_id=target_vault and owner_id=verified_user and revoked_at is null;
 if not found then raise exception 'Device unavailable' using errcode='42501';end if;
 delete from public.device_challenges where device_id=target_device and owner_id=verified_user;
 perform public.append_v5_device_history(verified_user,event_data,expected_signer);
 return target_device;
end $$;
revoke all on function public.revoke_verified_v5_device(uuid,jsonb,text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.revoke_verified_v5_device(uuid,jsonb,text,uuid,jsonb,jsonb) to service_role;

-- Internal append only. The API verifies the account signature and the outer
-- function executes the actual device action in this same transaction.
create function public.append_v5_device_history(verified_user uuid,event_data jsonb,expected_signer jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare signer public.review_signing_keys;head public.security_events;stamp timestamptz;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' or current_user not in ('postgres','supabase_admin') then raise exception 'Privileged writer required' using errcode='42501';end if;
 perform 1 from auth.users where id=verified_user for update;
 if not found then raise exception 'Account unavailable' using errcode='42501';end if;
 select * into signer from public.review_signing_keys where owner_id=verified_user and id=(event_data->>'signing_key_id')::uuid for share;
 if signer.id is null or signer.public_key is distinct from expected_signer then raise exception 'Signing identity changed' using errcode='42501';end if;
 if jsonb_typeof(event_data) is distinct from 'object'
 or not event_data ?& array['id','owner_id','sequence','event_type','severity','device_id','previous_hash','created_at','signing_key_id','event_hash','signature']
 or event_data-array['id','owner_id','sequence','event_type','severity','device_id','previous_hash','created_at','signing_key_id','event_hash','signature']<>'{}'::jsonb
 or event_data->>'owner_id' is distinct from verified_user::text or coalesce(event_data->>'event_type','') not in ('DEVICE_ENROLLED','DEVICE_PROOF_VERIFIED','DEVICE_REVOKED') or event_data->>'severity' is distinct from 'INFO'
 or event_data->>'id' is null or event_data->>'device_id' is null or coalesce(event_data->>'event_hash','') !~ '^[A-Za-z0-9+/]{43}=$' or coalesce(event_data->>'signature','') !~ '^[A-Za-z0-9+/]{86}==$' then raise exception 'Invalid event' using errcode='22023';end if;
 stamp:=(event_data->>'created_at')::timestamptz;
 if stamp is null or stamp<clock_timestamp()-interval '5 minutes' or stamp>clock_timestamp()+interval '30 seconds' then raise exception 'Expired event' using errcode='22023';end if;
 select * into head from public.security_events where owner_id=verified_user order by sequence desc limit 1;
 if (event_data->>'sequence')::bigint is distinct from coalesce(head.sequence,0)+1 or event_data->>'previous_hash' is distinct from head.event_hash then raise exception 'History changed' using errcode='PT409';end if;
 if head.id is not null and head.signature->>'domain' is distinct from 'leqvor-security-event-v1' then raise exception 'Legacy stream requires explicit migration' using errcode='42501';end if;
 insert into public.security_events(id,owner_id,sequence,event_type,severity,device_id,encrypted_details,previous_hash,event_hash,signature,created_at)
 values((event_data->>'id')::uuid,verified_user,(event_data->>'sequence')::bigint,event_data->>'event_type','INFO',(event_data->>'device_id')::uuid,null,event_data->>'previous_hash',event_data->>'event_hash',jsonb_build_object('domain','leqvor-security-event-v1','signing_key_id',signer.id,'value',event_data->>'signature','public_key',expected_signer),stamp);
end $$;
revoke all on function public.append_v5_device_history(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
