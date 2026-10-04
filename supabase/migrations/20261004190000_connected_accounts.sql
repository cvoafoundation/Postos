-- Connected membership/account records and explicit operational jurisdictions.
-- No existing membership links, roles, or appointments are rewritten.
begin;
alter table public.profiles add column is_test_account boolean not null default false;
alter table public.profiles add column access_suspended boolean not null default false;
alter table public.profiles add column access_version bigint not null default 0;

create table public.access_appointments (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id),
 role public.user_role not null check(role in ('state_commander','post_commander','post_officer')),
 post_id uuid references public.posts(id), state text, title text not null default '',
 appointed_by uuid not null references public.profiles(id), reason text not null check(length(trim(reason)) between 5 and 1000),
 created_at timestamptz not null default now(), revoked_at timestamptz, revoked_by uuid references public.profiles(id),
 check((role='state_commander' and state is not null and state ~ '^[A-Z]{2}$' and post_id is null) or (role in ('post_commander','post_officer') and post_id is not null and state is null))
);
create unique index access_appointment_active_unique on public.access_appointments(profile_id,role,coalesce(post_id::text,state)) where revoked_at is null;
create table public.access_audit (
 id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id) on delete set null,
 member_id uuid references public.members(id) on delete set null, actor_id uuid references public.profiles(id) on delete set null,
 action text not null, reason text not null, before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
create table public.access_workspace_selection(profile_id uuid primary key references public.profiles(id) on delete cascade, scope_id text not null);
alter table public.access_appointments enable row level security;
alter table public.access_audit enable row level security;
alter table public.access_workspace_selection enable row level security;
revoke all on public.access_appointments,public.access_audit,public.access_workspace_selection from anon,authenticated;

create or replace function public.cvoa_access_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists(select 1 from public.profiles where id=auth.uid() and access_suspended);
$$;
create or replace function public.is_national_role() returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.profiles where id=auth.uid() and role in ('national_commander','national_staff'));
$$;
-- Tribunal authority stays exclusively with the existing Tribunal role.
create or replace function public.is_ethics_tribunal_role() returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.profiles where id=auth.uid() and role='ethics_tribunal');
$$;
create function public.cvoa_access_scopes(p_user uuid)
returns table(scope_id text,role text,post_id uuid,state text,title text,source text)
language sql stable security definer set search_path='' as $$
 select 'primary',p.role::text,p.post_id,case when p.role='delegate' then (select state from public.posts where id=p.post_id) else p.state end,p.title,'Account appointment' from public.profiles p where p.id=p_user
 union all select a.id::text,a.role::text,a.post_id,a.state,a.title,'National appointment' from public.access_appointments a where a.profile_id=p_user and a.revoked_at is null
 union all select d.id::text,'delegate',d.post_id,p.state,case when d.is_alternate then 'Alternate delegate' else 'Congressional delegate' end,'Congress designation'
 from public.congress_delegates d join public.posts p on p.id=d.post_id where d.profile_id=p_user and (d.term_start is null or d.term_start<=current_date) and (d.term_end is null or d.term_end>=current_date);
$$;
revoke all on function public.cvoa_access_scopes(uuid) from public,anon,authenticated;
create function public.cvoa_current_scope() returns table(scope_id text,role text,post_id uuid,state text,title text,source text)
language sql stable security definer set search_path='' as $$
 select s.* from public.cvoa_access_scopes(auth.uid()) s where public.cvoa_access_enabled()
 order by (s.scope_id=coalesce((select w.scope_id from public.access_workspace_selection w where w.profile_id=auth.uid()),'primary')) desc,(s.scope_id='primary') desc limit 1;
$$;
create or replace function public.current_post_id() returns uuid language sql stable security definer set search_path='' as $$ select post_id from public.cvoa_current_scope(); $$;
create or replace function public.cvoa_can_manage_post(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_national_role() or (public.cvoa_access_enabled() and exists(select 1 from public.cvoa_access_scopes(auth.uid()) s where s.role in ('post_commander','post_officer') and s.post_id=p_post));
$$;
create or replace function public.cvoa_can_oversee_post(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_can_manage_post(p_post) or (public.cvoa_access_enabled() and exists(select 1 from public.cvoa_access_scopes(auth.uid()) s join public.posts p on upper(p.state)=upper(s.state) where s.role='state_commander' and p.id=p_post));
$$;
create function public.cvoa_can_read_post(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_can_oversee_post(p_post) or (public.cvoa_access_enabled() and exists(select 1 from public.cvoa_access_scopes(auth.uid()) where role='delegate' and post_id=p_post and source='Congress designation'));
$$;
create function public.cvoa_my_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select jsonb_build_object('suspended',coalesce(p.access_suspended,false),'scopes',case when p.access_suspended then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('post_name',(select name from public.posts where id=s.post_id))) from public.cvoa_access_scopes(auth.uid()) s),'[]'::jsonb) end,'selected',(select scope_id from public.cvoa_current_scope())) into result from public.profiles p where p.id=auth.uid();
 return result;
end; $$;
create function public.cvoa_select_workspace(p_scope text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() or not exists(select 1 from public.cvoa_access_scopes(auth.uid()) where scope_id=p_scope) then raise exception 'This workspace is not assigned to you.'; end if;
 insert into public.access_workspace_selection values(auth.uid(),p_scope) on conflict(profile_id) do update set scope_id=excluded.scope_id;
end; $$;

-- Suspension immediately gates direct table reads/writes, including old browser sessions.
-- Profiles remain readable for the signed-in account so it can display suspension.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not in ('profiles','access_appointments','access_audit','access_workspace_selection','pending_profile_signups') loop
 execute format('create policy access_enabled on public.%I as restrictive for all to authenticated using(public.cvoa_access_enabled()) with check(public.cvoa_access_enabled())',t.tablename);
 end loop;
end $$;

-- Operational reads inherit state oversight or a designated delegate's own post.
-- Members retain their personal records and narrow post directory endpoints.
do $$ declare p record; expression text; begin
 for p in select * from pg_policies where schemaname='public' and cmd='SELECT' and tablename in
 ('annual_reviews','financial_transactions','governance_signatures','meeting_records','post_facility_projects','post_facility_checklist_items','recruits','sponsors','sponsor_payments','toolkit_generated_documents','build_a_post_generated_plans','uro_action_items','uro_agenda_items','uro_attendance','uro_comments','uro_motions','uro_officer_reports','community_service_events') and policyname<>'access_enabled' loop
 expression:=case when p.tablename='post_facility_checklist_items' then 'exists(select 1 from public.post_facility_projects x where x.id=project_id and public.cvoa_can_read_post(x.post_id))' else 'public.cvoa_can_read_post(post_id)' end;
 execute format('alter policy %I on public.%I using (%s)',p.policyname,p.tablename,expression);
 end loop;
end $$;
alter policy uro_meetings_select on public.uro_meetings using(public.cvoa_can_read_post(post_id) or (status='published' and post_id=public.current_post_id()));
alter policy members_select_post_or_national on public.members using(public.cvoa_can_oversee_post(post_id));
alter policy membership_payments_select_post_or_national on public.membership_payments using(public.cvoa_can_oversee_post(post_id) or exists(select 1 from public.members m where m.id=member_id and m.profile_id=auth.uid()));
alter policy founding_team_post_or_national on public.founding_team_members using(public.cvoa_can_read_post(post_id) or profile_id=auth.uid());
alter policy campaigns_read on public.fundraising_campaigns using(public.cvoa_can_read_post(post_id));
alter policy entries_read on public.fundraising_entries using(exists(select 1 from public.fundraising_campaigns c where c.id=campaign_id and public.cvoa_can_read_post(c.post_id)));
alter policy activity_feed_read_all on public.activity_feed using(public.cvoa_can_read_post(post_id));
alter policy checklist_select_shared on public.checklist_items using(public.cvoa_can_read_post(post_id));
alter policy posts_select_all on public.posts using(public.cvoa_can_read_post(id) or (public.cvoa_access_enabled() and id=public.current_post_id()));
-- Public signup links expose only post directory fields, never the operational table.
create function public.cvoa_public_posts(p_post uuid default null) returns table(id uuid,name text,city text,state text,status public.post_status)
language sql stable security definer set search_path='' as $$ select id,name,city,state,status from public.posts where (p_post is not null and id=p_post) or (p_post is null and status='active_post') order by name; $$;

-- State voting visibility is anonymous aggregate information; each delegate still
-- casts only the designated post's vote. Assigning role=delegate alone grants no ballot.
create function public.cvoa_active_delegate(p_post uuid,p_primary_only boolean default true) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.congress_delegates d where d.profile_id=auth.uid() and d.post_id=p_post and (not p_primary_only or not d.is_alternate) and (d.term_start is null or d.term_start<=current_date) and (d.term_end is null or d.term_end>=current_date));
$$;
alter policy resolution_votes_write_auth on public.resolution_votes with check(
 public.cvoa_access_enabled() and voter_id=auth.uid() and exists(select 1 from public.resolutions r where r.id=resolution_id and r.status='voting' and r.vote_type=resolution_votes.vote_type) and
 ((vote_type in ('informal_poll','national_referendum') and voter_post_id is not distinct from public.current_post_id()) or (vote_type in ('delegate_vote','constitutional_amendment') and public.cvoa_active_delegate(voter_post_id))));
create function public.cvoa_can_read_vote(p_post uuid,p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_national_role() or (public.cvoa_access_enabled() and (p_actor=auth.uid() or p_post=public.current_post_id() or public.cvoa_can_oversee_post(p_post) or exists(select 1 from public.posts p join public.congress_delegates d on public.cvoa_active_delegate(d.post_id,false) join public.posts dp on dp.id=d.post_id and upper(dp.state)=upper(p.state) where p.id=p_post and d.profile_id=auth.uid())));
$$;
revoke all on function public.cvoa_can_read_vote(uuid,uuid) from public,anon;
grant execute on function public.cvoa_can_read_vote(uuid,uuid) to authenticated,anon;
alter policy resolution_votes_read_all on public.resolution_votes using(public.cvoa_can_read_vote(voter_post_id,voter_id));
create policy resolution_votes_update_own on public.resolution_votes for update to authenticated using(voter_id=auth.uid()) with check(
 public.cvoa_access_enabled() and voter_id=auth.uid() and exists(select 1 from public.resolutions r where r.id=resolution_id and r.status='voting' and r.vote_type=resolution_votes.vote_type) and
 ((vote_type in ('informal_poll','national_referendum') and voter_post_id is not distinct from public.current_post_id()) or (vote_type in ('delegate_vote','constitutional_amendment') and public.cvoa_active_delegate(voter_post_id))));
create function public.cvoa_vote_totals(p_resolution uuid default null) returns table(resolution_id uuid,support bigint,oppose bigint) language sql stable security definer set search_path='' as $$
 select r.id,count(v.id) filter(where v.vote),count(v.id) filter(where not v.vote) from public.resolutions r left join public.resolution_votes v on v.resolution_id=r.id and v.vote_type=r.vote_type where (p_resolution is null or r.id=p_resolution) and (public.cvoa_access_enabled() or r.status in ('passed','implemented','rejected')) group by r.id;
$$;
revoke all on function public.cvoa_vote_totals(uuid) from public,anon;
grant execute on function public.cvoa_vote_totals(uuid) to authenticated,anon;
alter policy member_preferences_own_insert on public.resolution_member_preferences with check(member_profile_id=auth.uid() and post_id=public.current_post_id() and exists(select 1 from public.resolutions r where r.id=resolution_id and r.status='voting' and r.vote_type in ('delegate_vote','constitutional_amendment')));
alter policy member_preferences_own_update on public.resolution_member_preferences using(member_profile_id=auth.uid()) with check(member_profile_id=auth.uid() and post_id=public.current_post_id() and exists(select 1 from public.resolutions r where r.id=resolution_id and r.status='voting' and r.vote_type in ('delegate_vote','constitutional_amendment')));

create unique index cvoa_one_formal_vote_per_post on public.resolution_votes(resolution_id,vote_type,voter_post_id) where vote_type in ('delegate_vote','constitutional_amendment');
create or replace function public.get_preference_tally(p_resolution_id uuid,p_post_id uuid) returns table(support_count bigint,oppose_count bigint) language plpgsql security definer set search_path='' as $$
begin
 if not (public.is_national_role() or public.cvoa_active_delegate(p_post_id)) then return query select 0::bigint,0::bigint; return; end if;
 return query select count(*) filter(where preference),count(*) filter(where not preference) from public.resolution_member_preferences where resolution_id=p_resolution_id and post_id=p_post_id;
end; $$;
revoke all on function public.get_preference_tally(uuid,uuid) from public,anon;
grant execute on function public.get_preference_tally(uuid,uuid) to authenticated;
-- State detail uses totals, preserving the existing private member preference ballot.
create function public.cvoa_state_voting(p_resolution uuid,p_state text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.is_national_role() or (public.cvoa_access_enabled() and exists(select 1 from public.congress_delegates d join public.posts p on p.id=d.post_id where d.profile_id=auth.uid() and upper(p.state)=upper(p_state) and public.cvoa_active_delegate(d.post_id,false)))) then raise exception 'Your congressional designation does not cover this state.'; end if;
 return jsonb_build_object('state',upper(p_state),'posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'support',(select count(*) from public.resolution_member_preferences v where v.resolution_id=p_resolution and v.post_id=p.id and v.preference),'oppose',(select count(*) from public.resolution_member_preferences v where v.resolution_id=p_resolution and v.post_id=p.id and not v.preference))) from public.posts p where upper(p.state)=upper(p_state)),'[]'::jsonb));
end; $$;

-- Append-only history records permission changes made by either the new screen
-- or older trusted invitation/promotion flows.
create function public.cvoa_audit_profile_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (to_jsonb(new)-array['full_name','email','phone','created_at','access_version']) is distinct from (to_jsonb(old)-array['full_name','email','phone','created_at','access_version']) then
 new.access_version:=old.access_version+1;
 insert into public.access_audit(profile_id,actor_id,action,reason,before_value,after_value) values(new.id,auth.uid(),'account_permissions',coalesce(nullif(current_setting('cvoa.access_reason',true),''),'Existing account administration or trusted promotion'),to_jsonb(old)-array['email','phone'],to_jsonb(new)-array['email','phone']);
 end if; return new;
end; $$;
create trigger audit_profile_access before update on public.profiles for each row execute function public.cvoa_audit_profile_access();
create function public.cvoa_update_account(p_profile uuid,p_version bigint,p_role public.user_role,p_post uuid,p_state text,p_title text,p_test boolean,p_suspended boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles; begin
 if not public.is_national_role() then raise exception 'National access administration required.'; end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 1000 then raise exception 'Explain the reason for this access change.'; end if;
 select * into target from public.profiles where id=p_profile for update;
 if not found then raise exception 'Account not found.'; end if;
 if target.access_version<>p_version then raise exception 'This account changed. Reload before saving.'; end if;
 if p_profile=auth.uid() then raise exception 'Another National administrator must change your own permissions.'; end if;
 if p_role='ethics_tribunal' or (target.role='ethics_tribunal' and p_role<>target.role) then raise exception 'Tribunal appointments are reserved for the separate ethics access review.'; end if;
 if p_role='state_commander' and (p_state is null or p_state !~ '^[A-Z]{2}$') then raise exception 'Assign a two-letter state code.'; end if;
 if p_role in ('post_commander','post_officer','delegate') and p_post is null then raise exception 'Assign the responsible post.'; end if;
 if p_role='delegate' and not exists(select 1 from public.congress_delegates where profile_id=p_profile and post_id=p_post and (term_end is null or term_end>=current_date) and (term_start is null or term_start<=current_date)) then raise exception 'Create a Congress designation before assigning the delegate role.'; end if;
 if target.role='national_commander' and (p_role<>'national_commander' or p_suspended) and not exists(select 1 from public.profiles where id<>p_profile and role='national_commander' and not access_suspended) then raise exception 'Keep at least one active National Commander.'; end if;
 perform set_config('cvoa.access_reason',p_reason,true);
 update public.profiles set role=p_role,post_id=p_post,state=p_state,title=nullif(trim(p_title),''),is_test_account=p_test,access_suspended=p_suspended where id=p_profile;
end; $$;
create function public.cvoa_add_appointment(p_profile uuid,p_role public.user_role,p_post uuid,p_state text,p_title text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if not public.is_national_role() then raise exception 'National access administration required.'; end if;
 if p_profile=auth.uid() then raise exception 'Another National administrator must appoint you.'; end if;
 if p_role not in ('state_commander','post_commander','post_officer') then raise exception 'Use the existing account appointment for National and the Congress designation for delegates.'; end if;
 insert into public.access_appointments(profile_id,role,post_id,state,title,appointed_by,reason) values(p_profile,p_role,p_post,p_state,coalesce(p_title,''),auth.uid(),p_reason) returning id into result;
 insert into public.access_audit(profile_id,actor_id,action,reason,after_value) values(p_profile,auth.uid(),'appointment_added',p_reason,jsonb_build_object('id',result,'role',p_role,'post_id',p_post,'state',p_state,'title',p_title));
 return result;
end; $$;
create function public.cvoa_revoke_appointment(p_appointment uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.access_appointments; begin
 if not public.is_national_role() then raise exception 'National access administration required.'; end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 1000 then raise exception 'Explain why this appointment is ending.'; end if;
 select * into a from public.access_appointments where id=p_appointment for update;
 if not found or a.revoked_at is not null then raise exception 'Active appointment not found.'; end if;
 if a.profile_id=auth.uid() then raise exception 'Another National administrator must change your appointments.'; end if;
 update public.access_appointments set revoked_at=now(),revoked_by=auth.uid() where id=a.id;
 insert into public.access_audit(profile_id,actor_id,action,reason,before_value) values(a.profile_id,auth.uid(),'appointment_revoked',p_reason,to_jsonb(a));
end; $$;

-- Only a unique, verified auth email can repair an unclaimed membership.
-- Existing links, duplicate email memberships, and role assignments are untouched.
create function public.cvoa_link_account(p_member uuid,p_profile uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare m public.members; email_address text; begin
 if not public.is_national_role() then raise exception 'National reconciliation access required.'; end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 1000 then raise exception 'Explain this record link.'; end if;
 perform pg_advisory_xact_lock(hashtext('cvoa-member-account-link'));
 perform 1 from public.profiles where id=p_profile for update;
 select * into m from public.members where id=p_member for update;
 if not found or m.profile_id is not null then raise exception 'This membership is already linked or no longer exists.'; end if;
 select u.email into email_address from auth.users u join public.profiles p on p.id=u.id where u.id=p_profile and u.email_confirmed_at is not null and lower(trim(p.email))=lower(trim(u.email));
 if email_address is null or lower(trim(email_address))<>lower(trim(m.email)) then raise exception 'A verified matching account email is required.'; end if;
 if (select count(*) from auth.users where lower(trim(email))=lower(trim(m.email)) and email_confirmed_at is not null)<>1 or (select count(*) from public.members where lower(trim(email))=lower(trim(m.email)))<>1 or exists(select 1 from public.members where profile_id=p_profile) then raise exception 'Conflicting records need individual review.'; end if;
 update public.members set profile_id=p_profile where id=p_member;
 insert into public.access_audit(profile_id,member_id,actor_id,action,reason,after_value) values(p_profile,p_member,auth.uid(),'membership_linked',p_reason,jsonb_build_object('member_id',p_member,'profile_id',p_profile));
end; $$;
create or replace function public.link_member_profile() returns void language plpgsql security definer set search_path='' as $$
declare verified text; mid uuid; begin
 if not public.cvoa_access_enabled() then return; end if;
 select lower(trim(email)) into verified from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified is null or (select count(*) from public.members where lower(trim(email))=verified)<>1 then return; end if;
 select id into mid from public.members where lower(trim(email))=verified and profile_id=auth.uid() for update;
 if mid is not null then
  update public.profiles p set role='member',post_id=coalesce(p.post_id,m.post_id) from public.members m where m.id=mid and p.id=auth.uid() and p.role='guest_applicant' and m.membership_status='active';
  return;
 end if;
 if exists(select 1 from public.members where profile_id=auth.uid()) then return; end if;
 select id into mid from public.members where lower(trim(email))=verified and profile_id is null for update;
 if mid is null then return; end if;
 update public.members set profile_id=auth.uid() where id=mid;
 update public.profiles p set full_name=m.full_name from public.members m where m.id=mid and p.id=auth.uid();
 update public.profiles p set role='member',post_id=coalesce(p.post_id,m.post_id) from public.members m where m.id=mid and p.id=auth.uid() and p.role='guest_applicant' and m.membership_status='active';
end; $$;

create function public.cvoa_accounts_directory(p_search text default '',p_view text default 'all',p_page integer default 0,p_size integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; query_text text:=lower(trim(coalesce(p_search,''))); size integer:=least(50,greatest(1,coalesce(p_size,25))); page_number integer:=greatest(0,coalesce(p_page,0)); begin
 if not public.is_national_role() then raise exception 'National reconciliation access required.'; end if;
 if p_view not in ('all','attention','unlinked','test') then raise exception 'Choose an account directory view.'; end if;
 with facts as (
 select p.*,u.email_confirmed_at,u.last_sign_in_at,
 (select count(*) from public.members m where m.profile_id=p.id) member_count,
 (u.last_sign_in_at is null or (select count(*) from public.members m where m.profile_id=p.id)>1 or exists(select 1 from public.members m where m.profile_id=p.id and lower(trim(m.email))<>lower(trim(p.email))) or
 (p.role='state_commander' and p.state is null) or (p.role in ('post_commander','post_officer') and p.post_id is null) or
 (p.role='delegate' and not exists(select 1 from public.congress_delegates d where d.profile_id=p.id and (d.term_start is null or d.term_start<=current_date) and (d.term_end is null or d.term_end>=current_date)))) attention
 from public.profiles p left join auth.users u on u.id=p.id
 ), matched as (
 select f.* from facts f where (case p_view when 'test' then f.is_test_account when 'attention' then not f.is_test_account and f.attention when 'unlinked' then false else not f.is_test_account end) and
 (query_text='' or position(query_text in lower(f.full_name||' '||f.email||' '||replace(f.role::text,'_',' ')||' '||coalesce(f.title,'')||' '||coalesce(f.state,'')))>0 or exists(select 1 from public.cvoa_access_scopes(f.id) s left join public.posts p on p.id=s.post_id where position(query_text in lower(coalesce(p.name,'')||' '||coalesce(s.state,'')||' '||replace(s.role,'_',' ')||' '||coalesce(s.title,'')))>0))
 ), paged as(select * from matched order by full_name,id limit size offset page_number*size),
 member_matches as(select m.* from public.members m where m.profile_id is null and (query_text='' or position(query_text in lower(m.full_name||' '||coalesce(m.email,'')))>0)),
 member_page as(select * from member_matches order by full_name,id limit size offset page_number*size)
 select jsonb_build_object('counts',jsonb_build_object('ordinary',(select count(*) from facts where not is_test_account),'attention',(select count(*) from facts where not is_test_account and attention),'unlinked',(select count(*) from public.members where profile_id is null),'test',(select count(*) from facts where is_test_account),'account_only',(select count(*) from facts where not is_test_account and member_count=0)),
 'total',case when p_view='unlinked' then (select count(*) from member_matches) else (select count(*) from matched) end,
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('profile',(select to_jsonb(p) from public.profiles p where p.id=f.id),'email_confirmed',f.email_confirmed_at is not null,'last_sign_in_at',f.last_sign_in_at,
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'full_name',m.full_name,'email',m.email,'membership_type',m.membership_type,'membership_status',m.membership_status,'post_id',m.post_id,'post_name',(select name from public.posts where id=m.post_id))) from public.members m where m.profile_id=f.id),'[]'::jsonb),
 'scopes',(select jsonb_agg(to_jsonb(s)||jsonb_build_object('post_name',(select name from public.posts where id=s.post_id))) from public.cvoa_access_scopes(f.id) s)) order by f.full_name,f.id) from paged f),'[]'::jsonb),
 'unlinked_members',case when p_view='unlinked' then coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'full_name',m.full_name,'email',m.email,'membership_status',m.membership_status,'post_id',m.post_id,
 'candidate_id',case when (select count(*) from public.members where lower(trim(email))=lower(trim(m.email)))=1 and (select count(*) from public.profiles p join auth.users u on u.id=p.id where lower(trim(u.email))=lower(trim(m.email)) and lower(trim(p.email))=lower(trim(u.email)) and u.email_confirmed_at is not null)=1 then (select p.id from public.profiles p join auth.users u on u.id=p.id where lower(trim(u.email))=lower(trim(m.email)) and lower(trim(p.email))=lower(trim(u.email)) and u.email_confirmed_at is not null and not exists(select 1 from public.members x where x.profile_id=p.id) limit 1) end)) from member_page m),'[]'::jsonb) else '[]'::jsonb end,
 'posts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'state',state) order by name) from public.posts),'[]'::jsonb)) into result;
 return result;
end; $$;

create function public.cvoa_person_record(p_profile uuid default null,p_member uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pid uuid; subject_member public.members; result jsonb; national boolean:=public.is_national_role(); begin
 if p_member is not null then select * into subject_member from public.members where id=p_member; if not found then raise exception 'Membership not found.'; end if; pid:=subject_member.profile_id; else pid:=p_profile; end if;
 if not national and (p_member is null or not public.cvoa_can_oversee_post(subject_member.post_id)) then raise exception 'Person record access is restricted to responsible staff.'; end if;
 select jsonb_build_object('profile',case when national then (select to_jsonb(p) from public.profiles p where id=pid) else (select jsonb_build_object('id',id,'full_name',full_name,'role',role,'title',title,'post_id',post_id,'state',state,'access_suspended',access_suspended) from public.profiles where id=pid) end,
 'memberships',coalesce((select jsonb_agg(to_jsonb(x)) from(select m.id,m.full_name,m.email,m.membership_type,m.membership_status,m.membership_number,m.expires_at,m.dd214_review_status,m.post_id,(select name from public.posts where id=m.post_id) post_name from public.members m where (m.profile_id=pid or m.id=p_member) and (national or public.cvoa_can_oversee_post(m.post_id)))x),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(x)) from(select p.id,p.amount,p.status,p.paid_at,p.created_at from public.membership_payments p join public.members mm on mm.id=p.member_id where (mm.profile_id=pid or mm.id=p_member) and (national or public.cvoa_can_oversee_post(mm.post_id)) order by p.created_at desc limit 10)x),'[]'::jsonb),
 'staff_records',coalesce((select jsonb_agg(jsonb_build_object('post_name',(select name from public.posts where id=f.post_id),'position',f.position,'verification_status',f.verification_status)) from public.founding_team_members f where f.profile_id=pid and (national or public.cvoa_can_oversee_post(f.post_id))),'[]'::jsonb),
 'activation',(select jsonb_build_object('email_confirmed',email_confirmed_at is not null,'last_sign_in_at',last_sign_in_at) from auth.users where id=pid),
 'scopes',case when national then coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('post_name',(select name from public.posts where id=s.post_id))) from public.cvoa_access_scopes(pid) s),'[]'::jsonb) else coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('post_name',(select name from public.posts where id=s.post_id))) from public.cvoa_access_scopes(pid) s where s.post_id=subject_member.post_id or (s.role='state_commander' and s.state=(select state from public.posts where id=subject_member.post_id))),'[]'::jsonb) end,
 'history',case when national then coalesce((select jsonb_agg(to_jsonb(x)) from(select a.id,a.action,a.reason,a.created_at,(select full_name from public.profiles where id=a.actor_id) actor_name from public.access_audit a where a.profile_id=pid or a.member_id=p_member order by a.created_at desc limit 30)x),'[]'::jsonb) else '[]'::jsonb end) into result;
 return result;
end; $$;

-- National's state workspace respects the selected, validated appointment.
create or replace function public.cvoa_state_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope record; result jsonb; begin
 select * into scope from public.cvoa_current_scope();
 if not public.is_national_role() and coalesce(scope.role,'')<>'state_commander' then raise exception 'State oversight access is required.'; end if;
 select jsonb_build_object('state',scope.state,'posts',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'state',p.state,'status',p.status,'health_status',p.health_status,'active_members',(select count(*) from public.members m where m.post_id=p.id and m.membership_status='active'),'last_meeting',(select max(meeting_date) from public.uro_meetings u where u.post_id=p.id and u.status='published'),'open_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open')) order by p.name),'[]'::jsonb)) into result from public.posts p where public.is_national_role() or (scope.state ~ '^[A-Z]{2}$' and upper(p.state)=scope.state);
 return result;
end; $$;

-- New functions have no default PUBLIC execution grants.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('cvoa_access_enabled','cvoa_current_scope','cvoa_can_read_post','cvoa_my_access','cvoa_select_workspace','cvoa_public_posts','cvoa_active_delegate','cvoa_state_voting','cvoa_audit_profile_access','cvoa_update_account','cvoa_add_appointment','cvoa_revoke_appointment','cvoa_link_account','cvoa_accounts_directory','cvoa_person_record') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.signature::text not like '%cvoa_audit_profile_access%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
grant execute on function public.cvoa_access_enabled(),public.cvoa_can_read_post(uuid),public.cvoa_current_scope(),public.cvoa_public_posts(uuid) to anon;
create function public.cvoa_service_authorized(p_actor uuid,p_post uuid,p_capability text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_actor and not p.access_suspended and
 (p_capability='personal' or (p_capability in ('national','manage_post') and p.role in ('national_commander','national_staff')) or
 (p_capability='manage_post' and exists(select 1 from public.cvoa_access_scopes(p_actor) s where s.role in ('post_commander','post_officer') and s.post_id=p_post))));
$$;
revoke all on function public.cvoa_service_authorized(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cvoa_service_authorized(uuid,uuid,text) to service_role;

create function public.cvoa_can_read_post_file(p_bucket text,p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_national_role() or (public.cvoa_access_enabled() and (
 exists(select 1 from public.posts p where p.id::text=split_part(p_name,'/',1) and public.cvoa_can_read_post(p.id)) or
 (p_bucket='meeting-records' and exists(select 1 from public.meeting_records r where r.attachment_storage_path=p_name and public.cvoa_can_read_post(r.post_id))) or
 (p_bucket='governance-documents' and exists(select 1 from public.governance_signatures g where g.document_storage_path=p_name and public.cvoa_can_read_post(g.post_id)))));
$$;
create function public.cvoa_can_write_post_file(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_national_role() or exists(select 1 from public.posts p where p.id::text=split_part(p_name,'/',1) and public.cvoa_can_manage_post(p.id));
$$;
revoke all on function public.cvoa_can_read_post_file(text,text),public.cvoa_can_write_post_file(text) from public,anon;
grant execute on function public.cvoa_can_read_post_file(text,text),public.cvoa_can_write_post_file(text) to authenticated,anon;
create policy access_enabled on storage.objects as restrictive for all to authenticated using(public.cvoa_access_enabled()) with check(public.cvoa_access_enabled());
alter policy meeting_records_files_read_auth on storage.objects using(bucket_id='meeting-records' and public.cvoa_can_read_post_file(bucket_id,name));
alter policy meeting_records_files_write_auth on storage.objects with check(bucket_id='meeting-records' and public.cvoa_can_write_post_file(name));
alter policy governance_documents_read_auth on storage.objects using(bucket_id='governance-documents' and public.cvoa_can_read_post_file(bucket_id,name));
alter policy governance_documents_write_auth on storage.objects with check(bucket_id='governance-documents' and public.cvoa_can_write_post_file(name));

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
create or replace function public.approve_post_role_application(p_application_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare app public.post_role_applications; m public.members; target uuid;
begin
 select * into app from public.post_role_applications where id=p_application_id for update;
 if not found then raise exception 'Application not found.'; end if;
 if not (public.is_national_role() or (app.requested_role='post_officer' and (public.cvoa_access_enabled() and exists(select 1 from public.cvoa_access_scopes(auth.uid()) where role='post_commander' and post_id=app.post_id)))) then raise exception 'Appointment approval access required.'; end if;
 if app.status<>'pending' then raise exception 'Application has already been reviewed.'; end if;
 select * into m from public.members where id=app.member_id for update;
 if not found or m.membership_status<>'active' or m.post_id is distinct from app.post_id then raise exception 'Active membership in this post is required.'; end if;
 target:=m.profile_id;
 if target is null then select id into target from auth.users where lower(email)=lower(m.email) and email_confirmed_at is not null; end if;
 if target is null then raise exception 'The member must activate an account first.'; end if;
 if exists(select 1 from public.profiles where id=target and role in ('national_commander','national_staff','state_commander','ethics_tribunal')) then raise exception 'Existing leadership appointments must be managed by National in Accounts & Access.'; end if;
 update public.members set profile_id=target where id=m.id;
 update public.profiles set role=app.requested_role::text::public.user_role,post_id=app.post_id where id=target;
 update public.post_role_applications set status='verified',reviewed_by=auth.uid(),reviewed_at=now() where id=app.id;
end; $$;
revoke all on function public.approve_post_role_application(uuid) from public,anon;
grant execute on function public.approve_post_role_application(uuid) to authenticated;


-- A caller cannot impersonate another person through shared Congress inputs.
alter policy resolutions_write_delegate on public.resolutions with check(public.cvoa_access_enabled() and submitted_by=auth.uid() and (public.is_national_role() or (status in ('draft','under_review') and vote_type is null)));
alter policy resolution_co_sponsors_write_auth on public.resolution_co_sponsors with check(public.cvoa_access_enabled() and profile_id=auth.uid());
alter policy resolution_comments_write_auth on public.resolution_comments with check(public.cvoa_access_enabled() and author_id=auth.uid());
alter policy activity_feed_write_auth on public.activity_feed with check(public.cvoa_can_manage_post(post_id) and (actor_id is null or actor_id=auth.uid()));
create function public.cvoa_guard_resolution_authority() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') or public.is_national_role() then return new; end if;
 if old.status not in ('draft','under_review') or (new.status is distinct from old.status and not (old.status='draft' and new.status='under_review')) or (to_jsonb(new)-array['title','category','executive_summary','body','purpose','financial_impact_cost','financial_impact_funding_source','financial_impact_revenue_note','organizational_impact','updated_at','status']) is distinct from (to_jsonb(old)-array['title','category','executive_summary','body','purpose','financial_impact_cost','financial_impact_funding_source','financial_impact_revenue_note','organizational_impact','updated_at','status']) then raise exception 'Congress procedure and voting authority require authorized administration.'; end if;
 return new;
end; $$;
create trigger resolution_authority before update on public.resolutions for each row execute function public.cvoa_guard_resolution_authority();
revoke all on function public.cvoa_guard_resolution_authority() from public,anon,authenticated;

-- Direct profile writes cannot bypass reviewed, audited access administration.
create or replace function public.cvoa_guard_profile_privileges() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if tg_op='INSERT' then
  if new.id<>auth.uid() or new.role<>'guest_applicant' or new.post_id is not null or new.state is not null or new.title is not null or new.is_test_account or new.access_suspended or new.access_version<>0 then raise exception 'New accounts require the applicant role and no staff assignment.'; end if;
 elsif (to_jsonb(new)-array['full_name','phone']) is distinct from (to_jsonb(old)-array['full_name','phone']) then
  raise exception 'Use reviewed Accounts & Access administration to change account permissions or identity fields.';
 end if;
 return new;
end; $$;
create or replace function public.cvoa_owns_application(p_application uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.post_applications a join auth.users u on u.id=auth.uid() where a.id=p_application and (a.applicant_profile_id=u.id or (u.email_confirmed_at is not null and lower(a.email)=lower(u.email))));
$$;
commit;
