-- Delivery state contains IDs and timestamps only, never letters or credentials.
create table public.member_welcome_emails (
  member_id uuid primary key references public.members(id),
  checkout_session_id text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  lease_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.member_welcome_emails enable row level security;
revoke all on public.member_welcome_emails from public, anon, authenticated;
grant select, insert, update on public.member_welcome_emails to service_role;

create function public.cvoa_enqueue_welcome_email(p_member uuid, p_session text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.member_welcome_emails(member_id, checkout_session_id)
  values(p_member, p_session) on conflict do nothing;
$$;

create function public.cvoa_claim_welcome_email(p_member uuid, p_session text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  update public.member_welcome_emails
    set lease_until = now() + interval '2 minutes', attempts = attempts + 1
    where member_id = p_member and checkout_session_id = p_session
      and sent_at is null and (lease_until is null or lease_until < now());
  if found then return 'claimed'; end if;
  if exists(select 1 from public.member_welcome_emails where member_id = p_member and checkout_session_id = p_session and sent_at is not null) then return 'sent'; end if;
  if exists(select 1 from public.member_welcome_emails where member_id = p_member and checkout_session_id = p_session) then return 'busy'; end if;
  return 'none';
end;
$$;

create function public.cvoa_finish_welcome_email(p_member uuid, p_session text, p_success boolean)
returns void language sql security invoker set search_path = '' as $$
  update public.member_welcome_emails
    set sent_at = case when p_success then now() else sent_at end, lease_until = null
    where member_id = p_member and checkout_session_id = p_session;
$$;
revoke all on function public.cvoa_enqueue_welcome_email(uuid,text) from public, anon, authenticated;
revoke all on function public.cvoa_claim_welcome_email(uuid,text) from public, anon, authenticated;
revoke all on function public.cvoa_finish_welcome_email(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.cvoa_enqueue_welcome_email(uuid,text) to service_role;
grant execute on function public.cvoa_claim_welcome_email(uuid,text) to service_role;
grant execute on function public.cvoa_finish_welcome_email(uuid,text,boolean) to service_role;
