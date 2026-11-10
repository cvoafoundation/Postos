begin;
-- Implementation work is a separate record; these writes cannot amend a vote.
create table public.resolution_follow_through (
  resolution_id uuid primary key references public.resolutions(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  due_date date not null,
  outcome text not null check (length(btrim(outcome)) between 1 and 500),
  status text not null default 'open' check (status in ('open','in_progress','blocked','completed')),
  progress text not null default '' check (length(progress)<=2000),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references public.profiles(id)
);
alter table public.resolution_follow_through enable row level security;
revoke all on public.resolution_follow_through from public, anon, authenticated;
grant select,insert(resolution_id,owner_id,due_date,outcome,status,progress),
  update(owner_id,due_date,outcome,status,progress) on public.resolution_follow_through to authenticated;
create policy resolution_follow_through_read on public.resolution_follow_through for select to authenticated
  using ((select public.is_national_role()) and not (select public.cvoa_membership_only()));
create policy resolution_follow_through_insert on public.resolution_follow_through for insert to authenticated
  with check ((select public.is_national_role()) and not (select public.cvoa_membership_only())
    and exists(select 1 from public.resolutions r where r.id=resolution_id and r.status::text in ('passed','implemented'))
    and exists(select 1 from public.profiles p where p.id=owner_id and p.role in ('national_commander','national_staff')
      and p.deleted_at is null and not p.access_suspended and not p.is_test_account));
create policy resolution_follow_through_update on public.resolution_follow_through for update to authenticated
  using ((select public.is_national_role()) and not (select public.cvoa_membership_only()))
  with check ((select public.is_national_role()) and not (select public.cvoa_membership_only())
    and exists(select 1 from public.resolutions r where r.id=resolution_id and r.status::text in ('passed','implemented'))
    and exists(select 1 from public.profiles p where p.id=owner_id and p.role in ('national_commander','national_staff')
      and p.deleted_at is null and not p.access_suspended and not p.is_test_account));
create function public.cvoa_stamp_resolution_follow_through() returns trigger
language plpgsql set search_path='' as $$ begin
  new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid(); return new;
end; $$;
revoke all on function public.cvoa_stamp_resolution_follow_through() from public,anon,authenticated;
create trigger stamp_resolution_follow_through before update on public.resolution_follow_through
for each row execute function public.cvoa_stamp_resolution_follow_through();

-- Preserve the legacy queue and its permissions. Add context only inside National's workspace.
create function public.ops_priority_work() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; result jsonb; extra_count bigint; membership_attention jsonb;
begin
  if not public.ops_access_enabled() or not public.is_national_role() or public.cvoa_membership_only() then
    raise exception 'National staff access required' using errcode='42501';
  end if;
  base:=public.ops_module_queue();
  with original as (
    select x || jsonb_build_object(
      'owner',coalesce(reviewer.full_name, nullif(t.owner_name,''), meeting_owner.full_name,
        case when a.id is not null or x->>'id' like 'launch-opening:%' or x->>'id' like 'launch-location:%' or x->>'id' like 'escalation:%' then 'National review team' end),
      'waiting_since',coalesce(a.created_at::date,location.submitted_at::date,opening.submitted_at::date,escalation.created_at::date),
      'deadline',coalesce(a.next_action_due_date,
        case when x->>'kind' in ('task','fundraising','membership','meeting') then nullif(x->>'due_date','')::date end),
      'next_step',coalesce(nullif(a.next_action,''),x->>'next_step')) as item
    from jsonb_array_elements(coalesce(base->'items','[]')) x
    left join public.post_applications a on 'application:'||a.id=x->>'id'
    left join public.profiles reviewer on reviewer.id=a.assigned_reviewer_id and reviewer.deleted_at is null and not reviewer.access_suspended
    left join public.launch_tasks t on 'launch-task:'||t.id=x->>'id'
    left join public.uro_actions u on 'uro-action:'||u.id=x->>'id'
    left join public.profiles meeting_owner on meeting_owner.id=u.owner_id and meeting_owner.deleted_at is null and not meeting_owner.access_suspended
    left join public.launch_locations location on 'launch-location:'||location.id=x->>'id'
    left join public.post_launch_plans plan on 'launch-opening:'||plan.post_id=x->>'id'
    left join lateral (select h.created_at submitted_at from public.launch_history h
      where h.post_id=plan.post_id and h.action='stage' and h.detail->>'stage'='opening_review'
      order by h.created_at desc limit 1) opening on true
    left join public.state_escalations escalation on 'escalation:'||escalation.id=x->>'id'
  ), additional as (
    select jsonb_build_object('id','paid-unlinked:'||m.id,'title','Link paid membership: '||m.full_name,
      'module','Membership','kind','review','owner','National membership team',
      'waiting_since',p.first_paid::date,'path','/members?highlight='||m.id,
      'next_step','Open the person record and verify which login belongs to this member before linking.') item
    from public.members m
    join lateral (select min(coalesce(mp.paid_at,mp.created_at)) first_paid
      from public.membership_payments mp where mp.member_id=m.id and mp.status='paid') p on p.first_paid is not null
    where m.profile_id is null and m.deleted_at is null
    union all
    select jsonb_build_object('id','approval-mail:'||m.id,'title','Retry verification email: '||m.full_name,
      'module','Membership','kind','review','owner','National membership team',
      'waiting_since',e.review_at::date,'path','/membership-review?status=verified',
      'next_step','Open Verified reviews and retry the approval email after checking the member address and Workspace sender.')
    from public.membership_verification_emails e join public.members m on m.id=e.member_id
    where m.deleted_at is null and m.dd214_review_status='verified' and m.dd214_reviewed_at=e.review_at
      and (e.status='failed' or (e.status='sending' and e.claimed_at<now()-interval '5 minutes'))
    union all
    select jsonb_build_object('id','resolution-action:'||r.id,'title',f.outcome,'module','Congress','kind','task',
      'owner',case when not p.access_suspended and p.deleted_at is null and not p.is_test_account and p.role in ('national_commander','national_staff') then p.full_name end,
      'deadline',f.due_date,'work_status',f.status,'path','/congress/resolutions/'||r.id,
      'next_step','Open the adopted resolution to review progress or record completion.')
    from public.resolution_follow_through f join public.resolutions r on r.id=f.resolution_id
    left join public.profiles p on p.id=f.owner_id
    where f.status<>'completed' and r.status::text in ('passed','implemented')
  ), all_items as (
    select item from original union all select item from additional
  ), ranked as (
    select item,
      case when item->>'work_status'='blocked' or nullif(item->>'deadline','')::date<current_date then 0
        when item->>'kind' in ('review','application','minutes') then 1 else 2 end as rank,
      coalesce(nullif(item->>'deadline','')::date,nullif(item->>'waiting_since','')::date,nullif(item->>'due_date','')::date) as sort_date
    from all_items
  )
  select coalesce((select jsonb_agg(item order by rank,sort_date nulls last,item->>'id')
    from (select * from ranked order by rank,sort_date nulls last,item->>'id' limit 100) bounded),'[]'),
    (select count(*) from additional),
    (select jsonb_build_object(
      'paid_unlinked', count(*) filter(where item->>'id' like 'paid-unlinked:%'),
      'approval_mail', count(*) filter(where item->>'id' like 'approval-mail:%')) from additional)
    into result,extra_count,membership_attention;
  return jsonb_build_object('total',coalesce((base->>'total')::bigint,0)+extra_count,'items',result,'membership_attention',membership_attention);
end; $$;
revoke all on function public.ops_priority_work() from public,anon;
grant execute on function public.ops_priority_work() to authenticated;
notify pgrst,'reload schema';
commit;
