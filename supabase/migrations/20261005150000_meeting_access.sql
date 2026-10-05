begin;
create function public.uro_post_start_allowed(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and (public.is_national_role() or exists(select 1 from public.cvoa_access_scopes(auth.uid()) sc where sc.role='post_commander' and sc.post_id=p_post));
$$;
revoke all on function public.uro_post_start_allowed(uuid) from public,anon;
grant execute on function public.uro_post_start_allowed(uuid) to authenticated;
create or replace function public.uro_body_manage(p_body uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.uro_bodies b where b.id=p_body and (public.is_national_role() or exists(select 1 from public.cvoa_access_scopes(auth.uid()) s where (b.jurisdiction='post' and s.role='post_commander' and s.post_id=b.post_id) or (b.jurisdiction='state' and s.role='state_commander' and upper(s.state)=b.state))));
$$;

create or replace function public.uro_body_read(p_body uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.uro_bodies b where b.id=p_body and (public.uro_body_manage(b.id) or (b.jurisdiction='post' and exists(select 1 from public.profiles p left join public.members m on m.profile_id=p.id where p.id=auth.uid() and (p.post_id=b.post_id or m.post_id=b.post_id))) or (b.jurisdiction='post' and public.cvoa_can_oversee_post(b.post_id)) or exists(select 1 from public.uro_body_members m where m.body_id=b.id and m.profile_id=auth.uid() and m.active)));
$$;

create or replace function public.uro_session_read(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where s.id=p_session and (public.uro_body_manage(b.id) or (b.jurisdiction='post' and public.cvoa_can_oversee_post(b.post_id)) or exists(select 1 from public.uro_body_members m where m.body_id=b.id and m.profile_id=auth.uid() and m.active) or exists(select 1 from public.uro_participants p where p.meeting_id=s.id and p.profile_id=auth.uid()) or (s.published_at is not null and public.uro_body_read(b.id))));
$$;

create or replace function public.uro_directory() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Active account required.';end if;
 return jsonb_build_object('bodies',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('manage',public.uro_body_manage(b.id)) order by b.name),'[]') from public.uro_bodies b where public.uro_body_read(b.id)),
 'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'body_id',s.body_id,'title',s.title,'scheduled_at',s.scheduled_at,'started_at',s.started_at,'ended_at',s.ended_at,'phase',s.phase,'published_at',s.published_at,'readable',public.uro_session_read(s.id)) order by s.scheduled_at desc),'[]') from public.uro_sessions s where public.uro_session_read(s.id) or public.uro_body_read(s.body_id)),
 'posts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'state',state) order by name),'[]') from public.posts where (public.is_national_role() or exists(select 1 from public.cvoa_access_scopes(auth.uid()) sc where sc.role='post_commander' and sc.post_id=posts.id))),
 'states',(select coalesce(jsonb_agg(distinct upper(state)),'[]') from public.cvoa_access_scopes(auth.uid()) where role='state_commander'),
 'national',public.is_national_role());
end; $$;

create or replace function public.uro_body_setup(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare candidate_name text; b public.uro_bodies; k text:=p_data->>'jurisdiction'; st text:=upper(p_data->>'state'); po uuid:=(p_data->>'post_id')::uuid; result uuid; m jsonb; body_rules jsonb; begin
 if not public.cvoa_access_enabled() then raise exception 'Active account required.';end if;
 if p_id is null then
 if not (public.is_national_role() or (k='post' and exists(select 1 from public.cvoa_access_scopes(auth.uid()) sc where sc.role='post_commander' and sc.post_id=po)) or (k='state' and exists(select 1 from public.cvoa_access_scopes(auth.uid()) where role='state_commander' and upper(state)=st))) then raise exception 'Jurisdiction administration required.';end if;
 else select * into b from public.uro_bodies where id=p_id for update;if not public.uro_body_manage(p_id) then raise exception 'Body administration required.';end if; end if;
 body_rules:=coalesce(p_data->'rules','{}');
 if jsonb_typeof(body_rules->'remote_authorized') is distinct from 'boolean' or jsonb_typeof(body_rules->'configured') is distinct from 'boolean' then raise exception 'Explicit configuration and remote authority flags required.';end if;
 if body_rules->>'denominator' is distinct from 'eligible_present' or body_rules->>'version' is null or coalesce((body_rules->>'speaking_seconds')::int,0) not between 15 and 1800 or (body_rules->>'quorum_count' is not null and (body_rules->>'quorum_count')::int<1) or (body_rules->>'notice_hours' is not null and (body_rules->>'notice_hours')::int<0) then raise exception 'Valid versioned URO rules with eligible-present denominator required.';end if;
 if (body_rules->>'configured')::boolean and (length(trim(coalesce(body_rules->>'voting_authority','')))=0 or length(trim(coalesce(body_rules->>'notice_authority','')))=0) then raise exception 'Identify voting and notice authority before configuration is confirmed.';end if;
 if p_id is null then insert into public.uro_bodies(name,jurisdiction,state,post_id,chair_id,secretary_id,rules,created_by) values(p_data->>'name',k,case when k='state' then st else null end,case when k='post' then po else null end,(p_data->>'chair_id')::uuid,(p_data->>'secretary_id')::uuid,body_rules,auth.uid()) returning id into result;
 else result:=p_id;update public.uro_bodies set name=p_data->>'name',chair_id=(p_data->>'chair_id')::uuid,secretary_id=(p_data->>'secretary_id')::uuid,rules=body_rules where id=result; end if;
 update public.uro_body_members set active=false where body_id=result;
 for m in select value from jsonb_array_elements(coalesce(p_data->'members','[]')) loop
 if m->>'profile_id' is null and m->>'member_id' is null then raise exception 'Select a linked account or membership record.';end if;
 -- Body administrators select from scoped roster candidates; prevent forged foreign records.
 select c.name into candidate_name from public.uro_candidates(result) c where c.profile_id is not distinct from (m->>'profile_id')::uuid and c.member_id is not distinct from (m->>'member_id')::uuid limit 1;
 if not found then raise exception 'Participant is outside the eligible jurisdiction directory.';end if;
 select id into po from public.uro_body_members where body_id=result and ((m->>'profile_id' is not null and profile_id=(m->>'profile_id')::uuid) or (m->>'member_id' is not null and member_id=(m->>'member_id')::uuid)) limit 1;
 if po is null then insert into public.uro_body_members(body_id,profile_id,member_id,name,voting,committee_chair) values(result,(m->>'profile_id')::uuid,(m->>'member_id')::uuid,candidate_name,coalesce((m->>'voting')::boolean,false),coalesce((m->>'committee_chair')::boolean,false));
 else update public.uro_body_members set name=candidate_name,voting=coalesce((m->>'voting')::boolean,false),committee_chair=coalesce((m->>'committee_chair')::boolean,false),active=true where id=po;end if;
 end loop;
 if (body_rules->>'configured')::boolean and (not exists(select 1 from public.uro_body_members where body_id=result and active and voting) or not exists(select 1 from public.uro_body_members where body_id=result and active and profile_id=(p_data->>'chair_id')::uuid) or not exists(select 1 from public.uro_body_members where body_id=result and active and profile_id=(p_data->>'secretary_id')::uuid)) then raise exception 'Confirmed configuration requires voting members and Chair and Secretary in the participant roster.';end if;
 return result;
end; $$;

alter function public.uro_command(uuid,text,jsonb,integer) rename to uro_command_engine;
revoke all on function public.uro_command_engine(uuid,text,jsonb,integer) from public,anon,authenticated;
create function public.uro_command(p_session uuid,p_action text,p_data jsonb,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p_action='start' and exists(select 1 from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where s.id=p_session and b.jurisdiction='post') and not public.is_national_role() and not exists(select 1 from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id cross join public.cvoa_access_scopes(auth.uid()) sc where s.id=p_session and sc.role='post_commander' and sc.post_id=b.post_id) then raise exception 'Only the post commander may start a post meeting.';end if;
 return public.uro_command_engine(p_session,p_action,p_data,p_version);
end; $$;
revoke all on function public.uro_command(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.uro_command(uuid,text,jsonb,integer) to authenticated;
create or replace function public.uro_registry(p_body uuid,p_term text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() or not (public.uro_body_manage(p_body) or exists(select 1 from public.uro_bodies b where b.id=p_body and b.jurisdiction='post' and public.cvoa_can_oversee_post(b.post_id)) or exists(select 1 from public.uro_body_members m where m.body_id=p_body and m.profile_id=auth.uid() and m.active)) then raise exception 'Body access required.';end if;
 return jsonb_build_object(
 'motions',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('meeting_title',s.title) order by p.created_at desc),'[]') from public.uro_proposals p join public.uro_sessions s on s.id=p.meeting_id where s.body_id=p_body and (p.current_text ilike '%'||p_term||'%' or p.identifier ilike '%'||p_term||'%')),
 'actions',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('meeting_title',s.title) order by a.due_date nulls last),'[]') from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id where s.body_id=p_body and a.title ilike '%'||p_term||'%'),
 'decisions',(select coalesce(jsonb_agg(d order by decided_at desc),'[]') from public.uro_decisions d join public.uro_sessions s on s.id=d.meeting_id where s.body_id=p_body and d.text ilike '%'||p_term||'%'),
 'meetings',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'scheduled_at',s.scheduled_at,'minutes_state',s.minutes_state)),'[]') from public.uro_sessions s where s.body_id=p_body and (s.title ilike '%'||p_term||'%' or s.minutes ilike '%'||p_term||'%')),
 'agenda',(select coalesce(jsonb_agg(a),'[]') from public.uro_agenda a join public.uro_sessions s on s.id=a.meeting_id where s.body_id=p_body and (a.title ilike '%'||p_term||'%' or a.report_body ilike '%'||p_term||'%' or a.brief::text ilike '%'||p_term||'%')),
 'procedure',(select coalesce(jsonb_agg(c),'[]') from public.uro_challenges c join public.uro_sessions s on s.id=c.meeting_id where s.body_id=p_body and (c.body ilike '%'||p_term||'%' or c.ruling ilike '%'||p_term||'%')),
 'interim',(select coalesce(jsonb_agg(i order by occurred_at desc),'[]') from public.uro_interim i where body_id=p_body and action ilike '%'||p_term||'%'));
end; $$;
-- The retained legacy wizard must not bypass commander-only creation.
alter policy uro_meetings_insert on public.uro_meetings with check(public.uro_post_start_allowed(post_id));
-- General post membership grants published minutes, not delegated interim records.
alter policy scoped_read on public.uro_interim using(public.cvoa_access_enabled() and (public.uro_body_manage(body_id) or exists(select 1 from public.uro_bodies b where b.id=uro_interim.body_id and b.jurisdiction='post' and public.cvoa_can_oversee_post(b.post_id)) or exists(select 1 from public.uro_body_members m where m.body_id=uro_interim.body_id and m.profile_id=auth.uid() and m.active)));
commit;
