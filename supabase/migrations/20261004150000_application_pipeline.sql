-- Guided National application workflow; launch authority stays in the post workspace.
-- Preserve the existing launch checklist template when called from a fixed-path RPC.
alter function public.seed_checklist_for_post() set search_path=public,pg_temp;
alter table public.post_applications add column assigned_reviewer_id uuid references public.profiles(id) on delete set null;
alter table public.post_applications add column next_action text check(length(next_action)<=1000);
alter table public.post_applications add column next_action_due_date date;
alter table public.post_applications add column workflow_version bigint not null default 1;
-- Applicants track their own status/feedback through the existing safe RPC.
-- Raw intake and staff handoff fields are restricted to National.
alter policy applications_select on public.post_applications using(public.is_national_role());
alter table public.vetting_interviews add column completed_at timestamptz;
alter table public.vetting_interviews add constraint interview_completion_evidence check(completed_at is null or (scheduled_at is not null and length(trim(coalesce(notes,'')))>0));

create table public.post_application_stage_events (
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.post_applications(id) on delete cascade,
 from_status public.post_status not null,to_status public.post_status not null,actor_id uuid references public.profiles(id),
 reason text not null,created_at timestamptz not null default now()
);
alter table public.post_application_stage_events enable row level security;
create policy stage_events_read on public.post_application_stage_events for select to authenticated
 using(public.is_national_role() or public.cvoa_owns_application(application_id));
revoke all on public.post_application_stage_events from anon,authenticated;
grant select on public.post_application_stage_events to authenticated;

create or replace function public.cvoa_guard_application_workflow() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' and current_user in ('anon','authenticated') then
   if new.status<>'new_inquiry' or new.post_id is not null or new.dd214_review_status<>'pending' or new.dd214_reviewed_by is not null or new.dd214_reviewed_at is not null or new.assigned_reviewer_id is not null or new.next_action is not null or new.next_action_due_date is not null or new.workflow_version<>1 then
     raise exception 'New applications must start as an unreviewed inquiry';
   end if;
 end if;
 if tg_op='UPDATE' then
   if current_user in ('anon','authenticated') and (new.status<>old.status or new.post_id is distinct from old.post_id) then
     raise exception 'Use the guided application transition';
   end if;
   new.workflow_version:=old.workflow_version+1;
   new.updated_at:=now();
 end if;
 if new.assigned_reviewer_id is not null and not exists(select 1 from public.profiles where id=new.assigned_reviewer_id and role in ('national_commander','national_staff')) then raise exception 'Assign a current National reviewer'; end if;
 return new;
end; $$;
create trigger cvoa_application_workflow_guard before insert or update on public.post_applications
 for each row execute function public.cvoa_guard_application_workflow();

-- Sign-offs refer to the specific service document reviewed. Keep old
-- sign-offs for history, but exclude them after a document replacement.
alter table public.application_signoffs add column document_path text;
update public.application_signoffs s set document_path=a.dd214_storage_path from public.post_applications a where a.id=s.application_id;
create table public.post_application_signoff_events (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.post_applications(id) on delete cascade,
 profile_id uuid not null, document_path text, action text not null check(action in ('signed','withdrawn')),signed_at timestamptz,recorded_at timestamptz not null default now()
);
alter table public.post_application_signoff_events enable row level security;
create policy signoff_events_read on public.post_application_signoff_events for select to authenticated using(public.is_national_role());
revoke all on public.post_application_signoff_events from anon,authenticated;
grant select on public.post_application_signoff_events to authenticated;
insert into public.post_application_signoff_events(application_id,profile_id,document_path,action,signed_at)
 select application_id,profile_id,document_path,'signed',signed_at from public.application_signoffs;
create or replace function public.cvoa_audit_application_signoff() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
   insert into public.post_application_signoff_events(application_id,profile_id,document_path,action,signed_at)
   select old.application_id,old.profile_id,old.document_path,'withdrawn',old.signed_at where exists(select 1 from public.post_applications where id=old.application_id);
   return old;
 end if;
 insert into public.post_application_signoff_events(application_id,profile_id,document_path,action,signed_at) values(new.application_id,new.profile_id,new.document_path,'signed',new.signed_at);
 return new;
end; $$;
create trigger cvoa_application_signoff_history after insert or update or delete on public.application_signoffs for each row execute function public.cvoa_audit_application_signoff();
create or replace function public.cvoa_stamp_application_signoff() returns trigger language plpgsql set search_path='' as $$
begin
 select dd214_storage_path into new.document_path from public.post_applications where id=new.application_id;
 if current_user in ('anon','authenticated') and not exists(select 1 from public.post_applications a where a.id=new.application_id and a.status in ('vetting','approved') and a.dd214_review_status='verified' and a.dd214_storage_path is not null) then raise exception 'Verify the current DD214 before signing off during vetting'; end if;
 return new;
end; $$;
create trigger cvoa_application_signoff_document before insert on public.application_signoffs for each row execute function public.cvoa_stamp_application_signoff();
create or replace function public.cvoa_sign_application(p_application uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.post_applications;
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National sign-off access required'; end if;
 select * into a from public.post_applications where id=p_application for update;
 if not found or a.status not in ('vetting','approved') or a.dd214_storage_path is null or a.dd214_review_status<>'verified' then raise exception 'Verify the current DD214 before signing off during vetting'; end if;
 insert into public.application_signoffs(application_id,profile_id,document_path) values(a.id,auth.uid(),a.dd214_storage_path)
 on conflict(application_id,profile_id) do update set document_path=a.dd214_storage_path,signed_at=now();
end; $$;
create or replace function public.cvoa_replace_application_document(p_application uuid,p_version bigint,p_path text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.post_applications;
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National document access required'; end if;
 select * into a from public.post_applications where id=p_application for update;
 if not found or a.workflow_version<>p_version then raise exception 'Application changed; refresh before replacing its document'; end if;
 if a.status not in ('new_inquiry','application_submitted','interview_scheduled','vetting') then raise exception 'Return an approved application to vetting before replacing its service document'; end if;
 if p_path is not distinct from a.dd214_storage_path then raise exception 'Upload a new document for replacement'; end if;
 if p_path is null or p_path not like auth.uid()::text||'/applications/'||a.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='dd214-uploads' and name=p_path) then raise exception 'Upload this application document first'; end if;
 update public.post_applications set dd214_storage_path=p_path,dd214_uploaded_at=now(),dd214_review_status='pending',dd214_reviewed_by=null,dd214_reviewed_at=null where id=a.id;
 insert into public.post_application_updates(application_id,author_id,kind,message) values(a.id,auth.uid(),'feedback','A service document was uploaded for review. Verification and National sign-offs must refer to this current document.');
end; $$;

create or replace function public.cvoa_application_pipeline() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National pipeline access required'; end if;
 select jsonb_build_object(
 'reviewers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name,id) from public.profiles where role in ('national_commander','national_staff')),'[]'::jsonb),
 'applications',coalesce((select jsonb_agg(jsonb_build_object('application',to_jsonb(a),'evidence',jsonb_build_object(
   'score', (select round(avg(v)::numeric,1) from public.vetting_scorecards s cross join lateral unnest(array[s.leadership_score,s.communication_score,s.professionalism_score,s.reliability_score,s.mission_alignment_score]) v where s.application_id=a.id),
   'complete_scorecards',(select count(*) from public.vetting_scorecards s where s.application_id=a.id and s.leadership_score is not null and s.communication_score is not null and s.professionalism_score is not null and s.reliability_score is not null and s.mission_alignment_score is not null),
   'signed_reviewers',coalesce((select jsonb_agg(s.profile_id) from public.application_signoffs s join public.profiles p on p.id=s.profile_id where s.application_id=a.id and s.document_path=a.dd214_storage_path and p.role in ('national_commander','national_staff')),'[]'::jsonb),
   'interview',(select jsonb_build_object('id',i.id,'scheduled_at',i.scheduled_at,'interviewer_id',i.interviewer_id,'notes',i.notes,'completed_at',i.completed_at) from public.vetting_interviews i where i.application_id=a.id order by i.scheduled_at desc nulls last,i.created_at desc,i.id limit 1),
   'completed_interviews',(select count(*) from public.vetting_interviews i where i.application_id=a.id and i.completed_at is not null and i.completed_at<=now()),
   'post_status',(select status from public.posts where id=a.post_id),
   'founding_team_ready',(select count(distinct position)=5 from public.founding_team_members m where m.post_id=a.post_id and m.position in ('commander','vice_commander','adjutant','quartermaster','sergeant_at_arms') and m.verification_status='verified' and not exists(select 1 from public.founding_team_members other where other.post_id=a.post_id and other.position in ('commander','vice_commander','adjutant','quartermaster','sergeant_at_arms') and other.verification_status<>'verified')),
   'team_verified',(select count(*) from public.founding_team_members m where m.post_id=a.post_id and m.verification_status='verified'),
   'checklist_total',(select count(*) from public.checklist_items c where c.post_id=a.post_id),
   'checklist_complete',(select count(*) from public.checklist_items c where c.post_id=a.post_id and c.is_complete),
   'latest_update',(select jsonb_build_object('kind',u.kind,'message',u.message,'created_at',u.created_at) from public.post_application_updates u where u.application_id=a.id order by u.created_at desc,u.id limit 1)
 )) order by a.created_at,a.id) from public.post_applications a),'[]'::jsonb)) into result;
 return result;
end; $$;

create or replace function public.cvoa_save_application_handoff(p_application uuid,p_version bigint,p_reviewer uuid,p_next_action text,p_due date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National reviewer access required'; end if;
 if p_reviewer is not null and not exists(select 1 from public.profiles where id=p_reviewer and role in ('national_commander','national_staff')) then raise exception 'Choose a current National reviewer'; end if;
 update public.post_applications set assigned_reviewer_id=p_reviewer,next_action=nullif(trim(p_next_action),''),next_action_due_date=p_due
 where id=p_application and workflow_version=p_version;
 if not found then raise exception 'Application changed; refresh before saving your handoff'; end if;
end; $$;

create or replace function public.cvoa_record_application_interview(p_application uuid,p_interview uuid,p_scheduled timestamptz,p_interviewer uuid,p_notes text,p_complete boolean)
returns void language plpgsql security definer set search_path='' as $$
declare a public.post_applications;
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National reviewer access required'; end if;
 select * into a from public.post_applications where id=p_application for update;
 if not found or a.status not in ('application_submitted','interview_scheduled','vetting','approved') then raise exception 'Interviews can be recorded during application review or vetting'; end if;
 if p_scheduled is null or not exists(select 1 from public.profiles where id=p_interviewer and role in ('national_commander','national_staff')) then raise exception 'Interview date and current National interviewer required'; end if;
 if p_complete and (p_scheduled>now() or length(trim(coalesce(p_notes,'')))=0) then raise exception 'A completed interview needs a past date and written notes'; end if;
 if length(coalesce(p_notes,''))>5000 then raise exception 'Keep interview notes under 5000 characters'; end if;
 if p_interview is null then
   insert into public.vetting_interviews(application_id,scheduled_at,interviewer_id,notes,completed_at) values(p_application,p_scheduled,p_interviewer,nullif(trim(p_notes),''),case when p_complete then now() end);
 else
   update public.vetting_interviews set scheduled_at=p_scheduled,interviewer_id=p_interviewer,notes=nullif(trim(p_notes),''),completed_at=case when p_complete then coalesce(completed_at,now()) end
   where id=p_interview and application_id=p_application;
   if not found then raise exception 'Interview does not belong to this application'; end if;
 end if;
end; $$;

create or replace function public.cvoa_move_application(p_application uuid,p_expected public.post_status,p_next public.post_status,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.post_applications; new_post uuid; statuses public.post_status[]:=array['new_inquiry','application_submitted','interview_scheduled','vetting','approved','founding_team_building','charter_ready','active_post']::public.post_status[];
 current_index integer; next_index integer; national_count integer; signed_count integer;
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National transition access required'; end if;
 select * into a from public.post_applications where id=p_application for update;
 if not found or a.status is distinct from p_expected then raise exception 'Application changed; refresh before advancing'; end if;
 if length(trim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 then raise exception 'Record the reason and next steps (up to 2000 characters)'; end if;
 current_index:=array_position(statuses,a.status);next_index:=array_position(statuses,p_next);
 if next_index is null or abs(next_index-current_index)<>1 then raise exception 'Move one stage at a time'; end if;
 if current_index>=6 or (a.post_id is not null and next_index<current_index) then raise exception 'Use the linked post workspace for launch progress'; end if;
 if next_index>current_index then
   if nullif(trim(a.dd214_storage_path),'') is null then raise exception 'A DD214 must be on file before advancing'; end if;
   if next_index>=3 and a.dd214_review_status<>'verified' then raise exception 'Review and verify the DD214 before proceeding'; end if;
   if next_index=3 and not exists(select 1 from public.vetting_interviews where application_id=a.id and scheduled_at is not null) then raise exception 'Schedule the interview first'; end if;
   if next_index>=4 and not exists(select 1 from public.vetting_interviews where application_id=a.id and completed_at is not null and completed_at<=now()) then raise exception 'Record the completed interview first'; end if;
   if next_index>=5 then
     if not exists(select 1 from public.vetting_scorecards s where s.application_id=a.id and s.leadership_score is not null and s.communication_score is not null and s.professionalism_score is not null and s.reliability_score is not null and s.mission_alignment_score is not null) then raise exception 'Complete all five scorecard categories'; end if;
     select count(*) into national_count from public.profiles where role in ('national_commander','national_staff');
     select count(distinct s.profile_id) into signed_count from public.application_signoffs s join public.profiles p on p.id=s.profile_id where s.application_id=a.id and s.document_path=a.dd214_storage_path and p.role in ('national_commander','national_staff');
     if national_count=0 or signed_count<>national_count then raise exception 'Every current National reviewer must sign off'; end if;
   end if;
 end if;
 new_post:=a.post_id;
 if p_next='founding_team_building' then
   if new_post is null then
     insert into public.posts(name,city,state,status,health_status) values(concat_ws(' ',nullif(a.city,''),a.state,'Post (Forming)'),a.city,a.state,'founding_team_building','yellow') returning id into new_post;
   elsif not exists(select 1 from public.posts where id=new_post and status='founding_team_building') then raise exception 'Linked post stage needs reconciliation in the post workspace'; end if;
   if not exists(select 1 from public.founding_team_members where post_id=new_post and position='commander') then
     insert into public.founding_team_members(post_id,name,email,phone,position,combat_status,verification_status,dd214_reviewed,combat_service_verified,membership_approved,dd214_storage_path)
     values(new_post,a.name,a.email,a.phone,'commander',case when a.combat_service then 'Combat veteran' else 'Non-combat veteran' end,a.dd214_review_status,true,a.combat_service and a.dd214_review_status='verified',
       exists(select 1 from public.members m where m.profile_id=a.applicant_profile_id and m.membership_status='active' and (m.expires_at is null or m.expires_at>=current_date)),a.dd214_storage_path);
   end if;
 end if;
 update public.post_applications set status=p_next,post_id=new_post,next_action=null,next_action_due_date=null where id=a.id;
 insert into public.post_application_stage_events(application_id,from_status,to_status,actor_id,reason) values(a.id,a.status,p_next,auth.uid(),trim(p_reason));
 insert into public.post_application_updates(application_id,author_id,kind,message) values(a.id,auth.uid(),'feedback','Stage changed: '||replace(a.status::text,'_',' ')||' → '||replace(p_next::text,'_',' ')||'. '||trim(p_reason));
 return jsonb_build_object('status',p_next,'post_id',new_post);
end; $$;

-- Post launch is managed in one place. Keep linked applications in sync.
create or replace function public.cvoa_sync_post_application_stage() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status in ('founding_team_building','charter_ready','active_post') then
   insert into public.post_application_stage_events(application_id,from_status,to_status,actor_id,reason)
   select id,status,new.status,auth.uid(),'Launch stage updated in the post workspace' from public.post_applications where post_id=new.id and status in ('founding_team_building','charter_ready','active_post') and status<>new.status;
   update public.post_applications set status=new.status where post_id=new.id and status in ('founding_team_building','charter_ready','active_post') and status<>new.status;
 end if;
 return new;
end; $$;
create trigger cvoa_sync_application_launch after update of status on public.posts for each row execute function public.cvoa_sync_post_application_stage();

create index pipeline_scorecards_application on public.vetting_scorecards(application_id);
create index pipeline_interviews_application on public.vetting_interviews(application_id,scheduled_at desc);
create index pipeline_updates_application on public.post_application_updates(application_id,created_at desc);
do $$ declare f text; begin
 foreach f in array array['cvoa_sign_application(uuid)','cvoa_replace_application_document(uuid,bigint,text)','cvoa_application_pipeline()','cvoa_save_application_handoff(uuid,bigint,uuid,text,date)','cvoa_record_application_interview(uuid,uuid,timestamp with time zone,uuid,text,boolean)','cvoa_move_application(uuid,public.post_status,public.post_status,text)'] loop
 execute 'revoke all on function public.'||f||' from public,anon';
 execute 'grant execute on function public.'||f||' to authenticated';
 end loop;
end $$;
