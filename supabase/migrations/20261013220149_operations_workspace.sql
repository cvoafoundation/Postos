create schema if not exists operations_private;
revoke all on schema operations_private from public,anon,authenticated;
create table public.ops_channels (
 id uuid primary key default gen_random_uuid(),name text not null check(name ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
 description text not null default '' check(length(description)<=1000),scope text not null check(scope in ('national','state','post','direct')),
 state text,post_id uuid references public.posts(id),staff_only boolean not null default false,private boolean not null default false,
 participants uuid[] not null default '{}',read_only boolean not null default false,archived boolean not null default false,
 created_by uuid references public.profiles(id),created_at timestamptz not null default now(),
 check((scope='national' and state is null and post_id is null) or (scope='state' and state is not null and post_id is null) or (scope='post' and post_id is not null and state is null) or (scope='direct' and cardinality(participants)=2 and private and state is null and post_id is null))
);
create unique index ops_scope_name on public.ops_channels(scope,coalesce(state,''),coalesce(post_id,'00000000-0000-0000-0000-000000000000'),name) where scope<>'direct';
create unique index ops_direct_pair on public.ops_channels(participants) where scope='direct';
create function operations_private.active(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_user and not access_suspended and deleted_at is null and role::text<>'guest_applicant');
$$;
create function operations_private.scope_access(p_user uuid,p_scope text,p_state text,p_post uuid,p_manage boolean default false,p_staff boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$
declare appointment record; post_state text;
begin
 if not operations_private.active(p_user) then return false;end if;
 if p_scope='post' then select state into post_state from public.posts where id=p_post;if post_state is null then return false;end if;end if;
 for appointment in select * from public.cvoa_access_scopes(p_user) loop
  if appointment.role in ('national_commander','national_staff') then return true;end if;
  if p_scope='national' and not p_manage and not p_staff then return true;end if;
  if p_scope='state' then
   if appointment.role='state_commander' and upper(appointment.state)=upper(p_state) then return true;end if;
   if appointment.role<>'state_commander' and not p_manage and not p_staff and (upper(appointment.state)=upper(p_state) or exists(select 1 from public.posts where id=appointment.post_id and upper(state)=upper(p_state))) then return true;end if;
  end if;
  if p_scope='post' then
   if appointment.role='state_commander' and upper(appointment.state)=upper(post_state) then return true;end if;
   if appointment.role<>'state_commander' and appointment.post_id=p_post and (appointment.role in ('post_commander','post_officer') or (not p_manage and not p_staff)) then return true;end if;
  end if;
 end loop;return false;
end $$;
create function operations_private.channel_access(p_user uuid,p_channel uuid,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select operations_private.active(p_user) and exists(select 1 from public.ops_channels c where c.id=p_channel and
  (not p_write or (not c.archived and (not c.read_only or operations_private.scope_access(p_user,c.scope,c.state,c.post_id,true)))) and
  ((c.scope='direct' and p_user=any(c.participants)) or (c.scope<>'direct' and operations_private.scope_access(p_user,c.scope,c.state,c.post_id,false,c.staff_only) and (not c.private or p_user=any(c.participants) or operations_private.scope_access(p_user,c.scope,c.state,c.post_id,true)))))
$$;
create function public.ops_can_channel(p_channel uuid,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$ select operations_private.channel_access(auth.uid(),p_channel,p_write); $$;
revoke all on function public.ops_can_channel(uuid,boolean) from public,anon;
grant execute on function public.ops_can_channel(uuid,boolean) to authenticated;

create table public.ops_messages (
 id uuid primary key default gen_random_uuid(),channel_id uuid not null references public.ops_channels(id),author_id uuid not null default auth.uid() references public.profiles(id),author_name text not null default '',
 parent_id uuid references public.ops_messages(id),body text not null default '' check(length(body)<=10000),attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=5),
 mentions uuid[] not null default '{}',pinned boolean not null default false,deleted_at timestamptz,created_at timestamptz not null default now(),edited_at timestamptz,
 search tsvector generated always as (to_tsvector('english',body)) stored,check(length(trim(body))>0 or jsonb_array_length(attachments)>0)
);
create index ops_message_author_time on public.ops_messages(author_id,created_at desc);
create index ops_message_channel_time on public.ops_messages(channel_id,created_at desc);
create index ops_message_thread on public.ops_messages(parent_id,created_at) where parent_id is not null;
create index ops_message_search on public.ops_messages using gin(search);
create table operations_private.message_history(id bigint generated always as identity primary key,message_id uuid not null,editor_id uuid,previous_body text,previous_attachments jsonb,changed_at timestamptz default now());
alter table operations_private.message_history enable row level security;
create function operations_private.guard_message() returns trigger language plpgsql security definer set search_path='' as $$
declare attachment jsonb; mentioned uuid;
begin
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended('ops-message:'||auth.uid()::text,0));
  if (select count(*) from public.ops_messages where author_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then raise exception 'Please slow down before sending more messages';end if;
  new.author_id:=auth.uid();new.created_at:=now();new.edited_at:=null;new.pinned:=false;new.deleted_at:=null;
  select full_name into new.author_name from public.profiles where id=new.author_id;
  if not public.ops_can_channel(new.channel_id,true) then raise exception 'Channel access required'; end if;
  if new.parent_id is not null and not exists(select 1 from public.ops_messages where id=new.parent_id and channel_id=new.channel_id and parent_id is null) then raise exception 'Reply must belong to this channel'; end if;
 else
  if new.id<>old.id or new.channel_id<>old.channel_id or new.author_id<>old.author_id or new.parent_id is distinct from old.parent_id or new.author_name<>old.author_name or new.created_at<>old.created_at then raise exception 'Message identity cannot change'; end if;
  if new.pinned<>old.pinned and not exists(select 1 from public.ops_channels c where c.id=new.channel_id and operations_private.scope_access(auth.uid(),c.scope,c.state,c.post_id,true)) then raise exception 'Channel leadership manages pins'; end if;
  if new.body<>old.body or new.attachments<>old.attachments or new.mentions<>old.mentions or new.deleted_at is distinct from old.deleted_at then
   if old.author_id<>auth.uid() and not (new.deleted_at is not null and public.ops_manage_channel(new.channel_id)) then raise exception 'Only the author may edit a message'; end if;
   if old.deleted_at is not null and new.deleted_at is null then raise exception 'Removed messages remain preserved in record history';end if;
   insert into operations_private.message_history(message_id,editor_id,previous_body,previous_attachments) values(old.id,auth.uid(),old.body,old.attachments);
   new.edited_at:=now();
   if new.deleted_at is not null then new.body:='[Message removed]';new.pinned:=false;new.attachments:='[]';new.mentions:='{}';new.deleted_at:=now(); end if;
  end if;
 end if;
 foreach mentioned in array new.mentions loop if not operations_private.channel_access(mentioned,new.channel_id) then raise exception 'Mentioned person cannot access this channel'; end if; end loop;
 for attachment in select value from jsonb_array_elements(new.attachments) loop
  if attachment->>'path' is null or split_part(attachment->>'path','/',1)<>new.channel_id::text or split_part(attachment->>'path','/',2)<>new.author_id::text or (attachment->>'path') like '%..%' then raise exception 'Invalid attachment path'; end if;
 end loop;
 return new;
end $$;
create trigger guard_ops_message before insert or update on public.ops_messages for each row execute function operations_private.guard_message();

create table public.ops_reactions(message_id uuid references public.ops_messages(id) on delete cascade,user_id uuid not null default auth.uid() references public.profiles(id),emoji text not null check(emoji in ('👍','✅','❤️','👀','🎉')),primary key(message_id,user_id,emoji));
create table public.ops_reads(channel_id uuid references public.ops_channels(id),user_id uuid default auth.uid() references public.profiles(id),seen_at timestamptz not null default now(),primary key(channel_id,user_id));
create table public.ops_presence(channel_id uuid references public.ops_channels(id),user_id uuid default auth.uid() references public.profiles(id),last_seen timestamptz not null default now(),typing_until timestamptz,primary key(channel_id,user_id));
create index ops_presence_recent on public.ops_presence(channel_id,last_seen);
create function operations_private.guard_presence() returns trigger language plpgsql set search_path='' as $$ begin new.last_seen:=now();if new.typing_until is not null then new.typing_until:=now()+interval '6 seconds';end if;return new;end $$;
create trigger ops_presence_clock before insert or update on public.ops_presence for each row execute function operations_private.guard_presence();
create function public.ops_mark_read(p_channel uuid) returns void language plpgsql security definer set search_path='' as $$ begin if not public.ops_can_channel(p_channel) then raise exception 'Channel access required';end if;insert into public.ops_reads(channel_id,user_id,seen_at) values(p_channel,auth.uid(),now()) on conflict(channel_id,user_id) do update set seen_at=now();end $$;
revoke all on function public.ops_mark_read(uuid) from public,anon;
grant execute on function public.ops_mark_read(uuid) to authenticated;

create table public.ops_tasks (
 id uuid primary key default gen_random_uuid(),channel_id uuid not null references public.ops_channels(id),source_message_id uuid references public.ops_messages(id),
 title text not null check(length(trim(title)) between 1 and 200),outcome text not null default '' check(length(outcome)<=3000),measure text not null default '' check(length(measure)<=2000),
 owner_id uuid not null references public.profiles(id),created_by uuid not null default auth.uid() references public.profiles(id),due_date date not null,
 status text not null default 'on_track' check(status in ('on_track','at_risk','blocked','complete')),
 priority boolean not null default false,cycle_start date not null default current_date,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index ops_tasks_channel_due on public.ops_tasks(channel_id,due_date);create index ops_tasks_owner on public.ops_tasks(owner_id,status);
create table public.ops_activity (
 id uuid primary key default gen_random_uuid(),channel_id uuid not null references public.ops_channels(id),owner_id uuid not null default auth.uid() references public.profiles(id),
 activity_date date not null default current_date,activity_type text not null check(length(activity_type) between 1 and 80),contact text not null default '',organization text not null default '',state text not null default '',district text not null default '',topic text not null default '',takeaway text not null check(length(trim(takeaway)) between 1 and 3000),opportunity text not null default '',follow_up_task_id uuid references public.ops_tasks(id),created_at timestamptz default now()
);
create index ops_activity_channel_date on public.ops_activity(channel_id,activity_date desc);
create table public.ops_reports (
 id uuid primary key default gen_random_uuid(),channel_id uuid not null references public.ops_channels(id),owner_id uuid not null default auth.uid() references public.profiles(id),
 period date not null,completed text not null check(length(completed)<=5000),next_action text not null check(length(next_action)<=5000),blocked text not null check(length(blocked)<=5000),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(channel_id,owner_id,period)
);
create index ops_reports_channel_period on public.ops_reports(channel_id,period desc);
create function operations_private.guard_task() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='INSERT' then new.created_by:=auth.uid();new.created_at:=now();else if new.channel_id<>old.channel_id or new.created_by<>old.created_by or new.id<>old.id then raise exception 'Action identity cannot change';end if;end if;
 if not operations_private.channel_access(new.owner_id,new.channel_id) then raise exception 'Owner must have channel access';end if;
 if new.source_message_id is not null and not exists(select 1 from public.ops_messages where id=new.source_message_id and channel_id=new.channel_id) then raise exception 'Source message belongs to another channel';end if;
 new.updated_at:=now();return new;end $$;
create trigger guard_ops_task before insert or update on public.ops_tasks for each row execute function operations_private.guard_task();
create function operations_private.guard_activity() returns trigger language plpgsql security definer set search_path='' as $$ begin
 new.owner_id:=auth.uid();
 if new.follow_up_task_id is not null and not exists(select 1 from public.ops_tasks where id=new.follow_up_task_id and channel_id=new.channel_id) then raise exception 'Follow-up belongs to another channel';end if;return new;end $$;
create trigger guard_ops_activity before insert on public.ops_activity for each row execute function operations_private.guard_activity();
create function operations_private.guard_report() returns trigger language plpgsql set search_path='' as $$ begin new.owner_id:=auth.uid();new.period:=date_trunc('month',new.period)::date;new.updated_at:=now();return new;end $$;
create trigger guard_ops_report before insert or update on public.ops_reports for each row execute function operations_private.guard_report();

-- RLS applies to REST, realtime delivery, search, and direct SQL equally.
alter table public.ops_channels enable row level security;
create policy ops_channels_read on public.ops_channels for select to authenticated using(public.ops_can_channel(id));
do $$declare t text;begin foreach t in array array['ops_messages','ops_tasks','ops_activity','ops_reports','ops_presence'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy ops_read on public.%I for select to authenticated using(public.ops_can_channel(channel_id))',t);
 end loop;end $$;
create policy ops_messages_create on public.ops_messages for insert to authenticated with check(author_id=auth.uid() and public.ops_can_channel(channel_id,true));
create policy ops_messages_edit on public.ops_messages for update to authenticated using(public.ops_can_channel(channel_id,true) and (author_id=auth.uid() or exists(select 1 from public.ops_channels c where c.id=channel_id and operations_private.scope_access(auth.uid(),c.scope,c.state,c.post_id,true)))) with check(public.ops_can_channel(channel_id,true));
-- Policies cannot call private-schema functions as an unprivileged role: expose
-- a narrow current-user moderation predicate, never arbitrary-user access.
create function public.ops_manage_channel(p_channel uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.ops_channels c where c.id=p_channel and c.scope<>'direct' and operations_private.scope_access(auth.uid(),c.scope,c.state,c.post_id,true));$$;
revoke all on function public.ops_manage_channel(uuid) from public,anon;grant execute on function public.ops_manage_channel(uuid) to authenticated;
alter policy ops_messages_edit on public.ops_messages using(public.ops_can_channel(channel_id,true) and (author_id=auth.uid() or public.ops_manage_channel(channel_id)));
create policy ops_tasks_create on public.ops_tasks for insert to authenticated with check(created_by=auth.uid() and public.ops_can_channel(channel_id,true));
create policy ops_tasks_edit on public.ops_tasks for update to authenticated using(public.ops_can_channel(channel_id,true) and (owner_id=auth.uid() or created_by=auth.uid() or public.ops_manage_channel(channel_id))) with check(public.ops_can_channel(channel_id,true));
create policy ops_activity_create on public.ops_activity for insert to authenticated with check(owner_id=auth.uid() and public.ops_can_channel(channel_id,true));
create policy ops_reports_create on public.ops_reports for insert to authenticated with check(owner_id=auth.uid() and public.ops_can_channel(channel_id,true));
create policy ops_reports_edit on public.ops_reports for update to authenticated using(owner_id=auth.uid() and public.ops_can_channel(channel_id,true)) with check(owner_id=auth.uid() and public.ops_can_channel(channel_id,true));
create policy ops_presence_write on public.ops_presence for all to authenticated using(user_id=auth.uid() and public.ops_can_channel(channel_id)) with check(user_id=auth.uid() and public.ops_can_channel(channel_id));
alter table public.ops_reactions enable row level security;
create policy ops_reactions_read on public.ops_reactions for select to authenticated using(exists(select 1 from public.ops_messages m where m.id=message_id and public.ops_can_channel(m.channel_id)));
create policy ops_reactions_create on public.ops_reactions for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.ops_messages m where m.id=message_id and public.ops_can_channel(m.channel_id,true)));
create policy ops_reactions_remove on public.ops_reactions for delete to authenticated using(user_id=auth.uid() and exists(select 1 from public.ops_messages m where m.id=message_id and public.ops_can_channel(m.channel_id,true)));
alter table public.ops_reads enable row level security;
create policy ops_reads_own on public.ops_reads for select to authenticated using(user_id=auth.uid() and public.ops_can_channel(channel_id));
revoke all on public.ops_channels,public.ops_messages,public.ops_reactions,public.ops_reads,public.ops_tasks,public.ops_activity,public.ops_reports,public.ops_presence from anon,authenticated;
grant select on public.ops_channels,public.ops_reads to authenticated;
grant select,insert on public.ops_messages,public.ops_tasks,public.ops_activity,public.ops_reports to authenticated;
grant update(body,attachments,mentions,pinned,deleted_at) on public.ops_messages to authenticated;
grant update(title,outcome,measure,owner_id,due_date,status,priority,cycle_start) on public.ops_tasks to authenticated;
grant update(completed,next_action,blocked) on public.ops_reports to authenticated;
grant select,insert,delete on public.ops_reactions to authenticated;
grant select,insert,update,delete on public.ops_presence to authenticated;

create function public.ops_channel_people(p_channel uuid) returns table(id uuid,full_name text) language plpgsql stable security definer set search_path='' as $$begin
 if not public.ops_can_channel(p_channel) then raise exception 'Channel access required';end if;
 return query select p.id,p.full_name from public.profiles p where operations_private.channel_access(p.id,p_channel) order by p.full_name;
end $$;
create function public.ops_channel_list() returns table(id uuid,name text,description text,scope text,state text,post_id uuid,private boolean,read_only boolean,archived boolean,unread bigint,can_write boolean,can_manage boolean) language sql stable security invoker set search_path='' as $$
 select c.id,case when c.scope='direct' then coalesce((select p.full_name from public.profiles p where p.id=any(c.participants) and p.id<>auth.uid()),'Direct message') else c.name end,c.description,c.scope,c.state,c.post_id,c.private,c.read_only,c.archived,
 (select count(*) from public.ops_messages m where m.channel_id=c.id and m.author_id<>auth.uid() and m.created_at>coalesce((select seen_at from public.ops_reads r where r.channel_id=c.id and r.user_id=auth.uid()),'1970-01-01')),
 public.ops_can_channel(c.id,true),public.ops_manage_channel(c.id) from public.ops_channels c order by c.scope,c.name;
$$;
create function public.ops_workspaces() returns table(scope text,state text,post_id uuid,label text,can_manage boolean) language sql stable security definer set search_path='' as $$
 select 'national',null::text,null::uuid,'National Command',operations_private.scope_access(auth.uid(),'national',null,null,true) where operations_private.active(auth.uid())
 union all select 'state',s.state,null::uuid,s.state||' state',operations_private.scope_access(auth.uid(),'state',s.state,null,true) from (select distinct state from public.posts where state is not null) s where operations_private.scope_access(auth.uid(),'state',s.state,null)
 union all select 'post',null::text,p.id,p.name,operations_private.scope_access(auth.uid(),'post',null,p.id,true) from public.posts p where operations_private.scope_access(auth.uid(),'post',null,p.id);
$$;
create function public.ops_create_channel(p_name text,p_description text,p_scope text,p_state text default null,p_post uuid default null,p_staff boolean default false,p_private boolean default false,p_participants uuid[] default '{}',p_read_only boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare channel uuid;
begin
 if p_scope='direct' or not operations_private.scope_access(auth.uid(),p_scope,p_state,p_post,true) then raise exception 'Workspace leadership required';end if;
 insert into public.ops_channels(name,description,scope,state,post_id,staff_only,private,participants,read_only,created_by) values(p_name,p_description,p_scope,upper(p_state),p_post,p_staff,p_private,array_append(p_participants,auth.uid()),p_read_only,auth.uid()) returning id into channel;return channel;
end $$;
create function public.ops_open_dm(p_other uuid) returns uuid language plpgsql security definer set search_path='' as $$declare pair uuid[];channel uuid;begin
 if auth.uid()=p_other or not operations_private.active(auth.uid()) or not operations_private.active(p_other) then raise exception 'Choose another active member';end if;
 select array_agg(x order by x) into pair from unnest(array[auth.uid(),p_other]) x;
 insert into public.ops_channels(name,scope,private,participants,created_by) values('direct-message','direct',true,pair,auth.uid()) on conflict(participants) where scope='direct' do update set name=excluded.name returning id into channel;return channel;
end $$;
create function public.ops_bootstrap() returns void language plpgsql security definer set search_path='' as $$declare w record;begin
 if not operations_private.active(auth.uid()) then raise exception 'Verified active membership required';end if;
 for w in select * from public.ops_workspaces() where scope<>'national' loop
 insert into public.ops_channels(name,description,scope,state,post_id) values('operations','Coordination, commitments, and requests for help.',w.scope,upper(w.state),w.post_id) on conflict do nothing;
 end loop;
end $$;
create function public.ops_archive_channel(p_channel uuid,p_archived boolean) returns void language plpgsql security definer set search_path='' as $$begin if not public.ops_manage_channel(p_channel) then raise exception 'Workspace leadership required';end if;update public.ops_channels set archived=p_archived where id=p_channel;end $$;
revoke all on function public.ops_channel_people(uuid),public.ops_channel_list(),public.ops_workspaces(),public.ops_create_channel(text,text,text,text,uuid,boolean,boolean,uuid[],boolean),public.ops_open_dm(uuid),public.ops_bootstrap(),public.ops_archive_channel(uuid,boolean) from public,anon;
grant execute on function public.ops_channel_people(uuid),public.ops_channel_list(),public.ops_workspaces(),public.ops_create_channel(text,text,text,text,uuid,boolean,boolean,uuid[],boolean),public.ops_open_dm(uuid),public.ops_bootstrap(),public.ops_archive_channel(uuid,boolean) to authenticated;
insert into public.ops_channels(name,description,scope,read_only) values('announcements','Official operational announcements and approved organizational updates.','national',true),('general','Organization-wide coordination and member opportunities.','national',false);
insert into public.ops_channels(name,description,scope,staff_only) values('national-operations','National leadership priorities, decisions, and execution.','national',true);

-- Private attachments inherit channel access at download time.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('operations-files','operations-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict(id) do nothing;
create function public.ops_file_access(p_path text,p_write boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$declare channel uuid;begin
 if split_part(p_path,'/',1) !~ '^[0-9a-f-]{36}$' then return false;end if;
 begin channel:=split_part(p_path,'/',1)::uuid;exception when invalid_text_representation then return false;end;
 return public.ops_can_channel(channel,p_write) and (not p_write or split_part(p_path,'/',2)=auth.uid()::text);
end $$;
revoke all on function public.ops_file_access(text,boolean) from public,anon;grant execute on function public.ops_file_access(text,boolean) to authenticated;
create policy operations_files_read on storage.objects for select to authenticated using(bucket_id='operations-files' and public.ops_file_access(name));
create policy operations_files_create on storage.objects for insert to authenticated with check(bucket_id='operations-files' and public.ops_file_access(name,true));
-- No client deletion: attachments and message revisions remain organizational records.
-- Realtime events still run each subscriber's SELECT policies.
do $$declare t text;begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['ops_channels','ops_messages','ops_reactions','ops_tasks','ops_activity','ops_reports','ops_presence'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;end loop;end if;end $$;
create function public.ops_thread_counts(p_channel uuid) returns table(parent_id uuid,replies bigint) language sql stable security invoker set search_path='' as $$ select parent_id,count(*) from public.ops_messages where channel_id=p_channel and parent_id is not null group by parent_id; $$;
create function public.ops_submit_report(p_channel uuid,p_period date,p_completed text,p_next text,p_blocked text) returns void language sql security invoker set search_path='' as $$
 insert into public.ops_reports(channel_id,owner_id,period,completed,next_action,blocked) values(p_channel,auth.uid(),date_trunc('month',p_period)::date,p_completed,p_next,p_blocked) on conflict(channel_id,owner_id,period) do update set completed=excluded.completed,next_action=excluded.next_action,blocked=excluded.blocked;
$$;
create function public.ops_log_activity(p_channel uuid,p_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$declare action uuid;entry uuid;begin
 if coalesce(p_data->>'follow_up','false')='true' then
 insert into public.ops_tasks(channel_id,title,outcome,owner_id,due_date) values(p_channel,'Follow up: '||left(p_data->>'topic',160),coalesce(p_data->>'follow_up_action',''),(p_data->>'follow_up_owner')::uuid,(p_data->>'follow_up_due')::date) returning id into action;
 end if;
 insert into public.ops_activity(channel_id,activity_date,activity_type,contact,organization,state,district,topic,takeaway,opportunity,follow_up_task_id) values(p_channel,(p_data->>'activity_date')::date,p_data->>'activity_type',coalesce(p_data->>'contact',''),coalesce(p_data->>'organization',''),coalesce(p_data->>'state',''),coalesce(p_data->>'district',''),coalesce(p_data->>'topic',''),p_data->>'takeaway',coalesce(p_data->>'opportunity',''),action) returning id into entry;return entry;
end $$;
revoke all on function public.ops_thread_counts(uuid),public.ops_submit_report(uuid,date,text,text,text),public.ops_log_activity(uuid,jsonb) from public,anon;
grant execute on function public.ops_thread_counts(uuid),public.ops_submit_report(uuid,date,text,text,text),public.ops_log_activity(uuid,jsonb) to authenticated;
create table operations_private.record_history(id bigint generated always as identity primary key,record_type text not null,record_id uuid not null,actor_id uuid,previous_record jsonb not null,changed_at timestamptz default now());
alter table operations_private.record_history enable row level security;
create function operations_private.keep_record_history() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into operations_private.record_history(record_type,record_id,actor_id,previous_record) values(tg_table_name,old.id,auth.uid(),to_jsonb(old));return new;end $$;
create trigger ops_task_history before update on public.ops_tasks for each row execute function operations_private.keep_record_history();
create trigger ops_report_history before update on public.ops_reports for each row execute function operations_private.keep_record_history();
create function public.ops_summary() returns table(channel_id uuid,name text,scope text,state text,post_id uuid,open_actions bigint,overdue bigint,blocked bigint,completed bigint,engagements bigint,monthly_reports bigint) language sql stable security invoker set search_path='' as $$
 select c.id,c.name,c.scope,c.state,c.post_id,
 (select count(*) from public.ops_tasks t where t.channel_id=c.id and t.status<>'complete'),
 (select count(*) from public.ops_tasks t where t.channel_id=c.id and t.status<>'complete' and t.due_date<current_date),
 (select count(*) from public.ops_tasks t where t.channel_id=c.id and t.status='blocked'),
 (select count(*) from public.ops_tasks t where t.channel_id=c.id and t.status='complete'),
 (select count(*) from public.ops_activity a where a.channel_id=c.id and a.activity_date>=date_trunc('month',current_date)),
 (select count(*) from public.ops_reports r where r.channel_id=c.id and r.period=date_trunc('month',current_date)::date)
 from public.ops_channels c where c.scope<>'direct' and not c.archived order by c.scope,c.name;
$$;
revoke all on function public.ops_summary() from public,anon;grant execute on function public.ops_summary() to authenticated;

alter table public.ops_activity add constraint ops_activity_lengths check(length(contact)<=500 and length(organization)<=500 and length(state)<=80 and length(district)<=80 and length(topic)<=500 and length(opportunity)<=3000);
create index ops_messages_mentions on public.ops_messages using gin(mentions);
create function public.ops_unread_count() returns bigint language sql stable security invoker set search_path='' as $$
 select count(*) from public.ops_messages m where m.author_id<>auth.uid() and m.deleted_at is null and m.created_at>coalesce((select seen_at from public.ops_reads r where r.channel_id=m.channel_id and r.user_id=auth.uid()),'1970-01-01');
$$;
revoke all on function public.ops_unread_count() from public,anon;grant execute on function public.ops_unread_count() to authenticated;

alter table public.ops_messages add constraint ops_mentions_limit check(cardinality(mentions)<=50);
alter table public.ops_channels add constraint ops_participant_limit check(cardinality(participants)<=200);
