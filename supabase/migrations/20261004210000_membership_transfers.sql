begin;
alter table public.membership_change_requests add column source_post_id uuid references public.posts(id);
alter table public.membership_change_requests add column source_recorded boolean not null default false;
-- Only pending requests have a reliable current source; preserve unknown historical origins.
update public.membership_change_requests r set source_post_id=m.post_id,source_recorded=true from public.members m where m.id=r.member_id and r.status='pending';
create function public.cvoa_can_review_transfer(p_target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_national_role() or (p_target is not null and public.cvoa_access_enabled() and exists(select 1 from public.cvoa_access_scopes(auth.uid()) s where s.role='post_commander' and s.post_id=p_target));
$$;
create function public.cvoa_can_oversee_transfer(p_source uuid,p_target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_national_role() or public.cvoa_can_oversee_post(p_source) or public.cvoa_can_oversee_post(p_target);
$$;
alter policy change_request_read on public.membership_change_requests using(requested_by=auth.uid() or public.cvoa_can_oversee_transfer(source_post_id,target_post_id));
create or replace function public.cvoa_request_post_change(p_member uuid,p_post uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.members; result uuid; begin
 if not public.cvoa_access_enabled() then raise exception 'Active account access required.'; end if;
 select * into m from public.members where id=p_member and profile_id=auth.uid() for update;
 if not found or m.membership_status<>'active' then raise exception 'An active membership linked to your account is required.'; end if;
 if m.post_id is not distinct from p_post then raise exception 'You already belong to this post or are already at large.'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Explain your requested change.'; end if;
 if p_post is not null and not exists(select 1 from public.posts where id=p_post and status='active_post') then raise exception 'Choose an active post.'; end if;
 insert into public.membership_change_requests(member_id,requested_by,target_post_id,source_post_id,source_recorded,reason) values(p_member,auth.uid(),p_post,m.post_id,true,trim(p_reason)) returning id into result;
 return result;
end; $$;
create or replace function public.cvoa_review_post_change(p_request uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.membership_change_requests; m public.members; begin
 select * into r from public.membership_change_requests where id=p_request for update;
 if not found or not public.cvoa_can_review_transfer(r.target_post_id) then raise exception 'Receiving post commander or National approval is required.'; end if;
 if r.status<>'pending' then raise exception 'Request is no longer pending.'; end if;
 if nullif(trim(p_note),'') is null then raise exception 'Explain the decision to the member.'; end if;
 select * into m from public.members where id=r.member_id for update;
 if p_approve then
   if m.membership_status<>'active' then raise exception 'Membership must be active before reassignment.'; end if;
   if r.source_recorded and m.post_id is distinct from r.source_post_id then raise exception 'The member affiliation changed. Withdraw this request and submit a new one.'; end if;
   if r.target_post_id is not null and not exists(select 1 from public.posts where id=r.target_post_id and status='active_post') then raise exception 'The requested post is no longer active.'; end if;
   update public.members set post_id=r.target_post_id where id=r.member_id;
   -- Membership transfers never move or grant operational authority.
   update public.profiles set post_id=r.target_post_id where id=m.profile_id and role='member';
 end if;
 update public.membership_change_requests set status=case when p_approve then 'approved' else 'declined' end,review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now() where id=p_request;
end; $$;
create function public.cvoa_withdraw_post_change(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Active account access required.'; end if;
 update public.membership_change_requests set status='withdrawn' where id=p_request and requested_by=auth.uid() and status='pending';
 if not found then raise exception 'Only your pending request can be withdrawn.'; end if;
end; $$;
-- Narrow review context for incoming members; does not open another post's roster.
create function public.cvoa_transfer_requests() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',r.id,'member_id',r.member_id,'member_name',m.full_name,'reason',r.reason,'status',r.status,'created_at',r.created_at,'reviewed_at',r.reviewed_at,'review_note',r.review_note,
 'source_post_id',r.source_post_id,'source_recorded',r.source_recorded,'source_name',sp.name,'target_post_id',r.target_post_id,'target_name',tp.name,
 'can_review',public.cvoa_can_review_transfer(r.target_post_id),
 'can_open_member',public.cvoa_can_oversee_post(m.post_id),
 'staff_access',exists(select 1 from public.cvoa_access_scopes(m.profile_id) s where s.role in ('post_commander','post_officer','state_commander','national_staff','national_commander','delegate'))
 ) order by r.created_at desc,r.id),'[]'::jsonb)
 from public.membership_change_requests r join public.members m on m.id=r.member_id left join public.posts sp on sp.id=r.source_post_id left join public.posts tp on tp.id=r.target_post_id
 where public.cvoa_access_enabled() and public.cvoa_can_oversee_transfer(r.source_post_id,r.target_post_id);
$$;
revoke all on function public.cvoa_can_review_transfer(uuid),public.cvoa_can_oversee_transfer(uuid,uuid),public.cvoa_withdraw_post_change(uuid),public.cvoa_transfer_requests() from public,anon;
grant execute on function public.cvoa_can_review_transfer(uuid),public.cvoa_can_oversee_transfer(uuid,uuid),public.cvoa_withdraw_post_change(uuid),public.cvoa_transfer_requests() to authenticated;

create or replace function public.cvoa_action_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pr public.profiles; result jsonb;
begin
 select * into pr from public.profiles where id=auth.uid();
 select role::public.user_role,post_id,state into pr.role,pr.post_id,pr.state from public.cvoa_current_scope();
 if not found or pr.role not in ('national_commander','national_staff','state_commander','post_commander','post_officer') then raise exception 'Staff access required.'; end if;
 with items as (
 select 'minutes:'||u.id as id,case when pr.role in ('national_commander','national_staff','state_commander') then 'Awaiting published minutes: '||u.title else 'Complete minutes: '||u.title end as title,u.meeting_date as due_date,
 'minutes' as kind,case when pr.role in ('post_commander','post_officer') then '/meetings/uro/'||u.id else '/state' end as path
 from public.uro_meetings u where u.status='in_progress' and public.cvoa_can_oversee_post(u.post_id)
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
 select 'transfer:'||r.id,case when public.cvoa_can_review_transfer(r.target_post_id) then 'Review join / transfer request' else 'Oversee join / transfer request' end,r.created_at::date,'application','/members?tab=requests'
 from public.membership_change_requests r where r.status='pending' and public.cvoa_can_oversee_transfer(r.source_post_id,r.target_post_id)
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
commit;
