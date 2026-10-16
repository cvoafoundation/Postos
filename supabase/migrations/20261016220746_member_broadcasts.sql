-- Commander-only broadcasts. Recipients are snapshotted and deduplicated at send.
create function public.cvoa_broadcast_commander() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='national_commander' and deleted_at is null and not access_suspended)
 and not public.cvoa_membership_only();
$$;
revoke all on function public.cvoa_broadcast_commander() from public,anon;
grant execute on function public.cvoa_broadcast_commander() to authenticated;
create table public.member_broadcasts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 subject text not null default '' check(length(subject)<=180), body text not null default '' check(length(body)<=30000),
 attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=8),
 status text not null default 'draft' check(status in ('draft','queued','complete','cancelled')),
 revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz, last_test_at timestamptz, next_attempt_at timestamptz not null default now()
);
create table public.member_broadcast_deliveries (
 id uuid primary key default gen_random_uuid(), broadcast_id uuid not null references public.member_broadcasts(id),
 email text not null, member_name text not null, state text not null default 'pending' check(state in ('pending','sending','sent','failed','uncertain','skipped')),
 claimed_at timestamptz, sent_at timestamptz, failure text, unique(broadcast_id,email)
);
create index member_broadcast_pending on public.member_broadcast_deliveries(broadcast_id,state) where state in ('pending','sending');
create index member_broadcast_sent on public.member_broadcast_deliveries(sent_at) where sent_at is not null;
alter table public.member_broadcasts enable row level security;
alter table public.member_broadcast_deliveries enable row level security;
revoke all on public.member_broadcasts,public.member_broadcast_deliveries from anon,authenticated;
grant select on public.member_broadcasts,public.member_broadcast_deliveries to authenticated;
grant all on public.member_broadcasts,public.member_broadcast_deliveries to service_role;
create policy commander_read on public.member_broadcasts for select to authenticated using ((select public.cvoa_broadcast_commander()));
create policy commander_read on public.member_broadcast_deliveries for select to authenticated using ((select public.cvoa_broadcast_commander()));
-- All non-read mutations run through the authenticated Edge endpoint.
create function public.cvoa_broadcast_audience() returns table(email text,member_name text) language sql stable security definer set search_path='' as $$
 select distinct on (lower(trim(m.email))) lower(trim(m.email)),coalesce(nullif(trim(m.full_name),''),'Member')
 from public.members m left join public.profiles p on p.id=m.profile_id
 where m.deleted_at is null and trim(m.email) ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
 and (m.profile_id is null or (p.id is not null and p.deleted_at is null and not coalesce(p.is_test_account,false)))
 order by lower(trim(m.email)),m.created_at,m.id;
$$;
revoke all on function public.cvoa_broadcast_audience() from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_audience() to service_role;
create function public.cvoa_broadcast_queue(p_id uuid,p_actor uuid,p_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare b public.member_broadcasts; n integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='national_commander' and deleted_at is null and not access_suspended)
 or exists(select 1 from membership_private.account_limits where profile_id=p_actor and enabled) then
 raise exception 'National Commander access required' using errcode='42501'; end if;
 select * into b from public.member_broadcasts where id=p_id for update;
 if b.id is null then raise exception 'Broadcast unavailable'; end if;
 -- Repeated identical requests never create another delivery snapshot.
 if b.status<>'draft' then return (select count(*)::integer from public.member_broadcast_deliveries where broadcast_id=p_id); end if;
 if b.revision<>p_revision then raise exception 'Draft changed. Refresh before sending.'; end if;
 if length(trim(b.subject))=0 or length(trim(b.body))=0 then raise exception 'Subject and message required'; end if;
 insert into public.member_broadcast_deliveries(broadcast_id,email,member_name) select p_id,email,member_name from public.cvoa_broadcast_audience();
 get diagnostics n=row_count;
 if n=0 then raise exception 'No deliverable member email addresses'; end if;
 update public.member_broadcasts set status='queued',sent_at=now(),updated_at=now() where id=p_id;
 return n;
end; $$;
revoke all on function public.cvoa_broadcast_queue(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_queue(uuid,uuid,integer) to service_role;
-- Claim one recipient transactionally. Expired claims are uncertain, never auto-retried.
create function public.cvoa_broadcast_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.member_broadcast_deliveries; b public.member_broadcasts;
begin
 perform pg_advisory_xact_lock(hashtext('cvoa_broadcast_claim'));
 update public.member_broadcast_deliveries set state='uncertain',failure='Delivery was interrupted. Verify receipt before sending again.' where state='sending' and claimed_at<now()-interval '10 minutes';
 update public.member_broadcasts j set status='complete',updated_at=now() where status='queued' and not exists(select 1 from public.member_broadcast_deliveries where broadcast_id=j.id and state in ('pending','sending'));
 -- Conservative broadcast budget leaves room for transactional Workspace mail.
 if (select count(*) from public.member_broadcast_deliveries where claimed_at>now()-interval '24 hours')>=1000 then return null; end if;
 select r.* into d from public.member_broadcast_deliveries r join public.member_broadcasts j on j.id=r.broadcast_id join public.profiles p on p.id=j.owner_id
 where r.state='pending' and j.status='queued' and j.next_attempt_at<=now() and p.role='national_commander' and p.deleted_at is null and not p.access_suspended
 and not exists(select 1 from membership_private.account_limits where profile_id=p.id and enabled)
 order by j.sent_at,r.id limit 1 for update of r skip locked;
 if d.id is null then return null; end if;
 -- A removed member is not emailed even if removal happened after queuing.
 if not exists(select 1 from public.cvoa_broadcast_audience() a where a.email=d.email) then
 update public.member_broadcast_deliveries set state='skipped',failure='Recipient no longer in membership audience' where id=d.id; return jsonb_build_object('skipped',true); end if;
 update public.member_broadcast_deliveries set state='sending',claimed_at=now() where id=d.id;
 select * into b from public.member_broadcasts where id=d.broadcast_id;
 return jsonb_build_object('delivery',to_jsonb(d),'broadcast',to_jsonb(b));
end; $$;
revoke all on function public.cvoa_broadcast_claim() from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_claim() to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('member-broadcasts','member-broadcasts',false,8388608,array['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','audio/mpeg']) on conflict(id) do nothing;
create policy broadcast_upload on storage.objects for insert to authenticated with check(bucket_id='member-broadcasts' and (select public.cvoa_broadcast_commander()) and exists(select 1 from public.member_broadcasts b where b.id::text=(storage.foldername(name))[1] and b.status='draft' and b.owner_id=(select auth.uid())));
create policy broadcast_read on storage.objects for select to authenticated using(bucket_id='member-broadcasts' and (select public.cvoa_broadcast_commander()));
-- No overwrite/delete policy: queued message files remain immutable.
select vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'member_broadcast_worker');
create function public.cvoa_broadcast_verify_worker(p_secret text) returns boolean language sql security definer set search_path='' as $$
 select length(p_secret)=64 and exists(select 1 from vault.decrypted_secrets where name='member_broadcast_worker' and decrypted_secret=p_secret);
$$;
revoke all on function public.cvoa_broadcast_verify_worker(text) from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_verify_worker(text) to service_role;
select cron.schedule('member-broadcast-mail','* * * * *',$job$
 select net.http_post(url:='https://mvlhtuoukhorxmmibruc.supabase.co/functions/v1/member-broadcasts',headers:=jsonb_build_object('Content-Type','application/json','x-broadcast-secret',(select decrypted_secret from vault.decrypted_secrets where name='member_broadcast_worker')),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=60000);
$job$);
create function public.cvoa_broadcast_audience_count() returns integer language sql stable security definer set search_path='' as $$ select count(*)::integer from public.cvoa_broadcast_audience(); $$;
create function public.cvoa_broadcast_stats(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(state,n),'{}'::jsonb) from (select state,count(*) n from public.member_broadcast_deliveries where broadcast_id=p_id group by state) s;
$$;
create function public.cvoa_broadcast_retry(p_id uuid,p_actor uuid) returns integer language plpgsql security definer set search_path='' as $$
declare n integer; b public.member_broadcasts;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='national_commander' and deleted_at is null and not access_suspended) or membership_private.is_limited(p_actor) then raise exception 'National Commander access required' using errcode='42501'; end if;
 select * into b from public.member_broadcasts where id=p_id for update;
 if b.id is null or b.status not in ('queued','complete') then raise exception 'Broadcast cannot be retried'; end if;
 update public.member_broadcast_deliveries set state='pending',failure=null where broadcast_id=p_id and state='failed'; get diagnostics n=row_count;
 if n>0 then update public.member_broadcasts set status='queued',next_attempt_at=now() where id=p_id; end if;
 return n;
end; $$;
revoke all on function public.cvoa_broadcast_audience_count(),public.cvoa_broadcast_stats(uuid),public.cvoa_broadcast_retry(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cvoa_broadcast_audience_count(),public.cvoa_broadcast_stats(uuid),public.cvoa_broadcast_retry(uuid,uuid) to service_role;
