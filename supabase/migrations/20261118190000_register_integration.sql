-- CVOA.ONE remains the sole source of membership eligibility.
create schema if not exists register_private;
revoke all on schema register_private from public,anon,authenticated;
create table register_private.codes(code_hash text primary key,profile_id uuid not null references public.profiles(id),challenge text not null,expires_at timestamptz not null);
create table register_private.preferences(profile_id uuid primary key references public.profiles(id),enabled boolean not null default false,topics text[] not null default '{}',updated_at timestamptz not null default now());
create table register_private.notices(profile_id uuid not null,event_key text not null,primary key(profile_id,event_key));
create table register_private.outbox(id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id),items jsonb not null,status text not null default 'pending',attempts int not null default 0,lease uuid,lease_until timestamptz,created_at timestamptz not null default now());
alter table register_private.codes enable row level security;
alter table register_private.preferences enable row level security;
revoke all on register_private.codes,register_private.preferences from public,anon,authenticated;
alter table register_private.notices enable row level security;alter table register_private.outbox enable row level security;
revoke all on register_private.notices,register_private.outbox from public,anon,authenticated;
create function public.cvoa_register_eligible(p_profile uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.members m on m.profile_id=p.id
 where p.id=p_profile and p.deleted_at is null and not coalesce(p.access_suspended,false)
 and m.deleted_at is null and m.membership_status::text='active'
 and (m.membership_type::text='lifetime' or m.expires_at>=current_date));
$$;
create function public.cvoa_register_authorize(p_hash text,p_profile uuid,p_challenge text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_register_eligible(p_profile) or p_hash !~ '^[a-f0-9]{64}$' or p_challenge !~ '^[a-f0-9]{64}$' then raise exception 'Active membership required';end if;
 delete from register_private.codes where expires_at<now();
 insert into register_private.codes values(p_hash,p_profile,p_challenge,now()+interval '2 minutes');
end $$;
-- A verified reader email can prevent a duplicate purchase, but never grants access.
create function public.cvoa_register_member_email(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where lower(u.email)=lower(p_email) and u.email_confirmed_at is not null and public.cvoa_register_eligible(u.id));
$$;
create function public.cvoa_register_exchange(p_hash text,p_challenge text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;begin
 delete from register_private.codes where code_hash=p_hash and challenge=p_challenge and expires_at>now() returning profile_id into actor;
 if actor is null or not public.cvoa_register_eligible(actor) then raise exception 'Sign-in expired';end if;return actor;
end $$;
create function public.cvoa_register_preferences(p_profile uuid,p_enabled boolean default null,p_topics text[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_register_eligible(p_profile) then raise exception 'Membership required';end if;
 if p_enabled is not null then
  if p_topics is null or cardinality(p_topics)>12 or not p_topics<@array['Congress','Compensation','Health Care','Education','Housing','Claims & Appeals','Survivors & Family','GAO Oversight','VA Announcements','Recorded Votes'] then raise exception 'Choose valid subjects';end if;
  insert into register_private.preferences values(p_profile,p_enabled,p_topics,now()) on conflict(profile_id) do update set enabled=excluded.enabled,topics=excluded.topics,updated_at=now();
 end if;
 return coalesce((select jsonb_build_object('enabled',enabled,'topics',topics) from register_private.preferences where profile_id=p_profile),'{"enabled":false,"topics":[]}'::jsonb);
end $$;
create function public.cvoa_register_queue(p_items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare pref record;item jsonb;batch jsonb;added int;queued int:=0;begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>50 then raise exception 'Invalid batch';end if;
 perform pg_advisory_xact_lock(172019801);
 for pref in select * from register_private.preferences where enabled loop
  if not public.cvoa_register_eligible(pref.profile_id) then continue;end if;
  batch:='[]'::jsonb;
  for item in select value from jsonb_array_elements(p_items) loop
   if not (item->>'topic'=any(pref.topics)) or length(item->>'key') not between 1 and 240 or (item->>'publishedAt')::timestamptz<pref.updated_at then continue;end if;
   insert into register_private.notices values(pref.profile_id,item->>'key') on conflict do nothing;
   get diagnostics added=row_count;
   if added=1 then batch:=batch||jsonb_build_array(item);end if;
  end loop;
  if jsonb_array_length(batch)>0 then insert into register_private.outbox(profile_id,items) values(pref.profile_id,batch);queued:=queued+1;end if;
 end loop;return queued;
end $$;
create function public.cvoa_register_claim_mail() returns jsonb language plpgsql security definer set search_path='' as $$
declare job register_private.outbox;recipient text;token uuid:=gen_random_uuid();current_topics text[];filtered jsonb;begin
 select * into job from register_private.outbox where status='pending' and attempts<5 and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 if not public.cvoa_register_eligible(job.profile_id) or not exists(select 1 from register_private.preferences where profile_id=job.profile_id and enabled) then update register_private.outbox set status='suppressed' where id=job.id;return null;end if;
 select topics into current_topics from register_private.preferences where profile_id=job.profile_id;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into filtered from jsonb_array_elements(job.items) item where item->>'topic'=any(current_topics);
 if jsonb_array_length(filtered)=0 then update register_private.outbox set status='suppressed' where id=job.id;return null;end if;
 select email into recipient from auth.users where id=job.profile_id and email_confirmed_at is not null;
 if recipient is null then update register_private.outbox set status='suppressed' where id=job.id;return null;end if;
 update register_private.outbox set lease=token,lease_until=now()+interval '10 minutes',attempts=attempts+1 where id=job.id;
 return jsonb_build_object('id',job.id,'lease',token,'profile',job.profile_id,'email',recipient,'items',filtered);
end $$;
create function public.cvoa_register_finish_mail(p_id uuid,p_lease uuid,p_success boolean) returns void language sql security definer set search_path='' as $$
 update register_private.outbox set status=case when p_success then 'sent' else 'pending' end,lease=null,lease_until=case when p_success then null else now()+interval '15 minutes' end where id=p_id and lease=p_lease and lease_until>now();
$$;
create function public.cvoa_register_unsubscribe(p_profile uuid) returns void language sql security definer set search_path='' as $$
 update register_private.preferences set enabled=false,updated_at=now() where profile_id=p_profile;
$$;
do $$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cvoa_register_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
end loop;end $$;
