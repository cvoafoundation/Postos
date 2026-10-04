-- Coordinated release: apply after the live profile privilege audit, then deploy
-- membership-checkout and stripe-webhook, then release the matching frontend.
begin;

-- Personal membership remains readable when a staff appointment belongs to a
-- different post, and for national at-large members without any post_id.
create policy cvoa_members_select_own on public.members for select to authenticated
 using(profile_id=auth.uid());

create or replace function public.cvoa_can_manage_post(p_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = auth.uid() and
   (role in ('national_commander','national_staff') or
    (role in ('post_commander','post_officer') and post_id = p_post)));
$$;
create or replace function public.cvoa_can_oversee_post(p_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select public.cvoa_can_manage_post(p_post) or exists(
   select 1 from public.profiles pr join public.posts p on upper(p.state) = upper(pr.state)
   where pr.id = auth.uid() and pr.role = 'state_commander' and p.id = p_post
     and pr.state ~ '^[A-Z]{2}$');
$$;

create table public.membership_change_requests (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.members(id),
 requested_by uuid not null references public.profiles(id),
 target_post_id uuid references public.posts(id),
 reason text not null check(length(reason) between 1 and 3000),
 status text not null default 'pending' check(status in ('pending','approved','declined','withdrawn')),
 review_note text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index membership_change_one_pending on public.membership_change_requests(member_id) where status = 'pending';
alter table public.membership_change_requests enable row level security;
create policy change_request_read on public.membership_change_requests for select to authenticated
 using(requested_by = auth.uid() or public.is_national_role());
grant select on public.membership_change_requests to authenticated;
revoke insert,update,delete on public.membership_change_requests from anon,authenticated;

create or replace function public.cvoa_request_post_change(p_member uuid,p_post uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.members; result uuid;
begin
 select * into m from public.members where id = p_member and profile_id = auth.uid();
 if not found or m.membership_status <> 'active' then raise exception 'An active membership linked to your account is required.'; end if;
 if m.post_id is not distinct from p_post then raise exception 'You already belong to this post or are already at large.'; end if;
 if p_post is not null and not exists(select 1 from public.posts where id=p_post and status='active_post') then raise exception 'Choose an active post.'; end if;
 insert into public.membership_change_requests(member_id,requested_by,target_post_id,reason)
 values(p_member,auth.uid(),p_post,trim(p_reason)) returning id into result;
 return result;
end; $$;

create or replace function public.cvoa_review_post_change(p_request uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.membership_change_requests; m public.members;
begin
 if not public.is_national_role() then raise exception 'National approval is required.'; end if;
 select * into r from public.membership_change_requests where id=p_request for update;
 if not found or r.status <> 'pending' then raise exception 'Request is no longer pending.'; end if;
 if nullif(trim(p_note),'') is null then raise exception 'Explain the decision to the member.'; end if;
 select * into m from public.members where id=r.member_id for update;
 if p_approve then
   if m.membership_status <> 'active' then raise exception 'Membership must be active before reassignment.'; end if;
   if r.target_post_id is not null and not exists(select 1 from public.posts where id=r.target_post_id and status='active_post') then raise exception 'The requested post is no longer active.'; end if;
   update public.members set post_id=r.target_post_id where id=r.member_id;
   -- Staff appointments remain assigned to their operational post.
   update public.profiles set post_id=r.target_post_id where id=m.profile_id and role='member';
 end if;
 update public.membership_change_requests set status=case when p_approve then 'approved' else 'declined' end,
 review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now() where id=p_request;
end; $$;

alter table public.post_applications add column applicant_profile_id uuid references public.profiles(id);
create index post_applications_applicant on public.post_applications(applicant_profile_id);
create or replace function public.cvoa_owns_application(p_application uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.post_applications a join auth.users u on u.id=auth.uid()
   where a.id=p_application and (a.applicant_profile_id=u.id or
     (u.email_confirmed_at is not null and lower(a.email)=lower(u.email))));
$$;
create or replace function public.cvoa_stamp_application_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is not null and not public.is_national_role() then
   new.applicant_profile_id := auth.uid();
   new.email := (select email from auth.users where id=auth.uid());
 elsif auth.uid() is null and current_setting('role',true) <> 'service_role' then
   new.applicant_profile_id := null;
 end if;
 return new;
end; $$;
create trigger cvoa_application_owner before insert on public.post_applications
 for each row execute function public.cvoa_stamp_application_owner();

create table public.post_application_updates (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.post_applications(id) on delete cascade,
 author_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('feedback','document_request','reply')),
 message text not null check(length(message) between 1 and 5000),
 document_path text,
 created_at timestamptz not null default now()
);
alter table public.post_application_updates enable row level security;
create policy application_update_read on public.post_application_updates for select to authenticated
 using(public.is_national_role() or public.cvoa_owns_application(application_id));
create policy application_update_insert on public.post_application_updates for insert to authenticated
 with check(author_id=auth.uid() and (public.is_national_role() or
   (kind='reply' and public.cvoa_owns_application(application_id))) and
   (document_path is null or split_part(document_path,'/',1)=auth.uid()::text));
grant select,insert on public.post_application_updates to authenticated;
revoke update,delete on public.post_application_updates from anon,authenticated;
create index application_update_timeline on public.post_application_updates(application_id,created_at);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('cvoa-application-documents','cvoa-application-documents',false,10485760,
 array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
create policy cvoa_application_document_upload on storage.objects for insert to authenticated
 with check(bucket_id='cvoa-application-documents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy cvoa_application_document_read on storage.objects for select to authenticated
 using(bucket_id='cvoa-application-documents' and
   ((storage.foldername(name))[1]=auth.uid()::text or public.is_national_role() or
    exists(select 1 from public.post_application_updates x where x.document_path=name
      and public.cvoa_owns_application(x.application_id))));

create or replace function public.cvoa_my_applications()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'city',a.city,'state',a.state,'status',a.status,
 'created_at',a.created_at,'updates',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb)
 from public.post_application_updates x where x.application_id=a.id)) order by a.created_at desc),'[]'::jsonb)
 from public.post_applications a where public.cvoa_owns_application(a.id);
$$;

create table public.fundraising_campaigns (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts(id),
 title text not null check(length(title) between 1 and 200),
 goal_cents bigint not null check(goal_cents > 0),owner_name text not null check(length(owner_name) between 1 and 200),
 deadline date not null,status text not null default 'planning' check(status in ('planning','active','completed')),
 results_note text not null default '', check(status<>'completed' or length(trim(results_note))>0), created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.fundraising_entries (
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.fundraising_campaigns(id),
 entry_type text not null check(entry_type in ('income','expense')),
 amount_cents bigint not null check(amount_cents > 0),entry_date date not null,
 description text not null check(length(description) between 1 and 1000),
 recorded_by uuid not null default auth.uid() references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.fundraising_campaigns enable row level security;
alter table public.fundraising_entries enable row level security;
create policy campaigns_read on public.fundraising_campaigns for select to authenticated using(public.cvoa_can_oversee_post(post_id));
create policy campaigns_insert on public.fundraising_campaigns for insert to authenticated with check(public.cvoa_can_manage_post(post_id) and created_by=auth.uid());
create policy campaigns_update on public.fundraising_campaigns for update to authenticated using(public.cvoa_can_manage_post(post_id)) with check(public.cvoa_can_manage_post(post_id));
create policy entries_read on public.fundraising_entries for select to authenticated using(exists(select 1 from public.fundraising_campaigns c where c.id=campaign_id and public.cvoa_can_oversee_post(c.post_id)));
create policy entries_insert on public.fundraising_entries for insert to authenticated with check(recorded_by=auth.uid() and exists(select 1 from public.fundraising_campaigns c where c.id=campaign_id and c.status<>'completed' and public.cvoa_can_manage_post(c.post_id)));
revoke update on public.fundraising_campaigns from anon,authenticated;
grant select,insert on public.fundraising_campaigns to authenticated;
grant update(status,results_note) on public.fundraising_campaigns to authenticated;
grant select,insert on public.fundraising_entries to authenticated;
revoke delete on public.fundraising_campaigns,public.fundraising_entries from anon,authenticated;
revoke update on public.fundraising_entries from anon,authenticated;
create index campaign_scope on public.fundraising_campaigns(post_id,deadline);
create index campaign_entries on public.fundraising_entries(campaign_id,entry_date);

create or replace function public.cvoa_state_workspace()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pr public.profiles; result jsonb;
begin
 select * into pr from public.profiles where id=auth.uid();
 if not found or pr.role not in ('national_commander','national_staff','state_commander') then raise exception 'State oversight access is required.'; end if;
 if pr.role='state_commander' and (pr.state is null or pr.state !~ '^[A-Z]{2}$') then raise exception 'National must assign your state in Accounts & Access.'; end if;
 select jsonb_build_object('state',pr.state,'posts',coalesce(jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.name,'city',p.city,'state',p.state,'status',p.status,'health_status',p.health_status,
 'active_members',(select count(*) from public.members m where m.post_id=p.id and m.membership_status='active'),
 'last_meeting',(select max(meeting_date) from public.uro_meetings u where u.post_id=p.id and u.status='published'),
 'open_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open')
 ) order by p.state,p.name),'[]'::jsonb)) into result from public.posts p
 where pr.role in ('national_commander','national_staff') or upper(p.state)=pr.state;
 return result;
end; $$;

create or replace function public.cvoa_member_record(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.members; result jsonb;
begin
 select * into m from public.members where id=p_member;
 if not found or not public.cvoa_can_manage_post(m.post_id) then raise exception 'Member record access is restricted to the responsible post staff and National.'; end if;
 select jsonb_build_object('post',(select jsonb_build_object('name',name,'state',state) from public.posts where id=m.post_id),
 'account',(select jsonb_build_object('post_name',(select name from public.posts where id=p.post_id),'role',p.role,'title',p.title,'post_id',p.post_id,'state',p.state,
 'email_confirmed',u.email_confirmed_at is not null,'last_sign_in_at',u.last_sign_in_at)
 from public.profiles p join auth.users u on u.id=p.id where p.id=m.profile_id),
 'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from
 (select id,amount,status,membership_type,paid_at,created_at from public.membership_payments where member_id=m.id order by created_at desc limit 10) x),
 'appointments',(select coalesce(jsonb_agg(jsonb_build_object('post_id',f.post_id,'post_name',p.name,'position',f.position,'verification_status',f.verification_status)),'[]'::jsonb)
 from public.founding_team_members f join public.posts p on p.id=f.post_id where f.profile_id=m.profile_id and public.cvoa_can_manage_post(f.post_id))) into result;
 return result;
end; $$;

create table public.state_escalations (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts(id),
 author_id uuid not null default auth.uid() references public.profiles(id),
 subject text not null check(length(subject) between 1 and 200),
 message text not null check(length(message) between 1 and 5000),
 status text not null default 'open' check(status in ('open','resolved')),
 response text not null default '',created_at timestamptz not null default now(),
 check(status<>'resolved' or length(trim(response))>0)
);
alter table public.state_escalations enable row level security;
create policy escalation_read on public.state_escalations for select to authenticated using(public.cvoa_can_oversee_post(post_id));
create policy escalation_insert on public.state_escalations for insert to authenticated with check(author_id=auth.uid() and status='open' and response='' and public.cvoa_can_oversee_post(post_id));
create policy escalation_review on public.state_escalations for update to authenticated using(public.is_national_role()) with check(public.is_national_role());
grant select,insert on public.state_escalations to authenticated;
revoke update,delete on public.state_escalations from anon,authenticated;
grant update(status,response) on public.state_escalations to authenticated;
create index state_escalation_scope on public.state_escalations(post_id,status);

create or replace function public.cvoa_action_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pr public.profiles; result jsonb;
begin
 select * into pr from public.profiles where id=auth.uid();
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

-- Renewal/upgrade fulfillment is atomic and replay-safe. Existing duplicate
create table public.membership_checkout_attempts (
 member_id uuid primary key references public.members(id),token uuid not null default gen_random_uuid(),
 session_id text,lease_expires_at timestamptz not null default now()+interval '2 minutes'
);
alter table public.membership_checkout_attempts enable row level security;
revoke all on public.membership_checkout_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.membership_checkout_attempts to service_role;
create or replace function public.cvoa_reserve_checkout(p_member uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.membership_checkout_attempts;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required.'; end if;
 perform id from public.members where id=p_member for update;
 if not found then raise exception 'Membership not found.'; end if;
 select * into attempt from public.membership_checkout_attempts where member_id=p_member;
 if found and attempt.session_id is not null then return jsonb_build_object('token',attempt.token,'session_id',attempt.session_id,'busy',false); end if;
 if found and attempt.lease_expires_at>now() then return jsonb_build_object('busy',true); end if;
 insert into public.membership_checkout_attempts(member_id) values(p_member)
 on conflict(member_id) do update set token=gen_random_uuid(),session_id=null,lease_expires_at=now()+interval '2 minutes'
 returning * into attempt;
 return jsonb_build_object('token',attempt.token,'session_id',null,'busy',false);
end; $$;
revoke all on function public.cvoa_reserve_checkout(uuid) from public,anon,authenticated;
grant execute on function public.cvoa_reserve_checkout(uuid) to service_role;

-- Existing duplicate
-- checkout session rows must be reconciled before this index can be installed.
create unique index cvoa_payment_session_unique on public.membership_payments(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create table public.membership_payment_fulfillments (
 session_id text primary key,member_id uuid not null references public.members(id),fulfilled_at timestamptz not null default now()
);
alter table public.membership_payment_fulfillments enable row level security;
revoke all on public.membership_payment_fulfillments from anon,authenticated;
create or replace function public.cvoa_fulfill_membership(p_session text,p_member uuid,p_type text,p_intent text,p_subscription text,p_paid_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.members; payment public.membership_payments; base_date date;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service access required.'; end if;
 select * into m from public.members where id=p_member for update;
 if not found then raise exception 'Membership not found.'; end if;
 if exists(select 1 from public.membership_payment_fulfillments where session_id=p_session) then return false; end if;
 select * into payment from public.membership_payments where stripe_checkout_session_id=p_session for update;
 if not found or payment.member_id<>p_member or payment.membership_type::text<>p_type or
 payment.amount<>(case when p_type='annual' then 49.99 when p_type='lifetime' then 499.99 else -1 end) then raise exception 'Payment record does not match checkout.'; end if;
 if payment.status='paid' then return false; end if;
 if m.membership_type='lifetime' and m.membership_status='active' then raise exception 'Lifetime membership is already active.'; end if;
 base_date := greatest(coalesce(m.expires_at,p_paid_at::date),p_paid_at::date);
 update public.members set membership_type=p_type::public.membership_type,membership_status='active',
 joined_at=coalesce(joined_at,p_paid_at::date),
 expires_at=case when p_type='lifetime' then null else (base_date+interval '1 year')::date end,
 auto_renew=p_subscription is not null,stripe_subscription_id=p_subscription where id=p_member;
 update public.membership_payments set status='paid',paid_at=p_paid_at,stripe_payment_intent_id=p_intent where id=payment.id;
 insert into public.membership_payment_fulfillments(session_id,member_id) values(p_session,p_member);
 delete from public.membership_checkout_attempts where member_id=p_member and session_id=p_session;
 return true;
end; $$;
revoke all on function public.cvoa_fulfill_membership(text,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.cvoa_fulfill_membership(text,uuid,text,text,text,timestamptz) to service_role;

-- Lock down new callable APIs. Helpers also require an authenticated identity.
revoke all on function public.cvoa_can_manage_post(uuid),public.cvoa_can_oversee_post(uuid),public.cvoa_owns_application(uuid),
 public.cvoa_request_post_change(uuid,uuid,text),public.cvoa_review_post_change(uuid,boolean,text),
 public.cvoa_my_applications(),public.cvoa_state_workspace(),public.cvoa_member_record(uuid),public.cvoa_action_queue() from public,anon;
grant execute on function public.cvoa_can_manage_post(uuid),public.cvoa_can_oversee_post(uuid),public.cvoa_owns_application(uuid),
 public.cvoa_request_post_change(uuid,uuid,text),public.cvoa_review_post_change(uuid,boolean,text),
 public.cvoa_my_applications(),public.cvoa_state_workspace(),public.cvoa_member_record(uuid),public.cvoa_action_queue() to authenticated;
create or replace function public.cvoa_renew_subscription(p_invoice text,p_subscription text,p_period_end date,p_paid_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.members;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service access required.'; end if;
 select * into m from public.members where stripe_subscription_id=p_subscription for update;
 if not found then raise exception 'Subscription is not linked to a member; reconciliation required.'; end if;
 if exists(select 1 from public.membership_payment_fulfillments where session_id=p_invoice) then return false; end if;
 if m.membership_type<>'annual' then raise exception 'Subscription belongs to a non-annual member.'; end if;
 update public.members set membership_status='active',expires_at=greatest(expires_at,p_period_end) where id=m.id;
 insert into public.membership_payments(member_id,post_id,membership_type,amount,status,paid_at)
 values(m.id,m.post_id,'annual',49.99,'paid',p_paid_at);
 insert into public.membership_payment_fulfillments(session_id,member_id) values(p_invoice,m.id);
 return true;
end; $$;
revoke all on function public.cvoa_renew_subscription(text,text,date,timestamptz) from public,anon,authenticated;
grant execute on function public.cvoa_renew_subscription(text,text,date,timestamptz) to service_role;
revoke all on function public.cvoa_stamp_application_owner() from public,anon,authenticated;
-- Safe boolean predicate used by anonymous pending-membership intake policies.
-- With no authenticated identity it returns false and exposes no records.
grant execute on function public.cvoa_can_manage_post(uuid) to anon;
commit;
