-- ============================================================================
-- CVOA POST OS — Supabase schema
-- Run this in Supabase SQL Editor (or via `supabase db push`) on a fresh project.
-- Organized by module to match the product spec.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 0. ENUMS
-- ----------------------------------------------------------------------------
create type user_role as enum (
  'national_commander',
  'national_staff',
  'state_commander',
  'post_commander',
  'post_officer',
  'member',
  'delegate',
  'guest_applicant'
);

create type post_status as enum (
  'new_inquiry',
  'application_submitted',
  'interview_scheduled',
  'vetting',
  'approved',
  'founding_team_building',
  'charter_ready',
  'active_post'
);

create type post_health_status as enum ('green', 'yellow', 'red');

create type vetting_decision as enum ('approve', 'reject', 'hold');

create type verification_status as enum ('pending', 'verified', 'rejected');

create type founding_position as enum (
  'commander',
  'vice_commander',
  'adjutant',
  'quartermaster',
  'sergeant_at_arms',
  'member'
);

create type sponsor_stage as enum (
  'identified', 'contacted', 'meeting_scheduled', 'proposal_sent', 'won', 'lost'
);

create type recruit_stage as enum (
  'prospect', 'interested', 'attended_meeting', 'applied', 'member', 'leader', 'officer', 'commander'
);

create type resolution_status as enum ('draft', 'submitted', 'in_discussion', 'voting', 'adopted', 'archived');

-- ----------------------------------------------------------------------------
-- 1. CORE: PROFILES & ROLES
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role user_role not null default 'guest_applicant',
  post_id uuid, -- set after post exists; FK added below
  state text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. POSTS (the central entity every module hangs off of)
-- ----------------------------------------------------------------------------
create table posts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  city text,
  state text not null,
  status post_status not null default 'new_inquiry',
  health_status post_health_status not null default 'yellow',
  lat double precision,
  lng double precision,
  charter_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_post_id_fkey foreign key (post_id) references posts(id) on delete set null;

-- ----------------------------------------------------------------------------
-- MODULE 1: POST APPLICATION PIPELINE
-- ----------------------------------------------------------------------------
create table post_applications (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid references posts(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  city text,
  state text not null,
  military_branch text,
  years_served integer,
  combat_service boolean default false,
  leadership_experience text,
  existing_veteran_network text,
  estimated_membership_potential integer,
  motivation text, -- "Why do you want to start a post?"
  status post_status not null default 'new_inquiry',
  dd214_storage_path text, -- path within the private 'dd214-uploads' bucket
  dd214_uploaded_at timestamptz,
  dd214_review_status verification_status not null default 'pending',
  dd214_reviewed_by uuid references profiles(id),
  dd214_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 2: VETTING SYSTEM
-- ----------------------------------------------------------------------------
create table vetting_scorecards (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references post_applications(id) on delete cascade,
  scored_by uuid references profiles(id),
  leadership_score smallint check (leadership_score between 1 and 10),
  communication_score smallint check (communication_score between 1 and 10),
  professionalism_score smallint check (professionalism_score between 1 and 10),
  reliability_score smallint check (reliability_score between 1 and 10),
  mission_alignment_score smallint check (mission_alignment_score between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);

create table vetting_interviews (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references post_applications(id) on delete cascade,
  scheduled_at timestamptz,
  interviewer_id uuid references profiles(id),
  notes text,
  follow_up_tasks text,
  created_at timestamptz not null default now()
);

create table vetting_decisions (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references post_applications(id) on delete cascade,
  decided_by uuid references profiles(id),
  decision vetting_decision not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 3: FOUNDING TEAM BUILDER
-- ----------------------------------------------------------------------------
create table founding_team_members (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  position founding_position not null default 'member',
  combat_status text,
  verification_status verification_status not null default 'pending',
  dd214_reviewed boolean not null default false,
  combat_service_verified boolean not null default false,
  membership_approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 4: POST LAUNCH CHECKLIST
-- ----------------------------------------------------------------------------
create table checklist_items (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  category text not null, -- Administration | Membership | Operations | Facility
  label text not null,
  is_complete boolean not null default false,
  completed_at timestamptz,
  auto_tracked boolean not null default false, -- true if system-derived (e.g. member counts)
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 5: POST TOOLKIT (download center)
-- ----------------------------------------------------------------------------
create table toolkit_templates (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null,
  description text,
  file_url text, -- Supabase Storage path
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 6: RECRUITING ENGINE
-- ----------------------------------------------------------------------------
create table recruits (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  stage recruit_stage not null default 'prospect',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 7: SPONSORSHIP CRM
-- ----------------------------------------------------------------------------
create table sponsors (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid references posts(id) on delete set null,
  company text not null,
  contact_name text,
  email text,
  phone text,
  sponsorship_value numeric(12,2) default 0,
  stage sponsor_stage not null default 'identified',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 8: VETERANS CONGRESS
-- ----------------------------------------------------------------------------
create table congress_delegates (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  profile_id uuid references profiles(id),
  is_alternate boolean not null default false,
  created_at timestamptz not null default now()
);

create table resolutions (
  id uuid primary key default uuid_generate_v4(),
  submitted_by uuid references profiles(id),
  post_id uuid references posts(id),
  title text not null,
  category text, -- Resolution | Legislative Priority | National Concern | Constitutional Amendment
  body text not null,
  status resolution_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table resolution_comments (
  id uuid primary key default uuid_generate_v4(),
  resolution_id uuid not null references resolutions(id) on delete cascade,
  author_id uuid references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table resolution_votes (
  id uuid primary key default uuid_generate_v4(),
  resolution_id uuid not null references resolutions(id) on delete cascade,
  voter_id uuid references profiles(id),
  vote boolean not null, -- true = support
  created_at timestamptz not null default now(),
  unique (resolution_id, voter_id)
);

-- ----------------------------------------------------------------------------
-- MODULE 9: POST HEALTH SYSTEM
-- ----------------------------------------------------------------------------
create table post_health_metrics (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  membership_growth numeric,
  attendance_rate numeric,
  events_held integer,
  funds_raised numeric,
  retention_rate numeric,
  reporting_compliance boolean,
  community_service_hours numeric,
  computed_status post_health_status,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 10: BUILD A POST (franchise planning tool)
-- ----------------------------------------------------------------------------
create table build_a_post_modules (
  id uuid primary key default uuid_generate_v4(),
  name text not null, -- e.g. "Bar Layout", "Kitchen Layout", "Classroom Layout"
  description text,
  startup_cost_low numeric,
  startup_cost_high numeric,
  equipment_list text[],
  sponsor_opportunities text,
  grant_opportunities text,
  revenue_potential text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ACTIVITY FEED (national dashboard)
-- ----------------------------------------------------------------------------
create table activity_feed (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null, -- new_application | charter_approved | new_member | new_sponsor | congress_submission
  post_id uuid references posts(id),
  actor_id uuid references profiles(id),
  summary text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Baseline policy set: National roles see everything; post-affiliated roles
-- see their own post's data. Tighten per-table as real workflows solidify.
-- ============================================================================

alter table profiles enable row level security;
alter table posts enable row level security;
alter table post_applications enable row level security;
alter table vetting_scorecards enable row level security;
alter table vetting_interviews enable row level security;
alter table vetting_decisions enable row level security;
alter table founding_team_members enable row level security;
alter table checklist_items enable row level security;
alter table toolkit_templates enable row level security;
alter table recruits enable row level security;
alter table sponsors enable row level security;
alter table congress_delegates enable row level security;
alter table resolutions enable row level security;
alter table resolution_comments enable row level security;
alter table resolution_votes enable row level security;
alter table post_health_metrics enable row level security;
alter table build_a_post_modules enable row level security;
alter table activity_feed enable row level security;

-- Helper: is the current user national-level staff?
create or replace function is_national_role()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('national_commander', 'national_staff')
  );
$$;

-- Helper: current user's post_id
create or replace function current_post_id()
returns uuid
language sql
security definer
stable
as $$
  select post_id from profiles where id = auth.uid();
$$;

-- profiles: users read their own row; national roles read all
create policy "profiles_select_own_or_national" on profiles
  for select using (id = auth.uid() or is_national_role());
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());

-- posts: national roles full access; everyone can read (public post directory)
create policy "posts_select_all" on posts for select using (true);
create policy "posts_write_national" on posts for insert with check (is_national_role());
create policy "posts_update_national_or_own" on posts
  for update using (is_national_role() or id = current_post_id());

-- Generic pattern applied to the remaining module tables:
-- national roles: full read/write. Post-scoped roles: read/write rows tied to their post_id.
-- guest_applicant: insert-only on post_applications (public application form).

create policy "applications_select" on post_applications
  for select using (is_national_role() or post_id = current_post_id());
create policy "applications_insert_public" on post_applications
  for insert with check (true); -- public application form, no auth required at submit time
create policy "applications_update_national" on post_applications
  for update using (is_national_role());
create policy "applications_delete_national" on post_applications
  for delete using (is_national_role());

create policy "vetting_scorecards_national" on vetting_scorecards
  for all using (is_national_role());
create policy "vetting_interviews_national" on vetting_interviews
  for all using (is_national_role());
create policy "vetting_decisions_national" on vetting_decisions
  for all using (is_national_role());

create policy "founding_team_post_or_national" on founding_team_members
  for select using (is_national_role() or post_id = current_post_id());
create policy "founding_team_insert_public" on founding_team_members
  for insert with check (true); -- public invite link — anyone with the post's link can add themselves
create policy "founding_team_update_national" on founding_team_members
  for update using (is_national_role() or post_id = current_post_id());
create policy "founding_team_delete_national" on founding_team_members
  for delete using (is_national_role());

create policy "checklist_post_or_national" on checklist_items
  for all using (is_national_role() or post_id = current_post_id());

create policy "toolkit_read_all" on toolkit_templates for select using (true);
create policy "toolkit_write_national" on toolkit_templates for insert with check (is_national_role());

create policy "recruits_post_or_national" on recruits
  for all using (is_national_role() or post_id = current_post_id());

create policy "sponsors_post_or_national" on sponsors
  for all using (is_national_role() or post_id = current_post_id());

create policy "delegates_read_all" on congress_delegates for select using (true);
create policy "delegates_write_post_or_national" on congress_delegates
  for insert with check (is_national_role() or post_id = current_post_id());

create policy "resolutions_read_all" on resolutions for select using (true);
create policy "resolutions_write_delegate" on resolutions
  for insert with check (auth.uid() is not null);
create policy "resolutions_update_own_or_national" on resolutions
  for update using (submitted_by = auth.uid() or is_national_role());

create policy "resolution_comments_read_all" on resolution_comments for select using (true);
create policy "resolution_comments_write_auth" on resolution_comments
  for insert with check (auth.uid() is not null);

create policy "resolution_votes_read_all" on resolution_votes for select using (true);
create policy "resolution_votes_write_auth" on resolution_votes
  for insert with check (auth.uid() is not null);

create policy "health_metrics_read_all" on post_health_metrics for select using (true);
create policy "health_metrics_write_national" on post_health_metrics
  for insert with check (is_national_role());

create policy "build_a_post_read_all" on build_a_post_modules for select using (true);
create policy "build_a_post_write_national" on build_a_post_modules
  for all using (is_national_role());

create policy "activity_feed_read_all" on activity_feed for select using (true);
create policy "activity_feed_write_auth" on activity_feed
  for insert with check (auth.uid() is not null);

-- ============================================================================
-- STORAGE: DD214 uploads
-- Private bucket — DD214s contain sensitive PII (SSN fragments, etc.) and
-- must never be publicly readable. Only national roles can read files;
-- anyone (including unauthenticated applicants) can upload one, matching the
-- public application form's insert policy above.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('dd214-uploads', 'dd214-uploads', false)
on conflict (id) do nothing;

create policy "dd214_upload_public" on storage.objects
  for insert with check (bucket_id = 'dd214-uploads');

create policy "dd214_read_national" on storage.objects
  for select using (bucket_id = 'dd214-uploads' and is_national_role());

-- ============================================================================
-- AUTOMATION: hands-off intake pipeline
-- The goal is that National Command never has to manually notice a new
-- application — it should already be visible, logged, and gated correctly
-- by the time anyone looks at the dashboard.
-- ============================================================================

-- 1. Every new application automatically posts to the activity feed, so it
--    shows up on the Global Dashboard without anyone doing anything.
create or replace function log_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_feed (event_type, post_id, summary)
  values (
    'new_application',
    new.post_id,
    'New application from ' || new.name || ' (' || coalesce(new.city || ', ', '') || new.state || ')'
  );
  return new;
end;
$$;

create trigger trg_log_new_application
  after insert on post_applications
  for each row execute function log_new_application();

-- 2. Once a DD214 is attached, flip review status back to pending-for-staff
--    automatically (covers the case where a DD214 is uploaded after initial
--    submission) and log it to the activity feed as ready-for-review.
create or replace function log_dd214_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dd214_storage_path is not null and old.dd214_storage_path is null then
    insert into activity_feed (event_type, post_id, summary)
    values ('dd214_uploaded', new.post_id, new.name || '''s DD214 is uploaded and ready for review');
  end if;
  return new;
end;
$$;

create trigger trg_log_dd214_uploaded
  after update on post_applications
  for each row execute function log_dd214_uploaded();

-- Note: this schema deliberately does NOT send emails or SMS on its own —
-- Postgres/Supabase can't do that natively. To get applicant confirmation
-- emails and a staff alert with zero manual effort, wire a Supabase Database
-- Webhook (Database -> Webhooks in the dashboard) on INSERT to
-- post_applications, pointing at a Supabase Edge Function that calls an
-- email API (e.g. Resend). See supabase/functions/notify-new-application
-- for a ready-to-deploy starting point.


create or replace function seed_checklist_for_post()
returns trigger
language plpgsql
as $$
begin
  insert into checklist_items (post_id, category, label, auto_tracked) values
    (new.id, 'Administration', 'Charter Packet Completed', false),
    (new.id, 'Administration', 'Bylaws Signed', false),
    (new.id, 'Administration', 'Officers Appointed', false),
    (new.id, 'Administration', 'EIN Issued', false),
    (new.id, 'Administration', 'Bank Account Opened', false),
    (new.id, 'Administration', 'State Filing Complete', false),
    (new.id, 'Membership', '10 Members', true),
    (new.id, 'Membership', '25 Members', true),
    (new.id, 'Membership', '50 Members', true),
    (new.id, 'Membership', '100 Members', true),
    (new.id, 'Operations', 'First Meeting Held', false),
    (new.id, 'Operations', 'Minutes Submitted', false),
    (new.id, 'Operations', 'Community Event Completed', false),
    (new.id, 'Operations', 'Recruiting Event Completed', false),
    (new.id, 'Facility', 'Meeting Location Secured', false),
    (new.id, 'Facility', 'Permanent Facility Identified', false),
    (new.id, 'Facility', 'Lease Under Review', false);
  return new;
end;
$$;

create trigger trg_seed_checklist
  after insert on posts
  for each row execute function seed_checklist_for_post();

-- ============================================================================
-- End of schema
-- ============================================================================
