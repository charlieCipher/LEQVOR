-- Administrative authenticated review. Never issues or activates record grants.
begin;
set local lock_timeout='5s';
create table public.trigger_review_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null,
 vault_id uuid not null,
 rule_id uuid not null,
 grant_id uuid not null references public.record_grants(id) on delete cascade,
 reviewer_id uuid not null references auth.users(id) on delete cascade,
 record_revision bigint not null check(record_revision>0),
 expires_at timestamptz not null,
 cancelled_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(rule_id,owner_id,vault_id) references public.trigger_rules(id,owner_id,vault_id) on delete cascade,
 check(owner_id<>reviewer_id)
);
create table public.trigger_reviewer_decisions (
 request_id uuid primary key references public.trigger_review_requests(id) on delete cascade,
 reviewer_id uuid not null references auth.users(id) on delete cascade,
 outcome text not null check(outcome in ('APPROVED','REJECTED','NEEDS_REVIEW')),
 created_at timestamptz not null default now()
);
alter table public.trigger_review_requests enable row level security;
alter table public.trigger_review_requests force row level security;
alter table public.trigger_reviewer_decisions enable row level security;
alter table public.trigger_reviewer_decisions force row level security;
create policy participants_read on public.trigger_review_requests for select to authenticated using(owner_id=auth.uid() or reviewer_id=auth.uid());
create policy participant_boundary on public.trigger_review_requests as restrictive for select to authenticated using(owner_id=auth.uid() or reviewer_id=auth.uid());
create policy participants_read on public.trigger_reviewer_decisions for select to authenticated using(exists(select 1 from public.trigger_review_requests r where r.id=request_id and (r.owner_id=auth.uid() or r.reviewer_id=auth.uid())));
create policy participant_boundary on public.trigger_reviewer_decisions as restrictive for select to authenticated using(exists(select 1 from public.trigger_review_requests r where r.id=request_id and (r.owner_id=auth.uid() or r.reviewer_id=auth.uid())));
revoke all on public.trigger_review_requests,public.trigger_reviewer_decisions from public,anon,authenticated;
grant select on public.trigger_review_requests,public.trigger_reviewer_decisions to authenticated;
create index on public.trigger_review_requests(owner_id,vault_id,created_at);
create index on public.trigger_review_requests(reviewer_id,created_at);

create function public.request_v5_trigger_review(target_rule uuid,selected_grant uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.trigger_rules;g public.record_grants;request uuid;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 select * into r from public.trigger_rules where id=target_rule and owner_id=auth.uid();
 if r.id is null then raise exception 'Rule unavailable' using errcode='42501';end if;
 -- Lock grant first, consistently with cancellation/decision, to serialize revocation.
 select * into g from public.record_grants where id=selected_grant for update;
 if g.id is null or g.owner_id<>auth.uid() or g.vault_id<>r.vault_id or g.record_id<>r.record_id
 or g.status<>'active' or g.crypto_version is distinct from 'leqvor-v5' or g.expires_at is null or g.expires_at<=now()
 or not exists(select 1 from public.user_sharing_keys where owner_id=g.recipient_id) then
  raise exception 'Accepted selected share required' using errcode='42501';end if;
 perform 1 from public.vaults where id=r.vault_id and owner_id=auth.uid() for update;
 if (select count(*) from public.trigger_review_requests where owner_id=auth.uid() and cancelled_at is null and expires_at>now())>=100 then raise exception 'Review limit reached' using errcode='22023';end if;
 if exists(select 1 from public.trigger_review_requests where rule_id=r.id and grant_id=g.id and cancelled_at is null and expires_at>now()) then raise exception 'Review already requested' using errcode='22023';end if;
 insert into public.trigger_review_requests(owner_id,vault_id,rule_id,grant_id,reviewer_id,record_revision,expires_at)
 values(auth.uid(),r.vault_id,r.id,g.id,g.recipient_id,g.record_revision,least(g.expires_at,now()+interval '7 days')) returning id into request;
 return request;
end $$;

create function public.decide_v5_trigger_review(target uuid,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.trigger_review_requests;g public.record_grants;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 if decision is null or decision not in ('APPROVED','REJECTED','NEEDS_REVIEW') then raise exception 'Invalid review decision' using errcode='22023';end if;
 select * into r from public.trigger_review_requests where id=target and reviewer_id=auth.uid();
 if r.id is null then raise exception 'Review unavailable' using errcode='42501';end if;
 select * into g from public.record_grants where id=r.grant_id for update;
 select * into r from public.trigger_review_requests where id=target and reviewer_id=auth.uid() for update;
 if r.id is null or r.cancelled_at is not null or r.expires_at<=now() or g.id is null or g.status<>'active'
 or g.crypto_version is distinct from 'leqvor-v5' or g.expires_at is null or g.expires_at<=now()
 or g.recipient_id<>auth.uid() or g.owner_id<>r.owner_id or g.record_revision is distinct from r.record_revision
 or not exists(select 1 from public.user_sharing_keys where owner_id=auth.uid()) then raise exception 'Review unavailable' using errcode='42501';end if;
 if exists(select 1 from public.trigger_reviewer_decisions where request_id=r.id) then raise exception 'Decision already recorded' using errcode='22023';end if;
 insert into public.trigger_reviewer_decisions(request_id,reviewer_id,outcome) values(r.id,auth.uid(),decision);
end $$;

create function public.cancel_v5_trigger_review(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.trigger_review_requests;
begin
 if not public.v5_recent_sharing_auth() then raise exception 'Recent authentication required' using errcode='42501';end if;
 select * into r from public.trigger_review_requests where id=target and owner_id=auth.uid();
 if r.id is null then raise exception 'Review unavailable' using errcode='42501';end if;
 perform 1 from public.record_grants where id=r.grant_id for update;
 update public.trigger_review_requests set cancelled_at=now() where id=target and owner_id=auth.uid() and cancelled_at is null;
 if not found then raise exception 'Review unavailable' using errcode='42501';end if;
end $$;
revoke all on function public.request_v5_trigger_review(uuid,uuid),public.decide_v5_trigger_review(uuid,text),public.cancel_v5_trigger_review(uuid) from public,anon;
grant execute on function public.request_v5_trigger_review(uuid,uuid),public.decide_v5_trigger_review(uuid,text),public.cancel_v5_trigger_review(uuid) to authenticated;
commit;
