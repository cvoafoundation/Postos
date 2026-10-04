-- Verified against production policies on 2026-10-03. Apply before workspaces.
begin;
alter table public.members add column if not exists auto_renew boolean not null default false;

create or replace function public.is_national_role() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role in ('national_commander','national_staff'));
$$;
create or replace function public.current_post_id() returns uuid language sql stable security definer set search_path='' as $$
 select post_id from public.profiles where id=auth.uid();
$$;
create or replace function public.is_ethics_tribunal_role() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='ethics_tribunal');
$$;
create or replace function public.cvoa_can_manage_post(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and (role in ('national_commander','national_staff') or (role in ('post_commander','post_officer') and post_id=p_post)));
$$;
revoke all on function public.cvoa_can_manage_post(uuid) from public,anon;
grant execute on function public.cvoa_can_manage_post(uuid) to anon,authenticated;

-- Invoker trigger: trusted service/definer functions keep their controlled
-- promotions; direct authenticated writes cannot change privilege fields.
create or replace function public.cvoa_guard_profile_privileges() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') or public.is_national_role() then return new; end if;
 if tg_op='INSERT' then
  if new.id<>auth.uid() or new.role<>'guest_applicant' or new.post_id is not null or new.state is not null or new.title is not null then
   raise exception 'New accounts require the applicant role and no staff assignment.';
  end if;
 else
  if (to_jsonb(new)-array['full_name','phone']) is distinct from (to_jsonb(old)-array['full_name','phone']) then
   raise exception 'Only National can change account permissions or identity fields.';
  end if;
 end if;
 return new;
end; $$;
create trigger cvoa_profile_privileges before insert or update on public.profiles for each row execute function public.cvoa_guard_profile_privileges();
revoke truncate,references,trigger on all tables in schema public from anon,authenticated;

alter policy profiles_insert_own on public.profiles with check(id=auth.uid() and role='guest_applicant' and post_id is null and state is null and title is null);
alter policy members_insert_auth_or_public on public.members with check(
 public.is_national_role() or (auth.uid() is not null and public.cvoa_can_manage_post(post_id)) or
 (membership_status='pending_payment' and profile_id is null and joined_at is null and expires_at is null
  and dd214_review_status='pending' and dd214_reviewed_by is null and dd214_reviewed_at is null
  and auto_renew=false and stripe_subscription_id is null));
alter policy members_update_post_or_national on public.members using(public.cvoa_can_manage_post(post_id)) with check(public.cvoa_can_manage_post(post_id));
alter policy members_select_post_or_national on public.members using(public.cvoa_can_manage_post(post_id));
-- Own-member read policy already exists in production.
alter policy membership_payments_insert_public on public.membership_payments with check(public.is_national_role());
alter policy membership_payments_select_post_or_national on public.membership_payments using(public.cvoa_can_manage_post(post_id) or exists(select 1 from public.members m where m.id=member_id and m.profile_id=auth.uid()));
alter policy founding_team_insert_public on public.founding_team_members with check(public.is_national_role() or
 (verification_status='pending' and dd214_reviewed=false and combat_service_verified=false and membership_approved=false and profile_id is null and verified_at is null));
alter policy founding_team_update_national on public.founding_team_members using(public.is_national_role()) with check(public.is_national_role());
alter policy founding_team_post_or_national on public.founding_team_members using(public.cvoa_can_manage_post(post_id) or profile_id=auth.uid());
alter policy pending_signups_insert_public on public.pending_profile_signups with check(role in ('member','guest_applicant'));
create or replace function public.cvoa_verified_email() returns text language sql stable security definer set search_path='' as $$ select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null; $$;
revoke all on function public.cvoa_verified_email() from public,anon;
grant execute on function public.cvoa_verified_email() to authenticated;
alter policy pending_signups_select_auth on public.pending_profile_signups using(lower(email)=public.cvoa_verified_email());
alter policy pending_signups_delete_auth on public.pending_profile_signups using(lower(email)=public.cvoa_verified_email());

-- Post writes must be National or an officer of that exact post. The existing
-- private secretary-note and Tribunal policies are intentionally excluded.
do $$ declare p record; expression text; begin
 for p in select * from pg_policies where schemaname='public' and
 (policyname in ('annual_reviews_write_auth','facility_plans_write_auth','community_service_insert_auth','financial_transactions_insert_auth','governance_signatures_insert_auth','meeting_records_insert_auth','facility_checklist_write_auth','facility_projects_write_auth','toolkit_generated_write_auth','uro_action_items_write','uro_agenda_items_write','uro_attendance_write','uro_comments_write','uro_motions_write','uro_officer_reports_write','uro_meetings_insert','uro_meetings_update','uro_meetings_delete','posts_update_national_or_own','recruits_update_post_or_national','sponsors_update_post_or_national','sponsor_payments_insert_post_or_national','delegates_write_post_or_national','checklist_update_shared')) loop
  expression := case when p.tablename='posts' then 'public.cvoa_can_manage_post(id)' when p.tablename='post_facility_checklist_items' then 'exists(select 1 from public.post_facility_projects x where x.id=project_id and public.cvoa_can_manage_post(x.post_id))' else 'public.cvoa_can_manage_post(post_id)' end;
  if p.cmd='INSERT' then execute format('alter policy %I on public.%I with check (%s)',p.policyname,p.tablename,expression);
  elsif p.cmd='DELETE' then execute format('alter policy %I on public.%I using (%s)',p.policyname,p.tablename,expression);
  else execute format('alter policy %I on public.%I using (%s) with check (%s)',p.policyname,p.tablename,expression,expression); end if;
 end loop;
end $$;

-- Scope confidential operational reads; public/member directories use narrow RPCs.
do $$ declare p record; expression text; begin
 for p in select * from pg_policies where schemaname='public' and cmd='SELECT' and tablename in
 ('annual_reviews','financial_transactions','governance_signatures','meeting_records','post_applications','post_facility_projects','post_facility_checklist_items','recruits','sponsors','sponsor_payments','toolkit_generated_documents','build_a_post_generated_plans','uro_action_items','uro_agenda_items','uro_attendance','uro_comments','uro_motions','uro_officer_reports') loop
  expression:=case when p.tablename='post_facility_checklist_items' then 'exists(select 1 from public.post_facility_projects x where x.id=project_id and public.cvoa_can_manage_post(x.post_id))' else 'public.cvoa_can_manage_post(post_id)' end;
  execute format('alter policy %I on public.%I using (%s)',p.policyname,p.tablename,expression);
 end loop;
end $$;
alter policy activity_feed_read_all on public.activity_feed using(public.cvoa_can_manage_post(post_id));

-- Anonymous application intake can request review, never mark itself approved.
alter policy applications_insert_public on public.post_applications with check(public.is_national_role() or
 (status='new_inquiry' and dd214_review_status='pending' and dd214_reviewed_by is null and dd214_reviewed_at is null));
alter policy post_role_applications_insert_public on public.post_role_applications with check(status='pending' and reviewed_by is null and reviewed_at is null);

create or replace function public.approve_post_role_application(p_application_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare app public.post_role_applications; m public.members; target uuid;
begin
 select * into app from public.post_role_applications where id=p_application_id for update;
 if not found then raise exception 'Application not found.'; end if;
 if not (public.is_national_role() or (app.requested_role='post_officer' and exists(select 1 from public.profiles where id=auth.uid() and role='post_commander' and post_id=app.post_id))) then raise exception 'Appointment approval access required.'; end if;
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

create or replace function public.link_member_profile() returns void language plpgsql security definer set search_path='' as $$
declare email_address text;
begin
 select email into email_address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if email_address is null then return; end if;
 update public.members set profile_id=auth.uid() where profile_id is null and lower(email)=lower(email_address);
 update public.profiles p set full_name=m.full_name from public.members m where p.id=auth.uid() and m.profile_id=auth.uid() and coalesce(m.full_name,'')<>'';
 update public.profiles p set role='member',post_id=coalesce(p.post_id,m.post_id) from public.members m where p.id=auth.uid() and m.profile_id=auth.uid() and m.membership_status='active' and p.role='guest_applicant';
end; $$;
create or replace function public.link_founding_team_profile() returns void language plpgsql security definer set search_path='' as $$
begin
 update public.founding_team_members set profile_id=auth.uid() where profile_id is null and lower(email)=lower((select email from auth.users where id=auth.uid() and email_confirmed_at is not null));
end; $$;
revoke all on function public.link_member_profile(),public.link_founding_team_profile() from public,anon;
grant execute on function public.link_member_profile(),public.link_founding_team_profile() to authenticated;

create or replace function public.promote_founding_team_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.verification_status='verified' and new.profile_id is not null then
  update public.profiles set role=(case when new.position='commander' then 'post_commander' when new.position='member' then 'member' else 'post_officer' end)::public.user_role,post_id=new.post_id
  where id=new.profile_id and role in ('guest_applicant','member','post_commander','post_officer');
 end if;
 return new;
end; $$;

create or replace function public.cvoa_post_officer_directory() returns table(id uuid,name text,email text,phone text,"position" public.founding_position) language sql stable security definer set search_path='' as $$
 select f.id,f.name,f.email,f.phone,f.position from public.founding_team_members f where f.post_id=public.current_post_id() and f.position<>'member' and f.verification_status='verified' and auth.uid() is not null;
$$;
revoke all on function public.cvoa_post_officer_directory() from public,anon;
grant execute on function public.cvoa_post_officer_directory() to authenticated;

-- Directory exposes the four displayed fields instead of the full roster,
-- which contains addresses, service documents and payment identifiers.
create or replace function public.cvoa_post_member_directory() returns table(id uuid,full_name text,membership_number text,membership_type public.membership_type,membership_status public.membership_status) language sql stable security definer set search_path='' as $$
 select m.id,m.full_name,m.membership_number,m.membership_type,m.membership_status from public.members m
 where m.post_id=public.current_post_id() and auth.uid() is not null order by m.full_name;
$$;
revoke all on function public.cvoa_post_member_directory() from public,anon;
grant execute on function public.cvoa_post_member_directory() to authenticated;
commit;
