-- Membership-only workspace. No account is changed by this migration.
create schema if not exists membership_private;
revoke all on schema membership_private from public, anon, authenticated;
create table membership_private.account_limits (
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false,
 reason text not null,
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table membership_private.account_limits enable row level security;
revoke all on membership_private.account_limits from public, anon, authenticated;

create function membership_private.is_limited(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from membership_private.account_limits where profile_id=p_actor and enabled);
$$;
revoke all on function membership_private.is_limited(uuid) from public, anon, authenticated;
create function public.cvoa_membership_only() returns boolean
language sql stable security definer set search_path='' as $$
 select membership_private.is_limited(auth.uid());
$$;
revoke all on function public.cvoa_membership_only() from public, anon;
grant execute on function public.cvoa_membership_only() to authenticated;

create function public.cvoa_membership_access(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if not public.is_national_role() then raise exception 'National access required.' using errcode='42501'; end if;
 select jsonb_build_object('enabled',membership_private.is_limited(p.id),'version',p.access_version,
 'eligible',p.id<>auth.uid() and p.deleted_at is null and p.role in ('member','delegate')
 and exists(select 1 from public.members m where m.profile_id=p.id and m.deleted_at is null)
 and not exists(select 1 from public.cvoa_access_scopes(p.id) s where s.role not in ('member','delegate')))
 into result from public.profiles p where p.id=p_profile;
 if result is null then raise exception 'Account not found.'; end if; return result;
end; $$;
create function public.cvoa_set_membership_access(p_profile uuid,p_version bigint,p_enabled boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account public.profiles; previous boolean; begin
 if not public.is_national_role() then raise exception 'National access required.' using errcode='42501'; end if;
 if p_enabled is null or length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Enter a reason of 5–1000 characters.'; end if;
 select * into account from public.profiles where id=p_profile for update;
 if not found or account.deleted_at is not null then raise exception 'Account not found.'; end if;
 if p_profile=auth.uid() then raise exception 'Another National administrator must change your access.'; end if;
 if account.access_version is distinct from p_version then raise exception 'This account changed. Refresh before saving.'; end if;
 if p_enabled and not (public.cvoa_membership_access(p_profile)->>'eligible')::boolean then
 raise exception 'Use a linked member account. End staff appointments before selecting membership-only access.'; end if;
 previous:=membership_private.is_limited(p_profile);
 if previous=p_enabled then return public.cvoa_membership_access(p_profile); end if;
 insert into membership_private.account_limits(profile_id,enabled,reason,updated_by)
 values(p_profile,p_enabled,trim(p_reason),auth.uid())
 on conflict(profile_id) do update set enabled=excluded.enabled,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
 update public.profiles set access_version=access_version+1 where id=p_profile;
 insert into public.access_audit(profile_id,actor_id,action,reason,before_value,after_value)
 values(p_profile,auth.uid(),'membership_workspace',trim(p_reason),jsonb_build_object('membership_only',previous),jsonb_build_object('membership_only',p_enabled));
 return public.cvoa_membership_access(p_profile);
end; $$;
revoke all on function public.cvoa_membership_access(uuid),public.cvoa_set_membership_access(uuid,bigint,boolean,text) from public, anon;
grant execute on function public.cvoa_membership_access(uuid),public.cvoa_set_membership_access(uuid,bigint,boolean,text) to authenticated;

-- A later appointment cannot accidentally bypass a membership-only workspace.
create function membership_private.guard_appointment() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; begin
 if tg_table_name='profiles' then target:=new.id; else target:=new.profile_id; end if;
 perform 1 from public.profiles where id=target for update;
 if membership_private.is_limited(target) and new.role::text not in ('member','delegate')
 and (tg_table_name='profiles' or (to_jsonb(new)->>'revoked_at') is null) then
 raise exception 'Restore standard membership access before adding staff appointments.'; end if;
 return new;
end; $$;
revoke all on function membership_private.guard_appointment() from public, anon, authenticated;
create trigger membership_workspace_role_guard before insert or update on public.profiles for each row execute function membership_private.guard_appointment();
create trigger membership_workspace_appointment_guard before insert or update on public.access_appointments for each row execute function membership_private.guard_appointment();

create or replace function public.cvoa_my_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select jsonb_build_object('membership_only',public.cvoa_membership_only(),'suspended',coalesce(p.access_suspended,false),
 'scopes',case when p.access_suspended then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('post_name',(select name from public.posts where id=s.post_id))) from public.cvoa_access_scopes(auth.uid()) s),'[]'::jsonb) end,
 'selected',(select scope_id from public.cvoa_current_scope())) into result from public.profiles p where p.id=auth.uid();
 return result;
end; $$;

create function public.cvoa_my_membership_cards() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Sign in required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'full_name',m.full_name,'membership_number',m.membership_number,
 'membership_type',m.membership_type,'membership_status',m.membership_status,'joined_at',m.joined_at,'expires_at',m.expires_at,'dd214_review_status',m.dd214_review_status) order by m.created_at desc)
 from public.members m where m.profile_id=auth.uid() and m.deleted_at is null),'[]'::jsonb);
end; $$;
-- Display names for Congress without exposing the member directory or post records.
create function public.cvoa_congress_labels() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Sign in required.' using errcode='42501'; end if;
 return jsonb_build_object('posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) from public.posts p),'[]'::jsonb),
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name)) from public.profiles p
 where exists(select 1 from public.congress_delegates d where d.profile_id=p.id)),'[]'::jsonb));
end; $$;
revoke all on function public.cvoa_my_membership_cards(),public.cvoa_congress_labels() from public, anon;
grant execute on function public.cvoa_my_membership_cards(),public.cvoa_congress_labels() to authenticated;

-- Fail closed for Data API functions, views and direct requests outside the three areas.
create function public.cvoa_membership_request_guard() returns void
language plpgsql stable security definer set search_path='' as $$
declare path text:=trim(both '/' from coalesce(current_setting('request.path',true),''));
 method text:=current_setting('request.method',true); begin
 if not public.cvoa_membership_only() then return; end if;
 if path in ('rpc/cvoa_my_access','rpc/cvoa_membership_only','rpc/cvoa_my_membership_cards','rpc/cvoa_congress_labels','rpc/verify_membership','rpc/cvoa_state_voting','rpc/cvoa_vote_totals','rpc/get_preference_tally','rpc/cvoa_select_workspace','rpc/mark_notification_viewed') then return; end if;
 if path='profiles' and method in ('GET','HEAD') then return; end if;
 if path in ('resolutions','resolution_amendments','resolution_documents','resolution_comments','resolution_votes','resolution_member_preferences','congress_announcements','committees','committee_reviews','congress_calendar_events','legislative_bills','ethics_complaints') then return; end if;
 if path='congress_delegates' and method in ('GET','HEAD') then return; end if;
 raise exception 'This action is outside your available workspace.' using errcode='42501';
end; $$;
revoke all on function public.cvoa_membership_request_guard() from public,anon;
grant execute on function public.cvoa_membership_request_guard() to authenticated,service_role,anon;
do $$ begin
 if exists(select 1 from pg_roles r, unnest(coalesce(r.rolconfig,'{}'::text[])) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%' and setting not in ('pgrst.db_pre_request=', 'pgrst.db_pre_request=public.cvoa_membership_request_guard')) then raise exception 'An existing Data API request hook must be composed with the membership guard before installation.'; end if;
end; $$;
alter role authenticator set pgrst.db_pre_request='public.cvoa_membership_request_guard';

-- Restrictive policies also enforce limits for Realtime and direct table access.
do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
 and c.relname not in ('profiles','resolutions','resolution_amendments','resolution_documents','resolution_comments','resolution_votes','resolution_member_preferences','congress_announcements','committees','committee_reviews','congress_delegates','congress_calendar_events','legislative_bills','ethics_complaints') loop
 execute format('create policy membership_workspace on public.%I as restrictive for all to authenticated using (not (select public.cvoa_membership_only())) with check (not (select public.cvoa_membership_only()))',t.relname);
 end loop;
end; $$;
create policy membership_workspace on public.profiles as restrictive for all to authenticated
 using (not (select public.cvoa_membership_only()) or id=(select auth.uid())) with check (not (select public.cvoa_membership_only()));
create policy membership_workspace on public.congress_delegates as restrictive for all to authenticated
 using (true) with check (not (select public.cvoa_membership_only()));
create policy membership_workspace_delete on public.congress_delegates as restrictive for delete to authenticated using (not (select public.cvoa_membership_only()));
create policy membership_workspace on public.ethics_complaints as restrictive for all to authenticated
 using (not (select public.cvoa_membership_only()) or complainant_id=(select auth.uid()))
 with check (not (select public.cvoa_membership_only()) or complainant_id=(select auth.uid()) or (filed_anonymously and complainant_id is null));
create policy membership_workspace on storage.objects as restrictive for all to authenticated
 using (not (select public.cvoa_membership_only()) or bucket_id='congress-documents')
 with check (not (select public.cvoa_membership_only()) or bucket_id='congress-documents');

-- Service clients in Edge Functions must honor the same account limit.
create or replace function public.cvoa_service_authorized(p_actor uuid,p_post uuid,p_capability text) returns boolean
language sql stable security definer set search_path='' as $$
 select not membership_private.is_limited(p_actor) and exists(select 1 from public.profiles p where p.id=p_actor and not p.access_suspended and p.deleted_at is null and
 (p_capability='personal' or (p_capability in ('national','manage_post') and p.role in ('national_commander','national_staff')) or
 (p_capability='manage_post' and exists(select 1 from public.cvoa_access_scopes(p_actor) s where s.role in ('post_commander','post_officer') and s.post_id=p_post))));
$$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
