-- Attributed, retry-safe scorecards and private applicant questionnaires.
alter table public.vetting_scorecards add column question_answers jsonb not null default '{}'::jsonb;
alter table public.vetting_scorecards add column recommendation text not null default 'not_recorded' check(recommendation in ('not_recorded','needs_follow_up','ready_for_council','not_recommended'));
alter table public.vetting_scorecards add column follow_up_tasks text;
-- Existing reviews, including partial/anonymous legacy entries, are preserved.
revoke insert,update,delete on public.vetting_scorecards from anon,authenticated;

-- Keep the released legacy form working during the coordinated frontend rollout.
-- Every authenticated direct insert is still National-only and attributed by the server.
create function public.cvoa_stamp_vetting_reviewer() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
   if auth.uid() is null or not public.is_national_role() then raise exception 'National vetting access required'; end if;
   new.scored_by:=auth.uid();
 end if;
 return new;
end $$;
create trigger cvoa_scorecard_reviewer before insert on public.vetting_scorecards for each row execute function public.cvoa_stamp_vetting_reviewer();
grant insert on public.vetting_scorecards to authenticated;

create table public.post_application_questionnaires (
 application_id uuid primary key references public.post_applications(id) on delete cascade,
 answers jsonb not null default '{}'::jsonb, workflow_version bigint not null default 1,
 requested_by uuid references public.profiles(id),requested_at timestamptz not null default now(),
 submitted_at timestamptz,updated_at timestamptz not null default now()
);
create table public.post_application_questionnaire_submissions (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.post_applications(id) on delete cascade,
 submitted_by uuid not null references public.profiles(id),answers jsonb not null,created_at timestamptz not null default now()
);
alter table public.post_application_questionnaires enable row level security;
alter table public.post_application_questionnaire_submissions enable row level security;
revoke all on public.post_application_questionnaires,public.post_application_questionnaire_submissions from public,anon,authenticated;
create index questionnaire_submissions_application on public.post_application_questionnaire_submissions(application_id,created_at desc);

create function public.cvoa_validate_vetting_answers(p_answers jsonb,p_complete boolean default false)
returns boolean language plpgsql immutable set search_path='' as $$
declare keys text[]:=array['purpose','eligibility','region','petitioners','officers','leadership','commitment','first90','resources','accountability']; k text; v jsonb;
begin
 if p_answers is null or jsonb_typeof(p_answers)<>'object' then return false; end if;
 for k,v in select key,value from jsonb_each(p_answers) loop
   if not(k=any(keys)) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then return false; end if;
 end loop;
 if p_complete then foreach k in array keys loop
   if length(trim(coalesce(p_answers->>k,'')))=0 then return false; end if;
 end loop; end if;
 return true;
end $$;
revoke all on function public.cvoa_validate_vetting_answers(jsonb,boolean) from public,anon,authenticated;

create function public.cvoa_save_vetting_scorecard(p_id uuid,p_application uuid,p_scores jsonb,p_notes text,p_answers jsonb,p_recommendation text,p_follow_up text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.vetting_scorecards; k text; keys text[]:=array['leadership','communication','professionalism','reliability','mission_alignment'];
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National vetting access required'; end if;
 if p_id is null or p_scores is null or jsonb_typeof(p_scores)<>'object' then raise exception 'Choose all five scores from 1 to 10'; end if;
 if (select count(*) from jsonb_object_keys(p_scores))<>5 then raise exception 'Choose all five scores from 1 to 10'; end if;
 foreach k in array keys loop
   if jsonb_typeof(p_scores->k) is distinct from 'number' or coalesce(p_scores->>k,'') !~ '^([1-9]|10)$' then raise exception 'Choose all five scores from 1 to 10'; end if;
 end loop;
 if not public.cvoa_validate_vetting_answers(p_answers,false) or length(coalesce(p_notes,''))>5000 or length(coalesce(p_follow_up,''))>2000 then raise exception 'Invalid or oversized review responses'; end if;
 if p_recommendation is null or p_recommendation not in ('needs_follow_up','ready_for_council','not_recommended') then raise exception 'Choose a reviewer recommendation'; end if;
 -- Lock the applicant so a simultaneous stage change cannot invalidate this review.
 perform 1 from public.post_applications where id=p_application for update;
 if not found then raise exception 'Application not found'; end if;
 select * into r from public.vetting_scorecards where id=p_id;
 if found then
   if r.application_id<>p_application or r.scored_by is distinct from auth.uid() or
     array[r.leadership_score,r.communication_score,r.professionalism_score,r.reliability_score,r.mission_alignment_score] is distinct from array[(p_scores->>'leadership')::smallint,(p_scores->>'communication')::smallint,(p_scores->>'professionalism')::smallint,(p_scores->>'reliability')::smallint,(p_scores->>'mission_alignment')::smallint] or
     r.notes is distinct from nullif(trim(p_notes),'') or r.question_answers<>p_answers or r.recommendation<>p_recommendation or r.follow_up_tasks is distinct from nullif(trim(p_follow_up),'') then
     raise exception 'This review was already saved. Start a new review to record different findings';
   end if;
   return to_jsonb(r);
 end if;
 if not exists(select 1 from public.post_applications where id=p_application and status in ('application_submitted','interview_scheduled','vetting','approved')) then raise exception 'Scorecards are recorded during application review and vetting'; end if;
 insert into public.vetting_scorecards(id,application_id,scored_by,leadership_score,communication_score,professionalism_score,reliability_score,mission_alignment_score,notes,question_answers,recommendation,follow_up_tasks)
 values(p_id,p_application,auth.uid(),(p_scores->>'leadership')::smallint,(p_scores->>'communication')::smallint,(p_scores->>'professionalism')::smallint,(p_scores->>'reliability')::smallint,(p_scores->>'mission_alignment')::smallint,nullif(trim(p_notes),''),p_answers,p_recommendation,nullif(trim(p_follow_up),'')) returning * into r;
 return to_jsonb(r);
end $$;

create function public.cvoa_vetting_questionnaire(p_application uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q public.post_application_questionnaires; s public.post_application_questionnaire_submissions;
begin
 if auth.uid() is null or not(public.is_national_role() or public.cvoa_owns_application(p_application)) then raise exception 'Application questionnaire access required'; end if;
 select * into q from public.post_application_questionnaires where application_id=p_application;
 if not found then return null; end if;
 if public.is_national_role() and not public.cvoa_owns_application(p_application) then
   select * into s from public.post_application_questionnaire_submissions where application_id=p_application order by created_at desc,id desc limit 1;
   -- National sees the last submitted version, never an unfinished private draft.
   q.answers:=coalesce(s.answers,'{}'::jsonb); q.submitted_at:=s.created_at;
 end if;
 return to_jsonb(q)-'requested_by';
end $$;
create function public.cvoa_request_vetting_questionnaire(p_application uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National questionnaire access required'; end if;
 if not exists(select 1 from public.post_applications where id=p_application) then raise exception 'Application not found'; end if;
 insert into public.post_application_questionnaires(application_id,requested_by) values(p_application,auth.uid()) on conflict(application_id) do nothing;
 if found then
   insert into public.post_application_updates(application_id,author_id,kind,message) values(p_application,auth.uid(),'feedback','Please complete the applicant questionnaire in My Post Applications. Your responses help National prepare for the interview and identify next steps. This is separate from the formal charter petition.');
 end if;
end $$;
create function public.cvoa_save_vetting_questionnaire(p_application uuid,p_version bigint,p_answers jsonb,p_submit boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.post_application_questionnaires;
begin
 if auth.uid() is null or not public.cvoa_owns_application(p_application) then raise exception 'Only the applicant may save these responses'; end if;
 if p_submit is null or not public.cvoa_validate_vetting_answers(p_answers,p_submit) then raise exception 'Answer all ten questions before submitting; each response must be at most 2000 characters'; end if;
 select * into q from public.post_application_questionnaires where application_id=p_application for update;
 if not found then raise exception 'National has not requested this questionnaire'; end if;
 if q.workflow_version is distinct from p_version then raise exception 'Questionnaire changed; refresh before saving. Your entries have not been overwritten'; end if;
 update public.post_application_questionnaires set answers=p_answers,submitted_at=case when p_submit then now() end,updated_at=now(),workflow_version=workflow_version+1 where application_id=p_application returning * into q;
 if p_submit then
   insert into public.post_application_questionnaire_submissions(application_id,submitted_by,answers) values(p_application,auth.uid(),p_answers);
   insert into public.post_application_updates(application_id,author_id,kind,message) values(p_application,auth.uid(),'reply','Applicant questionnaire submitted for National review.');
 end if;
 return to_jsonb(q)-'requested_by';
end $$;
create function public.cvoa_vetting_record(p_application uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National vetting access required'; end if;
 if not exists(select 1 from public.post_applications where id=p_application) then raise exception 'Application not found'; end if;
 return jsonb_build_object('scorecards',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('reviewer_name',p.full_name) order by s.created_at desc,s.id desc) from public.vetting_scorecards s left join public.profiles p on p.id=s.scored_by where s.application_id=p_application),'[]'::jsonb),'questionnaire',public.cvoa_vetting_questionnaire(p_application));
end $$;
do $$ declare f text; begin foreach f in array array[
 'cvoa_save_vetting_scorecard(uuid,uuid,jsonb,text,jsonb,text,text)','cvoa_vetting_questionnaire(uuid)','cvoa_request_vetting_questionnaire(uuid)','cvoa_save_vetting_questionnaire(uuid,bigint,jsonb,boolean)','cvoa_vetting_record(uuid)'
 ] loop execute 'revoke all on function public.'||f||' from public,anon';execute 'grant execute on function public.'||f||' to authenticated'; end loop; end $$;

-- Export only to the National-only Drive root, never a post-shared folder.
create function public.cvoa_archive_vetting_report(p_id uuid,p_application uuid,p_path text,p_bytes bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.drive_files;
begin
 if auth.uid() is null or not public.is_national_role() then raise exception 'National report archive access required'; end if;
 if p_id is null or p_bytes is null or p_bytes<1 or p_bytes>10485760 or p_path is distinct from 'root/vetting-reports/'||auth.uid()::text||'/'||p_application::text||'/'||p_id::text||'.html' then raise exception 'Invalid report archive path or size'; end if;
 if not exists(select 1 from public.post_applications where id=p_application) or not exists(select 1 from storage.objects where bucket_id='ncc-drive' and name=p_path) then raise exception 'Upload this application report first'; end if;
 select * into existing from public.drive_files where id=p_id;
 if found then
   if existing.storage_path<>p_path or existing.uploaded_by is distinct from auth.uid() or existing.folder_id is not null then raise exception 'Report archive conflicts with an existing file'; end if;
   return existing.id;
 end if;
 insert into public.drive_files(id,folder_id,name,storage_path,file_size,mime_type,uploaded_by)
 values(p_id,null,'CVOA Vetting Report - '||p_application::text||' - '||to_char(now(),'YYYY-MM-DD HH24MI')||'.html',p_path,p_bytes,'text/html',auth.uid());
 return p_id;
end $$;
revoke all on function public.cvoa_archive_vetting_report(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.cvoa_archive_vetting_report(uuid,uuid,text,bigint) to authenticated;
