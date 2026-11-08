begin;

-- Only the delivery state is visible to reviewers; no addresses, messages,
-- signed links, or document paths are stored in this table.
create table public.membership_verification_emails (
  member_id uuid primary key references public.members(id) on delete cascade,
  review_at timestamptz not null,
  status text not null check (status in ('sending', 'sent', 'failed')),
  attempt uuid not null,
  claimed_at timestamptz not null,
  sent_at timestamptz
);
alter table public.membership_verification_emails enable row level security;
revoke all on public.membership_verification_emails from public, anon, authenticated;
grant select (member_id, review_at, status, claimed_at, sent_at) on public.membership_verification_emails to authenticated;
create policy membership_verification_email_reviewers on public.membership_verification_emails
for select to authenticated using (
  (select public.cvoa_access_enabled()) and not (select public.cvoa_membership_only()) and exists (
    select 1 from public.members m where m.id=member_id and m.deleted_at is null and public.cvoa_can_manage_post(m.post_id)
  )
);

-- The Edge Function authenticates the reviewer before using this service-only API.
-- Approval and the delivery claim commit together, before any SMTP activity.
create function public.cvoa_prepare_dd214_approval_mail(p_actor uuid, p_member uuid, p_path text, p_previous text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  m public.members;
  job public.membership_verification_emails;
  account_status text := 'support';
  email_address text;
  u auth.users;
  enabled boolean;
begin
  select * into m from public.members where id=p_member and deleted_at is null for update;
  if not found or not public.cvoa_service_authorized(p_actor,m.post_id,'manage_post') then
    return jsonb_build_object('status','forbidden');
  end if;

  if p_previous is not null then
    if p_previous not in ('pending','rejected') or p_path is null or m.dd214_storage_path is distinct from p_path then
      return jsonb_build_object('status','stale');
    end if;
    if m.dd214_review_status::text=p_previous then
      update public.members set dd214_review_status='verified', dd214_reviewed_by=p_actor, dd214_reviewed_at=clock_timestamp()
      where id=m.id returning * into m;
      insert into public.membership_verification_emails(member_id,review_at,status,attempt,claimed_at)
      values(m.id,m.dd214_reviewed_at,'failed',gen_random_uuid(),clock_timestamp())
      on conflict(member_id) do update set review_at=excluded.review_at,status='failed',attempt=excluded.attempt,claimed_at=excluded.claimed_at,sent_at=null;
    elsif m.dd214_review_status <> 'verified' then
      return jsonb_build_object('status','stale');
    end if;
  end if;

  select * into job from public.membership_verification_emails where member_id=m.id for update;
  if not found or m.dd214_storage_path is null or m.dd214_review_status <> 'verified' or job.review_at is distinct from m.dd214_reviewed_at then
    return jsonb_build_object('status','no_notice');
  end if;
  if job.status='sent' then return jsonb_build_object('status','sent'); end if;
  if job.status='sending' and job.claimed_at>clock_timestamp()-interval '5 minutes' then
    return jsonb_build_object('status','sending');
  end if;

  email_address:=btrim(m.email);
  if email_address is null or email_address !~ '^[^[:space:]<>,;@]+@[^[:space:]<>,;@]+[.][^[:space:]<>,;@]+$' then
    update public.membership_verification_emails set status='failed' where member_id=m.id;
    return jsonb_build_object('status','failed','message','Approval saved. Add a valid member email in the roster, then retry.');
  end if;

  if m.profile_id is not null then
    select * into u from auth.users where id=m.profile_id;
    if u.id is not null and lower(u.email) is distinct from lower(email_address) then
      update public.membership_verification_emails set status='failed' where member_id=m.id;
      return jsonb_build_object('status','failed','message','Approval saved. The roster and sign-in emails differ. Check the linked account before retrying.');
    end if;
    select exists(select 1 from public.profiles p where p.id=m.profile_id and p.deleted_at is null and not p.access_suspended) into enabled;
    if enabled and u.id is not null and u.deleted_at is null and coalesce(u.banned_until<=now(),true) then
      account_status:=case when u.email_confirmed_at is null then 'setup_linked' else 'ready' end;
    end if;
  elsif not exists(select 1 from auth.users where lower(email)=lower(email_address))
    and not exists(select 1 from public.members other where other.id<>m.id and other.deleted_at is null and lower(btrim(other.email))=lower(email_address)) then
    account_status:='setup_new';
  end if;

  update public.membership_verification_emails set status='sending',attempt=gen_random_uuid(),claimed_at=clock_timestamp()
  where member_id=m.id returning * into job;
  return jsonb_build_object('status','claimed','attempt',job.attempt,'review_at',job.review_at,'email',email_address,
    'full_name',m.full_name,'profile_id',m.profile_id,'account',account_status,'membership_status',m.membership_status,
    'membership_current',m.membership_status='active' and (m.expires_at is null or m.expires_at>=current_date));
end; $$;

-- Auto-link only a newly invited Auth identity for this approval, and never
-- overwrite an existing profile, role, or membership-to-account link.
create function public.cvoa_link_dd214_approval_account(p_member uuid, p_attempt uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare m public.members; job public.membership_verification_emails; u auth.users;
begin
  select * into m from public.members where id=p_member and deleted_at is null for update;
  if not found or m.profile_id is not null or m.dd214_review_status<>'verified' or m.membership_status<>'active' then return false; end if;
  select * into job from public.membership_verification_emails where member_id=m.id for update;
  if not found or job.status<>'sending' or job.attempt<>p_attempt or job.review_at is distinct from m.dd214_reviewed_at then return false; end if;
  select * into u from auth.users where id=p_user;
  if not found or u.created_at<job.claimed_at or u.email_confirmed_at is not null or lower(u.email) is distinct from lower(btrim(m.email)) then return false; end if;
  if exists(select 1 from public.members other where other.id<>m.id and other.deleted_at is null and (other.profile_id=p_user or lower(btrim(other.email))=lower(btrim(m.email)))) then return false; end if;
  insert into public.profiles(id,full_name,email,role,post_id) values(p_user,m.full_name,btrim(m.email),'member',m.post_id)
  on conflict(id) do nothing;
  if not found then return false; end if;
  update public.members set profile_id=p_user where id=m.id;
  return true;
end; $$;

create function public.cvoa_finish_dd214_approval_mail(p_member uuid, p_attempt uuid, p_sent boolean)
returns boolean language plpgsql security definer set search_path='' as $$ begin
  update public.membership_verification_emails set status=case when p_sent then 'sent' else 'failed' end,
    sent_at=case when p_sent then clock_timestamp() else null end
  where member_id=p_member and status='sending' and attempt=p_attempt;
  return found;
end; $$;

revoke all on function public.cvoa_prepare_dd214_approval_mail(uuid,uuid,text,text),
  public.cvoa_link_dd214_approval_account(uuid,uuid,uuid),public.cvoa_finish_dd214_approval_mail(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.cvoa_prepare_dd214_approval_mail(uuid,uuid,text,text),
  public.cvoa_link_dd214_approval_account(uuid,uuid,uuid),public.cvoa_finish_dd214_approval_mail(uuid,uuid,boolean) to service_role;

notify pgrst,'reload schema';
commit;
