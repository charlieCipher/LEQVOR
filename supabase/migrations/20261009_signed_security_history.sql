begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Event history follows confirmed account deletion, just like vault data.
alter table public.security_events drop constraint security_events_owner_id_fkey;
alter table public.security_events add constraint security_events_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete cascade;
create function public.append_verified_v5_security_event(verified_user uuid,verified_amr jsonb,verified_aal text,event_data jsonb,expected_signer jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare signer public.review_signing_keys;head public.security_events;result uuid;stamp timestamptz;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' or current_user<>'postgres' and current_user<>'supabase_admin' then raise exception 'Privileged writer required' using errcode='42501';end if;
 if verified_user is null or verified_aal is null or verified_aal not in ('aal1','aal2') or jsonb_typeof(verified_amr) is distinct from 'array'
 or not exists(select 1 from jsonb_array_elements(verified_amr) m where m->>'method'='password' and (m->>'timestamp')::bigint between extract(epoch from clock_timestamp())::bigint-300 and extract(epoch from clock_timestamp())::bigint+30)
 or (exists(select 1 from auth.mfa_factors where user_id=verified_user and status='verified') and verified_aal<>'aal2') then raise exception 'Recent authentication required' using errcode='42501';end if;
 -- Serialize the account stream, including concurrent attempts from new devices.
 perform 1 from auth.users where id=verified_user for update;
 if not found then raise exception 'Account unavailable' using errcode='42501';end if;
 select * into signer from public.review_signing_keys where owner_id=verified_user and id=(event_data->>'signing_key_id')::uuid for share;
 if signer.id is null or signer.public_key is distinct from expected_signer then raise exception 'Signing identity changed' using errcode='42501';end if;
 if jsonb_typeof(event_data) is distinct from 'object'
 or not event_data ?& array['id','owner_id','sequence','event_type','severity','device_id','previous_hash','created_at','signing_key_id','event_hash','signature']
 or event_data->>'id' is null or event_data->>'event_hash' is null or event_data->>'signature' is null
 or event_data - array['id','owner_id','sequence','event_type','severity','device_id','previous_hash','created_at','signing_key_id','event_hash','signature']<>'{}'::jsonb
 or event_data->>'owner_id' is distinct from verified_user::text or event_data->>'event_type' is distinct from 'SECURITY_HISTORY_REVIEWED' or event_data->>'severity' is distinct from 'INFO'
 or event_data->'device_id' is distinct from 'null'::jsonb or event_data->>'event_hash' !~ '^[A-Za-z0-9+/]{43}=$' or event_data->>'signature' !~ '^[A-Za-z0-9+/]{86}==$' then raise exception 'Invalid event' using errcode='22023';end if;
 stamp:=(event_data->>'created_at')::timestamptz;
 if stamp is null or stamp<clock_timestamp()-interval '5 minutes' or stamp>clock_timestamp()+interval '30 seconds' then raise exception 'Expired event' using errcode='22023';end if;
 select * into head from public.security_events where owner_id=verified_user order by sequence desc limit 1;
 if (event_data->>'sequence')::bigint is distinct from coalesce(head.sequence,0)+1 or event_data->>'previous_hash' is distinct from head.event_hash then raise exception 'History changed' using errcode='40001';end if;
 if head.id is not null and head.signature->>'domain' is distinct from 'leqvor-security-event-v1' then raise exception 'Legacy stream requires explicit migration' using errcode='42501';end if;
 insert into public.security_events(id,owner_id,sequence,event_type,severity,device_id,encrypted_details,previous_hash,event_hash,signature,created_at)
 values((event_data->>'id')::uuid,verified_user,(event_data->>'sequence')::bigint,'SECURITY_HISTORY_REVIEWED','INFO',null,null,event_data->>'previous_hash',event_data->>'event_hash',jsonb_build_object('domain','leqvor-security-event-v1','signing_key_id',signer.id,'value',event_data->>'signature','public_key',expected_signer),stamp) returning id into result;
 return result;
end $$;
revoke all on function public.append_verified_v5_security_event(uuid,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.append_verified_v5_security_event(uuid,jsonb,text,jsonb,jsonb) to service_role;
commit;
