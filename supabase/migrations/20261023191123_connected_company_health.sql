-- An active annual membership must have a current term; removed/test records are excluded.
create function membership_private.company_membership_counts(p_post uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('active',count(*) filter(where m.membership_status='active' and (m.membership_type='lifetime' or m.expires_at is null or m.expires_at>=current_date)),
 'lapsed',count(*) filter(where m.membership_status='lapsed' or (m.membership_status='active' and m.membership_type<>'lifetime' and m.expires_at<current_date)),
 'expiring',count(*) filter(where m.membership_status='active' and m.membership_type<>'lifetime' and m.expires_at between current_date and current_date+30))
 from public.members m left join public.profiles pr on pr.id=m.profile_id where m.post_id=p_post and m.deleted_at is null and (m.profile_id is null or (pr.id is not null and pr.deleted_at is null and not pr.is_test_account));
$$;
revoke all on function membership_private.company_membership_counts(uuid) from public,anon,authenticated;

create or replace function public.cvoa_post_health_evidence(p_posts uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if p_posts is null or cardinality(p_posts)>500 or not public.cvoa_access_enabled() or public.cvoa_membership_only() then raise exception 'Select up to 500 posts within your jurisdiction.';end if;
 if exists(select 1 from unnest(p_posts) x where not public.cvoa_can_read_post(x)) then raise exception 'This post is outside your appointed jurisdiction.';end if;
 select coalesce(jsonb_object_agg(p.id::text,jsonb_build_object(
 'as_of',now(),'policy_version',(select version from public.post_health_policy where id),
 'post',jsonb_build_object('id',p.id,'status',p.status,'archived_at',p.archived_at,'charter_date',p.charter_date,'created_at',p.created_at),
 'members',coalesce((select jsonb_agg(jsonb_build_object('membership_status',m.membership_status,'membership_type',m.membership_type,'expires_at',m.expires_at,'joined_at',m.joined_at)) from public.members m left join public.profiles pr on pr.id=m.profile_id where m.post_id=p.id and m.deleted_at is null and (m.profile_id is null or (pr.id is not null and pr.deleted_at is null and not pr.is_test_account))),'[]'),
 'meeting_dates',coalesce((select jsonb_agg(x.meeting_date order by x.meeting_date) from (
 select meeting_date from public.meeting_records where post_id=p.id and meeting_date<=current_date
 union select meeting_date from public.uro_meetings where post_id=p.id and status='published' and meeting_date<=current_date
 union select s.started_at::date from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and s.published_at is not null and s.ended_at is not null and s.started_at<=now() and s.ended_at<=now()
 ) x),'[]'),
 'governance_signatures',coalesce((select jsonb_agg(jsonb_build_object('profile_id',g.profile_id,'signed_at',g.signed_at,'form_type',g.form_type)) from public.governance_signatures g where g.post_id=p.id),'[]'),
 'annual_review',(select to_jsonb(r) - 'notes' - 'post_id' - 'id' || jsonb_build_object('notes',case when length(trim(r.notes))>=5 then 'Evidence recorded' else '' end) from public.annual_reviews r where r.post_id=p.id and r.review_year=extract(year from current_date)::integer order by r.created_at desc limit 1),
 'community_service_events',coalesce((select jsonb_agg(jsonb_build_object('event_date',event_date)) from public.community_service_events where post_id=p.id),'[]'),
 'financial_transactions',coalesce((select jsonb_agg(jsonb_build_object('transaction_date',transaction_date,'transaction_type',transaction_type,'amount',amount)) from public.financial_transactions where post_id=p.id),'[]'),
 'policy',(select settings from public.post_health_policy where id),'current_officers',coalesce((select jsonb_agg(jsonb_build_object('position',f.position,'profile_id',f.profile_id)) from public.founding_team_members f join public.profiles pr on pr.id=f.profile_id where f.post_id=p.id and f.verification_status='verified' and pr.deleted_at is null and not pr.access_suspended and not pr.is_test_account and exists(select 1 from auth.users u where u.id=pr.id and u.email_confirmed_at is not null) and exists(select 1 from public.cvoa_access_scopes(pr.id) s where s.post_id=p.id and s.role in ('post_commander','post_officer') and (f.position<>'commander' or s.role='post_commander'))),'[]'),
 'sponsor_receipts',coalesce((select jsonb_agg(jsonb_build_object('sponsor_id',sponsor_id,'amount',amount-refunded_amount)) from public.sponsor_payments where post_id=p.id and stripe_livemode is distinct from false and payment_date<=current_date and amount>refunded_amount),'[]'),
 'eligible_votes',(select count(*) from public.resolutions r where r.vote_type in ('delegate_vote','constitutional_amendment') and (r.status in ('passed','rejected','implemented') or (r.status='voting' and r.voting_closes_at<=now())) and coalesce(r.voting_opens_at,r.created_at)>=now()-interval '365 days' and coalesce(r.voting_opens_at,r.created_at)<=now() and exists(select 1 from public.congress_delegates d where d.post_id=p.id and not d.is_alternate and d.profile_id is not null and coalesce(d.term_start,'1900-01-01'::date)<=coalesce(r.voting_opens_at,r.created_at)::date and coalesce(d.term_end,'9999-12-31'::date)>=coalesce(r.voting_opens_at,r.created_at)::date)),
 'votes_cast',(select count(distinct v.resolution_id) from public.resolution_votes v join public.resolutions r on r.id=v.resolution_id where v.voter_post_id=p.id and v.vote_type=r.vote_type and r.vote_type in ('delegate_vote','constitutional_amendment') and (r.status in ('passed','rejected','implemented') or (r.status='voting' and r.voting_closes_at<=now())) and coalesce(r.voting_opens_at,r.created_at)>=now()-interval '365 days' and coalesce(r.voting_opens_at,r.created_at)<=now() and exists(select 1 from public.congress_delegates d where d.post_id=p.id and d.profile_id=v.voter_id and not d.is_alternate and coalesce(d.term_start,'1900-01-01'::date)<=coalesce(r.voting_opens_at,r.created_at)::date and coalesce(d.term_end,'9999-12-31'::date)>=coalesce(r.voting_opens_at,r.created_at)::date)),
 'has_delegate',exists(select 1 from public.congress_delegates d join public.profiles pr on pr.id=d.profile_id where d.post_id=p.id and not d.is_alternate and coalesce(d.term_start,'1900-01-01'::date)<=current_date and coalesce(d.term_end,'9999-12-31'::date)>=current_date and pr.deleted_at is null and not pr.access_suspended and not pr.is_test_account)
 )),'{}') into result from public.posts p where p.id=any(p_posts);return result;
end;$$;
create or replace function public.cvoa_post_dashboard(p_post uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not public.cvoa_can_oversee_post(p_post) then raise exception 'This post is outside your appointed jurisdiction.';end if;
 select jsonb_build_object(
 'policy',(select to_jsonb(h) from public.post_health_policy h where id),'post',to_jsonb(p),'can_manage',public.cvoa_can_manage_post(p.id),'national',public.is_national_role(),'updated_at',now(),
 'plan',(select to_jsonb(l) from public.post_launch_plans l where l.post_id=p.id),
 'funding',public.cvoa_launch_totals(p.id),
 'members',membership_private.company_membership_counts(p.id),
 'staff',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
  select f.id,f.name,f.position,f.profile_id,f.verification_status,
   (select id from public.members m where m.deleted_at is null and m.profile_id=f.profile_id and m.post_id=p.id limit 1) member_id,
   exists(select 1 from public.profiles pr where pr.id=f.profile_id and pr.deleted_at is null and not pr.access_suspended and not pr.is_test_account and exists(select 1 from public.cvoa_access_scopes(pr.id) s where s.post_id=p.id and s.role in ('post_commander','post_officer'))) appointed,
   (select coalesce(jsonb_agg(jsonb_build_object('role',s.role,'title',s.title)),'[]') from public.cvoa_access_scopes(f.profile_id) s where s.post_id=p.id and s.role in ('post_commander','post_officer')) appointments
  from public.founding_team_members f where f.post_id=p.id
 )x),'[]'),
 'account_staff',coalesce((select jsonb_agg(to_jsonb(x)) from (
  select pr.id,pr.full_name,pr.access_suspended,pr.is_test_account,
   exists(select 1 from auth.users u where u.id=pr.id and u.email_confirmed_at is not null) email_confirmed,
   exists(select 1 from auth.users u where u.id=pr.id and u.last_sign_in_at is not null) has_signed_in,
   (select coalesce(jsonb_agg(jsonb_build_object('role',s.role,'title',s.title)),'[]') from public.cvoa_access_scopes(pr.id) s where s.post_id=p.id and s.role in ('post_commander','post_officer')) appointments,
   exists(select 1 from public.founding_team_members f where f.post_id=p.id and f.profile_id=pr.id) roster_linked
  from public.profiles pr where pr.deleted_at is null and exists(select 1 from public.cvoa_access_scopes(pr.id) s where s.post_id=p.id and s.role in ('post_commander','post_officer'))
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
create or replace function public.cvoa_state_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope record; result jsonb; begin
 select * into scope from public.cvoa_current_scope();
 if not public.is_national_role() and coalesce(scope.role,'')<>'state_commander' then raise exception 'State oversight access is required.'; end if;
 select jsonb_build_object('state',scope.state,'posts',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'state',p.state,'status',p.status,'archived_at',p.archived_at,'health_status',p.health_status,'active_members',(membership_private.company_membership_counts(p.id)->>'active')::integer,'last_meeting',greatest((select max(meeting_date) from public.meeting_records where post_id=p.id and meeting_date<=current_date),(select max(meeting_date) from public.uro_meetings u where u.post_id=p.id and u.status='published' and meeting_date<=current_date),(select max(s.started_at::date) from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and s.published_at is not null and s.ended_at is not null and s.started_at<=now() and s.ended_at<=now())),'overdue_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open' and u.due_date<current_date)+(select count(*) from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and a.status<>'completed' and a.due_date<current_date),
 'draft_meetings',(select count(*) from public.uro_meetings u where u.post_id=p.id and u.status<>'published')+(select count(*) from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and s.published_at is null),
 'active_campaigns',(select count(*) from public.fundraising_campaigns c where c.post_id=p.id and c.status<>'completed'),
 'support_requests',(select count(*) from public.state_escalations e where e.post_id=p.id and e.status='open'),
 'open_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open')+(select count(*) from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and a.status<>'completed')) order by p.name),'[]'::jsonb)) into result from public.posts p where public.is_national_role() or (scope.state ~ '^[A-Z]{2}$' and upper(p.state)=scope.state);
 return result;
end; $$;
