begin;
-- URO is organization-neutral. Jurisdiction supplies CVOA's access adapter.
create table public.uro_bodies (
 id uuid primary key default gen_random_uuid(), organization text not null default 'CVOA', name text not null check(length(trim(name)) between 1 and 200),
 jurisdiction text not null check(jurisdiction in ('national','state','post')), state text, post_id uuid references public.posts(id),
 chair_id uuid references public.profiles(id), secretary_id uuid references public.profiles(id),
 rules jsonb not null default '{"version":"URO-2026.10-present-v1","denominator":"eligible_present","quorum":"majority_membership","speaking_seconds":120,"remote_authorized":false,"recusal_counts_quorum":null,"notice_hours":null,"notice_authority":"","voting_authority":"","configured":false}',
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 check((jurisdiction='national' and post_id is null and state is null) or (jurisdiction='state' and post_id is null and state ~ '^[A-Z]{2}$') or (jurisdiction='post' and post_id is not null))
);
create table public.uro_body_members (
 id uuid primary key default gen_random_uuid(), body_id uuid not null references public.uro_bodies(id), profile_id uuid references public.profiles(id), member_id uuid references public.members(id),
 name text not null, voting boolean not null default false, committee_chair boolean not null default false, active boolean not null default true,
 check(profile_id is not null or member_id is not null)
);
create unique index uro_body_profile on public.uro_body_members(body_id,profile_id) where profile_id is not null;
create unique index uro_body_member on public.uro_body_members(body_id,member_id) where member_id is not null;
create table public.uro_sessions (
 id uuid primary key default gen_random_uuid(), body_id uuid not null references public.uro_bodies(id), title text not null check(length(trim(title)) between 1 and 200),
 type text not null check(type in ('regular','special','emergency')), phase text not null default 'prepare' check(phase in ('prepare','review','meet','execute','archive')),
 state text not null default 'preparation', scheduled_at timestamptz not null, target_end timestamptz, location text, virtual_link text, purpose text,
 notice_deadline timestamptz, packet_deadline timestamptz, agenda_deadline timestamptz, amendment_deadline timestamptz,
 chair_id uuid references public.profiles(id), secretary_id uuid references public.profiles(id), rules jsonb not null, version integer not null default 1, notice_revision integer not null default 1,
 started_at timestamptz, ended_at timestamptz, recess_started_at timestamptz, recess_seconds integer not null default 0,
 current_agenda_id uuid, minutes text, minutes_state text not null default 'draft' check(minutes_state in ('draft','certified','approved')), published_at timestamptz,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index uro_sessions_body on public.uro_sessions(body_id,scheduled_at desc);
create table public.uro_participants (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), membership_id uuid references public.uro_body_members(id),
 profile_id uuid references public.profiles(id), name text not null, voting boolean not null default false, guest boolean not null default false,
 rsvp text not null default 'no_response' check(rsvp in ('accepted','declined','tentative','no_response')),
 presence text not null default 'absent' check(presence in ('present','remote','absent','excused','left','away')), arrived_at timestamptz, departed_at timestamptz, accommodation text,
 unique(meeting_id,membership_id), check(not guest or not voting)
);
create index uro_participants_meeting on public.uro_participants(meeting_id);
create table public.uro_agenda (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), title text not null check(length(trim(title)) between 1 and 200),
 classification text not null check(classification in ('information','consent','discussion','decision','emergency')),
 readiness text not null default 'draft' check(readiness in ('draft','needs_information','ready_for_review','ready_for_decision','blocked')),
 owner_id uuid references public.profiles(id), brief jsonb not null default '{}', proposed_text text, estimated_minutes integer not null default 10 check(estimated_minutes between 0 and 240),
 status text not null default 'pending', source_agenda_id uuid references public.uro_agenda(id), report_body text, requested_discussion boolean not null default false,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(), sort_order integer not null default 0
);
alter table public.uro_sessions add constraint uro_current_agenda_fk foreign key(current_agenda_id) references public.uro_agenda(id);
create index uro_agenda_meeting on public.uro_agenda(meeting_id);
create table public.uro_proposals (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), agenda_id uuid references public.uro_agenda(id), parent_id uuid references public.uro_proposals(id),
 identifier text not null unique, kind text not null check(kind in ('main','amendment','refer','postpone','table','reconsider','close_debate','extend_debate','chair_challenge','emergency_override','suspend_rule','uro_amendment','consent','withdraw')),
 original_text text not null check(length(trim(original_text)) between 1 and 12000), current_text text not null, maker_id uuid references public.profiles(id), second_id uuid references public.profiles(id),
 second_exempt boolean not null default false, context jsonb not null default '{}', status text not null default 'draft', threshold text not null default 'majority' check(threshold in ('majority','two_thirds','unanimous')),
 vote_round integer not null default 0, method text check(method in ('voice','hands','roll_call','digital','secret')), electorate uuid[], eligible_present integer, quorum_snapshot jsonb,
 result jsonb, opened_at timestamptz, closed_at timestamptz, created_at timestamptz not null default now()
);
create index uro_proposals_meeting on public.uro_proposals(meeting_id);
create sequence public.uro_proposal_number;
create table public.uro_ballots (
 proposal_id uuid not null references public.uro_proposals(id), participant_id uuid not null references public.uro_participants(id), round integer not null, choice text not null check(choice in ('yes','no','abstain')), cast_at timestamptz not null default now(), primary key(proposal_id,participant_id,round)
);
create table public.uro_events (
 id bigint generated always as identity primary key, meeting_id uuid not null references public.uro_sessions(id), actor_id uuid references public.profiles(id), action text not null, detail jsonb not null default '{}', occurred_at timestamptz not null default now()
);
create index uro_events_meeting on public.uro_events(meeting_id,id);
create table public.uro_documents (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), agenda_id uuid references public.uro_agenda(id), item_id uuid not null references public.cvoa_drive_items(id), label text not null, created_by uuid references public.profiles(id)
);
create table public.uro_reviews (
 meeting_id uuid not null references public.uro_sessions(id), profile_id uuid not null references public.profiles(id), state text not null check(state in ('reviewed','partial','not_reviewed')), reviewed_at timestamptz not null default now(), primary key(meeting_id,profile_id)
);
create table public.uro_questions (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), agenda_id uuid references public.uro_agenda(id), author_id uuid references public.profiles(id), kind text not null default 'question' check(kind in ('question','minutes_correction','future_agenda','recommendation')),
 body text not null check(length(trim(body)) between 1 and 5000), answer text, answered_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.uro_notices (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), recipient_ids uuid[] not null, revision integer not null, method text not null, sent_at timestamptz not null, sender_id uuid references public.profiles(id), evidence text not null, deadline timestamptz, created_at timestamptz not null default now()
);
create table public.uro_recusals (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), agenda_id uuid not null references public.uro_agenda(id), participant_id uuid not null references public.uro_participants(id), reason text not null, declared_at timestamptz not null default now(), unique(agenda_id,participant_id)
);
create table public.uro_floor (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), agenda_id uuid references public.uro_agenda(id), participant_id uuid not null references public.uro_participants(id), status text not null default 'waiting' check(status in ('waiting','recognized','yielded')), requested_at timestamptz not null default now(), recognized_at timestamptz, yielded_at timestamptz, seconds_allowed integer not null default 120
);
create table public.uro_challenges (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), author_id uuid references public.profiles(id), kind text not null, body text not null, rule text, remedy text, ruling text, ruled_by uuid references public.profiles(id), disposition text not null default 'pending', proposal_id uuid references public.uro_proposals(id), resume_state text, created_at timestamptz not null default now()
);
create table public.uro_decisions (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), proposal_id uuid not null references public.uro_proposals(id), identifier text not null, text text not null, authorized_amount numeric check(authorized_amount>=0), decided_at timestamptz not null default now()
);
create table public.uro_actions (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), decision_id uuid references public.uro_decisions(id), title text not null check(length(trim(title)) between 1 and 1000),
 owner_id uuid references public.profiles(id), supporting_ids uuid[], due_date date, priority text not null default 'normal', status text not null default 'open' check(status in ('open','in_progress','blocked','completed')),
 reporting_required boolean not null default false, progress text, evidence text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.uro_private_notes (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), author_id uuid not null references public.profiles(id), kind text not null, body text not null check(length(body) between 1 and 12000), created_at timestamptz not null default now()
);
create table public.uro_corrections (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id), actor_id uuid references public.profiles(id), target text not null, previous_value jsonb, new_value jsonb not null, reason text not null, authority text not null, created_at timestamptz not null default now()
);
create table public.uro_interim (
 id uuid primary key default gen_random_uuid(), body_id uuid not null references public.uro_bodies(id), meeting_id uuid references public.uro_sessions(id), actor_id uuid references public.profiles(id), authority text not null, reason text not null, action text not null, occurred_at timestamptz not null, financial_amount numeric, ratification_required boolean not null, created_at timestamptz not null default now()
);
create function public.uro_body_manage(p_body uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.uro_bodies b where b.id=p_body and (public.is_national_role() or (b.jurisdiction='post' and public.cvoa_can_manage_post(b.post_id)) or (b.jurisdiction='state' and exists(select 1 from public.cvoa_access_scopes(auth.uid()) s where s.role='state_commander' and upper(s.state)=b.state))));
$$;
create function public.uro_body_read(p_body uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.uro_bodies b where b.id=p_body and (public.uro_body_manage(b.id) or (b.jurisdiction='post' and public.cvoa_can_oversee_post(b.post_id)) or exists(select 1 from public.uro_body_members m where m.body_id=b.id and m.profile_id=auth.uid() and m.active)));
$$;
create function public.uro_session_read(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from public.uro_sessions s where s.id=p_session and (public.uro_body_read(s.body_id) or exists(select 1 from public.uro_participants p where p.meeting_id=s.id and p.profile_id=auth.uid())));
$$;
-- Explicit governance membership, not application role, determines eligibility.
create function public.uro_participant_active(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.uro_participants p join public.uro_body_members m on m.id=p.membership_id left join public.profiles a on a.id=p.profile_id where p.id=p_id and m.active and m.voting and p.voting and not p.guest and (p.profile_id is null or not coalesce(a.access_suspended,true)));
$$;
create function public.uro_quorum(p_session uuid,p_agenda uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.uro_sessions; total integer; present integer; required integer; recusal_unset boolean; begin
 select * into s from public.uro_sessions where id=p_session;
 select count(*) into total from public.uro_participants p where p.meeting_id=s.id and public.uro_participant_active(p.id);
 select count(*) into present from public.uro_participants p where p.meeting_id=s.id and public.uro_participant_active(p.id) and (p.presence='present' or (p.presence='remote' and (s.rules->>'remote_authorized')::boolean)) and ((s.rules->>'recusal_counts_quorum')::boolean is true or not exists(select 1 from public.uro_recusals r where r.agenda_id=p_agenda and r.participant_id=p.id));
 required:=coalesce((s.rules->>'quorum_count')::integer,total/2+1);
 recusal_unset:=(s.rules->>'recusal_counts_quorum') is null and exists(select 1 from public.uro_recusals where meeting_id=s.id and agenda_id=p_agenda);
 return jsonb_build_object('membership',total,'present',present,'required',required,'satisfied',total>0 and present>=required and not recusal_unset,'recusal_rule_missing',recusal_unset);
end; $$;
create function public.uro_directory() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Active account required.';end if;
 return jsonb_build_object('bodies',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('manage',public.uro_body_manage(b.id)) order by b.name),'[]') from public.uro_bodies b where public.uro_body_read(b.id)),
 'sessions',(select coalesce(jsonb_agg(to_jsonb(s)-'minutes' order by s.scheduled_at desc),'[]') from public.uro_sessions s where public.uro_session_read(s.id)),
 'posts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'state',state) order by name),'[]') from public.posts where public.cvoa_can_manage_post(id)),
 'states',(select coalesce(jsonb_agg(distinct upper(state)),'[]') from public.cvoa_access_scopes(auth.uid()) where role='state_commander'),
 'national',public.is_national_role());
end; $$;
create function public.uro_body_setup(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare candidate_name text; b public.uro_bodies; k text:=p_data->>'jurisdiction'; st text:=upper(p_data->>'state'); po uuid:=(p_data->>'post_id')::uuid; result uuid; m jsonb; body_rules jsonb; begin
 if not public.cvoa_access_enabled() then raise exception 'Active account required.';end if;
 if p_id is null then
 if not (public.is_national_role() or (k='post' and public.cvoa_can_manage_post(po)) or (k='state' and exists(select 1 from public.cvoa_access_scopes(auth.uid()) where role='state_commander' and upper(state)=st))) then raise exception 'Jurisdiction administration required.';end if;
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
create function public.uro_candidates(p_body uuid) returns table(profile_id uuid,member_id uuid,name text,role text) language sql stable security definer set search_path='' as $$
 select p.id,m.id,coalesce(m.full_name,p.full_name),p.role::text from public.uro_bodies b join public.profiles p on true left join public.members m on m.profile_id=p.id
 where b.id=p_body and public.uro_body_manage(b.id) and not p.access_suspended and (exists(select 1 from public.cvoa_access_scopes(p.id) scope where scope.role in ('national_commander','national_staff')) or b.jurisdiction='national' or (b.jurisdiction='post' and (p.post_id=b.post_id or m.post_id=b.post_id or exists(select 1 from public.cvoa_access_scopes(p.id) s where s.post_id=b.post_id))) or (b.jurisdiction='state' and (upper(p.state)=b.state or exists(select 1 from public.posts x where x.id=coalesce(m.post_id,p.post_id) and upper(x.state)=b.state))))
 union all select null::uuid,m.id,m.full_name,'membership' from public.members m join public.uro_bodies b on b.id=p_body left join public.posts x on x.id=m.post_id where m.profile_id is null and public.uro_body_manage(b.id) and (b.jurisdiction='national' or (b.jurisdiction='post' and m.post_id=b.post_id) or (b.jurisdiction='state' and upper(x.state)=b.state));
$$;
create function public.uro_create(p_body uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.uro_bodies; result uuid; dt timestamptz:=(p_data->>'scheduled_at')::timestamptz; begin
 select * into b from public.uro_bodies where id=p_body;
 if not public.uro_body_manage(p_body) then raise exception 'Body administration required.';end if;
 insert into public.uro_sessions(body_id,title,type,scheduled_at,target_end,location,virtual_link,purpose,notice_deadline,packet_deadline,agenda_deadline,amendment_deadline,chair_id,secretary_id,rules,created_by)
 values(p_body,p_data->>'title',p_data->>'type',dt,(p_data->>'target_end')::timestamptz,p_data->>'location',p_data->>'virtual_link',p_data->>'purpose',dt-make_interval(hours=>(b.rules->>'notice_hours')::integer),(p_data->>'packet_deadline')::timestamptz,(p_data->>'agenda_deadline')::timestamptz,(p_data->>'amendment_deadline')::timestamptz,b.chair_id,b.secretary_id,b.rules,auth.uid()) returning id into result;
 insert into public.uro_participants(meeting_id,membership_id,profile_id,name,voting) select result,id,profile_id,name,voting from public.uro_body_members where body_id=p_body and active;
 -- Carry each unresolved agenda item once, using its explicit disposition.
 insert into public.uro_agenda(meeting_id,title,classification,readiness,owner_id,brief,proposed_text,estimated_minutes,source_agenda_id,created_by)
 select result,a.title,a.classification,'needs_information',a.owner_id,a.brief,a.proposed_text,a.estimated_minutes,a.id,auth.uid() from public.uro_agenda a join public.uro_sessions s on s.id=a.meeting_id where s.body_id=p_body and s.ended_at is not null and a.status in ('postponed','referred','tabled','carry_forward') and not exists(select 1 from public.uro_agenda c where c.source_agenda_id=a.id);
 insert into public.uro_agenda(meeting_id,title,classification,brief,created_by) select result,'Follow-up: '||left(a.title,170),'discussion',jsonb_build_object('action_id',a.id,'source_meeting',a.meeting_id),auth.uid() from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id where s.body_id=p_body and a.reporting_required and a.status<>'completed' and not exists(select 1 from public.uro_agenda x where x.meeting_id=result and x.brief->>'action_id'=a.id::text);
 insert into public.uro_events(meeting_id,actor_id,action,detail) values(result,auth.uid(),'MeetingScheduled',jsonb_build_object('rules',b.rules));return result;
end; $$;
-- Generate restrained factual minutes from the same authoritative records.
create function public.uro_minutes(p_session uuid) returns text language sql stable security definer set search_path='' as $$
 select concat_ws(E'\n',s.title,'Body: '||b.name,'Rules: '||(s.rules->>'version'),'Scheduled: '||s.scheduled_at,
 'Called to order: '||coalesce(s.started_at::text,'Not recorded'),
 'Chair: '||coalesce((select full_name from public.profiles where id=s.chair_id),'Unassigned'),
 'Secretary: '||coalesce((select full_name from public.profiles where id=s.secretary_id),'Unassigned'),
 'ATTENDANCE',
 (select string_agg(name||' | '||presence||case when guest then ' | Guest, nonvoting' when voting then ' | Voting roster member' else ' | Nonvoting participant' end||' | Arrival: '||coalesce(arrived_at::text,'Not recorded')||' | Departure: '||coalesce(departed_at::text,'Not recorded'),E'\n' order by name) from public.uro_participants where meeting_id=s.id),
 'Quorum at call to order: '||(select (detail->>'present')||' present; '||(detail->>'required')||' required' from public.uro_events where meeting_id=s.id and action='MeetingCalledToOrder' order by id limit 1),
 'NOTICES',
 (select string_agg(method||' | '||sent_at::text||' | Recipients recorded: '||cardinality(recipient_ids)||' | '||evidence,E'\n' order by sent_at) from public.uro_notices where meeting_id=s.id),
 'AGENDA AND REPORTS',
 (select string_agg(title||' | '||classification||' | Disposition: '||status||case when classification='information' then ' | Written report: '||case when length(trim(coalesce(report_body,'')))>0 then 'received' else 'not recorded' end else '' end,E'\n' order by sort_order,created_at) from public.uro_agenda where meeting_id=s.id),
 'MOTIONS AND RESULTS',
 (select string_agg(identifier||' | '||kind||E'\nOriginal text: '||original_text||E'\nFinal question: '||current_text||E'\nMaker: '||coalesce((select full_name from public.profiles where id=p.maker_id),'Not recorded')||' | Second: '||case when second_exempt then 'Committee/consent exemption' else coalesce((select full_name from public.profiles where id=p.second_id),'Not recorded') end||E'\nDisposition: '||status||' | Threshold: '||threshold||' of eligible members present'||case when result is not null then E'\nResult: Yes '||(result->>'yes')||'; No '||(result->>'no')||'; Abstain '||(result->>'abstain')||'; Not cast '||(result->>'not_cast')||'; Eligible present '||(result->>'denominator')||'; Required '||(result->>'required') else '' end,E'\n\n' order by created_at) from public.uro_proposals p where meeting_id=s.id),
 'PROCEDURAL MATTERS',
 (select string_agg(kind||' | '||body||' | Rule: '||coalesce(rule,'Not specified')||' | Ruling: '||coalesce(ruling,'Not recorded')||' | Disposition: '||disposition,E'\n' order by created_at) from public.uro_challenges where meeting_id=s.id),
 'RECUSALS',
 (select string_agg(p.name||' | '||r.reason,E'\n' order by r.declared_at) from public.uro_recusals r join public.uro_participants p on p.id=r.participant_id where r.meeting_id=s.id),
 'ASSIGNMENTS',
 (select string_agg(title||' | Owner: '||coalesce((select full_name from public.profiles where id=a.owner_id),'Unassigned')||' | Due: '||coalesce(due_date::text,'Unset')||' | Reporting required: '||reporting_required,E'\n' order by created_at) from public.uro_actions a where meeting_id=s.id),
 'SUPPORTING DOCUMENTS',
 (select string_agg(label||' | Document identifier: '||item_id,E'\n') from public.uro_documents where meeting_id=s.id),
 'Recess time excluded: '||s.recess_seconds||' seconds',
 'Adjourned: '||coalesce(s.ended_at::text,'Not recorded'),
 'The official event log preserves procedural chronology and later execution updates. This record excludes private working notes.')
 from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where s.id=p_session;
$$;
create function public.uro_command(p_session uuid,p_action text,p_data jsonb,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare s public.uro_sessions; p public.uro_proposals; a public.uro_agenda; me public.uro_participants; chair boolean; clerk boolean; manager boolean; voter boolean; q jsonb; result uuid:=p_session; event text; detail jsonb:=p_data; n integer; yes integer; no integer; abstain integer; required integer; passed boolean; target uuid; ids uuid[]; previous jsonb; rowdata jsonb; kind text; threshold text; begin
 select * into s from public.uro_sessions where id=p_session for update;
 if not found or not public.uro_session_read(s.id) then raise exception 'Meeting access required.';end if;
 if s.version is distinct from p_version then raise exception 'Meeting changed in another session. Refresh before acting.';end if;
 chair:=coalesce(s.chair_id=auth.uid(),false);clerk:=coalesce(s.secretary_id=auth.uid(),false);manager:=public.uro_body_manage(s.body_id);
 select * into me from public.uro_participants where meeting_id=s.id and profile_id=auth.uid() order by voting desc limit 1;
 voter:=coalesce(public.uro_participant_active(me.id),false);q:=public.uro_quorum(s.id,s.current_agenda_id);
 if s.phase='archive' and p_action not in ('correct_record','action_update','minutes_approve','note','publish_record','challenge','review_packet') then raise exception 'Archived meeting is protected. Use an auditable correction.';end if;
 if p_action not in ('note','action_update','correct_record','minutes_approve','certify','publish_record','challenge','review_packet') and s.ended_at is not null then raise exception 'Meeting is adjourned.';end if;
 if coalesce(p_data->>'owner_id',p_data->'context'->>'owner_id') is not null and not exists(select 1 from public.uro_participants where meeting_id=s.id and profile_id=coalesce(p_data->>'owner_id',p_data->'context'->>'owner_id')::uuid) then raise exception 'Choose an owner from this meeting participant roster.';end if;
 case p_action
 when 'edit_setup' then
   if not (chair or clerk or manager) or s.started_at is not null then raise exception 'Preparation authority required.';end if;
   previous:=to_jsonb(s);update public.uro_sessions set title=coalesce(p_data->>'title',title),scheduled_at=coalesce((p_data->>'scheduled_at')::timestamptz,scheduled_at),target_end=(p_data->>'target_end')::timestamptz,location=p_data->>'location',virtual_link=p_data->>'virtual_link',purpose=p_data->>'purpose',packet_deadline=(p_data->>'packet_deadline')::timestamptz,agenda_deadline=(p_data->>'agenda_deadline')::timestamptz,amendment_deadline=(p_data->>'amendment_deadline')::timestamptz,notice_deadline=coalesce((p_data->>'scheduled_at')::timestamptz,scheduled_at)-make_interval(hours=>(rules->>'notice_hours')::int) where id=s.id;event:='MeetingPreparationUpdated';detail:=jsonb_build_object('previous',previous,'new',p_data);
 when 'refresh_roster' then
   if not (chair or clerk or manager) or s.started_at is not null then raise exception 'Roster is frozen after call to order.';end if;
   update public.uro_sessions x set rules=b.rules,chair_id=b.chair_id,secretary_id=b.secretary_id from public.uro_bodies b where b.id=x.body_id and x.id=s.id;
   delete from public.uro_participants where meeting_id=s.id and membership_id is not null and membership_id not in(select id from public.uro_body_members where body_id=s.body_id and active);
   insert into public.uro_participants(meeting_id,membership_id,profile_id,name,voting) select s.id,id,profile_id,name,voting from public.uro_body_members where body_id=s.body_id and active on conflict(meeting_id,membership_id) do update set name=excluded.name,voting=excluded.voting,profile_id=excluded.profile_id;event:='RosterPrepared';
 when 'agenda' then
   if not (voter or chair or clerk) then raise exception 'Agenda submission authority required.';end if;
   if s.started_at is not null and not chair then raise exception 'Chair must admit new live matters.';end if;
   if s.agenda_deadline<now() and not chair then raise exception 'Agenda deadline passed; ask the Chair to admit this item.';end if;
   if s.started_at is not null and length(trim(coalesce(p_data->>'late_reason','')))=0 then raise exception 'Explain why this matter was not prepared.';end if;
   if p_data->>'id' is null then
   insert into public.uro_agenda(meeting_id,title,classification,readiness,owner_id,brief,proposed_text,estimated_minutes,report_body,created_by,sort_order) values(s.id,p_data->>'title',p_data->>'classification',coalesce(p_data->>'readiness','draft'),(p_data->>'owner_id')::uuid,coalesce(p_data->'brief','{}'),p_data->>'proposed_text',coalesce((p_data->>'estimated_minutes')::int,10),p_data->>'report_body',auth.uid(),(select count(*) from public.uro_agenda where meeting_id=s.id)) returning id into result;
   else select * into a from public.uro_agenda where id=(p_data->>'id')::uuid and meeting_id=s.id;if not found or not (chair or clerk or (a.created_by=auth.uid() and s.started_at is null)) then raise exception 'Agenda editing authority required.';end if;
   previous:=to_jsonb(a);update public.uro_agenda set title=p_data->>'title',classification=p_data->>'classification',readiness=coalesce(p_data->>'readiness','draft'),owner_id=(p_data->>'owner_id')::uuid,brief=coalesce(p_data->'brief','{}'),proposed_text=p_data->>'proposed_text',estimated_minutes=coalesce((p_data->>'estimated_minutes')::int,10),report_body=p_data->>'report_body' where id=a.id;result:=a.id; end if;event:='AgendaPrepared';detail:=jsonb_build_object('id',result,'previous',previous,'new',p_data);
 when 'review_packet' then
   if me.id is null then raise exception 'Participant required.';end if;
   insert into public.uro_reviews(meeting_id,profile_id,state) values(s.id,auth.uid(),p_data->>'state') on conflict(meeting_id,profile_id) do update set state=excluded.state,reviewed_at=now();event:='PacketReviewed';
 when 'question' then
   if me.id is null then raise exception 'Participant required.';end if;
   if p_data->>'agenda_id' is not null and not exists(select 1 from public.uro_agenda where id=(p_data->>'agenda_id')::uuid and meeting_id=s.id) then raise exception 'Agenda item must belong to this meeting.';end if;
   insert into public.uro_questions(meeting_id,agenda_id,author_id,kind,body) values(s.id,(p_data->>'agenda_id')::uuid,auth.uid(),coalesce(p_data->>'kind','question'),p_data->>'body') returning id into result;event:='QuestionSubmitted';detail:=jsonb_build_object('question_id',result);
 when 'answer' then
   if not (chair or clerk) then raise exception 'Chair or Secretary required.';end if;
   update public.uro_questions set answer=p_data->>'answer',answered_by=auth.uid() where id=(p_data->>'id')::uuid and meeting_id=s.id;event:='QuestionResolved';
 when 'attach_document' then
   if not (chair or clerk or voter) then raise exception 'Document submission authority required.';end if;
   if public.cvoa_drive_item_level((p_data->>'item_id')::uuid)<1 or not public.cvoa_drive_item_live((p_data->>'item_id')::uuid) then raise exception 'Available document access required.';end if;
   if p_data->>'agenda_id' is not null and not exists(select 1 from public.uro_agenda where id=(p_data->>'agenda_id')::uuid and meeting_id=s.id) then raise exception 'Agenda item must belong to this meeting.';end if;
   insert into public.uro_documents(meeting_id,agenda_id,item_id,label,created_by) values(s.id,(p_data->>'agenda_id')::uuid,(p_data->>'item_id')::uuid,p_data->>'label',auth.uid()) returning id into result;event:='PacketDocumentLinked';
 when 'record_notice' then
   if not (chair or clerk) then raise exception 'Chair or Secretary required.';end if;
   if length(trim(coalesce(p_data->>'evidence','')))=0 or (p_data->>'sent_at')::timestamptz>now() then raise exception 'Record actual delivery evidence and time.';end if;
   insert into public.uro_notices(meeting_id,recipient_ids,revision,method,sent_at,sender_id,evidence,deadline) values(s.id,array(select id from public.uro_participants where meeting_id=s.id),s.notice_revision,p_data->>'method',(p_data->>'sent_at')::timestamptz,auth.uid(),p_data->>'evidence',s.notice_deadline) returning id into result;event:='NoticeRecorded';
 when 'packet_ready' then
   if not (chair or clerk) or s.phase<>'prepare' then raise exception 'Preparation authority required.';end if;
   update public.uro_sessions set phase='review',state='packet_review' where id=s.id;event:='PacketReviewOpened';
 when 'rsvp' then
   if me.id is null then raise exception 'Participant required.';end if;
   update public.uro_participants set rsvp=p_data->>'state' where id=me.id;event:='ParticipationResponded';
 when 'guest' then
   if not (chair or clerk) then raise exception 'Attendance authority required.';end if;
   insert into public.uro_participants(meeting_id,name,guest,voting) values(s.id,p_data->>'name',true,false) returning id into result;event:='GuestRegistered';
 when 'attendance' then
   target:=(p_data->>'id')::uuid;
   if not exists(select 1 from public.uro_participants where id=target and meeting_id=s.id and (chair or clerk or id=me.id)) then raise exception 'Attendance authority required.';end if;
   if p_data->>'presence'='remote' and not (s.rules->>'remote_authorized')::boolean then raise exception 'Remote participation has not been authorized for this body.';end if;
   if exists(select 1 from public.uro_proposals where meeting_id=s.id and status in ('voting','consent_open')) then raise exception 'Close or cancel the open vote before changing attendance.';end if;
   select to_jsonb(x) into previous from public.uro_participants x where id=target;
   update public.uro_participants set presence=p_data->>'presence',arrived_at=case when p_data->>'presence' in ('present','remote') then coalesce(arrived_at,now()) else arrived_at end,departed_at=case when p_data->>'presence' in ('left','away') then now() else departed_at end where id=target;event:='AttendanceChanged';detail:=jsonb_build_object('previous',previous,'new',p_data,'quorum_after',public.uro_quorum(s.id,s.current_agenda_id));
 when 'start' then
   if not chair or s.phase not in ('prepare','review') or s.started_at is not null then raise exception 'Assigned Chair may call the meeting to order.';end if;
   if not coalesce((s.rules->>'configured')::boolean,false) then raise exception 'Confirm governing-body rules and voting roster before call to order.';end if;
   if s.type='emergency' and length(trim(coalesce(s.purpose,'')))=0 then raise exception 'Emergency justification required.';end if;
   update public.uro_sessions set phase='meet',state=case when (q->>'satisfied')::boolean then 'clarification' else 'quorum_lost' end,started_at=now() where id=s.id;event:='MeetingCalledToOrder';detail:=q;
 when 'open_item' then
   if not chair or s.phase<>'meet' or s.recess_started_at is not null or exists(select 1 from public.uro_proposals where meeting_id=s.id and status in ('voting','consent_open','amendment_pending','introduced','before_body')) or exists(select 1 from public.uro_challenges where meeting_id=s.id and disposition='challenged') then raise exception 'Resolve pending procedure before opening another item.';end if;
   select * into a from public.uro_agenda where id=(p_data->>'id')::uuid and meeting_id=s.id;if not found then raise exception 'Agenda item not found.';end if;
   if a.readiness<>'ready_for_decision' and a.classification in ('decision','emergency') and length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Record a reason for advancing an unprepared decision.';end if;
   update public.uro_sessions set current_agenda_id=a.id,state='clarification' where id=s.id;update public.uro_agenda set status='open' where id=a.id;event:='AgendaItemOpened';
 when 'stage' then
   if not chair or s.phase<>'meet' or s.recess_started_at is not null or p_data->>'state' not in ('clarification','deliberation','amendments','final_question','action_review','member_floor') or exists(select 1 from public.uro_proposals where meeting_id=s.id and status in ('voting','consent_open')) or exists(select 1 from public.uro_challenges where meeting_id=s.id and disposition='challenged') then raise exception 'Procedural state transition unavailable.';end if;
   if p_data->>'state'='final_question' and exists(select 1 from public.uro_floor where meeting_id=s.id and agenda_id is not distinct from s.current_agenda_id and status='waiting') and not exists(select 1 from public.uro_proposals where meeting_id=s.id and kind='close_debate' and status='adopted' and agenda_id=s.current_agenda_id) then raise exception 'Members still seek the floor. Resolve debate through URO before the final question.';end if;
   update public.uro_sessions set state=p_data->>'state' where id=s.id;event:='ProceduralStageChanged';
 when 'floor_request' then
   if me.id is null or s.phase<>'meet' or s.recess_started_at is not null or me.presence not in ('present','remote') then raise exception 'Present participant required.';end if;
   if exists(select 1 from public.uro_floor where meeting_id=s.id and participant_id=me.id and status in ('waiting','recognized')) then raise exception 'You are already in the floor queue.';end if;
   insert into public.uro_floor(meeting_id,agenda_id,participant_id,seconds_allowed) values(s.id,s.current_agenda_id,me.id,coalesce((s.rules->>'speaking_seconds')::int,120)) returning id into result;event:='FloorRequested';detail:=jsonb_build_object('participant',me.id);
 when 'recognize' then
   if not chair or s.phase<>'meet' or s.recess_started_at is not null or s.state not in ('clarification','deliberation','amendments','member_floor','procedure') then raise exception 'Chair recognition is unavailable at this stage.';end if;
   if exists(select 1 from public.uro_floor where meeting_id=s.id and status='recognized') then raise exception 'The current speaker must yield first.';end if;
   update public.uro_floor set status='recognized',recognized_at=now() where id=(p_data->>'id')::uuid and meeting_id=s.id and status='waiting';if not found then raise exception 'Waiting speaker not found.';end if;event:='MemberRecognized';
 when 'yield' then
   update public.uro_floor set status='yielded',yielded_at=now() where id=(p_data->>'id')::uuid and meeting_id=s.id and status in ('waiting','recognized') and (chair or participant_id=me.id);if not found then raise exception 'Floor authority required.';end if;event:='FloorYielded';
 when 'extend_floor' then
   if not chair or not exists(select 1 from public.uro_proposals where meeting_id=s.id and agenda_id is not distinct from s.current_agenda_id and kind='extend_debate' and status='adopted') then raise exception 'Adopt an extension before extending floor time.';end if;
   update public.uro_floor set seconds_allowed=seconds_allowed+300 where id=(p_data->>'id')::uuid and meeting_id=s.id and status='recognized';event:='FloorExtended';
 when 'propose' then
   kind:=p_data->>'kind';
   if not voter and not (chair and kind='consent') then raise exception 'Voting member required to propose a motion.';end if;
   if s.started_at is not null and (s.recess_started_at is not null or s.phase<>'meet' or me.presence not in ('present','remote') or not (q->>'satisfied')::boolean) and not (chair and kind='consent') then raise exception 'Present voting member and quorum required.';end if;
   if s.amendment_deadline<now() and s.started_at is null and kind='amendment' then raise exception 'Amendment submission deadline passed.';end if;
   target:=(p_data->>'parent_id')::uuid;
   if target is not null then select * into p from public.uro_proposals where id=target and meeting_id=s.id;if not found then raise exception 'Parent motion must belong to this meeting.';end if;end if;
   if kind='amendment' and (target is null or p.kind='amendment' or p.status not in ('draft','introduced','before_body','deliberation','ready_for_vote') or exists(select 1 from public.uro_proposals where parent_id=target and status not in ('adopted','defeated','withdrawn','out_of_order'))) then raise exception 'One amendment to the main motion may be pending at a time.';end if;
   if kind='reconsider' and (target is null or p.closed_at is null or p.status not in ('adopted','defeated') or not exists(select 1 from public.uro_ballots where proposal_id=target and round=p.vote_round and participant_id=me.id and choice=case when p.status='adopted' then 'yes' else 'no' end)) then raise exception 'Reconsideration requires evidence that the maker voted on the prevailing side in this meeting.';end if;
   if kind in ('emergency_override','suspend_rule') and (length(trim(coalesce(p_data->'context'->>'rule','')))=0 or length(trim(coalesce(p_data->'context'->>'authority','')))=0 or not coalesce((p_data->'context'->>'suspendable')::boolean,false)) then raise exception 'Identify a suspendable URO rule and controlling authority. Law, quorum and superior rights cannot be suspended.';end if;
   if kind='chair_challenge' and not exists(select 1 from public.uro_challenges where id=(p_data->'context'->>'challenge_id')::uuid and meeting_id=s.id and ruling is not null) then raise exception 'Identify an existing Chair ruling.';end if;
   if p_data->'context'->>'approves_minutes_id' is not null and not exists(select 1 from public.uro_sessions x where x.id=(p_data->'context'->>'approves_minutes_id')::uuid and x.body_id=s.body_id and x.minutes_state='certified' and x.ended_at<s.started_at) then raise exception 'Select certified prior minutes of this governing body.';end if;
   if kind='uro_amendment' and not coalesce((p_data->'context'->>'prior_notice_confirmed')::boolean,false) then raise exception 'Confirm the required prior regular-meeting notice or superior adoption rule.';end if;
   threshold:=case when kind in ('close_debate','chair_challenge','emergency_override','suspend_rule','uro_amendment') then 'two_thirds' else 'majority' end;
   if p_data->>'agenda_id' is not null and not exists(select 1 from public.uro_agenda where id=(p_data->>'agenda_id')::uuid and meeting_id=s.id) then raise exception 'Agenda item must belong to this meeting.';end if;
   insert into public.uro_proposals(meeting_id,agenda_id,parent_id,identifier,kind,original_text,current_text,maker_id,context,threshold,second_exempt)
   values(s.id,coalesce((p_data->>'agenda_id')::uuid,s.current_agenda_id),target,(select case jurisdiction when 'national' then 'NCC' when 'state' then state else 'POST' end from public.uro_bodies where id=s.body_id)||'-'||extract(year from s.scheduled_at)::text||'-'||lpad(nextval('public.uro_proposal_number')::text,6,'0'),kind,p_data->>'text',case when kind='chair_challenge' then 'Shall the ruling of the Chair be sustained?' else p_data->>'text' end,auth.uid(),coalesce(p_data->'context','{}'),threshold,kind='consent' or (coalesce((p_data->'context'->>'committee_recommendation')::boolean,false) and exists(select 1 from public.uro_body_members where id=me.membership_id and committee_chair) and coalesce((p_data->'context'->>'committee_voting_members')::int,0)>1)) returning id into result;event:='MotionProposed';
 when 'second' then
   if not voter then raise exception 'Voting member required.';end if;
   select * into p from public.uro_proposals where id=(p_data->>'id')::uuid and meeting_id=s.id;
   if not found or p.maker_id=auth.uid() or p.status not in ('draft','introduced') or p.second_id is not null then raise exception 'A different voting member must second a pending proposal.';end if;
   update public.uro_proposals set second_id=auth.uid() where id=p.id;event:='MotionSeconded';
 when 'introduce' then
   if not chair or s.phase<>'meet' or s.recess_started_at is not null or not (q->>'satisfied')::boolean then raise exception 'Chair and quorum required.';end if;
   select * into p from public.uro_proposals where id=(p_data->>'id')::uuid and meeting_id=s.id;
   if not found or p.status<>'draft' then raise exception 'Draft motion required.';end if;
   if p.kind='main' and exists(select 1 from public.uro_proposals where meeting_id=s.id and kind='main' and status in ('introduced','before_body','deliberation','ready_for_vote','voting')) then raise exception 'Resolve the pending main motion first.';end if;
   if p.kind='amendment' and length(trim(coalesce(p_data->>'germaneness_reason','')))=0 then raise exception 'Chair must record why the amendment is germane.';end if;
   update public.uro_proposals set status=case when second_id is null and not second_exempt then 'introduced' else 'before_body' end where id=p.id;
   if p.kind='chair_challenge' then update public.uro_challenges set disposition='challenged',proposal_id=p.id,resume_state=s.state where id=(p.context->>'challenge_id')::uuid;update public.uro_sessions set state='procedure' where id=s.id;end if;event:='MotionIntroduced';
 when 'dispose' then
   select * into p from public.uro_proposals where id=(p_data->>'id')::uuid and meeting_id=s.id;
   if not found then raise exception 'Motion not found.';end if;
   if p_data->>'status'='withdrawn' and p.status='draft' and p.maker_id=auth.uid() then null;
   elsif not chair or (p_data->>'status' not in ('out_of_order','unseconded') or length(trim(coalesce(p_data->>'reason','')))=0 or p.status in ('adopted','defeated','voting','consent_open') or (p_data->>'status'='unseconded' and (p.second_id is not null or p.second_exempt))) then raise exception 'Record a permitted disposition or use the body consent procedure.';end if;
   update public.uro_proposals set status=p_data->>'status',closed_at=now() where id=p.id;event:='MotionDisposed';
 when 'consent_remove' then
   if not voter or me.presence not in ('present','remote') then raise exception 'Present voting member required.';end if;
   if exists(select 1 from public.uro_proposals where meeting_id=s.id and kind='consent' and status='consent_open') then raise exception 'Object to the open consent action first; then remove the item.';end if;
   update public.uro_agenda set classification='decision',requested_discussion=true where id=(p_data->>'id')::uuid and meeting_id=s.id and classification='consent' and status='pending';if not found then raise exception 'Pending consent item required.';end if;event:='ConsentItemRemoved';detail:=jsonb_build_object('id',p_data->>'id');
 when 'open_vote' then
   if not chair or s.phase<>'meet' or s.recess_started_at is not null then raise exception 'Assigned Chair and active meeting required.';end if;
   select * into p from public.uro_proposals where id=(p_data->>'id')::uuid and meeting_id=s.id;
   if not found or p.status not in ('introduced','before_body') or (p.second_id is null and not p.second_exempt) then raise exception 'Introduce and second this motion before voting.';end if;
   if p.kind not in ('consent','chair_challenge','close_debate') and s.state<>'final_question' then raise exception 'Display the final question before opening this vote.';end if;
   if exists(select 1 from public.uro_proposals where meeting_id=s.id and status in ('voting','consent_open')) then raise exception 'Only one vote may be open.';end if;
   if p.kind='main' and exists(select 1 from public.uro_proposals where parent_id=p.id and kind='amendment' and status not in ('adopted','defeated','withdrawn','out_of_order','unseconded')) then raise exception 'Resolve the pending amendment first.';end if;
   if exists(select 1 from public.uro_challenges where meeting_id=s.id and disposition='challenged' and proposal_id<>p.id) then raise exception 'Resolve the Chair challenge first.';end if;
   q:=public.uro_quorum(s.id,p.agenda_id);if not (q->>'satisfied')::boolean then raise exception 'Quorum is not satisfied or recusal treatment is unconfigured.';end if;
   select array_agg(x.id order by x.id) into ids from public.uro_participants x where x.meeting_id=s.id and public.uro_participant_active(x.id) and (x.presence='present' or (x.presence='remote' and (s.rules->>'remote_authorized')::boolean)) and not exists(select 1 from public.uro_recusals r where r.agenda_id=p.agenda_id and r.participant_id=x.id);
   if coalesce(cardinality(ids),0)=0 then raise exception 'Eligible voters must be present.';end if;
   update public.uro_proposals set vote_round=vote_round+1,closed_at=null,result=null,electorate=ids,eligible_present=cardinality(ids),quorum_snapshot=q,method=p_data->>'method',status=case when p_data->>'unanimous_consent'='true' then 'consent_open' else 'voting' end,opened_at=now() where id=p.id;
   update public.uro_sessions set state='vote' where id=s.id;event:='VoteOpened';detail:=jsonb_build_object('proposal',p.id,'eligible_present',cardinality(ids),'quorum',q,'method',p_data->>'method');
 when 'vote' then
   select * into p from public.uro_proposals where id=(p_data->>'id')::uuid and meeting_id=s.id;
   if not found or p.status<>'voting' or p.method not in ('digital','secret') or not voter or not me.id=any(p.electorate) or me.presence not in ('present','remote') then raise exception 'Open digital vote and eligible present participant required.';end if;
   insert into public.uro_ballots(proposal_id,participant_id,round,choice) values(p.id,me.id,p.vote_round,p_data->>'choice') on conflict(proposal_id,participant_id,round) do update set choice=excluded.choice,cast_at=now();event:='VoteCast';detail:=jsonb_build_object('proposal',p.id); -- Never place a secret choice in the public audit log.
 when 'record_ballot' then
   if not chair then raise exception 'Chair must attest assisted roll-call entries.';end if;
   select * into p from public.uro_proposals where id=(p_data->>'id')::uuid and meeting_id=s.id;
   target:=(p_data->>'participant_id')::uuid;
   if not found or p.status<>'voting' or p.method<>'roll_call' or not coalesce(target=any(p.electorate),false) or not public.uro_participant_active(target) then raise exception 'Open roll-call and eligible participant required.';end if;
   insert into public.uro_ballots(proposal_id,participant_id,round,choice) values(p.id,target,p.vote_round,p_data->>'choice') on conflict(proposal_id,participant_id,round) do update set choice=excluded.choice,cast_at=now();event:='RollCallRecorded';
 when 'object' then
   select * into p from public.uro_proposals where id=(p_data->>'id')::uuid and meeting_id=s.id;
   if not found or p.status<>'consent_open' or not voter or not me.id=any(p.electorate) then raise exception 'Eligible member and open unanimous-consent action required.';end if;
   update public.uro_proposals set status='before_body',opened_at=null,electorate=null,eligible_present=null,method=null where id=p.id;update public.uro_sessions set state='deliberation' where id=s.id;event:='UnanimousConsentObjected';detail:=jsonb_build_object('proposal',p.id);
 when 'cancel_vote' then
   if not chair or length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Chair must record why the vote is canceled.';end if;
   update public.uro_proposals set status='before_body',result=null where id=(p_data->>'id')::uuid and meeting_id=s.id and status in ('voting','consent_open');if not found then raise exception 'Open vote required.';end if;
   -- Preserve canceled rounds; a reopened vote receives a fresh round.
   update public.uro_sessions set state='deliberation' where id=s.id;event:='VoteCanceled';
 when 'close_vote' then
   if not chair or s.phase<>'meet' then raise exception 'Chair required to announce the result.';end if;
   select * into p from public.uro_proposals where id=(p_data->>'id')::uuid and meeting_id=s.id;
   if not found or p.status not in ('voting','consent_open') then raise exception 'Open vote required.';end if;
   q:=public.uro_quorum(s.id,p.agenda_id);if not (q->>'satisfied')::boolean then raise exception 'Quorum was lost. Cancel this vote and restore participation.';end if;
   if exists(select 1 from unnest(p.electorate) x where not public.uro_participant_active(x) or not exists(select 1 from public.uro_participants where id=x and presence in ('present','remote'))) then raise exception 'Eligibility changed after opening. Cancel and reopen with a current electorate.';end if;
   if p.status='consent_open' then
    if now()<p.opened_at+interval '15 seconds' then raise exception 'Allow a reasonable opportunity to object before closing consent.';end if;
    if not coalesce((p_data->>'opportunity_confirmed')::boolean,false) then raise exception 'Confirm all participants had a reasonable opportunity to object.';end if;
    yes:=p.eligible_present;no:=0;abstain:=0;passed:=true;required:=p.eligible_present;
   else
    if p.method in ('digital','secret','roll_call') then select count(*) filter(where choice='yes'),count(*) filter(where choice='no'),count(*) filter(where choice='abstain') into yes,no,abstain from public.uro_ballots where proposal_id=p.id and round=p.vote_round;
    else yes:=(p_data->>'yes')::int;no:=(p_data->>'no')::int;abstain:=(p_data->>'abstain')::int;end if;
    if yes is null or no is null or abstain is null or least(yes,no,abstain)<0 or yes+no+abstain>p.eligible_present then raise exception 'Vote counts must be nonnegative and fit the frozen electorate.';end if;
    if yes+no+abstain<p.eligible_present and not coalesce((p_data->>'opportunity_confirmed')::boolean,false) then raise exception 'Some eligible voters have not voted. Confirm opportunity or keep the vote open.';end if;
    required:=case p.threshold when 'two_thirds' then (2*p.eligible_present+2)/3 when 'unanimous' then p.eligible_present else p.eligible_present/2+1 end;
    passed:=case when p.kind='chair_challenge' then no>=required else yes>=required end;
   end if;
   rowdata:=jsonb_build_object('round',p.vote_round,'yes',yes,'no',no,'abstain',abstain,'not_cast',p.eligible_present-yes-no-abstain,'required',required,'denominator',p.eligible_present,'rule_version',s.rules->>'version','unanimous_consent',p.status='consent_open');
   update public.uro_proposals set status=case when passed then 'adopted' else 'defeated' end,result=rowdata,closed_at=now() where id=p.id;
   if passed then
    insert into public.uro_decisions(meeting_id,proposal_id,identifier,text,authorized_amount) values(s.id,p.id,p.identifier,p.current_text,(p.context->>'authorized_amount')::numeric) returning id into result;
    if p.kind='amendment' then update public.uro_proposals set current_text=p.current_text where id=p.parent_id;end if;
    if p.kind in ('refer','postpone','table') then update public.uro_agenda set status=case p.kind when 'refer' then 'referred' when 'postpone' then 'postponed' else 'tabled' end where id=p.agenda_id;update public.uro_proposals set status=case p.kind when 'refer' then 'referred' when 'postpone' then 'postponed' else 'tabled' end where id=p.parent_id and meeting_id=s.id;end if;
    if p.kind='main' then update public.uro_agenda set status='decided' where id=p.agenda_id;end if;
    if p.kind='consent' then update public.uro_agenda set status='decided' where meeting_id=s.id and classification='consent' and status='pending';end if;
    if p.kind='withdraw' then update public.uro_proposals set status='withdrawn' where id=p.parent_id and meeting_id=s.id;end if;
    if p.kind='reconsider' then update public.uro_proposals set status='before_body',result=null where id=p.parent_id and meeting_id=s.id;end if;
    if coalesce((p.context->>'action_required')::boolean,false) or p.kind='refer' then insert into public.uro_actions(meeting_id,decision_id,title,owner_id,due_date,reporting_required) values(s.id,result,coalesce(p.context->>'action_title',p.current_text),(p.context->>'owner_id')::uuid,(p.context->>'due_date')::date,p.kind='refer' or coalesce((p.context->>'reporting_required')::boolean,false));end if;
   end if;
   if p.kind='chair_challenge' then
    update public.uro_challenges set disposition=case when passed then 'overturned' else 'sustained' end where proposal_id=p.id;
    update public.uro_sessions set state=coalesce((select resume_state from public.uro_challenges where proposal_id=p.id),'deliberation') where id=s.id;
   else update public.uro_sessions set state='deliberation' where id=s.id;end if;
   event:='VoteCertified';detail:=jsonb_build_object('proposal',p.id,'result',rowdata,'outcome',case when passed then 'adopted' else 'defeated' end,'decision',case when passed then result else null end);
 when 'recuse' then
   if not voter or s.current_agenda_id is null then raise exception 'Voting member and current agenda required.';end if;
   if exists(select 1 from public.uro_proposals where meeting_id=s.id and status in ('voting','consent_open')) then raise exception 'Cancel the open vote before recording a recusal.';end if;
   insert into public.uro_recusals(meeting_id,agenda_id,participant_id,reason) values(s.id,s.current_agenda_id,me.id,p_data->>'reason') on conflict(agenda_id,participant_id) do nothing;event:='RecusalDeclared';detail:=jsonb_build_object('participant',me.id,'agenda',s.current_agenda_id,'reason',p_data->>'reason');
 when 'challenge' then
   if me.id is null then raise exception 'Participant required.';end if;
   insert into public.uro_challenges(meeting_id,author_id,kind,body,rule,remedy) values(s.id,auth.uid(),p_data->>'kind',p_data->>'body',p_data->>'rule',p_data->>'remedy') returning id into result;event:='ProcedureRaised';
 when 'rule' then
   if not chair then raise exception 'Assigned Chair required.';end if;
   update public.uro_challenges set ruling=p_data->>'ruling',ruled_by=auth.uid(),disposition='ruled' where id=(p_data->>'id')::uuid and meeting_id=s.id and disposition='pending';if not found then raise exception 'Pending procedure required.';end if;event:='ChairRulingIssued';
 when 'recess' then
   if not chair or s.phase<>'meet' or s.recess_started_at is not null or exists(select 1 from public.uro_proposals where meeting_id=s.id and status in ('voting','consent_open')) then raise exception 'Chair may recess after resolving open voting.';end if;
   update public.uro_sessions set recess_started_at=now() where id=s.id;event:='RecessStarted';
 when 'resume' then
   if not chair or s.recess_started_at is null then raise exception 'Chair and recessed meeting required.';end if;
   update public.uro_floor set recognized_at=recognized_at+(now()-s.recess_started_at) where meeting_id=s.id and status='recognized';
   update public.uro_sessions set recess_seconds=recess_seconds+greatest(0,extract(epoch from now()-recess_started_at)::int),recess_started_at=null where id=s.id;event:='RecessEnded';
 when 'complete_item' then
   if not chair or s.phase<>'meet' or exists(select 1 from public.uro_proposals where meeting_id=s.id and agenda_id=s.current_agenda_id and status in ('introduced','before_body','voting','consent_open')) then raise exception 'Resolve pending business first.';end if;
   update public.uro_agenda set status=case when status in ('decided','postponed','referred','tabled') then status else 'completed' end where id=s.current_agenda_id;event:='AgendaItemCompleted';
 when 'action' then
   if not (chair or clerk) then raise exception 'Assignment authority required.';end if;
   if p_data->>'decision_id' is not null and not exists(select 1 from public.uro_decisions where id=(p_data->>'decision_id')::uuid and meeting_id=s.id) then raise exception 'Decision must belong to this meeting.';end if;
   insert into public.uro_actions(meeting_id,decision_id,title,owner_id,due_date,priority,reporting_required) values(s.id,(p_data->>'decision_id')::uuid,p_data->>'title',(p_data->>'owner_id')::uuid,(p_data->>'due_date')::date,coalesce(p_data->>'priority','normal'),coalesce((p_data->>'reporting_required')::boolean,false)) returning id into result;event:='ActionAssigned';
 when 'action_update' then
   select to_jsonb(x) into previous from public.uro_actions x where id=(p_data->>'id')::uuid and meeting_id=s.id and (chair or clerk or owner_id=auth.uid());if previous is null then raise exception 'Action owner or record authority required.';end if;
   update public.uro_actions set status=p_data->>'status',progress=p_data->>'progress',evidence=p_data->>'evidence',owner_id=case when chair or clerk then (p_data->>'owner_id')::uuid else owner_id end,due_date=case when chair or clerk then (p_data->>'due_date')::date else due_date end,updated_at=now() where id=(p_data->>'id')::uuid;event:='ActionUpdated';detail:=jsonb_build_object('previous',previous,'new',p_data);
 when 'adjourn' then
   if not chair or s.phase<>'meet' or exists(select 1 from public.uro_proposals where meeting_id=s.id and status in ('voting','consent_open')) or exists(select 1 from public.uro_challenges where meeting_id=s.id and disposition='challenged') then raise exception 'Resolve open votes and challenges before adjournment.';end if;
   if not coalesce((p_data->>'action_review_confirmed')::boolean,false) then raise exception 'Confirm assignments were reviewed before adjournment.';end if;
   update public.uro_agenda set status='carry_forward' where meeting_id=s.id and status in ('pending','open') and classification<>'information';
   update public.uro_sessions set phase='execute',state='post_meeting_review',ended_at=now(),recess_seconds=recess_seconds+case when recess_started_at is null then 0 else greatest(0,extract(epoch from now()-recess_started_at)::int) end,recess_started_at=null where id=s.id;event:='MeetingAdjourned';
 when 'certify' then
   if not clerk or s.phase<>'execute' or s.minutes_state<>'draft' then raise exception 'Assigned Secretary must review and certify the adjourned record.';end if;
   update public.uro_sessions set phase='archive',state='record_certified',minutes_state='certified' where id=s.id;event:='DraftRecordCertified';
 when 'minutes_approve' then
   if not (chair or clerk) or s.minutes_state<>'certified' or not exists(select 1 from public.uro_decisions d join public.uro_sessions x on x.id=d.meeting_id join public.uro_proposals approval on approval.id=d.proposal_id where approval.context->>'approves_minutes_id'=s.id::text and d.id=(p_data->>'decision_id')::uuid and x.body_id=s.body_id and x.id<>s.id and x.started_at>s.ended_at) then raise exception 'A later same-body decision must authorize minutes approval.';end if;
   update public.uro_sessions set minutes_state='approved' where id=s.id;event:='MinutesApproved';
 when 'publish_record' then
   if not (chair or clerk) or s.minutes_state='draft' then raise exception 'Certify the record before publishing.';end if;
   update public.uro_sessions set published_at=now() where id=s.id;event:='RecordPublished';
 when 'correct_record' then
   if not clerk or s.ended_at is null or length(trim(coalesce(p_data->>'reason','')))=0 or length(trim(coalesce(p_data->>'authority','')))=0 then raise exception 'Secretary, reason and correction authority required.';end if;
   -- Preserve original facts; record corrections as an explicit addendum.
   insert into public.uro_corrections(meeting_id,actor_id,target,previous_value,new_value,reason,authority) values(s.id,auth.uid(),p_data->>'target',p_data->'previous',p_data->'new',p_data->>'reason',p_data->>'authority') returning id into result;event:='RecordCorrectionAdded';
 when 'note' then
   if me.id is null and not (chair or clerk) then raise exception 'Participant required.';end if;
   insert into public.uro_private_notes(meeting_id,author_id,kind,body) values(s.id,auth.uid(),coalesce(p_data->>'kind','personal_note'),p_data->>'body') returning id into result;return result; -- No private note text or existence in shared event stream.
 else raise exception 'Unsupported governance action.';
 end case;
 insert into public.uro_events(meeting_id,actor_id,action,detail) values(s.id,auth.uid(),event,coalesce(detail,'{}'));
 update public.uro_sessions set version=version+1,notice_revision=notice_revision+case when p_action in ('edit_setup','refresh_roster','agenda','attach_document','packet_ready') then 1 else 0 end,updated_at=now() where id=s.id;
 if p_action in ('adjourn','correct_record') then update public.uro_sessions set minutes=public.uro_minutes(s.id)||coalesce(E'\nCORRECTION ADDENDA:\n'||(select string_agg(target||' | '||new_value::text||' | Reason: '||reason||' | Authority: '||authority,E'\n' order by created_at) from public.uro_corrections where meeting_id=s.id),'') where id=s.id;end if;
 return result;
end; $$;
create function public.uro_state(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.uro_sessions; b public.uro_bodies; quorum jsonb; issues jsonb:='[]'; begin
 if not public.uro_session_read(p_session) then raise exception 'Meeting access required.';end if;
 select * into s from public.uro_sessions where id=p_session;select * into b from public.uro_bodies where id=s.body_id;quorum:=public.uro_quorum(s.id,s.current_agenda_id);
 if not coalesce((s.rules->>'configured')::boolean,false) then issues:=issues||jsonb_build_array('Voting and governing-document requirements are not confirmed.');end if;
 if s.notice_deadline is null then issues:=issues||jsonb_build_array('Notice requirement has not been configured.');end if;
 if not exists(select 1 from public.uro_notices where meeting_id=s.id) then issues:=issues||jsonb_build_array('Notice delivery evidence is missing.');
 elsif exists(select 1 from public.uro_notices where meeting_id=s.id and sent_at>deadline) then issues:=issues||jsonb_build_array('Notice was recorded after the required deadline.');end if;
 if s.packet_deadline<now() and not exists(select 1 from public.uro_events where meeting_id=s.id and action='PacketDistributed' and occurred_at<=s.packet_deadline) then issues:=issues||jsonb_build_array('Packet distribution deadline was missed.');end if;
 if s.started_at is not null and s.ended_at is null and not (quorum->>'satisfied')::boolean then issues:=issues||jsonb_build_array('Quorum is unavailable; substantive voting is blocked.');end if;
 if exists(select 1 from public.uro_events where meeting_id=s.id and action='AttendanceChanged' and detail->'quorum_after'->>'satisfied'='false') then issues:=issues||jsonb_build_array('Quorum was unavailable during part of the proceeding. See the event record.');end if;
 if s.ended_at is not null and s.minutes_state='draft' then issues:=issues||jsonb_build_array('Secretary certification is pending.');end if;
 if s.minutes_state='certified' then issues:=issues||jsonb_build_array('Formal minutes approval is pending.');end if;
 if exists(select 1 from public.uro_participants p where p.meeting_id=s.id and not p.guest and not exists(select 1 from public.uro_notices n where n.meeting_id=s.id and n.revision=s.notice_revision and p.id=any(n.recipient_ids))) then issues:=issues||jsonb_build_array('Notice delivery has not been recorded for every participant.');end if;
 if exists(select 1 from public.uro_actions where meeting_id=s.id and status<>'completed' and due_date<current_date) then issues:=issues||jsonb_build_array('Action items are overdue.');end if;
 if exists(select 1 from public.uro_actions where meeting_id=s.id and (owner_id is null or due_date is null)) then issues:=issues||jsonb_build_array('An action is missing an owner or due date.');end if;
 if exists(select 1 from public.uro_challenges where meeting_id=s.id and disposition in ('pending','challenged')) then issues:=issues||jsonb_build_array('Procedural challenges require resolution.');end if;
 if exists(select 1 from public.uro_agenda where meeting_id=s.id and classification='information' and readiness in ('draft','needs_information','blocked')) then issues:=issues||jsonb_build_array('An informational report is incomplete.');end if;
 return jsonb_build_object('session',s,'body',b,'quorum',quorum,'issues',issues,
 'permissions',jsonb_build_object('chair',coalesce(s.chair_id=auth.uid(),false),'secretary',coalesce(s.secretary_id=auth.uid(),false),'manage',public.uro_body_manage(b.id)),
 'participants',(select coalesce(jsonb_agg(to_jsonb(p)-'accommodation' order by p.name),'[]') from public.uro_participants p where meeting_id=s.id),
 'agenda',(select coalesce(jsonb_agg(a order by sort_order,created_at),'[]') from public.uro_agenda a where meeting_id=s.id),
 'proposals',(select coalesce(jsonb_agg(p order by created_at),'[]') from public.uro_proposals p where meeting_id=s.id),
 'documents',(select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('accessible',public.cvoa_drive_item_level(item_id)>0)),'[]') from public.uro_documents d where meeting_id=s.id),
 'questions',(select coalesce(jsonb_agg(x order by created_at),'[]') from public.uro_questions x where meeting_id=s.id),
 'notices',(select coalesce(jsonb_agg(x order by created_at),'[]') from public.uro_notices x where meeting_id=s.id),
 'notice_delivery_status',(select coalesce(jsonb_agg(x),'[]') from (select d.state,count(*) recipients from public.uro_notice_deliveries d join public.uro_notice_jobs j on j.id=d.job_id where j.meeting_id=s.id group by d.state) x),
 'reviews',(select coalesce(jsonb_agg(x),'[]') from public.uro_reviews x where meeting_id=s.id),
 'recusals',(select coalesce(jsonb_agg(x),'[]') from public.uro_recusals x where meeting_id=s.id),
 'floor',(select coalesce(jsonb_agg(x order by requested_at),'[]') from public.uro_floor x where meeting_id=s.id),
 'challenges',(select coalesce(jsonb_agg(x order by created_at),'[]') from public.uro_challenges x where meeting_id=s.id),
 'decisions',(select coalesce(jsonb_agg(x order by decided_at),'[]') from public.uro_decisions x where meeting_id=s.id),
 'actions',(select coalesce(jsonb_agg(x order by due_date nulls last),'[]') from public.uro_actions x where meeting_id=s.id),
 'events',(select coalesce(jsonb_agg(x order by id),'[]') from public.uro_events x where meeting_id=s.id),
 'corrections',(select coalesce(jsonb_agg(x order by created_at),'[]') from public.uro_corrections x where meeting_id=s.id),
 'notes',(select coalesce(jsonb_agg(x order by created_at desc),'[]') from public.uro_private_notes x where meeting_id=s.id and author_id=auth.uid()),
 'my_ballots',(select coalesce(jsonb_agg(x),'[]') from public.uro_ballots x join public.uro_participants p on p.id=x.participant_id where p.meeting_id=s.id and p.profile_id=auth.uid()),
 'roll_calls',(select coalesce(jsonb_agg(jsonb_build_object('proposal_id',v.proposal_id,'participant_id',v.participant_id,'round',v.round,'choice',v.choice)),'[]') from public.uro_ballots v join public.uro_proposals p on p.id=v.proposal_id where p.meeting_id=s.id and p.method in ('digital','roll_call') and p.closed_at is not null and v.round=p.vote_round),
 'previous_minutes',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'minutes_state',x.minutes_state)),'[]') from public.uro_sessions x where x.body_id=s.body_id and x.id<>s.id and x.ended_at<s.scheduled_at and x.minutes_state<>'draft'),
 'approval_decisions',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'identifier',d.identifier,'text',d.text)),'[]') from public.uro_decisions d join public.uro_proposals p on p.id=d.proposal_id join public.uro_sessions x on x.id=d.meeting_id where x.body_id=s.body_id and x.started_at>s.ended_at and p.context->>'approves_minutes_id'=s.id::text),
 'live_seconds',case when s.started_at is null then 0 else greatest(0,extract(epoch from coalesce(s.ended_at,now())-s.started_at)::int-s.recess_seconds-case when s.recess_started_at is null then 0 else extract(epoch from now()-s.recess_started_at)::int end) end);
end; $$;
create function public.uro_registry(p_body uuid,p_term text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.uro_body_read(p_body) then raise exception 'Body access required.';end if;
 return jsonb_build_object(
 'motions',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('meeting_title',s.title) order by p.created_at desc),'[]') from public.uro_proposals p join public.uro_sessions s on s.id=p.meeting_id where s.body_id=p_body and (p.current_text ilike '%'||p_term||'%' or p.identifier ilike '%'||p_term||'%')),
 'actions',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('meeting_title',s.title) order by a.due_date nulls last),'[]') from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id where s.body_id=p_body and a.title ilike '%'||p_term||'%'),
 'decisions',(select coalesce(jsonb_agg(d order by decided_at desc),'[]') from public.uro_decisions d join public.uro_sessions s on s.id=d.meeting_id where s.body_id=p_body and d.text ilike '%'||p_term||'%'),
 'meetings',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'scheduled_at',s.scheduled_at,'minutes_state',s.minutes_state)),'[]') from public.uro_sessions s where s.body_id=p_body and (s.title ilike '%'||p_term||'%' or s.minutes ilike '%'||p_term||'%')),
 'agenda',(select coalesce(jsonb_agg(a),'[]') from public.uro_agenda a join public.uro_sessions s on s.id=a.meeting_id where s.body_id=p_body and (a.title ilike '%'||p_term||'%' or a.report_body ilike '%'||p_term||'%' or a.brief::text ilike '%'||p_term||'%')),
 'procedure',(select coalesce(jsonb_agg(c),'[]') from public.uro_challenges c join public.uro_sessions s on s.id=c.meeting_id where s.body_id=p_body and (c.body ilike '%'||p_term||'%' or c.ruling ilike '%'||p_term||'%')),
 'interim',(select coalesce(jsonb_agg(i order by occurred_at desc),'[]') from public.uro_interim i where body_id=p_body and action ilike '%'||p_term||'%'));
end; $$;
create function public.uro_record_interim(p_body uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; sid uuid:=(p_data->>'meeting_id')::uuid; begin
 if not public.uro_body_manage(p_body) then raise exception 'Body administration required to attest delegated interim authority.';end if;
 if length(trim(coalesce(p_data->>'authority','')))=0 or length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Existing delegated authority and reason are required.';end if;
 if sid is not null and not exists(select 1 from public.uro_sessions where id=sid and body_id=p_body and phase in ('prepare','review')) then raise exception 'Choose a future meeting of this body.';end if;
 if coalesce((p_data->>'ratification_required')::boolean,false) and sid is null then raise exception 'Choose a future meeting for required ratification.';end if;
 insert into public.uro_interim(body_id,meeting_id,actor_id,authority,reason,action,occurred_at,financial_amount,ratification_required) values(p_body,sid,auth.uid(),p_data->>'authority',p_data->>'reason',p_data->>'action',(p_data->>'occurred_at')::timestamptz,(p_data->>'financial_amount')::numeric,coalesce((p_data->>'ratification_required')::boolean,false)) returning id into result;
 if (p_data->>'ratification_required')::boolean then insert into public.uro_agenda(meeting_id,title,classification,brief,created_by) values(sid,'Ratify interim action','decision',jsonb_build_object('interim_id',result,'authority',p_data->>'authority','action',p_data->>'action'),auth.uid());end if;return result;
end; $$;
-- Delivery jobs are private. Only the assigned Chair/Secretary can prepare notice.
create table public.uro_notice_jobs (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.uro_sessions(id),
 scheduled_at timestamptz not null, revision integer not null, payload jsonb not null, requested_by uuid not null references public.profiles(id), status text not null default 'pending', created_at timestamptz not null default now(), unique(meeting_id,revision)
);
create table public.uro_notice_deliveries (
 job_id uuid not null references public.uro_notice_jobs(id), participant_id uuid not null references public.uro_participants(id), email text,
 state text not null default 'pending', sent_at timestamptz, failure text, primary key(job_id,participant_id)
);
alter table public.uro_notice_jobs enable row level security;
alter table public.uro_notice_deliveries enable row level security;
revoke all on public.uro_notice_jobs,public.uro_notice_deliveries from anon,authenticated;
grant all on public.uro_notice_jobs,public.uro_notice_deliveries to service_role;
grant select on public.uro_sessions to service_role;
create function public.uro_prepare_notice(p_session uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.uro_sessions; job uuid; begin
 select * into s from public.uro_sessions where id=p_session for update;
 if not public.uro_session_read(s.id) or not coalesce(auth.uid() in(s.chair_id,s.secretary_id),false) or s.started_at is not null then raise exception 'Assigned Chair or Secretary may send notice before the meeting.';end if;
 insert into public.uro_notice_jobs(meeting_id,scheduled_at,revision,payload,requested_by) values(s.id,s.scheduled_at,s.notice_revision,jsonb_build_object('id',s.id,'title',s.title,'scheduled_at',s.scheduled_at,'location',s.location,'purpose',s.purpose,'notice_deadline',s.notice_deadline),auth.uid()) on conflict(meeting_id,revision) do update set requested_by=uro_notice_jobs.requested_by returning id into job;
 insert into public.uro_notice_deliveries(job_id,participant_id,email,state,failure)
 select job,p.id,coalesce(a.email,m.email),case when coalesce(a.email,m.email) is null then 'unreachable' else 'pending' end,case when coalesce(a.email,m.email) is null then 'No email address recorded; arrange another delivery method.' end
 from public.uro_participants p left join public.profiles a on a.id=p.profile_id left join public.uro_body_members bm on bm.id=p.membership_id left join public.members m on m.id=bm.member_id where p.meeting_id=s.id and not p.guest on conflict do nothing;
 return job;
end; $$;
create function public.uro_finish_notice(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.uro_notice_jobs; ids uuid[]; delivered integer; total integer; begin
 if auth.role() is distinct from 'service_role' then raise exception 'Delivery service required.';end if;
 select * into j from public.uro_notice_jobs where id=p_job for update;if not found then raise exception 'Job not found.';end if;
 select count(*),count(*) filter(where state='sent'),array_agg(participant_id) filter(where state='sent') into total,delivered,ids from public.uro_notice_deliveries where job_id=p_job;
 if delivered>0 and not exists(select 1 from public.uro_notices n where n.meeting_id=j.meeting_id and n.method='Google Workspace email' and n.revision=j.revision and n.recipient_ids @> ids) then
 insert into public.uro_notices(meeting_id,recipient_ids,revision,method,sent_at,sender_id,evidence,deadline) select j.meeting_id,ids,j.revision,'Google Workspace email',max(d.sent_at),j.requested_by,'SMTP accepted '||delivered||' of '||total||' recipient deliveries. Acceptance does not prove receipt.',s.notice_deadline from public.uro_notice_deliveries d join public.uro_sessions s on s.id=j.meeting_id where d.job_id=j.id group by s.notice_deadline;
 insert into public.uro_events(meeting_id,actor_id,action,detail) values(j.meeting_id,j.requested_by,'NoticeDeliveryRecorded',jsonb_build_object('sent',delivered,'recipients',total));
 update public.uro_sessions set version=version+1 where id=j.meeting_id;
 end if;
 update public.uro_notice_jobs set status=case when delivered=total and total>0 then 'sent' else 'incomplete' end where id=j.id;
 return jsonb_build_object('sent',delivered,'recipients',total,'incomplete',total-delivered);
end; $$;
revoke all on function public.uro_prepare_notice(uuid),public.uro_finish_notice(uuid) from public,anon,authenticated;
grant execute on function public.uro_prepare_notice(uuid) to authenticated;
grant execute on function public.uro_finish_notice(uuid) to service_role;
create or replace function public.cvoa_action_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pr public.profiles; result jsonb;
begin
 select * into pr from public.profiles where id=auth.uid();
 select role::public.user_role,post_id,state into pr.role,pr.post_id,pr.state from public.cvoa_current_scope();
 if not found or pr.role not in ('national_commander','national_staff','state_commander','post_commander','post_officer') then raise exception 'Staff access required.'; end if;
 with items as (
 select 'uro-minutes:'||m.id as id,'Certify meeting record: '||m.title as title,m.ended_at::date as due_date,'minutes' as kind,'/meetings/session/'||m.id as path from public.uro_sessions m where m.phase='execute' and public.uro_session_read(m.id)
 union all
 select 'uro-action:'||a.id,a.title,a.due_date,'task','/meetings/session/'||a.meeting_id from public.uro_actions a where a.status<>'completed' and (a.due_date<=current_date or a.due_date is null or a.owner_id is null) and public.uro_session_read(a.meeting_id)
 union all
 select 'uro-meeting:'||m.id,'Upcoming meeting: '||m.title,m.scheduled_at::date,'meeting','/meetings/session/'||m.id from public.uro_sessions m where m.ended_at is null and m.scheduled_at<=now()+interval '30 days' and public.uro_session_read(m.id)
 union all
 select 'minutes:'||u.id as id,case when pr.role in ('national_commander','national_staff','state_commander') then 'Awaiting published minutes: '||u.title else 'Complete minutes: '||u.title end as title,u.meeting_date as due_date,
 'minutes' as kind,case when pr.role in ('post_commander','post_officer') then '/meetings/uro/'||u.id else '/state' end as path
 from public.uro_meetings u where u.status='in_progress' and public.cvoa_can_oversee_post(u.post_id)
 union all
 select 'renewal:'||m.id,'Membership expires: '||case when pr.role='state_commander' then p.name else m.full_name end,m.expires_at,'membership',
 case when pr.role='state_commander' then '/state' else '/members?highlight='||m.id end
 from public.members m left join public.posts p on p.id=m.post_id where m.membership_type='annual' and m.membership_status='active'
 and m.expires_at <= current_date+30 and public.cvoa_can_oversee_post(m.post_id)
 union all
 select 'action:'||a.id,a.description,a.due_date,'task',case when pr.role='state_commander' then '/state' when public.is_national_role() then '/meetings/uro-actions' else '/meetings/uro/'||a.meeting_id end
 from public.uro_action_items a where a.status='open' and a.due_date<=current_date and public.cvoa_can_oversee_post(a.post_id)
 union all
 select 'meeting:'||u.id,'Upcoming meeting: '||u.title,u.meeting_date,'meeting',case when pr.role='state_commander' then '/state' else '/meetings/uro/'||u.id end
 from public.uro_meetings u where u.meeting_date>current_date and u.meeting_date<=current_date+30 and public.cvoa_can_oversee_post(u.post_id)
 union all
 select 'application:'||a.id,'Review post application: '||a.city||', '||a.state,a.created_at::date,'application','/applications'
 from public.post_applications a where a.status not in ('approved','founding_team_building','charter_ready','active_post') and public.is_national_role()
 union all
 select 'transfer:'||r.id,case when public.cvoa_can_review_transfer(r.target_post_id) then 'Review join / transfer request' else 'Oversee join / transfer request' end,r.created_at::date,'application','/members?tab=requests'
 from public.membership_change_requests r where r.status='pending' and public.cvoa_can_oversee_transfer(r.source_post_id,r.target_post_id)
 union all
 select 'campaign:'||c.id,'Campaign deadline: '||c.title,c.deadline,'fundraising','/fundraising?post='||c.post_id
 from public.fundraising_campaigns c where c.status<>'completed' and c.deadline<=current_date+30 and public.cvoa_can_oversee_post(c.post_id)
 union all
 select 'escalation:'||e.id,'State / post escalation: '||e.subject,e.created_at::date,'review','/state'
 from public.state_escalations e where e.status='open' and public.is_national_role()
 ) select jsonb_build_object('total',(select count(*) from items),'items',
 (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from
 (select * from items order by due_date nulls last,id limit 100) x)) into result;
 return result;
end; $$;


create or replace function public.cvoa_state_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope record; result jsonb; begin
 select * into scope from public.cvoa_current_scope();
 if not public.is_national_role() and coalesce(scope.role,'')<>'state_commander' then raise exception 'State oversight access is required.'; end if;
 select jsonb_build_object('state',scope.state,'posts',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'state',p.state,'status',p.status,'health_status',p.health_status,'active_members',(select count(*) from public.members m where m.post_id=p.id and m.membership_status='active'),'last_meeting',greatest((select max(meeting_date) from public.uro_meetings u where u.post_id=p.id and u.status='published'),(select max(s.started_at::date) from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and s.published_at is not null)),'overdue_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open' and u.due_date<current_date)+(select count(*) from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and a.status<>'completed' and a.due_date<current_date),
 'draft_meetings',(select count(*) from public.uro_meetings u where u.post_id=p.id and u.status<>'published')+(select count(*) from public.uro_sessions s join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and s.published_at is null),
 'active_campaigns',(select count(*) from public.fundraising_campaigns c where c.post_id=p.id and c.status<>'completed'),
 'support_requests',(select count(*) from public.state_escalations e where e.post_id=p.id and e.status='open'),
 'open_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open')+(select count(*) from public.uro_actions a join public.uro_sessions s on s.id=a.meeting_id join public.uro_bodies b on b.id=s.body_id where b.post_id=p.id and a.status<>'completed')) order by p.name),'[]'::jsonb)) into result from public.posts p where public.is_national_role() or (scope.state ~ '^[A-Z]{2}$' and upper(p.state)=scope.state);
 return result;
end; $$;


-- Revoke raw mutations even on installations with broad default table grants.
do $$ declare t text; f record; begin
 foreach t in array array['uro_bodies','uro_body_members','uro_sessions','uro_participants','uro_agenda','uro_proposals','uro_ballots','uro_events','uro_documents','uro_reviews','uro_questions','uro_notices','uro_recusals','uro_floor','uro_challenges','uro_decisions','uro_actions','uro_private_notes','uro_corrections','uro_interim'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 if t not in ('uro_ballots','uro_private_notes') then execute format('grant select on public.%I to authenticated',t);end if;
 execute format('create policy active_account on public.%I as restrictive for all to authenticated using(public.cvoa_access_enabled()) with check(public.cvoa_access_enabled())',t);
 if t='uro_bodies' then execute 'create policy scoped_read on public.uro_bodies for select to authenticated using(public.uro_body_read(id))';
 elsif t in ('uro_body_members','uro_interim') then execute format('create policy scoped_read on public.%I for select to authenticated using(public.uro_body_read(body_id))',t);
 elsif t='uro_sessions' then execute 'create policy scoped_read on public.uro_sessions for select to authenticated using(public.uro_session_read(id))';
 elsif t not in ('uro_ballots','uro_private_notes') then execute format('create policy scoped_read on public.%I for select to authenticated using(public.uro_session_read(meeting_id))',t);end if;
 end loop;
 for f in select p.oid::regprocedure signature,p.proname name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('uro_body_manage','uro_body_read','uro_session_read','uro_participant_active','uro_quorum','uro_directory','uro_candidates','uro_body_setup','uro_create','uro_command','uro_minutes','uro_state','uro_registry','uro_record_interim') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.name not in ('uro_participant_active','uro_quorum','uro_minutes') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end $$;
commit;
