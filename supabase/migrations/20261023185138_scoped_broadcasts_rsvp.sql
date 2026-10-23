-- Broadcast authority follows live organization appointments, never request-supplied roles.
alter table public.member_broadcasts add column scope_kind text not null default 'national' check(scope_kind in ('national','state','post')),
 add column scope_state text, add column scope_post_id uuid references public.posts(id),
 add column audience_type text, add column audience_status text, add column target_state text, add column target_post_id uuid references public.posts(id),
 add column event jsonb;
alter table public.member_broadcasts add constraint broadcast_scope_shape check(
 (scope_kind='national' and scope_state is null and scope_post_id is null) or
 (scope_kind='state' and scope_state is not null and scope_state ~ '^[A-Z]{2}$' and scope_post_id is null) or
 (scope_kind='post' and scope_state is null and scope_post_id is not null));
alter table public.member_broadcasts add constraint broadcast_event_shape check(event is null or (jsonb_typeof(event)='object' and length(event->>'title') between 1 and 180 and event ? 'starts_at'));
alter table public.member_broadcast_deliveries add column rsvp text check(rsvp in ('yes','maybe','no')), add column rsvp_at timestamptz;
create index broadcast_scope_lookup on public.member_broadcasts(scope_kind,scope_state,scope_post_id);
create function membership_private.broadcast_scope(p_actor uuid,p_kind text,p_state text,p_post uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_actor and deleted_at is null and not access_suspended)
 and not membership_private.is_limited(p_actor) and (
 exists(select 1 from public.profiles where id=p_actor and role='national_commander') or
 exists(select 1 from public.cvoa_access_scopes(p_actor) s where
 (s.role='state_commander' and ((p_kind='state' and s.state=p_state) or (p_kind='post' and exists(select 1 from public.posts where id=p_post and state=s.state)))) or
 (s.role in ('post_commander','post_officer') and p_kind='post' and s.post_id=p_post)));
$$;
revoke all on function membership_private.broadcast_scope(uuid,text,text,uuid) from public,anon,authenticated;
create function public.cvoa_broadcast_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('scopes',coalesce((select jsonb_agg(jsonb_build_object('scope_id',s.scope_id,'kind',case when s.role='national_commander' then 'national' when s.role='state_commander' then 'state' else 'post' end,'state',s.state,'post_id',s.post_id,'label',case when s.role='national_commander' then 'National membership' when s.role='state_commander' then s.state||' Battalion' else coalesce((select name from public.posts where id=s.post_id),'Assigned Company') end)) from public.cvoa_access_scopes(auth.uid()) s where s.role in ('national_commander','state_commander','post_commander','post_officer') and membership_private.broadcast_scope(auth.uid(),case when s.role='national_commander' then 'national' when s.role='state_commander' then 'state' else 'post' end,s.state,s.post_id)),'[]'::jsonb));
$$;
revoke all on function public.cvoa_broadcast_context() from public,anon;
grant execute on function public.cvoa_broadcast_context() to authenticated;
create function public.cvoa_broadcast_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.member_broadcasts b where id=p_id and membership_private.broadcast_scope(auth.uid(),b.scope_kind,b.scope_state,b.scope_post_id));
$$;
revoke all on function public.cvoa_broadcast_access(uuid) from public,anon;
grant execute on function public.cvoa_broadcast_access(uuid) to authenticated;
drop policy commander_read on public.member_broadcasts;
drop policy commander_read on public.member_broadcast_deliveries;
create policy broadcast_scope_read on public.member_broadcasts for select to authenticated using(public.cvoa_broadcast_access(id));
create policy broadcast_scope_read on public.member_broadcast_deliveries for select to authenticated using(public.cvoa_broadcast_access(broadcast_id));
drop policy broadcast_read on storage.objects;
drop policy broadcast_upload on storage.objects;
create policy broadcast_read on storage.objects for select to authenticated using(bucket_id='member-broadcasts' and exists(select 1 from public.member_broadcasts b where b.id::text=(storage.foldername(name))[1] and public.cvoa_broadcast_access(b.id)));
create policy broadcast_upload on storage.objects for insert to authenticated with check(bucket_id='member-broadcasts' and exists(select 1 from public.member_broadcasts b where b.id::text=(storage.foldername(name))[1] and b.status='draft' and public.cvoa_broadcast_access(b.id)));
create function public.cvoa_broadcast_create(p_actor uuid,p_scope text) returns public.member_broadcasts language plpgsql security definer set search_path='' as $$
declare s record; result public.member_broadcasts; k text;
begin
 select * into s from public.cvoa_access_scopes(p_actor) where scope_id=p_scope and role in ('national_commander','state_commander','post_commander','post_officer');
 if s is null then raise exception 'Broadcast workspace unavailable' using errcode='42501'; end if;
 k:=case when s.role='national_commander' then 'national' when s.role='state_commander' then 'state' else 'post' end;
 if not membership_private.broadcast_scope(p_actor,k,s.state,s.post_id) then raise exception 'Broadcast workspace unavailable' using errcode='42501'; end if;
 insert into public.member_broadcasts(owner_id,scope_kind,scope_state,scope_post_id) values(p_actor,k,case when k='state' then s.state end,case when k='post' then s.post_id end) returning * into result;
 return result;
end; $$;
revoke all on function public.cvoa_broadcast_create(uuid,text) from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_create(uuid,text) to service_role;
create function public.cvoa_broadcast_recipients(p_id uuid) returns table(email text,member_name text) language sql stable security definer set search_path='' as $$
 select distinct on (lower(trim(m.email))) lower(trim(m.email)),coalesce(nullif(trim(m.full_name),''),'Member')
 from public.member_broadcasts b join public.members m on m.deleted_at is null left join public.profiles p on p.id=m.profile_id left join public.posts company on company.id=m.post_id
 where b.id=p_id and trim(m.email) ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
 and (m.profile_id is null or (p.id is not null and p.deleted_at is null and not coalesce(p.is_test_account,false)))
 and (b.scope_kind='national' or (b.scope_kind='state' and upper(coalesce(company.state,m.state))=b.scope_state) or (b.scope_kind='post' and m.post_id=b.scope_post_id))
 and (b.target_state is null or upper(coalesce(company.state,m.state))=b.target_state)
 and (b.target_post_id is null or m.post_id=b.target_post_id)
 and (b.audience_type is null or m.membership_type::text=b.audience_type)
 and (b.audience_status is null or m.membership_status::text=b.audience_status)
 order by lower(trim(m.email)),m.created_at,m.id;
$$;
revoke all on function public.cvoa_broadcast_recipients(uuid) from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_recipients(uuid) to service_role;
create function public.cvoa_broadcast_recipient_count(p_id uuid) returns integer language sql stable security definer set search_path='' as $$select count(*)::integer from public.cvoa_broadcast_recipients(p_id);$$;
revoke all on function public.cvoa_broadcast_recipient_count(uuid) from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_recipient_count(uuid) to service_role;

create or replace function public.cvoa_broadcast_queue(p_id uuid,p_actor uuid,p_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare b public.member_broadcasts; n integer;
begin
 select * into b from public.member_broadcasts where id=p_id for update;
 if b.id is null or not membership_private.broadcast_scope(p_actor,b.scope_kind,b.scope_state,b.scope_post_id) then raise exception 'Broadcast workspace unavailable' using errcode='42501'; end if;
 if b.event is not null and ((b.event->>'starts_at')::timestamptz<=now() or ((b.event->>'ends_at') is not null and (b.event->>'ends_at')::timestamptz<=(b.event->>'starts_at')::timestamptz)) then raise exception 'Invitation needs valid future event times'; end if;
 -- Repeated identical requests never create another delivery snapshot.
 if b.status<>'draft' then return (select count(*)::integer from public.member_broadcast_deliveries where broadcast_id=p_id); end if;
 if b.revision<>p_revision then raise exception 'Draft changed. Refresh before sending.'; end if;
 if length(trim(b.subject))=0 or length(trim(b.body))=0 then raise exception 'Subject and message required'; end if;
 insert into public.member_broadcast_deliveries(broadcast_id,email,member_name) select p_id,email,member_name from public.cvoa_broadcast_recipients(p_id);
 get diagnostics n=row_count;
 if n=0 then raise exception 'No deliverable member email addresses'; end if;
 update public.member_broadcasts set status='queued',sent_at=now(),updated_at=now() where id=p_id;
 return n;
end; $$;
create or replace function public.cvoa_broadcast_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.member_broadcast_deliveries; b public.member_broadcasts;
begin
 perform pg_advisory_xact_lock(hashtext('cvoa_broadcast_claim'));
 update public.member_broadcast_deliveries set state='uncertain',failure='Delivery was interrupted. Verify receipt before sending again.' where state='sending' and claimed_at<now()-interval '10 minutes';
 update public.member_broadcasts j set status='complete',updated_at=now() where status='queued' and not exists(select 1 from public.member_broadcast_deliveries where broadcast_id=j.id and state in ('pending','sending'));
 -- Conservative broadcast budget leaves room for transactional Workspace mail.
 if (select count(*) from public.member_broadcast_deliveries where claimed_at>now()-interval '24 hours')>=1000 then return null; end if;
 select r.* into d from public.member_broadcast_deliveries r join public.member_broadcasts j on j.id=r.broadcast_id join public.profiles p on p.id=j.owner_id
 where r.state='pending' and j.status='queued' and j.next_attempt_at<=now() and membership_private.broadcast_scope(j.owner_id,j.scope_kind,j.scope_state,j.scope_post_id)
 and not exists(select 1 from membership_private.account_limits where profile_id=p.id and enabled)
 order by j.sent_at,r.id limit 1 for update of r skip locked;
 if d.id is null then return null; end if;
 -- A removed member is not emailed even if removal happened after queuing.
 if not exists(select 1 from public.cvoa_broadcast_recipients(d.broadcast_id) a where a.email=d.email) then
 update public.member_broadcast_deliveries set state='skipped',failure='Recipient no longer in membership audience' where id=d.id; return jsonb_build_object('skipped',true); end if;
 update public.member_broadcast_deliveries set state='sending',claimed_at=now() where id=d.id;
 select * into b from public.member_broadcasts where id=d.broadcast_id;
 return jsonb_build_object('delivery',to_jsonb(d),'broadcast',to_jsonb(b));
end; $$;
create or replace function public.cvoa_broadcast_retry(p_id uuid,p_actor uuid) returns integer language plpgsql security definer set search_path='' as $$
declare n integer; b public.member_broadcasts;
begin
 select * into b from public.member_broadcasts where id=p_id for update;
 if b.id is null or not membership_private.broadcast_scope(p_actor,b.scope_kind,b.scope_state,b.scope_post_id) then raise exception 'Broadcast workspace unavailable' using errcode='42501'; end if;
 if b.id is null or b.status not in ('queued','complete') then raise exception 'Broadcast cannot be retried'; end if;
 update public.member_broadcast_deliveries set state='pending',failure=null where broadcast_id=p_id and state='failed'; get diagnostics n=row_count;
 if n>0 then update public.member_broadcasts set status='queued',next_attempt_at=now() where id=p_id; end if;
 return n;
end; $$;
-- RSVP uses verified Auth email, never a client-supplied email or delivery ID.
create function public.cvoa_broadcast_rsvp(p_actor uuid,p_id uuid,p_response text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.member_broadcasts; d public.member_broadcast_deliveries; e text;
begin
 if not exists(select 1 from public.profiles where id=p_actor and deleted_at is null and not access_suspended) then raise exception 'Active account required' using errcode='42501'; end if;
 select lower(trim(email)) into e from auth.users where id=p_actor and email_confirmed_at is not null;
 select * into b from public.member_broadcasts where id=p_id;
 select * into d from public.member_broadcast_deliveries where broadcast_id=p_id and email=e and state in ('sent','sending','uncertain');
 if b.id is null or b.event is null or b.status='draft' or d.id is null then raise exception 'Invitation unavailable for this account' using errcode='42501'; end if;
 if not exists(select 1 from public.cvoa_broadcast_recipients(p_id) where email=e) then raise exception 'Membership is no longer in this invitation audience' using errcode='42501'; end if;
 if p_response is not null then
  if p_response not in ('yes','maybe','no') then raise exception 'Choose yes, maybe, or no'; end if;
  if (b.event->>'starts_at')::timestamptz<=now() then raise exception 'RSVP is closed'; end if;
  update public.member_broadcast_deliveries set rsvp=p_response,rsvp_at=now() where id=d.id; d.rsvp:=p_response;
 end if;
 return jsonb_build_object('event',b.event,'subject',b.subject,'response',d.rsvp,'closed',(b.event->>'starts_at')::timestamptz<=now());
end; $$;
revoke all on function public.cvoa_broadcast_rsvp(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_rsvp(uuid,uuid,text) to service_role;
create function public.cvoa_broadcast_responses(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('counts',coalesce((select jsonb_object_agg(response,n) from (select coalesce(rsvp,'awaiting') response,count(*) n from public.member_broadcast_deliveries where broadcast_id=p_id group by rsvp) s),'{}'::jsonb),'people',coalesce((select jsonb_agg(to_jsonb(s)) from (select member_name,email,rsvp,rsvp_at from public.member_broadcast_deliveries where broadcast_id=p_id and rsvp is not null order by rsvp_at desc limit 500) s),'[]'::jsonb));
$$;
revoke all on function public.cvoa_broadcast_responses(uuid) from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_responses(uuid) to service_role;
