-- Articles IX / X of the supplied 2025-08-19 bylaws. No automatic sanctions,
-- executive ratification, appeal adjudication or deletion of official records.
create table public.governance_offices (
 profile_id uuid primary key references public.profiles(id),
 office text not null check(office='congress_presiding'),
 election_reference text not null check(length(trim(election_reference))>0),
 term_end date not null,
 recorded_by uuid not null references public.profiles(id), recorded_at timestamptz not null default now()
);
alter table public.governance_offices enable row level security;
create policy governance_offices_read on public.governance_offices for select to authenticated using(true);
revoke all on public.governance_offices from anon,authenticated;
grant select on public.governance_offices to authenticated;
create table public.congress_chapter_credentials (
 post_id uuid primary key references public.posts(id), combat_members integer not null check(combat_members>0),
 certification_reference text not null, certified_by uuid references public.profiles(id),certified_at timestamptz not null default now()
);
alter table public.congress_chapter_credentials enable row level security;
create policy chapter_credentials_read on public.congress_chapter_credentials for select to authenticated using(true);
revoke all on public.congress_chapter_credentials from anon,authenticated;
grant select on public.congress_chapter_credentials to authenticated;
alter table public.congress_delegates add column certification_reference text;
alter table public.resolutions add column procedure_reference text;
alter table public.resolutions add column decision_record text;

create or replace function public.cvoa_is_seated_delegate(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.congress_delegates d join public.profiles p on p.id=d.profile_id
 join public.posts s on s.id=d.post_id where d.profile_id=p_user and not d.is_alternate
 and d.certification_reference is not null and d.term_start<=current_date and d.term_end>=current_date
 and p.post_id=d.post_id and s.status='active_post'
 and exists(select 1 from public.members m where m.profile_id=p.id and m.post_id=d.post_id
 and m.membership_status='active' and (m.expires_at is null or m.expires_at>=current_date)));
$$;
create or replace function public.cvoa_is_congress_presiding() returns boolean
language sql stable security definer set search_path='' as $$
 select public.cvoa_is_seated_delegate() and exists(select 1 from public.governance_offices
 where profile_id=auth.uid() and office='congress_presiding' and term_end>=current_date);
$$;

-- Certification records an election; it does not conduct one or appoint a seat.
create or replace function public.cvoa_certify_delegate(p_profile uuid,p_start date,p_end date,p_reference text,p_combat_members integer,p_presiding boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare post uuid; seats integer; occupied integer;
begin
 if not public.is_national_role() then raise exception 'National certification access required'; end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end>p_start+interval '2 years' or length(trim(coalesce(p_reference,'')))=0 then raise exception 'Election reference and a term of up to two years are required'; end if;
 select post_id into post from public.profiles where id=p_profile;
 if not exists(select 1 from public.members m where m.profile_id=p_profile and m.post_id=post and m.membership_status='active' and (m.expires_at is null or m.expires_at>=current_date)) then raise exception 'A verified Combat Member in good standing is required'; end if;
 perform 1 from public.posts where id=post and status='active_post' for update;
 if not found then raise exception 'A chartered active post is required'; end if;
 if p_combat_members is null or p_combat_members<1 or p_combat_members>(select count(*) from public.members where post_id=post and membership_status='active' and (expires_at is null or expires_at>=current_date)) then raise exception 'Supply the certified Combat Member roster count, within the active membership count'; end if;
 seats:=ceil(p_combat_members::numeric/10)::integer;
 insert into public.congress_chapter_credentials(post_id,combat_members,certification_reference,certified_by) values(post,p_combat_members,p_reference,auth.uid()) on conflict(post_id) do update set combat_members=excluded.combat_members,certification_reference=excluded.certification_reference,certified_by=auth.uid(),certified_at=now();
 select count(*) into occupied from public.congress_delegates where post_id=post and not is_alternate and profile_id<>p_profile and term_end>=p_start and term_start<=p_end;
 if occupied>=seats then raise exception 'Certified roster permits only % seats for this post',seats; end if;
 if exists(select 1 from public.congress_delegates where profile_id=p_profile and not is_alternate) then
 update public.congress_delegates set post_id=post,term_start=p_start,term_end=p_end,certification_reference=p_reference where profile_id=p_profile and not is_alternate;
 else insert into public.congress_delegates(post_id,profile_id,term_start,term_end,certification_reference) values(post,p_profile,p_start,p_end,p_reference); end if;
 if p_presiding then
 if exists(select 1 from public.governance_offices where office='congress_presiding' and profile_id<>p_profile and term_end>=current_date) then raise exception 'An active Presiding Officer is already recorded; resolve the succession record first'; end if;
 insert into public.governance_offices(profile_id,office,election_reference,term_end,recorded_by) values(p_profile,'congress_presiding',p_reference,p_end,auth.uid()) on conflict(profile_id) do update set election_reference=excluded.election_reference,term_end=excluded.term_end,recorded_by=auth.uid(),recorded_at=now();
 end if;
end; $$;
revoke insert,update,delete on public.congress_delegates from anon,authenticated;

create or replace function public.cvoa_delegate_registry() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'profile_id',d.profile_id,'profile_name',p.full_name,'post_id',d.post_id,'post_name',s.name,'is_alternate',d.is_alternate,'term_start',d.term_start,'term_end',d.term_end,'certification_reference',d.certification_reference,'seated',public.cvoa_is_seated_delegate(d.profile_id))) from public.congress_delegates d left join public.profiles p on p.id=d.profile_id join public.posts s on s.id=d.post_id),'[]'::jsonb) end;
$$;
create or replace function public.cvoa_governance_candidates() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when public.is_national_role() then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role,'post_id',p.post_id)) from public.profiles p),'[]'::jsonb) else '[]'::jsonb end;
$$;
create or replace function public.cvoa_congress_overview() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then '{}'::jsonb else jsonb_build_object(
 'resolutions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'resolution_number',r.resolution_number,'title',r.title,'category',r.category,'status',r.status,'vote_type',r.vote_type,'created_at',r.created_at,'yes_votes',(select count(*) from public.resolution_votes v where v.resolution_id=r.id and v.vote_type=r.vote_type and v.vote)) order by r.created_at desc) from public.resolutions r),'[]'::jsonb),
 'announcements',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,title,body,category,created_at from public.congress_announcements order by created_at desc limit 5) a),'[]'::jsonb)) end;
$$;

-- Freeze the electorate for each formal ballot. Presence is recorded separately
-- from yes/no votes so abstaining delegates can still establish chapter quorum.
create table public.congress_ballots (
 resolution_id uuid primary key references public.resolutions(id),
 opened_by uuid not null references public.profiles(id), closes_at timestamptz not null,
 motion text not null check(motion in ('ordinary','bylaws','structural','override','recall_initiation','recall_removal')),
 active_chapters integer not null check(active_chapters>0), procedure_reference text not null,
 closed_at timestamptz, yes_count integer,no_count integer,present_chapters integer,result text
);
create table public.congress_ballot_seats (
 resolution_id uuid references public.congress_ballots(resolution_id),
 profile_id uuid references public.profiles(id), post_id uuid not null references public.posts(id),
 present boolean not null default false, primary key(resolution_id,profile_id)
);
alter table public.congress_ballots enable row level security;
alter table public.congress_ballot_seats enable row level security;
create policy ballot_read on public.congress_ballots for select to authenticated using(true);
create policy ballot_seat_read on public.congress_ballot_seats for select to authenticated using(true);
revoke all on public.congress_ballots,public.congress_ballot_seats from anon,authenticated;
grant select on public.congress_ballots,public.congress_ballot_seats to authenticated;

create or replace function public.cvoa_open_congress_ballot(p_resolution uuid,p_closes timestamptz,p_motion text,p_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.resolutions; chapters integer;
begin
 if not public.cvoa_is_congress_presiding() then raise exception 'Certified Congress Presiding Officer access required'; end if;
 select * into r from public.resolutions where id=p_resolution for update;
 if r.id is null or r.status not in ('draft','under_review','committee_review','discussion') then raise exception 'Resolution is not ready for a ballot'; end if;
 if p_closes is null or p_closes<=now() or length(trim(coalesce(p_reference,'')))=0 then raise exception 'Closing date and adopted joint operating resolution reference required'; end if;
 if r.category='bylaws' and p_motion<>'bylaws' then raise exception 'Bylaws amendments require the bylaws procedure'; end if;
 if r.category='constitution' or p_motion='recall_removal' then raise exception 'This procedure requires additional adopted operating rules and a recorded prior proceeding'; end if;
 select count(*) into chapters from public.posts where status='active_post';
 insert into public.congress_ballots(resolution_id,opened_by,closes_at,motion,active_chapters,procedure_reference) values(p_resolution,auth.uid(),p_closes,p_motion,chapters,p_reference);
 insert into public.congress_ballot_seats(resolution_id,profile_id,post_id) select distinct p_resolution,d.profile_id,d.post_id from public.congress_delegates d where public.cvoa_is_seated_delegate(d.profile_id) and not d.is_alternate;
 if not found then raise exception 'No certified seated delegates'; end if;
 update public.resolutions set status='voting',vote_type=case when p_motion='bylaws' then 'constitutional_amendment'::public.congress_vote_type else 'delegate_vote'::public.congress_vote_type end,voting_opens_at=now(),voting_closes_at=p_closes,procedure_reference=p_reference where id=p_resolution;
end; $$;
create or replace function public.cvoa_congress_check_in(p_resolution uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_is_seated_delegate() then raise exception 'Seated delegate access required'; end if;
 perform 1 from public.congress_ballots where resolution_id=p_resolution and closed_at is null and closes_at>now() for update;
 if not found then raise exception 'The ballot is closed'; end if;
 update public.congress_ballot_seats set present=true where resolution_id=p_resolution and profile_id=auth.uid();
 if not found then raise exception 'You are not in this ballot electorate'; end if;
end; $$;
create or replace function public.cvoa_guard_congress_vote() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.resolutions;
begin
 select * into r from public.resolutions where id=new.resolution_id for update;
 if new.voter_id is distinct from auth.uid() or r.status<>'voting' or new.vote_type is distinct from r.vote_type
 or r.voting_opens_at is null or r.voting_opens_at>now() or r.voting_closes_at is null or r.voting_closes_at<=now() then raise exception 'An open ballot and your own voter identity are required'; end if;
 if TG_OP='UPDATE' and (new.resolution_id<>old.resolution_id or new.vote_type<>old.vote_type or new.voter_id<>old.voter_id or new.voter_post_id is distinct from old.voter_post_id) then raise exception 'Ballot identity cannot change'; end if;
 if new.vote_type in ('delegate_vote','constitutional_amendment') then
 if not public.cvoa_is_seated_delegate() or not exists(select 1 from public.congress_ballot_seats s join public.congress_ballots b using(resolution_id) where s.resolution_id=new.resolution_id and s.profile_id=auth.uid() and s.post_id=new.voter_post_id and s.present and b.closed_at is null) then raise exception 'Only a checked-in certified delegate can cast this formal vote'; end if;
 else
 if not exists(select 1 from public.members m where m.profile_id=auth.uid() and m.membership_status='active' and (m.expires_at is null or m.expires_at>=current_date)) or new.voter_post_id is distinct from public.current_post_id() then raise exception 'Active membership and your own post are required'; end if;
 end if;
 return new;
end; $$;
create trigger cvoa_congress_vote before insert or update on public.resolution_votes for each row execute function public.cvoa_guard_congress_vote();
drop policy if exists resolution_votes_write_auth on public.resolution_votes;
create policy congress_votes_insert on public.resolution_votes for insert to authenticated with check(voter_id=auth.uid());
create policy congress_votes_update on public.resolution_votes for update to authenticated using(voter_id=auth.uid()) with check(voter_id=auth.uid());
revoke delete on public.resolution_votes from anon,authenticated;

create or replace function public.cvoa_close_congress_ballot(p_resolution uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b public.congress_ballots; seats integer; present integer; yes integer; no integer; approved boolean; outcome text;
begin
 if not public.cvoa_is_congress_presiding() then raise exception 'Congress Presiding Officer access required'; end if;
 perform 1 from public.resolutions where id=p_resolution for update;
 select * into b from public.congress_ballots where resolution_id=p_resolution for update;
 if b.resolution_id is null or b.closed_at is not null or b.closes_at>now() then raise exception 'Wait until the ballot deadline before certifying results'; end if;
 select count(*),count(distinct s.post_id) filter(where s.present) into seats,present from public.congress_ballot_seats s where s.resolution_id=p_resolution;
 select count(*) filter(where v.vote),count(*) filter(where not v.vote) into yes,no from public.resolution_votes v join public.congress_ballot_seats s on s.resolution_id=v.resolution_id and s.profile_id=v.voter_id join public.resolutions r on r.id=v.resolution_id where v.resolution_id=p_resolution and v.vote_type=r.vote_type and s.present;
 if present*3<b.active_chapters then outcome:='no_quorum'; else
 approved:=case when b.motion='ordinary' then yes>no and yes+no>0 when b.motion in ('bylaws') then yes*2>seats when b.motion='recall_initiation' then yes*5>=seats*3 else yes*3>=seats*2 end;
 outcome:=case when approved then 'adopted_by_congress' else 'rejected_by_congress' end; end if;
 update public.congress_ballots set closed_at=now(),yes_count=yes,no_count=no,present_chapters=present,result=outcome where resolution_id=p_resolution;
 -- No quorum is an invalid ballot, not a defeated motion. Ratification and
 -- enforcement are recorded separately; adopted Congress text is not an order.
 update public.resolutions set status=case when outcome='no_quorum' then 'discussion'::public.resolution_status when approved then 'passed'::public.resolution_status else 'rejected'::public.resolution_status end,decision_record=format('%s; yes=%s, no=%s; represented chapters=%s/%s; seated delegates=%s; procedure=%s',outcome,yes,no,present,b.active_chapters,seats,b.procedure_reference) where id=p_resolution;
end; $$;

-- Sponsors can create/edit drafts; Congress controls deliberation. Definer
-- procedures alone may open/close formal ballots. Delete is unavailable.
create or replace function public.cvoa_guard_resolution() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if TG_OP='INSERT' then
 if new.submitted_by is distinct from auth.uid() or new.status<>'draft' or new.vote_type is not null or new.post_id is distinct from public.current_post_id() then raise exception 'Create your own draft resolution'; end if;
 elsif new.status is distinct from old.status or new.vote_type is distinct from old.vote_type or new.voting_opens_at is distinct from old.voting_opens_at or new.voting_closes_at is distinct from old.voting_closes_at or new.decision_record is distinct from old.decision_record or new.procedure_reference is distinct from old.procedure_reference then raise exception 'Use the Congress ballot procedure to change official status';
 elsif old.status<>'draft' or old.submitted_by is distinct from auth.uid() or new.submitted_by is distinct from old.submitted_by or new.post_id is distinct from old.post_id then raise exception 'Only the sponsor may edit a draft; official text is preserved'; end if;
 return new;
end; $$;
create trigger cvoa_resolution_guard before insert or update on public.resolutions for each row execute function public.cvoa_guard_resolution();
revoke delete on public.resolutions,public.resolution_amendments,public.resolution_comments from anon,authenticated;
drop policy if exists resolution_amendments_write_national on public.resolution_amendments;
create policy amendment_proposal_insert on public.resolution_amendments for insert to authenticated with check(amended_by=auth.uid() and (public.cvoa_is_seated_delegate() or public.is_national_role()) and exists(select 1 from public.resolutions r where r.id=resolution_id and r.body=previous_body and r.status not in ('passed','rejected','implemented','archived')));
drop policy if exists resolution_comments_write_auth on public.resolution_comments;
create policy debate_own_insert on public.resolution_comments for insert to authenticated with check(author_id=auth.uid());
drop policy if exists resolution_co_sponsors_write_auth on public.resolution_co_sponsors;
create policy co_sponsor_own_insert on public.resolution_co_sponsors for insert to authenticated with check(profile_id=auth.uid());
drop policy if exists committee_reviews_write_national on public.committee_reviews;
create policy committee_review_author on public.committee_reviews for insert to authenticated with check(reviewed_by=auth.uid() and (public.cvoa_is_congress_presiding() or exists(select 1 from public.committee_members m where m.committee_id=committee_reviews.committee_id and m.profile_id=auth.uid())));
revoke update,delete on public.committee_reviews from anon,authenticated;
create or replace function public.cvoa_guard_preference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.member_profile_id is distinct from auth.uid() or new.post_id is distinct from public.current_post_id() or not exists(select 1 from public.resolutions where id=new.resolution_id and status='voting' and vote_type in ('delegate_vote','constitutional_amendment') and voting_opens_at<=now() and voting_closes_at>now()) then raise exception 'Record your own post preference on an open formal vote'; end if;
 if not exists(select 1 from public.members where profile_id=auth.uid() and membership_status='active' and (expires_at is null or expires_at>=current_date)) then raise exception 'Active membership required'; end if;
 return new;
end; $$;
create trigger cvoa_preference_guard before insert or update on public.resolution_member_preferences for each row execute function public.cvoa_guard_preference();

-- National cannot gain judicial access through ordinary role administration.
-- Judicial seating remains a separate, evidence-backed process under §10.2.
create or replace function public.cvoa_guard_tribunal_appointment() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if TG_OP='INSERT' and new.role='ethics_tribunal' then raise exception 'Tribunal seating requires the Article X appointment process'; end if;
 if TG_OP='UPDATE' and new.role is distinct from old.role and (new.role='ethics_tribunal' or old.role='ethics_tribunal') then raise exception 'Tribunal seating and removal require the Article X process'; end if;
 return new;
end; $$;
create trigger cvoa_tribunal_appointment before insert or update on public.profiles for each row execute function public.cvoa_guard_tribunal_appointment();
create or replace function public.cvoa_guard_tribunal_deletion() returns trigger language plpgsql set search_path='' as $$
begin
 if old.role='ethics_tribunal' and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Tribunal removal requires the Article X process'; end if;
 return old;
end; $$;
create trigger cvoa_tribunal_deletion before delete on public.profiles for each row execute function public.cvoa_guard_tribunal_deletion();

-- Judicial case record. Filers get a narrow status RPC, never deliberations.
alter table public.ethics_complaints add column notice_text text;
alter table public.ethics_complaints add column notice_served_at timestamptz;
alter table public.ethics_complaints add column response_due_at timestamptz;
alter table public.ethics_complaints add column hearing_at timestamptz;
alter table public.ethics_complaints add column findings text;
alter table public.ethics_complaints add column governing_provisions text;
alter table public.ethics_complaints add column rationale text;
alter table public.ethics_complaints add column proposed_sanction text;
alter table public.ethics_complaints add column clear_and_convincing boolean not null default false;
alter table public.ethics_complaints add column record_version integer not null default 1;
create table public.ethics_case_recusals (
 complaint_id uuid references public.ethics_complaints(id), profile_id uuid references public.profiles(id),
 reason text not null check(length(trim(reason))>0),created_at timestamptz not null default now(),primary key(complaint_id,profile_id)
);
create table public.ethics_case_events (
 id uuid primary key default gen_random_uuid(),complaint_id uuid references public.ethics_complaints(id),
 actor_id uuid references public.profiles(id),actor_name text,event text not null,created_at timestamptz not null default now()
);
create table public.ethics_decision_votes (
 complaint_id uuid references public.ethics_complaints(id),profile_id uuid references public.profiles(id),
 decision_fingerprint text not null,created_at timestamptz not null default now(),primary key(complaint_id,profile_id)
);
alter table public.ethics_case_recusals enable row level security;
alter table public.ethics_case_events enable row level security;
alter table public.ethics_decision_votes enable row level security;
create index ethics_events_case_time on public.ethics_case_events(complaint_id,created_at);
create or replace function public.cvoa_can_review_ethics(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_ethics_tribunal_role() and exists(select 1 from public.ethics_complaints c where c.id=p_case and c.complainant_id is distinct from auth.uid()) and not exists(select 1 from public.ethics_case_recusals where complaint_id=p_case and profile_id=auth.uid());
$$;
create or replace function public.cvoa_ethics_docket() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('filer_name',case when c.filed_anonymously then null else p.full_name end) order by c.created_at desc),'[]'::jsonb) from public.ethics_complaints c left join public.profiles p on p.id=c.complainant_id where public.cvoa_can_review_ethics(c.id);
$$;
drop policy if exists ethics_complaints_select_own_or_tribunal on public.ethics_complaints;
drop policy if exists ethics_complaints_insert_any_authenticated on public.ethics_complaints;
drop policy if exists ethics_complaints_update_tribunal on public.ethics_complaints;
drop policy if exists ethics_complaints_delete_tribunal on public.ethics_complaints;
create policy ethics_case_read on public.ethics_complaints for select to authenticated using(public.cvoa_can_review_ethics(id));
create policy ethics_case_insert on public.ethics_complaints for insert to authenticated with check(auth.uid() is not null and ((filed_anonymously and complainant_id is null) or (not filed_anonymously and complainant_id=auth.uid())) and status='new' and tribunal_notes is null and assigned_to is null and resolved_at is null and notice_text is null and notice_served_at is null and response_due_at is null and hearing_at is null and findings is null and governing_provisions is null and rationale is null and proposed_sanction is null and not clear_and_convincing and record_version=1);
revoke update,delete on public.ethics_complaints from anon,authenticated;
create policy ethics_recusal_read on public.ethics_case_recusals for select to authenticated using(public.is_ethics_tribunal_role());
create policy ethics_events_read on public.ethics_case_events for select to authenticated using(public.cvoa_can_review_ethics(complaint_id));
create policy ethics_votes_read on public.ethics_decision_votes for select to authenticated using(public.cvoa_can_review_ethics(complaint_id));
revoke all on public.ethics_case_recusals,public.ethics_case_events,public.ethics_decision_votes from anon,authenticated;
grant select on public.ethics_case_recusals,public.ethics_case_events,public.ethics_decision_votes to authenticated;
create or replace function public.cvoa_my_ethics_complaints() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'respondent_name',respondent_name,'category',category,'status',status,'created_at',created_at,'resolved_at',resolved_at)),'[]'::jsonb) from public.ethics_complaints where auth.uid() is not null and complainant_id=auth.uid() and not filed_anonymously;
$$;
create or replace function public.cvoa_recuse_ethics(p_case uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_ethics_tribunal_role() or length(trim(coalesce(p_reason,'')))=0 then raise exception 'Tribunal access and a recusal reason required'; end if;
 perform 1 from public.ethics_complaints where id=p_case for update;
 if not found then raise exception 'Case not found'; end if;
 insert into public.ethics_case_recusals values(p_case,auth.uid(),p_reason,now()) on conflict do nothing;
 insert into public.ethics_case_events(complaint_id,actor_id,actor_name,event) select p_case,auth.uid(),full_name,'Recusal recorded' from public.profiles where id=auth.uid();
end; $$;
create or replace function public.cvoa_save_ethics_case(p_case uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.ethics_complaints; due timestamptz; served timestamptz; hearing timestamptz; state public.ethics_complaint_status;
begin
 if not public.cvoa_can_review_ethics(p_case) then raise exception 'Non-recused Tribunal access required'; end if;
 select * into c from public.ethics_complaints where id=p_case for update;
 if c.id is null or c.status in ('resolved','dismissed') then raise exception 'This case is closed; its opinion is preserved'; end if;
 if coalesce((p_data->>'record_version')::integer,0)<>c.record_version then raise exception 'Another Tribunal member updated this record; reload before saving'; end if;
 state:=coalesce(p_data->>'status',c.status::text)::public.ethics_complaint_status;
 if state in ('resolved','dismissed') then raise exception 'Publish a voted written opinion to close the case'; end if;
 served:=nullif(p_data->>'notice_served_at','')::timestamptz; due:=nullif(p_data->>'response_due_at','')::timestamptz; hearing:=nullif(p_data->>'hearing_at','')::timestamptz;
 if served is not null and (served>now() or due is null or due<served+interval '14 days' or length(trim(coalesce(p_data->>'notice_text','')))=0) then raise exception 'Record written notice and at least 14 days for a defense'; end if;
 if hearing is not null and (due is null or hearing<due) then raise exception 'Hearing must follow the defense deadline'; end if;
 update public.ethics_complaints set status=state,tribunal_notes=p_data->>'tribunal_notes',notice_text=p_data->>'notice_text',notice_served_at=served,response_due_at=due,hearing_at=hearing,findings=p_data->>'findings',governing_provisions=p_data->>'governing_provisions',rationale=p_data->>'rationale',proposed_sanction=nullif(trim(p_data->>'proposed_sanction'),''),clear_and_convincing=coalesce((p_data->>'clear_and_convincing')::boolean,false) where id=p_case;
 update public.ethics_complaints set record_version=record_version+1 where id=p_case;
 delete from public.ethics_decision_votes where complaint_id=p_case;
 insert into public.ethics_case_events(complaint_id,actor_id,actor_name,event) select p_case,auth.uid(),full_name,'Case record updated; prior decision approvals cleared' from public.profiles where id=auth.uid();
end; $$;
create or replace function public.cvoa_ethics_fingerprint(p_case uuid) returns text
language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(findings,governing_provisions,rationale,proposed_sanction,clear_and_convincing,notice_text,notice_served_at,response_due_at,hearing_at)::text) from public.ethics_complaints where id=p_case;
$$;
create or replace function public.cvoa_approve_ethics_opinion(p_case uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare c public.ethics_complaints;
begin
 if not public.cvoa_can_review_ethics(p_case) then raise exception 'Non-recused Tribunal access required'; end if;
 select * into c from public.ethics_complaints where id=p_case for update;
 if p_version is null or p_version<>c.record_version then raise exception 'Opinion changed; reload before approving'; end if;
 if c.status in ('resolved','dismissed') or length(trim(coalesce(c.findings,'')))=0 or length(trim(coalesce(c.governing_provisions,'')))=0 or length(trim(coalesce(c.rationale,'')))=0 then raise exception 'Save complete findings, governing provisions and rationale before approving'; end if;
 insert into public.ethics_decision_votes(complaint_id,profile_id,decision_fingerprint) values(p_case,auth.uid(),public.cvoa_ethics_fingerprint(p_case)) on conflict(complaint_id,profile_id) do update set decision_fingerprint=excluded.decision_fingerprint,created_at=now();
 insert into public.ethics_case_events(complaint_id,actor_id,actor_name,event) select p_case,auth.uid(),full_name,'Written opinion approved' from public.profiles where id=auth.uid();
end; $$;
create or replace function public.cvoa_publish_ethics_opinion(p_case uuid,p_version integer,p_dismiss boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare c public.ethics_complaints; approvals integer;
begin
 if not public.cvoa_can_review_ethics(p_case) then raise exception 'Non-recused Tribunal access required'; end if;
 select * into c from public.ethics_complaints where id=p_case for update;
 if c.id is null or c.status in ('resolved','dismissed') then raise exception 'Case is already closed'; end if;
 if p_version is null or p_version<>c.record_version then raise exception 'Opinion changed; reload before issuing'; end if;
 select count(*) into approvals from public.ethics_decision_votes v join public.profiles p on p.id=v.profile_id where v.complaint_id=p_case and v.decision_fingerprint=public.cvoa_ethics_fingerprint(p_case) and p.role='ethics_tribunal' and not exists(select 1 from public.ethics_case_recusals r where r.complaint_id=p_case and r.profile_id=p.id);
 if c.proposed_sanction is not null then
 if (select count(*) from public.profiles where role='ethics_tribunal') not between 5 and 8 then raise exception 'Article X requires a seated Tribunal of five to eight members'; end if;
 if p_dismiss then raise exception 'A dismissed complaint cannot impose a sanction'; end if;
 if approvals<3 or not c.clear_and_convincing then raise exception 'Sanctions require clear and convincing findings and three independent affirmative votes'; end if;
 if c.notice_served_at is null or c.response_due_at is null or c.response_due_at>now() then raise exception 'Written notice and the defense period must be complete'; end if;
 end if;
 if approvals<1 then raise exception 'An approved written opinion is required'; end if;
 update public.ethics_complaints set status=case when p_dismiss then 'dismissed'::public.ethics_complaint_status else 'resolved'::public.ethics_complaint_status end,resolved_at=now() where id=p_case;
 insert into public.ethics_case_events(complaint_id,actor_id,actor_name,event) select p_case,auth.uid(),full_name,'Written opinion issued; 30-day appeal period begins. Sanction enforcement remains a separate recorded action.' from public.profiles where id=auth.uid();
end; $$;

-- Internal helpers and all new procedures are closed to anonymous execution.
do $$ declare f record; begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cvoa_is_seated_delegate','cvoa_is_congress_presiding','cvoa_certify_delegate','cvoa_delegate_registry','cvoa_governance_candidates','cvoa_congress_overview','cvoa_open_congress_ballot','cvoa_congress_check_in','cvoa_close_congress_ballot','cvoa_can_review_ethics','cvoa_ethics_docket','cvoa_my_ethics_complaints','cvoa_recuse_ethics','cvoa_save_ethics_case','cvoa_approve_ethics_opinion','cvoa_publish_ethics_opinion') loop execute format('revoke all on function %s from public,anon',f.signature); execute format('grant execute on function %s to authenticated',f.signature); end loop; end $$;
revoke all on function public.cvoa_ethics_fingerprint(uuid) from public,anon,authenticated;
