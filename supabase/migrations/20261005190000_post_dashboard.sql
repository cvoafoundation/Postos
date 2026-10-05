begin;
alter table public.posts add column archived_at timestamptz, add column archived_reason text;
revoke delete on public.posts from anon,authenticated;
create table public.post_lifecycle_history (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts(id),actor_id uuid not null references public.profiles(id),action text not null check(action in ('archive','restore')),reason text not null check(length(trim(reason)) between 5 and 1000),created_at timestamptz not null default now()
);
alter table public.post_lifecycle_history enable row level security;
revoke all on public.post_lifecycle_history from public,anon,authenticated;
grant select on public.post_lifecycle_history to authenticated;
create policy lifecycle_read on public.post_lifecycle_history for select to authenticated using(public.cvoa_can_read_post(post_id));
create function public.cvoa_post_archive(p_post uuid,p_archive boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_national_role() then raise exception 'National administration required.';end if;
 if p_archive is null or coalesce(length(trim(p_reason)),0) not between 5 and 1000 then raise exception 'Record an archive or restoration reason.';end if;
 perform 1 from public.posts where id=p_post for update;
 if not found then raise exception 'Post not found.';end if;
 if exists(select 1 from public.posts where id=p_post and (archived_at is not null)=p_archive) then raise exception 'Post archive state has already changed. Refresh the dashboard.';end if;
 insert into public.post_lifecycle_history(post_id,actor_id,action,reason) values(p_post,auth.uid(),case when p_archive then 'archive' else 'restore' end,trim(p_reason));
 update public.posts set archived_at=case when p_archive then now() else null end,archived_reason=case when p_archive then trim(p_reason) else null end where id=p_post;
end;$$;
revoke all on function public.cvoa_post_archive(uuid,boolean,text) from public,anon;
grant execute on function public.cvoa_post_archive(uuid,boolean,text) to authenticated;
create function public.cvoa_post_archive_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.archived_at is distinct from old.archived_at or new.archived_reason is distinct from old.archived_reason) and auth.uid() is not null then
  if not public.is_national_role() or not exists(select 1 from public.post_lifecycle_history h where h.post_id=new.id and h.actor_id=auth.uid() and h.created_at=transaction_timestamp() and h.action=case when new.archived_at is null then 'restore' else 'archive' end and (new.archived_at is null or h.reason=new.archived_reason)) then raise exception 'Use the audited National archive or restore action.';end if;
 end if;
 return new;
end;$$;
create trigger post_archive_guard before update on public.posts for each row execute function public.cvoa_post_archive_guard();
create function public.cvoa_review_completion_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.bylaws_reviewed is distinct from old.bylaws_reviewed or new.financial_audit_complete is distinct from old.financial_audit_complete or new.officer_roster_current is distinct from old.officer_roster_current or new.required_filings_current is distinct from old.required_filings_current) then new.completed_at:=null;new.reviewed_by:=null;end if;
 if new.completed_at is not null and (tg_op='INSERT' or new.completed_at is distinct from old.completed_at) then
  if not public.cvoa_can_manage_post(new.post_id) then raise exception 'Post management authority required.';end if;
  if not(new.bylaws_reviewed and new.financial_audit_complete and new.officer_roster_current and new.required_filings_current) or length(trim(coalesce(new.notes,'')))<5 then raise exception 'Complete all review items and record supporting evidence or document references.';end if;
  if new.completed_at>now() then raise exception 'Review completion cannot be in the future.';end if;
  new.reviewed_by:=auth.uid();
 end if;
 return new;
end;$$;
create trigger review_completion_guard before insert or update on public.annual_reviews for each row execute function public.cvoa_review_completion_guard();

create function public.cvoa_signature_identity_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_can_manage_post(new.post_id) or new.profile_id is null or not exists(select 1 from public.founding_team_members f join public.profiles pr on pr.id=f.profile_id where f.post_id=new.post_id and f.profile_id=new.profile_id and not pr.access_suspended and exists(select 1 from public.cvoa_access_scopes(pr.id) s where s.post_id=new.post_id and s.role in ('post_commander','post_officer'))) then raise exception 'Select a linked officer with current post staff access.';end if;
 if new.signed_at>now() then raise exception 'A signature date cannot be in the future.';end if;
 select full_name into new.signer_name from public.profiles where id=new.profile_id;
 new.recorded_by:=auth.uid();return new;
end;$$;
create trigger signature_identity_guard before insert or update on public.governance_signatures for each row execute function public.cvoa_signature_identity_guard();

create table public.post_health_policy (
 id boolean primary key default true check(id),settings jsonb not null,version integer not null default 1,updated_by uuid references public.profiles(id),updated_at timestamptz not null default now()
);
create table public.post_health_policy_history (
 id uuid primary key default gen_random_uuid(),version integer not null,settings jsonb not null,reason text not null,actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.post_health_policy enable row level security;
alter table public.post_health_policy_history enable row level security;
revoke all on public.post_health_policy,public.post_health_policy_history from public,anon,authenticated;
grant select on public.post_health_policy,public.post_health_policy_history to authenticated;
create policy health_policy_read on public.post_health_policy for select to authenticated using(public.is_national_role() or (public.cvoa_access_enabled() and exists(select 1 from public.cvoa_current_scope() s where s.role in ('state_commander','post_commander','post_officer','delegate'))));
create policy health_policy_history_read on public.post_health_policy_history for select to authenticated using(public.is_national_role());
insert into public.post_health_policy(settings) values('{"required_positions":["commander","vice_commander","adjutant","quartermaster","sergeant_at_arms"],"meeting_green_days":30,"meeting_yellow_days":60,"membership_green":25,"membership_yellow":10,"new_post_days":180,"signature_days":365,"service_green_days":90,"service_yellow_days":180,"financial_fresh_days":60,"critical_keys":["officers","governance","financial"],"confirmed":false}');
create function public.cvoa_save_health_policy(p_version integer,p_settings jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare k text;n integer;prior integer;begin
 if not public.is_national_role() then raise exception 'National policy administration required.';end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 1000 then raise exception 'Record the authority or reason for these operational standards.';end if;
 if p_settings is null or jsonb_typeof(p_settings)<>'object' or jsonb_typeof(p_settings->'confirmed') is distinct from 'boolean' then raise exception 'Provide the complete operational policy.';end if;
 foreach k in array array['meeting_green_days','meeting_yellow_days','membership_green','membership_yellow','new_post_days','signature_days','service_green_days','service_yellow_days','financial_fresh_days'] loop
  if jsonb_typeof(p_settings->k) is distinct from 'number' or (p_settings->>k)!~'^[0-9]+$' then raise exception 'Policy thresholds must be whole numbers.';end if;
  n:=(p_settings->>k)::integer;if n<1 or n>10000 then raise exception 'Policy thresholds must be between 1 and 10000.';end if;
 end loop;
 if (p_settings->>'meeting_green_days')::integer>(p_settings->>'meeting_yellow_days')::integer or (p_settings->>'membership_yellow')::integer>(p_settings->>'membership_green')::integer or (p_settings->>'service_green_days')::integer>(p_settings->>'service_yellow_days')::integer then raise exception 'Yellow thresholds must follow green thresholds.';end if;
 if jsonb_typeof(p_settings->'required_positions') is distinct from 'array' or jsonb_typeof(p_settings->'critical_keys') is distinct from 'array' then raise exception 'Choose positions and critical signals.';end if;
 if jsonb_array_length(p_settings->'required_positions') not between 1 and 5 or exists(select 1 from jsonb_array_elements_text(p_settings->'required_positions') x where x not in ('commander','vice_commander','adjutant','quartermaster','sergeant_at_arms')) or (select count(distinct x) from jsonb_array_elements_text(p_settings->'required_positions') x)<>jsonb_array_length(p_settings->'required_positions') then raise exception 'Choose unique supported officer positions.';end if;
 if exists(select 1 from jsonb_array_elements_text(p_settings->'critical_keys') x where x not in ('officers','meetings','membership','congress','governance','annual_review','community_service','financial','sponsors')) or (select count(distinct x) from jsonb_array_elements_text(p_settings->'critical_keys') x)<>jsonb_array_length(p_settings->'critical_keys') then raise exception 'Choose unique supported critical signals.';end if;
 select version into prior from public.post_health_policy where id for update;
 if prior is distinct from p_version then raise exception 'The operational policy changed. Refresh before saving.';end if;
 update public.post_health_policy set settings=p_settings,version=version+1,updated_by=auth.uid(),updated_at=now() where id;
 insert into public.post_health_policy_history(version,settings,reason,actor_id) values(prior+1,p_settings,trim(p_reason),auth.uid());
end;$$;
revoke all on function public.cvoa_save_health_policy(integer,jsonb,text) from public,anon;
grant execute on function public.cvoa_save_health_policy(integer,jsonb,text) to authenticated;

-- Scoped facts contain operational metadata, never account credentials or identity documents.
create function public.cvoa_post_dashboard(p_post uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not public.cvoa_can_oversee_post(p_post) then raise exception 'This post is outside your appointed jurisdiction.';end if;
 select jsonb_build_object(
 'policy',(select to_jsonb(h) from public.post_health_policy h where id),'post',to_jsonb(p),'can_manage',public.cvoa_can_manage_post(p.id),'national',public.is_national_role(),'updated_at',now(),
 'plan',(select to_jsonb(l) from public.post_launch_plans l where l.post_id=p.id),
 'funding',public.cvoa_launch_totals(p.id),
 'members',jsonb_build_object('active',(select count(*) from public.members m where m.post_id=p.id and m.membership_status='active'),'lapsed',(select count(*) from public.members m where m.post_id=p.id and m.membership_status='lapsed'),'expiring',(select count(*) from public.members m where m.post_id=p.id and m.membership_status='active' and m.expires_at between current_date and current_date+30)),
 'staff',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
  select f.id,f.name,f.position,f.profile_id,f.verification_status,
   (select id from public.members m where m.profile_id=f.profile_id and m.post_id=p.id limit 1) member_id,
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

create function public.cvoa_post_health_evidence(p_posts uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if cardinality(p_posts)>500 or not public.cvoa_access_enabled() then raise exception 'Select up to 500 posts within your jurisdiction.';end if;
 if exists(select 1 from unnest(p_posts) x where not public.cvoa_can_read_post(x)) then raise exception 'This post is outside your appointed jurisdiction.';end if;
 select coalesce(jsonb_object_agg(p.id::text,jsonb_build_object(
 'policy',(select settings from public.post_health_policy where id),'current_officers',coalesce((select jsonb_agg(to_jsonb(f)) from public.founding_team_members f join public.profiles pr on pr.id=f.profile_id where f.post_id=p.id and f.verification_status='verified' and not pr.access_suspended and not pr.is_test_account and exists(select 1 from auth.users u where u.id=pr.id and u.email_confirmed_at is not null) and exists(select 1 from public.cvoa_access_scopes(pr.id) s where s.post_id=p.id and s.role in ('post_commander','post_officer') and (f.position<>'commander' or s.role='post_commander'))),'[]'),
 'sponsor_receipts',coalesce((select jsonb_agg(jsonb_build_object('sponsor_id',sponsor_id,'amount',amount-refunded_amount)) from public.sponsor_payments where post_id=p.id and stripe_livemode is distinct from false and payment_date<=current_date and amount>refunded_amount),'[]'),
 'eligible_votes',(select count(*) from public.resolutions r where r.vote_type in ('delegate_vote','constitutional_amendment') and r.status in ('voting','passed','rejected','implemented') and coalesce(r.voting_opens_at,r.created_at)>=now()-interval '365 days' and coalesce(r.voting_opens_at,r.created_at)<=now() and exists(select 1 from public.congress_delegates d where d.post_id=p.id and not d.is_alternate and d.profile_id is not null and coalesce(d.term_start,'1900-01-01'::date)<=coalesce(r.voting_opens_at,r.created_at)::date and coalesce(d.term_end,'9999-12-31'::date)>=coalesce(r.voting_opens_at,r.created_at)::date)),
 'votes_cast',(select count(distinct v.resolution_id) from public.resolution_votes v join public.resolutions r on r.id=v.resolution_id where v.voter_post_id=p.id and v.vote_type=r.vote_type and r.vote_type in ('delegate_vote','constitutional_amendment') and r.status in ('voting','passed','rejected','implemented') and coalesce(r.voting_opens_at,r.created_at)>=now()-interval '365 days' and coalesce(r.voting_opens_at,r.created_at)<=now() and exists(select 1 from public.congress_delegates d where d.post_id=p.id and d.profile_id=v.voter_id and not d.is_alternate and coalesce(d.term_start,'1900-01-01'::date)<=coalesce(r.voting_opens_at,r.created_at)::date and coalesce(d.term_end,'9999-12-31'::date)>=coalesce(r.voting_opens_at,r.created_at)::date)),
 'has_delegate',exists(select 1 from public.congress_delegates d join public.profiles pr on pr.id=d.profile_id where d.post_id=p.id and not d.is_alternate and coalesce(d.term_start,'1900-01-01'::date)<=current_date and coalesce(d.term_end,'9999-12-31'::date)>=current_date and not pr.access_suspended and not pr.is_test_account)
 )),'{}') into result from public.posts p where p.id=any(p_posts);return result;
end;$$;
revoke all on function public.cvoa_post_health_evidence(uuid[]) from public,anon;
grant execute on function public.cvoa_post_health_evidence(uuid[]) to authenticated;
create or replace function public.cvoa_campaign_request(p_slug uuid,p_cents integer,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare c public.fundraising_campaigns; r public.campaign_checkout_requests; begin
 select * into c from public.fundraising_campaigns where public_slug=p_slug and published and status='active' for update;
 if not found or exists(select 1 from public.posts where id=c.post_id and archived_at is not null) then raise exception 'This campaign is not accepting donations.'; end if;
 if p_cents<100 or p_cents>99999999 then raise exception 'Enter an amount from $1 to $999,999.99.'; end if;
 select * into r from public.campaign_checkout_requests where id=p_id;
 if found then
  if r.campaign_id<>c.id or r.amount_cents<>p_cents then raise exception 'Payment request changed.'; end if; return to_jsonb(r)||jsonb_build_object('title',c.title);
 end if;
 if (select count(*) from public.campaign_checkout_requests where campaign_id=c.id and created_at>now()-interval '1 hour')>=200 then raise exception 'Too many checkout requests. Please try again later.'; end if;
 insert into public.campaign_checkout_requests(id,campaign_id,amount_cents) values(p_id,c.id,p_cents) returning * into r;
 return to_jsonb(r)||jsonb_build_object('title',c.title);
end; $$;
create or replace function public.cvoa_public_campaign(p_slug uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('slug',c.public_slug,'title',c.title,'story',c.story,'goal_cents',c.goal_cents,'received_cents',public.cvoa_campaign_received(c.id),'status',c.status,'deadline',c.deadline,'post_name',p.name,'state',p.state) from public.fundraising_campaigns c join public.posts p on p.id=c.post_id where c.public_slug=p_slug and c.published and p.archived_at is null;
$$;
create or replace function public.cvoa_state_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope record; result jsonb; begin
 select * into scope from public.cvoa_current_scope();
 if not public.is_national_role() and coalesce(scope.role,'')<>'state_commander' then raise exception 'State oversight access is required.'; end if;
 select jsonb_build_object('state',scope.state,'posts',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'state',p.state,'status',p.status,'archived_at',p.archived_at,'health_status',p.health_status,'active_members',(select count(*) from public.members m where m.post_id=p.id and m.membership_status='active'),'last_meeting',greatest((select max(meeting_date) from public.uro_meetings u where u.post_id=p.id and u.status='published'),(select max(s.started_at::date) from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and s.published_at is not null)),'overdue_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open' and u.due_date<current_date)+(select count(*) from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and a.status<>'completed' and a.due_date<current_date),
 'draft_meetings',(select count(*) from public.uro_meetings u where u.post_id=p.id and u.status<>'published')+(select count(*) from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and s.published_at is null),
 'active_campaigns',(select count(*) from public.fundraising_campaigns c where c.post_id=p.id and c.status<>'completed'),
 'support_requests',(select count(*) from public.state_escalations e where e.post_id=p.id and e.status='open'),
 'open_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open')+(select count(*) from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and a.status<>'completed')) order by p.name),'[]'::jsonb)) into result from public.posts p where public.is_national_role() or (scope.state ~ '^[A-Z]{2}$' and upper(p.state)=scope.state);
 return result;
end; $$;
create or replace function public.cvoa_launch_directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'state',p.state,'status',p.status,'plan',to_jsonb(l),'funding',public.cvoa_launch_totals(p.id),'pending_locations',(select count(*) from public.launch_locations x where x.post_id=p.id and x.status='submitted'),'overdue_tasks',(select count(*) from public.launch_tasks t where t.post_id=p.id and not complete and due_date<current_date)) order by p.state,p.name),'[]'::jsonb) from public.posts p left join public.post_launch_plans l on l.post_id=p.id where public.cvoa_can_read_post(p.id) and p.archived_at is null;
$$;
alter table public.financial_transactions add constraint financial_positive_amount check(amount>0) not valid;
commit;
