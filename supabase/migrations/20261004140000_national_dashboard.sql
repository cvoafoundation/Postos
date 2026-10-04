-- National dashboard summaries: no client row caps or promised-money revenue.
-- Shared published-minutes rule used by the dashboard and staff action queue.
create or replace function public.cvoa_posts_needing_minutes()
returns table(post_id uuid,post_name text,due_date date)
language sql stable security definer set search_path='' as $$
 with today as (select (now() at time zone 'America/New_York')::date as d),
 latest as (select u.post_id,max(u.meeting_date) as meeting_date from public.uro_meetings u,today
   where u.status='published' and u.meeting_date<=today.d group by u.post_id)
 select p.id,p.name,coalesce(l.meeting_date+60,p.charter_date,p.created_at::date)
 from public.posts p cross join today left join latest l on l.post_id=p.id
 where p.status='active_post' and public.cvoa_can_oversee_post(p.id)
 and (l.meeting_date is null or l.meeting_date<today.d-60 or exists(
   select 1 from public.uro_meetings u where u.post_id=p.id and u.status='in_progress' and u.meeting_date<=today.d));
$$;
revoke all on function public.cvoa_posts_needing_minutes() from public,anon;
grant execute on function public.cvoa_posts_needing_minutes() to authenticated;

create or replace function public.cvoa_national_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; month_start date; next_month date; previous_month date;
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National dashboard access required'; end if;
 month_start:=date_trunc('month',now() at time zone 'America/New_York')::date;
 next_month:=(month_start+interval '1 month')::date;
 previous_month:=(month_start-interval '1 month')::date;
 with post_counts as (
 select count(*) filter(where status<>'active_post') as developing,
 count(*) filter(where status='charter_ready') as charter_ready,
 count(*) filter(where status='active_post') as active from public.posts
 ), application_counts as (
 select count(*) filter(where status in ('new_inquiry','application_submitted')) as open,
 count(*) filter(where status in ('interview_scheduled','vetting')) as vetting from public.post_applications
 ), sponsor_counts as (
 select coalesce(sum(sponsorship_value) filter(where stage='won'),0) as committed,
 count(*) filter(where stage not in ('won','lost')) as pipeline from public.sponsors
 ), sponsor_receipts as (
 select coalesce(sum(amount) filter(where sponsor_id is not null and payment_date<=(now() at time zone 'America/New_York')::date),0) as collected,
 coalesce(sum(amount) filter(where payment_date>=month_start and payment_date<next_month and payment_date<=(now() at time zone 'America/New_York')::date),0) as current_month,
 coalesce(sum(amount) filter(where payment_date>=previous_month and payment_date<month_start),0) as last_month from public.sponsor_payments
 ), dues as (
 select coalesce(sum(amount) filter(where paid_at>=(month_start::timestamp at time zone 'America/New_York') and paid_at<(next_month::timestamp at time zone 'America/New_York') and paid_at<=now()),0) as current_month,
 coalesce(sum(amount) filter(where paid_at>=(previous_month::timestamp at time zone 'America/New_York') and paid_at<(month_start::timestamp at time zone 'America/New_York')),0) as last_month
 from public.membership_payments where status='paid'
 ) select jsonb_build_object('generated_at',now(),'metrics',jsonb_build_object(
 'openApplications',a.open,'inVetting',a.vetting,'developingPosts',p.developing,'charterReady',p.charter_ready,'activePosts',p.active,
 'totalMembers',(select count(*) from public.members),
 'committedSponsorships',s.committed,'collectedSponsorships',sr.collected,'sponsorPipeline',s.pipeline,
 'recruitingPipeline',(select count(*) from public.recruits where stage in ('prospect','interested','attended_meeting','applied')),
 'thisMonthReceipts',sr.current_month+d.current_month,'lastMonthReceipts',sr.last_month+d.last_month,
 'overdueOnMinutes',(select count(*) from public.cvoa_posts_needing_minutes()),
 'openResolutions',(select count(*) from public.resolutions where status not in ('passed','rejected','implemented','archived')),
 'activeFacilityProjects',(select count(*) from public.post_facility_projects where status<>'complete')),
 'posts',coalesce((select jsonb_agg(to_jsonb(x) order by x.state,x.name,x.id) from
 (select id,name,city,state,status,health_status,lat,lng,charter_date,created_at,updated_at from public.posts) x),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from
 (select id,summary,created_at from public.activity_feed order by created_at desc,id limit 8) x),'[]'::jsonb))
 into result from post_counts p,application_counts a,sponsor_counts s,sponsor_receipts sr,dues d;
 return result;
end; $$;
revoke all on function public.cvoa_national_dashboard() from public,anon;
grant execute on function public.cvoa_national_dashboard() to authenticated;

create index if not exists dashboard_published_minutes on public.uro_meetings(post_id,meeting_date desc) where status in ('published','in_progress');
create index if not exists dashboard_paid_dues on public.membership_payments(paid_at) where status='paid';
create index if not exists dashboard_sponsor_receipts on public.sponsor_payments(payment_date);

create or replace function public.cvoa_action_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pr public.profiles; result jsonb;
begin
 select * into pr from public.profiles where id=auth.uid();
 if not found or pr.role not in ('national_commander','national_staff','state_commander','post_commander','post_officer') then raise exception 'Staff access required.'; end if;
 with items as (
 select 'minutes:'||u.id as id,case when pr.role in ('national_commander','national_staff','state_commander') then 'Awaiting published minutes: '||u.title else 'Complete minutes: '||u.title end as title,u.meeting_date as due_date,
 'minutes' as kind,case when pr.role='state_commander' then '/state' else '/meetings/uro/'||u.id end as path
 from public.uro_meetings u where u.status='in_progress' and u.meeting_date<=(now() at time zone 'America/New_York')::date and public.cvoa_can_oversee_post(u.post_id)
 union all
 select 'minutes-post:'||p.post_id,'Published minutes overdue: '||p.post_name,p.due_date,'minutes',
 case when pr.role='state_commander' then '/state' else '/meetings?post='||p.post_id end
 from public.cvoa_posts_needing_minutes() p
 where not exists(select 1 from public.uro_meetings u where u.post_id=p.post_id and u.status='in_progress' and u.meeting_date<=(now() at time zone 'America/New_York')::date)
 union all
 select 'renewal:'||m.id,'Membership expires: '||case when pr.role='state_commander' then p.name else m.full_name end,m.expires_at,'membership',
 case when pr.role='state_commander' then '/state' else '/members?highlight='||m.id end
 from public.members m left join public.posts p on p.id=m.post_id where m.membership_type='annual' and m.membership_status='active'
 and m.expires_at <= current_date+30 and public.cvoa_can_oversee_post(m.post_id)
 union all
 select 'action:'||a.id,a.description,a.due_date,'task',case when pr.role='state_commander' then '/state' when public.is_national_role() then '/meetings/uro-actions' else '/meetings/uro/'||a.meeting_id end
 from public.uro_action_items a where a.status='open' and a.due_date<=current_date and public.cvoa_can_oversee_post(a.post_id)
 union all
 select 'meeting:'||u.id,'Upcoming meeting: '||u.title,u.meeting_date,'meeting',case when pr.role='state_commander' then '/state' else '/meetings/uro/'||u.id end
 from public.uro_meetings u where u.meeting_date>current_date and u.meeting_date<=current_date+30 and public.cvoa_can_oversee_post(u.post_id)
 union all
 select 'application:'||a.id,'Review post application: '||a.city||', '||a.state,a.created_at::date,'application','/applications'
 from public.post_applications a where a.status not in ('approved','founding_team_building','charter_ready','active_post') and public.is_national_role()
 union all
 select 'transfer:'||r.id,'Review post affiliation request',r.created_at::date,'application','/membership-requests'
 from public.membership_change_requests r where r.status='pending' and public.is_national_role()
 union all
 select 'campaign:'||c.id,'Campaign deadline: '||c.title,c.deadline,'fundraising','/fundraising?post='||c.post_id
 from public.fundraising_campaigns c where c.status<>'completed' and c.deadline<=current_date+30 and public.cvoa_can_oversee_post(c.post_id)
 union all
 select 'escalation:'||e.id,'State / post escalation: '||e.subject,e.created_at::date,'review','/state'
 from public.state_escalations e where e.status='open' and public.is_national_role()
 ) select jsonb_build_object('total',(select count(*) from items),'items',
 (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from
 (select * from items order by due_date nulls last,id limit 100) x)) into result;
 return result;
end; $$;

