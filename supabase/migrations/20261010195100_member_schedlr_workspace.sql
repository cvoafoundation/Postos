-- Personal appointments remain separate from governance meetings and commercial
-- Schedlr staff records. Existing application policies are unchanged.
create schema if not exists scheduling_private;
revoke all on schema scheduling_private from public,anon,authenticated;
create table public.schedlr_personal_meetings (
 id uuid primary key default gen_random_uuid(),
 organizer_id uuid not null default auth.uid() references auth.users(id),
 title text not null check(length(trim(title)) between 1 and 160),
 starts_at timestamptz not null, ends_at timestamptz not null,
 location text not null default '' check(length(location)<=1000),
 description text not null default '' check(length(description)<=5000),
 attendee_emails text[] not null default '{}' check(cardinality(attendee_emails)<=20),
 status text not null default 'scheduled' check(status in ('scheduled','cancelled','completed')),
 version integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '12 hours')
);
create index schedlr_personal_owner_time on public.schedlr_personal_meetings(organizer_id,starts_at);
alter table public.schedlr_personal_meetings enable row level security;
create policy personal_meetings_read on public.schedlr_personal_meetings for select to authenticated using(organizer_id=(select auth.uid()));
create policy personal_meetings_create on public.schedlr_personal_meetings for insert to authenticated with check(organizer_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and not access_suspended and deleted_at is null));
create policy personal_meetings_edit on public.schedlr_personal_meetings for update to authenticated using(organizer_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and not access_suspended and deleted_at is null)) with check(organizer_id=(select auth.uid()));
revoke all on public.schedlr_personal_meetings from anon,authenticated;
grant select,insert on public.schedlr_personal_meetings to authenticated;
grant update(title,starts_at,ends_at,location,description,attendee_emails,status) on public.schedlr_personal_meetings to authenticated;
grant all on public.schedlr_personal_meetings to service_role;

create table public.schedlr_personal_deliveries (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.schedlr_personal_meetings(id),
 version integer not null,event text not null check(event in ('scheduled','updated','cancelled','completed','reminder-24h','reminder-1h')),
 recipient text not null,payload jsonb not null, due_at timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','superseded')),
 attempts integer not null default 0, claimed_at timestamptz,sent_at timestamptz,
 unique(meeting_id,version,event,recipient)
);
create index schedlr_personal_due on public.schedlr_personal_deliveries(due_at) where state in ('pending','failed','sending');
alter table public.schedlr_personal_deliveries enable row level security;
create policy personal_delivery_read on public.schedlr_personal_deliveries for select to authenticated using(exists(select 1 from public.schedlr_personal_meetings m where m.id=meeting_id and m.organizer_id=(select auth.uid())));
revoke all on public.schedlr_personal_deliveries from anon,authenticated;
grant select on public.schedlr_personal_deliveries to authenticated;
grant all on public.schedlr_personal_deliveries to service_role;

create function scheduling_private.validate_personal_meeting() returns trigger language plpgsql set search_path='' as $$
declare email text;
begin
 if tg_op='UPDATE' then
  if new.organizer_id<>old.organizer_id or new.id<>old.id then raise exception 'Meeting ownership cannot change'; end if;
  new.version:=old.version+1;
 else new.version:=0;
 end if;
 new.updated_at:=now();
 if new.status='scheduled' and (new.starts_at<now() or new.starts_at>now()+interval '2 years') then raise exception 'Choose a future meeting within two years'; end if;
 foreach email in array new.attendee_emails loop
  if email is null or length(email)>254 or email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$' then raise exception 'Enter valid attendee email addresses'; end if;
 end loop;
 return new;
end $$;
create trigger validate_personal_meeting before insert or update on public.schedlr_personal_meetings for each row execute function scheduling_private.validate_personal_meeting();

create function scheduling_private.queue_personal_notices() returns trigger language plpgsql security definer set search_path='' as $$
declare host_email text; recipient text; action text; payload jsonb;
begin
 select email into host_email from auth.users where id=new.organizer_id and email_confirmed_at is not null;
 if host_email is null then raise exception 'Confirm your account email before scheduling'; end if;
 if tg_op='INSERT' and (select count(*) from public.schedlr_personal_meetings where organizer_id=new.organizer_id and created_at>now()-interval '1 hour')>20 then raise exception 'Please wait before creating more meetings'; end if;
 update public.schedlr_personal_deliveries set state='superseded' where meeting_id=new.id and state in ('pending','failed');
 action:=case when new.status<>'scheduled' then new.status when tg_op='INSERT' then 'scheduled' else 'updated' end;
 payload:=to_jsonb(new)||jsonb_build_object('organizer_email',host_email);
 for recipient in select distinct lower(trim(e)) from unnest(array_append(new.attendee_emails,host_email)) e loop
  insert into public.schedlr_personal_deliveries(meeting_id,version,event,recipient,payload) values(new.id,new.version,action,recipient,payload);
  if new.status='scheduled' then
   if new.starts_at-interval '24 hours'>now() then insert into public.schedlr_personal_deliveries(meeting_id,version,event,recipient,payload,due_at) values(new.id,new.version,'reminder-24h',recipient,payload,new.starts_at-interval '24 hours'); end if;
   if new.starts_at-interval '1 hour'>now() then insert into public.schedlr_personal_deliveries(meeting_id,version,event,recipient,payload,due_at) values(new.id,new.version,'reminder-1h',recipient,payload,new.starts_at-interval '1 hour'); end if;
  end if;
 end loop;
 if tg_op='UPDATE' then
  for recipient in select distinct lower(trim(e)) from unnest(old.attendee_emails) e where lower(trim(e))<>lower(host_email) and not exists(select 1 from unnest(new.attendee_emails) n where lower(trim(n))=lower(trim(e))) loop
   insert into public.schedlr_personal_deliveries(meeting_id,version,event,recipient,payload) values(new.id,new.version,'cancelled',recipient,to_jsonb(old)||jsonb_build_object('version',new.version,'organizer_email',host_email,'status','cancelled')) on conflict do nothing;
  end loop;
 end if;
 return new;
end $$;
revoke all on function scheduling_private.queue_personal_notices() from public,anon,authenticated;
create trigger queue_personal_notices after insert or update on public.schedlr_personal_meetings for each row execute function scheduling_private.queue_personal_notices();

create function public.schedlr_claim_personal_deliveries() returns setof public.schedlr_personal_deliveries language sql security invoker set search_path='' as $$
 update public.schedlr_personal_deliveries set state='sending',claimed_at=now(),attempts=attempts+1 where id in (
  select id from public.schedlr_personal_deliveries where due_at<=now() and attempts<5 and (state in ('pending','failed') or (state='sending' and claimed_at<now()-interval '10 minutes')) order by due_at limit 25 for update skip locked
 ) returning *;
$$;
revoke all on function public.schedlr_claim_personal_deliveries() from public,anon,authenticated;
grant execute on function public.schedlr_claim_personal_deliveries() to service_role;
