-- Removal is recoverable and does not destroy payment, meeting, or audit history.
begin;
alter table public.members add column deleted_at timestamptz, add column deleted_reason text, add column removed_status public.membership_status;
alter table public.profiles add column deleted_at timestamptz;
revoke delete on public.members,public.profiles from anon,authenticated;
create policy member_not_removed on public.members as restrictive for all to authenticated using(deleted_at is null) with check(deleted_at is null);
create function public.cvoa_remove_person(p_member uuid default null,p_profile uuid default null,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare m public.members; p public.profiles; begin
 if not public.is_national_role() then raise exception 'National administration required.';end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 1000 then raise exception 'Enter a removal reason of 5 to 1000 characters.';end if;
 if (p_member is null)=(p_profile is null) then raise exception 'Choose one membership or one account.';end if;
 if p_profile is not null then
  select * into p from public.profiles where id=p_profile for update;
  if not found or p.deleted_at is not null then raise exception 'Account is already removed or no longer exists.';end if;
  if p.id=auth.uid() then raise exception 'You cannot remove your own account.';end if;
  if p.role in ('national_commander','national_staff','ethics_tribunal') then raise exception 'Review and end privileged appointments before removing this account. Tribunal changes remain restricted.';end if;
  insert into public.access_audit(profile_id,actor_id,action,reason,before_value) values(p.id,auth.uid(),'account_removed',trim(p_reason),jsonb_build_object('role',p.role,'access_suspended',p.access_suspended));
  update public.profiles set deleted_at=now(),access_suspended=true where id=p.id;
 end if;
 for m in select * from public.members where deleted_at is null and ((p_member is not null and id=p_member) or (p_profile is not null and profile_id=p_profile)) order by id for update loop
  if m.auto_renew and m.stripe_subscription_id is not null then raise exception 'Cancel Stripe Auto-Renew in the roster record before removing this membership. Removal does not cancel billing.';end if;
  if m.profile_id=auth.uid() then raise exception 'You cannot remove your own membership.';end if;
  insert into public.access_audit(profile_id,member_id,actor_id,action,reason,before_value) values(m.profile_id,m.id,auth.uid(),'membership_removed',trim(p_reason),jsonb_build_object('membership_status',m.membership_status,'post_id',m.post_id));
  update public.members set deleted_at=now(),deleted_reason=trim(p_reason),removed_status=membership_status,membership_status='lapsed' where id=m.id;
 end loop;
 if p_member is not null and m.id is null then raise exception 'Membership is already removed or no longer exists.';end if;
end;$$;
create function public.cvoa_restore_person(p_member uuid default null,p_profile uuid default null,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare m public.members; p public.profiles; begin
 if not public.is_national_role() then raise exception 'National administration required.';end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 1000 or (p_member is null)=(p_profile is null) then raise exception 'Choose one removed record and provide a restoration reason.';end if;
 if p_profile is not null then
  select * into p from public.profiles where id=p_profile for update;
  if not found or p.deleted_at is null then raise exception 'Account is not removed.';end if;
  insert into public.access_audit(profile_id,actor_id,action,reason) values(p.id,auth.uid(),'account_restored',trim(p_reason));
  -- Keep access suspended until National reviews the preserved appointments.
  update public.profiles set deleted_at=null where id=p.id;
 else
  select * into m from public.members where id=p_member for update;
  if not found or m.deleted_at is null then raise exception 'Membership is not removed.';end if;
  if exists(select 1 from public.profiles where id=m.profile_id and deleted_at is not null) then raise exception 'Restore the linked account first.';end if;
  insert into public.access_audit(profile_id,member_id,actor_id,action,reason) values(m.profile_id,m.id,auth.uid(),'membership_restored',trim(p_reason));
  update public.members set deleted_at=null,deleted_reason=null,membership_status=coalesce(removed_status,'lapsed'),removed_status=null where id=m.id;
 end if;
end;$$;
create function public.cvoa_removed_people() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_national_role() then raise exception 'National administration required.';end if;
 return jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'deleted_at',deleted_at) order by deleted_at desc) from public.profiles where deleted_at is not null),'[]'::jsonb),'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'profile_id',profile_id,'deleted_at',deleted_at,'reason',deleted_reason) order by deleted_at desc) from public.members where deleted_at is not null),'[]'::jsonb));
end;$$;
create function public.cvoa_removal_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare action_name text; begin
 if tg_table_name='members' then
  if new.deleted_at is null and exists(select 1 from public.profiles where id=new.profile_id and deleted_at is not null) then raise exception 'Restore the removed account before linking this membership.';end if;
 end if;
 if tg_table_name='members' and old.deleted_at is not null and new.deleted_at is not null then
  -- Late payment notifications retain the receipt but cannot restore a removed identity.
  new.membership_status:='lapsed';
 end if;
 if tg_table_name='profiles' then
  if new.deleted_at is not null and not new.access_suspended then raise exception 'Restore this account before reviewing access.';end if;
 end if;
 if new.deleted_at is distinct from old.deleted_at and auth.uid() is not null then
  action_name:=case when tg_table_name='members' then 'membership_' else 'account_' end ||case when new.deleted_at is null then 'restored' else 'removed' end;
  if not public.is_national_role() or not exists(select 1 from public.access_audit a where a.actor_id=auth.uid() and a.action=action_name and a.created_at=transaction_timestamp() and (case when tg_table_name='members' then a.member_id=new.id else a.profile_id=new.id end)) then raise exception 'Use the audited removal or restoration action.';end if;
 end if;
 return new;
end;$$;
create trigger member_removal_guard before insert or update on public.members for each row execute function public.cvoa_removal_guard();
create trigger account_removal_guard before update on public.profiles for each row execute function public.cvoa_removal_guard();

create or replace function public.cvoa_link_account(p_member uuid,p_profile uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare m public.members; email_address text; begin
 if not public.is_national_role() then raise exception 'National reconciliation access required.'; end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 1000 then raise exception 'Explain this record link.'; end if;
 perform pg_advisory_xact_lock(hashtext('cvoa-member-account-link'));
 perform 1 from public.profiles where id=p_profile for update;
 select * into m from public.members where deleted_at is null and id=p_member for update;
 if not found or m.profile_id is not null then raise exception 'This membership is already linked or no longer exists.'; end if;
 select u.email into email_address from auth.users u join public.profiles p on p.id=u.id where u.id=p_profile and p.deleted_at is null and u.email_confirmed_at is not null and lower(trim(p.email))=lower(trim(u.email));
 if email_address is null or lower(trim(email_address))<>lower(trim(m.email)) then raise exception 'A verified matching account email is required.'; end if;
 if (select count(*) from auth.users where lower(trim(email))=lower(trim(m.email)) and email_confirmed_at is not null)<>1 or (select count(*) from public.members where deleted_at is null and lower(trim(email))=lower(trim(m.email)))<>1 or exists(select 1 from public.members where deleted_at is null and profile_id=p_profile) then raise exception 'Conflicting records need individual review.'; end if;
 update public.members set profile_id=p_profile where id=p_member;
 insert into public.access_audit(profile_id,member_id,actor_id,action,reason,after_value) values(p_profile,p_member,auth.uid(),'membership_linked',p_reason,jsonb_build_object('member_id',p_member,'profile_id',p_profile));
end; $$;
create or replace function public.link_member_profile() returns void language plpgsql security definer set search_path='' as $$
declare verified text; mid uuid; begin
 if not public.cvoa_access_enabled() then return; end if;
 select lower(trim(email)) into verified from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified is null or (select count(*) from public.members where deleted_at is null and lower(trim(email))=verified)<>1 then return; end if;
 select id into mid from public.members where deleted_at is null and lower(trim(email))=verified and profile_id=auth.uid() for update;
 if mid is not null then
  update public.profiles p set role='member',post_id=coalesce(p.post_id,m.post_id) from public.members m where m.deleted_at is null and m.id=mid and p.id=auth.uid() and p.role='guest_applicant' and m.membership_status='active';
  return;
 end if;
 if exists(select 1 from public.members where deleted_at is null and profile_id=auth.uid()) then return; end if;
 select id into mid from public.members where deleted_at is null and lower(trim(email))=verified and profile_id is null for update;
 if mid is null then return; end if;
 update public.members set profile_id=auth.uid() where id=mid;
 update public.profiles p set full_name=m.full_name from public.members m where m.deleted_at is null and m.id=mid and p.id=auth.uid();
 update public.profiles p set role='member',post_id=coalesce(p.post_id,m.post_id) from public.members m where m.deleted_at is null and m.id=mid and p.id=auth.uid() and p.role='guest_applicant' and m.membership_status='active';
end; $$;


create or replace function public.cvoa_accounts_directory(p_search text default '',p_view text default 'all',p_page integer default 0,p_size integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; query_text text:=lower(trim(coalesce(p_search,''))); size integer:=least(50,greatest(1,coalesce(p_size,25))); page_number integer:=greatest(0,coalesce(p_page,0)); begin
 if not public.is_national_role() then raise exception 'National reconciliation access required.'; end if;
 if p_view not in ('all','attention','unlinked','test') then raise exception 'Choose an account directory view.'; end if;
 with facts as (
 select p.*,u.email_confirmed_at,u.last_sign_in_at,
 (select count(*) from public.members m where m.deleted_at is null and m.profile_id=p.id) member_count,
 (u.last_sign_in_at is null or (select count(*) from public.members m where m.deleted_at is null and m.profile_id=p.id)>1 or exists(select 1 from public.members m where m.deleted_at is null and m.profile_id=p.id and lower(trim(m.email))<>lower(trim(p.email))) or
 (p.role='state_commander' and p.state is null) or (p.role in ('post_commander','post_officer') and p.post_id is null) or
 (p.role='delegate' and not exists(select 1 from public.congress_delegates d where d.profile_id=p.id and (d.term_start is null or d.term_start<=current_date) and (d.term_end is null or d.term_end>=current_date)))) attention
 from public.profiles p left join auth.users u on u.id=p.id where p.deleted_at is null
 ), matched as (
 select f.* from facts f where (case p_view when 'test' then f.is_test_account when 'attention' then not f.is_test_account and f.attention when 'unlinked' then false else not f.is_test_account end) and
 (query_text='' or position(query_text in lower(f.full_name||' '||f.email||' '||replace(f.role::text,'_',' ')||' '||coalesce(f.title,'')||' '||coalesce(f.state,'')))>0 or exists(select 1 from public.cvoa_access_scopes(f.id) s left join public.posts p on p.id=s.post_id where position(query_text in lower(coalesce(p.name,'')||' '||coalesce(s.state,'')||' '||replace(s.role,'_',' ')||' '||coalesce(s.title,'')))>0))
 ),
 member_matches as(select m.* from public.members m where m.deleted_at is null and m.profile_id is null and (query_text='' or position(query_text in lower(m.full_name||' '||coalesce(m.email,'')||' '||coalesce(m.membership_number,'')||' '||coalesce((select name||' '||state from public.posts where id=m.post_id),'')))>0)),
 people as(select id,full_name,'account' kind from matched union all select id,full_name,'member' from member_matches where p_view in ('all','unlinked')), person_page as(select * from people order by full_name,id,kind limit size offset page_number*size), paged as(select f.* from matched f join person_page x on x.id=f.id and x.kind='account'), member_page as(select m.* from member_matches m join person_page x on x.id=m.id and x.kind='member')
 select jsonb_build_object('counts',jsonb_build_object('ordinary',(select count(*) from facts where not is_test_account),'attention',(select count(*) from facts where not is_test_account and attention),'unlinked',(select count(*) from public.members where deleted_at is null and profile_id is null),'test',(select count(*) from facts where is_test_account),'account_only',(select count(*) from facts where not is_test_account and member_count=0)),
 'total',(select count(*) from people),
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('profile',(select to_jsonb(p) from public.profiles p where p.id=f.id),'email_confirmed',f.email_confirmed_at is not null,'last_sign_in_at',f.last_sign_in_at,
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'full_name',m.full_name,'email',m.email,'membership_type',m.membership_type,'membership_status',m.membership_status,'post_id',m.post_id,'post_name',(select name from public.posts where id=m.post_id))) from public.members m where m.deleted_at is null and m.profile_id=f.id),'[]'::jsonb),
 'scopes',(select jsonb_agg(to_jsonb(s)||jsonb_build_object('post_name',(select name from public.posts where id=s.post_id))) from public.cvoa_access_scopes(f.id) s)) order by f.full_name,f.id) from paged f),'[]'::jsonb),
 'unlinked_members',case when p_view in ('all','unlinked') then coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'full_name',m.full_name,'email',m.email,'membership_type',m.membership_type,'membership_status',m.membership_status,'post_id',m.post_id,
 'candidate_id',case when (select count(*) from public.members where deleted_at is null and lower(trim(email))=lower(trim(m.email)))=1 and (select count(*) from public.profiles p join auth.users u on u.id=p.id where lower(trim(u.email))=lower(trim(m.email)) and lower(trim(p.email))=lower(trim(u.email)) and u.email_confirmed_at is not null)=1 then (select p.id from public.profiles p join auth.users u on u.id=p.id where lower(trim(u.email))=lower(trim(m.email)) and lower(trim(p.email))=lower(trim(u.email)) and u.email_confirmed_at is not null and not exists(select 1 from public.members x where x.deleted_at is null and x.profile_id=p.id) limit 1) end)) from member_page m),'[]'::jsonb) else '[]'::jsonb end,
 'posts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'state',state) order by name) from public.posts),'[]'::jsonb)) into result;
 return result;
end; $$;


create or replace function public.cvoa_person_record(p_profile uuid default null,p_member uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pid uuid; subject_member public.members; result jsonb; national boolean:=public.is_national_role(); begin
 if p_member is not null then select * into subject_member from public.members where id=p_member and deleted_at is null; if not found then raise exception 'Membership not found.'; end if; pid:=subject_member.profile_id; else pid:=p_profile; end if;
 if not national and (p_member is null or not public.cvoa_can_oversee_post(subject_member.post_id)) then raise exception 'Person record access is restricted to responsible staff.'; end if;
 select jsonb_build_object('profile',case when national then (select to_jsonb(p) from public.profiles p where id=pid and deleted_at is null) else (select jsonb_build_object('id',id,'full_name',full_name,'role',role,'title',title,'post_id',post_id,'state',state,'access_suspended',access_suspended) from public.profiles where id=pid and deleted_at is null) end,
 'memberships',coalesce((select jsonb_agg(to_jsonb(x)) from(select m.id,m.full_name,m.email,m.membership_type,m.membership_status,m.membership_number,m.expires_at,m.dd214_review_status,m.post_id,(select name from public.posts where id=m.post_id) post_name from public.members m where m.deleted_at is null and (m.profile_id=pid or m.id=p_member) and (national or public.cvoa_can_oversee_post(m.post_id)))x),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(x)) from(select p.id,p.amount,p.status,p.paid_at,p.created_at from public.membership_payments p join public.members mm on mm.id=p.member_id where (mm.profile_id=pid or mm.id=p_member) and (national or public.cvoa_can_oversee_post(mm.post_id)) order by p.created_at desc limit 10)x),'[]'::jsonb),
 'staff_records',coalesce((select jsonb_agg(jsonb_build_object('post_name',(select name from public.posts where id=f.post_id),'position',f.position,'verification_status',f.verification_status)) from public.founding_team_members f where f.profile_id=pid and (national or public.cvoa_can_oversee_post(f.post_id))),'[]'::jsonb),
 'activation',(select jsonb_build_object('email_confirmed',email_confirmed_at is not null,'last_sign_in_at',last_sign_in_at) from auth.users where id=pid),
 'scopes',case when national then coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('post_name',(select name from public.posts where id=s.post_id))) from public.cvoa_access_scopes(pid) s),'[]'::jsonb) else coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('post_name',(select name from public.posts where id=s.post_id))) from public.cvoa_access_scopes(pid) s where s.post_id=subject_member.post_id or (s.role='state_commander' and s.state=(select state from public.posts where id=subject_member.post_id))),'[]'::jsonb) end,
 'history',case when national then coalesce((select jsonb_agg(to_jsonb(x)) from(select a.id,a.action,a.reason,a.created_at,(select full_name from public.profiles where id=a.actor_id) actor_name from public.access_audit a where a.profile_id=pid or a.member_id=p_member order by a.created_at desc limit 30)x),'[]'::jsonb) else '[]'::jsonb end) into result;
 return result;
end; $$;


create or replace function public.cvoa_reserve_checkout(p_member uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.membership_checkout_attempts;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required.'; end if;
 perform id from public.members where id=p_member and deleted_at is null for update;
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


create or replace function public.cvoa_post_member_directory() returns table(id uuid,full_name text,membership_number text,membership_type public.membership_type,membership_status public.membership_status) language sql stable security definer set search_path='' as $$
 select m.id,m.full_name,m.membership_number,m.membership_type,m.membership_status from public.members m
 where m.deleted_at is null and public.cvoa_access_enabled() and m.post_id=public.current_post_id() and auth.uid() is not null order by m.full_name;
$$;
revoke all on function public.cvoa_post_member_directory() from public,anon;
grant execute on function public.cvoa_post_member_directory() to authenticated;

create or replace function public.cvoa_post_dashboard(p_post uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not public.cvoa_can_oversee_post(p_post) then raise exception 'This post is outside your appointed jurisdiction.';end if;
 select jsonb_build_object(
 'policy',(select to_jsonb(h) from public.post_health_policy h where id),'post',to_jsonb(p),'can_manage',public.cvoa_can_manage_post(p.id),'national',public.is_national_role(),'updated_at',now(),
 'plan',(select to_jsonb(l) from public.post_launch_plans l where l.post_id=p.id),
 'funding',public.cvoa_launch_totals(p.id),
 'members',jsonb_build_object('active',(select count(*) from public.members m where m.deleted_at is null and m.post_id=p.id and m.membership_status='active'),'lapsed',(select count(*) from public.members m where m.deleted_at is null and m.post_id=p.id and m.membership_status='lapsed'),'expiring',(select count(*) from public.members m where m.deleted_at is null and m.post_id=p.id and m.membership_status='active' and m.expires_at between current_date and current_date+30)),
 'staff',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
  select f.id,f.name,f.position,f.profile_id,f.verification_status,
   (select id from public.members m where m.deleted_at is null and m.profile_id=f.profile_id and m.post_id=p.id limit 1) member_id,
   exists(select 1 from public.profiles pr where pr.id=f.profile_id and not pr.access_suspended and not pr.is_test_account and exists(select 1 from public.cvoa_access_scopes(pr.id) s where s.post_id=p.id and s.role in ('post_commander','post_officer'))) appointed,
   (select coalesce(jsonb_agg(jsonb_build_object('role',s.role,'title',s.title)),'[]') from public.cvoa_access_scopes(f.profile_id) s where s.post_id=p.id and s.role in ('post_commander','post_officer')) appointments
  from public.founding_team_members f where f.post_id=p.id
 )x),'[]'),
 'account_staff',coalesce((select jsonb_agg(to_jsonb(x)) from (
  select pr.id,pr.full_name,pr.access_suspended,pr.is_test_account,
   exists(select 1 from auth.users u where u.id=pr.id and u.email_confirmed_at is not null) email_confirmed,
   exists(select 1 from auth.users u where u.id=pr.id and u.last_sign_in_at is not null) has_signed_in,
   (select coalesce(jsonb_agg(jsonb_build_object('role',s.role,'title',s.title)),'[]') from public.cvoa_access_scopes(pr.id) s where s.post_id=p.id and s.role in ('post_commander','post_officer')) appointments,
   exists(select 1 from public.founding_team_members f where f.post_id=p.id and f.profile_id=pr.id) roster_linked
  from public.profiles pr where exists(select 1 from public.cvoa_access_scopes(pr.id) s where s.post_id=p.id and s.role in ('post_commander','post_officer'))
 )x),'[]'),
 'meetings',coalesce((select jsonb_agg(to_jsonb(x) order by x.meeting_at desc) from (
  select s.id,s.title,s.scheduled_at meeting_at,case when s.ended_at is not null then 'completed' when s.started_at is not null then 'in_progress' else 'scheduled' end status,s.minutes_state,s.published_at,'/meetings/session/'||s.id path,s.started_at actual_at from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id
  union all select m.id,m.title,m.meeting_date::timestamptz,case when m.status='published' then 'completed' else m.status::text end,m.status::text,case when m.status='published' then m.meeting_date::timestamptz else null end,'/meetings/uro/'||m.id||'/view',case when m.status='published' then m.meeting_date::timestamptz else null end from public.uro_meetings m where m.post_id=p.id
  union all select m.id,m.title,m.meeting_date::timestamptz,'completed','legacy',m.created_at,'/meetings/legacy?post='||p.id,m.meeting_date::timestamptz from public.meeting_records m where m.post_id=p.id
  order by meeting_at desc limit 30
 )x),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.due_date nulls last) from (
  select 'launch:'||t.id id,t.label title,t.owner_name owner,t.due_date,'/post-development?post='||p.id||'&tab=tasks' path,'launch' kind from public.launch_tasks t where t.post_id=p.id and not t.complete
  union all select 'uro:'||a.id,a.title,coalesce((select full_name from public.profiles where id=a.owner_id),''),a.due_date,'/meetings/session/'||s.id,'meeting' from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and a.status<>'completed'
  union all select 'legacy:'||a.id,a.description,coalesce(a.owner_name,''),a.due_date,'/meetings/uro/'||a.meeting_id||'/view','meeting' from public.uro_action_items a where a.post_id=p.id and a.status='open'
  order by due_date nulls last limit 50
 )x),'[]'),
 'sponsorship',jsonb_build_object('pledged',coalesce((select sum(sponsorship_value) from public.sponsors where post_id=p.id and stage='won'),0),'pipeline',coalesce((select sum(sponsorship_value) from public.sponsors where post_id=p.id and stage not in ('won','lost')),0),'received',coalesce((select sum(amount-refunded_amount) from public.sponsor_payments where post_id=p.id and stripe_livemode is distinct from false and payment_date<=current_date),0)),
 'finance',jsonb_build_object('income',coalesce((select sum(amount) from public.financial_transactions where post_id=p.id and transaction_type='income' and transaction_date<=current_date),0),'expenses',coalesce((select sum(amount) from public.financial_transactions where post_id=p.id and transaction_type='expense' and transaction_date<=current_date),0),'last_entry',(select max(transaction_date) from public.financial_transactions where post_id=p.id and transaction_date<=current_date),'monthly_expense',coalesce((select sum(amount)/3 from public.financial_transactions where post_id=p.id and transaction_type='expense' and transaction_date between current_date-90 and current_date),0),'future_expenses',coalesce((select sum(amount) from public.financial_transactions where post_id=p.id and transaction_type='expense' and transaction_date>current_date),0)),
 'escalations',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'subject',e.subject,'status',e.status,'response',e.response,'created_at',e.created_at) order by e.created_at desc) from public.state_escalations e where e.post_id=p.id),'[]'),
 'archive_history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'reason',h.reason,'created_at',h.created_at,'actor_name',(select full_name from public.profiles where id=h.actor_id)) order by h.created_at desc) from public.post_lifecycle_history h where h.post_id=p.id),'[]')
 ) into result from public.posts p where p.id=p_post;
 if result is null then raise exception 'Post not found.';end if;return result;
end;$$;
revoke all on function public.cvoa_post_dashboard(uuid) from public,anon;
grant execute on function public.cvoa_post_dashboard(uuid) to authenticated;


-- Directory returns an allowlist of display fields, never full member rows.
create function public.cvoa_member_directory(p_search text default '',p_state text default '',p_post uuid default null,p_page integer default 0,p_size integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; q text:=lower(trim(coalesce(p_search,''))); begin
 if not public.cvoa_access_enabled() or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.deleted_at is null and not p.is_test_account and (p.role<>'guest_applicant' or exists(select 1 from public.members m where m.profile_id=p.id and m.deleted_at is null and m.membership_status='active'))) then raise exception 'A CVOA member or staff account is required.';end if;
 with entries as(select m.id,m.full_name,p.id post_id,p.name post_name,p.city,upper(coalesce(p.state,m.state)) state from public.members m left join public.posts p on p.id=m.post_id where m.deleted_at is null and m.membership_status='active' and not exists(select 1 from public.profiles pr where pr.id=m.profile_id and (pr.is_test_account or pr.deleted_at is not null)) and (coalesce(p_state,'')='' or upper(coalesce(p.state,m.state))=upper(p_state)) and (p_post is null or m.post_id=p_post) and (q='' or position(q in lower(m.full_name||' '||coalesce(p.name,'')||' '||coalesce(p.city,'')||' '||coalesce(p.state,m.state,'')))>0)), page as(select * from entries order by full_name,id limit least(100,greatest(1,coalesce(p_size,25))) offset greatest(0,coalesce(p_page,0))*least(100,greatest(1,coalesce(p_size,25))))
 select jsonb_build_object('total',(select count(*) from entries),'members',coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name,x.id) from page x),'[]'::jsonb)) into result;return result;
end;$$;
-- Link only a unique confirmed login identity. Duplicate or conflicting records remain for National review.
create function public.cvoa_sync_member_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare candidate uuid;begin
 if new.deleted_at is not null then return new;end if;
 if new.profile_id is null and nullif(trim(new.email),'') is not null and (select count(*) from public.members where deleted_at is null and lower(trim(email))=lower(trim(new.email)))=1 then
  select p.id into candidate from public.profiles p join auth.users u on u.id=p.id where p.deleted_at is null and not p.is_test_account and u.email_confirmed_at is not null and lower(trim(u.email))=lower(trim(new.email)) and lower(trim(p.email))=lower(trim(u.email)) and not exists(select 1 from public.members m where m.profile_id=p.id and m.deleted_at is null);
  if candidate is not null and (select count(*) from auth.users where lower(trim(email))=lower(trim(new.email)) and email_confirmed_at is not null)=1 then
   update public.members set profile_id=candidate where id=new.id and profile_id is null;
   update public.profiles set full_name=new.full_name where id=candidate and role='member' and deleted_at is null and full_name is distinct from new.full_name;
   insert into public.access_audit(profile_id,member_id,actor_id,action,reason) values(candidate,new.id,auth.uid(),'membership_linked','Unique confirmed account email matched to the membership roster');
  end if;
 elsif new.profile_id is not null and (select count(*) from public.members where profile_id=new.profile_id and deleted_at is null)=1 then
  update public.profiles set full_name=new.full_name where id=new.profile_id and role='member' and deleted_at is null and full_name is distinct from new.full_name;
 end if;return new;
end;$$;
create trigger sync_member_identity after insert or update of email,full_name on public.members for each row execute function public.cvoa_sync_member_identity();
-- Existing unique confirmed matches are reconciled; no accounts or roles are created.
update public.members set email=email where profile_id is null and deleted_at is null and nullif(trim(email),'') is not null;
revoke all on function public.cvoa_remove_person(uuid,uuid,text),public.cvoa_restore_person(uuid,uuid,text),public.cvoa_removed_people(),public.cvoa_member_directory(text,text,uuid,integer,integer),public.cvoa_removal_guard(),public.cvoa_sync_member_identity() from public,anon,authenticated;
grant execute on function public.cvoa_remove_person(uuid,uuid,text),public.cvoa_restore_person(uuid,uuid,text),public.cvoa_removed_people(),public.cvoa_member_directory(text,text,uuid,integer,integer) to authenticated;
commit;
