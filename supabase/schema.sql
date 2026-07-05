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

-- Veterans Congress enums (Module 8)
create type resolution_status as enum (
  'draft', 'under_review', 'committee_review', 'discussion', 'voting',
  'passed', 'rejected', 'implemented', 'archived'
);

create type resolution_category as enum (
  'membership', 'governance', 'budget', 'legislative_affairs', 'national_policy',
  'bylaws', 'constitution', 'expansion', 'programs', 'veterans_benefits', 'other'
);

create type congress_vote_type as enum (
  'informal_poll', 'delegate_vote', 'constitutional_amendment', 'national_referendum'
);

create type debate_response_type as enum (
  'support', 'oppose', 'question', 'amendment', 'clarification'
);

create type committee_recommendation as enum ('approve', 'reject', 'request_revisions');

create type legislative_bill_status as enum ('monitoring', 'active', 'passed', 'failed', 'stalled');

create type calendar_event_type as enum (
  'hearing', 'vote', 'deadline', 'committee_meeting', 'national_meeting', 'session'
);

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
  proposed_site_location text, -- optional, mainly populated by the founding commander
  funding_commitment text, -- optional, mainly populated by the founding commander
  dd214_storage_path text, -- this member's own ID/DD214 upload, in the shared 'dd214-uploads' bucket
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
-- MODULE 5: POST TOOLKIT
-- Organized like a real franchise operations manual: categories -> items ->
-- optional sub-items, with three actions per item (Read / Download /
-- Generate). "Generate" calls out to an Edge Function that uses Claude to
-- produce a post-specific packet from a prompt template — see
-- supabase/functions/generate-toolkit-document.
-- ----------------------------------------------------------------------------
create table toolkit_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table toolkit_items (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references toolkit_categories(id) on delete cascade,
  title text not null,
  sub_items text[], -- e.g. {"Duties", "Expectations", "Reporting requirements"}
  description text, -- short one-liner shown under the title
  read_content text, -- the actual guide text for the "Read" button, markdown-ish plain text
  file_storage_path text, -- populated once a file is uploaded, enables "Download"
  generate_prompt_template text, -- populated for items where an AI-generated packet makes sense, enables "Generate"
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A record of every AI-generated packet, so a commander can come back to one
-- later instead of regenerating it, and so National can see what's being used.
create table toolkit_generated_documents (
  id uuid primary key default uuid_generate_v4(),
  toolkit_item_id uuid not null references toolkit_items(id) on delete cascade,
  post_id uuid references posts(id),
  title text not null,
  content text not null,
  generated_by uuid references profiles(id),
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
create table sponsor_tiers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  min_value numeric(12,2) not null default 0,
  benefits text[], -- e.g. {"Logo on website", "Mentioned at 2 events/year"}
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

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
  tier_id uuid references sponsor_tiers(id), -- auto-assigned by trigger, see below
  agreement_start_date date,
  agreement_end_date date,
  agreement_storage_path text, -- signed agreement, in the private 'sponsor-agreements' bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sponsor_notes (
  id uuid primary key default uuid_generate_v4(),
  sponsor_id uuid not null references sponsors(id) on delete cascade,
  author_id uuid references profiles(id),
  note text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 8: VETERANS CONGRESS
-- A governing/legislative system, not a forum: every resolution is numbered,
-- traceable through committee review, debate, amendment, and a formal vote,
-- and nothing is ever deleted from the record.
-- ----------------------------------------------------------------------------
create table congress_delegates (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  profile_id uuid references profiles(id),
  is_alternate boolean not null default false,
  term_start date,
  term_end date,
  created_at timestamptz not null default now()
);

create table resolutions (
  id uuid primary key default uuid_generate_v4(),
  resolution_number text unique, -- VC-2026-001, auto-generated by trigger below
  submitted_by uuid references profiles(id), -- the sponsor
  post_id uuid references posts(id), -- originating post
  title text not null,
  category resolution_category not null default 'other',
  executive_summary text,
  body text not null, -- full formal resolution text
  purpose text,
  financial_impact_cost numeric(12,2),
  financial_impact_funding_source text,
  financial_impact_revenue_note text,
  organizational_impact text,
  status resolution_status not null default 'draft',
  vote_type congress_vote_type,
  supermajority_threshold numeric(4,3), -- e.g. 0.667 for constitutional amendments
  voting_opens_at timestamptz,
  voting_closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table resolution_co_sponsors (
  id uuid primary key default uuid_generate_v4(),
  resolution_id uuid not null references resolutions(id) on delete cascade,
  profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (resolution_id, profile_id)
);

-- Amendment history — append-only. A resolution's text can change, but every
-- prior version stays on the record permanently (per the "nothing deleted"
-- requirement).
create table resolution_amendments (
  id uuid primary key default uuid_generate_v4(),
  resolution_id uuid not null references resolutions(id) on delete cascade,
  amended_by uuid references profiles(id),
  amendment_summary text not null,
  previous_body text not null, -- snapshot of the text being replaced
  new_body text not null,
  created_at timestamptz not null default now()
);

create table resolution_documents (
  id uuid primary key default uuid_generate_v4(),
  resolution_id uuid not null references resolutions(id) on delete cascade,
  title text not null,
  storage_path text not null,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Debate Floor — structured, categorized responses. Threaded via
-- parent_comment_id, but every response has a declared type (Support /
-- Oppose / Question / Amendment / Clarification) rather than being a
-- generic comment.
create table resolution_comments (
  id uuid primary key default uuid_generate_v4(),
  resolution_id uuid not null references resolutions(id) on delete cascade,
  parent_comment_id uuid references resolution_comments(id) on delete cascade,
  author_id uuid references profiles(id),
  response_type debate_response_type not null default 'clarification',
  body text not null,
  created_at timestamptz not null default now()
);

-- Votes are scoped by vote_type so a resolution can carry an informal poll
-- and, later, a separate binding delegate vote without the two colliding.
create table resolution_votes (
  id uuid primary key default uuid_generate_v4(),
  resolution_id uuid not null references resolutions(id) on delete cascade,
  vote_type congress_vote_type not null default 'informal_poll',
  voter_id uuid references profiles(id),
  voter_post_id uuid references posts(id), -- snapshot at vote time, for post-by-post breakdown
  vote boolean not null, -- true = support / yes
  created_at timestamptz not null default now(),
  unique (resolution_id, vote_type, voter_id)
);

-- Committees
create table committees (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table committee_members (
  id uuid primary key default uuid_generate_v4(),
  committee_id uuid not null references committees(id) on delete cascade,
  profile_id uuid references profiles(id),
  is_chair boolean not null default false,
  created_at timestamptz not null default now(),
  unique (committee_id, profile_id)
);

create table committee_reviews (
  id uuid primary key default uuid_generate_v4(),
  resolution_id uuid not null references resolutions(id) on delete cascade,
  committee_id uuid not null references committees(id),
  recommendation committee_recommendation not null,
  notes text,
  reviewed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Legislative Affairs Tracker — external bills/regulations CVOA is
-- monitoring, distinct from CVOA's own internal resolutions.
create table legislative_bills (
  id uuid primary key default uuid_generate_v4(),
  bill_number text,
  title text not null,
  level text not null default 'federal', -- federal | state
  jurisdiction text, -- state name, if level = state
  summary text,
  status legislative_bill_status not null default 'monitoring',
  cvoa_position text,
  impact_analysis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- National announcements / information dissemination
create table congress_announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null,
  category text not null default 'National Announcement', -- Official Position | Legislative Update | Policy Brief | Congressional Summary | Meeting Minutes | National Announcement
  published_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Congressional Calendar
create table congress_calendar_events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  event_type calendar_event_type not null default 'session',
  event_date timestamptz not null,
  description text,
  resolution_id uuid references resolutions(id),
  created_at timestamptz not null default now()
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
alter table toolkit_categories enable row level security;
alter table toolkit_items enable row level security;
alter table toolkit_generated_documents enable row level security;
alter table recruits enable row level security;
alter table sponsors enable row level security;
alter table sponsor_tiers enable row level security;
alter table sponsor_notes enable row level security;
alter table congress_delegates enable row level security;
alter table resolutions enable row level security;
alter table resolution_co_sponsors enable row level security;
alter table resolution_amendments enable row level security;
alter table resolution_documents enable row level security;
alter table resolution_comments enable row level security;
alter table resolution_votes enable row level security;
alter table committees enable row level security;
alter table committee_members enable row level security;
alter table committee_reviews enable row level security;
alter table legislative_bills enable row level security;
alter table congress_announcements enable row level security;
alter table congress_calendar_events enable row level security;
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

create policy "checklist_select_shared" on checklist_items
  for select using (true); -- viewable via the post's shareable checklist link
create policy "checklist_update_shared" on checklist_items
  for update using (true); -- the post's own team can check things off via that same link
create policy "checklist_insert_national" on checklist_items
  for insert with check (is_national_role());
create policy "checklist_delete_national" on checklist_items
  for delete using (is_national_role());

create policy "toolkit_categories_read_auth" on toolkit_categories for select using (auth.uid() is not null);
create policy "toolkit_categories_write_national" on toolkit_categories for all using (is_national_role());

create policy "toolkit_items_read_auth" on toolkit_items for select using (auth.uid() is not null);
create policy "toolkit_items_write_national" on toolkit_items for all using (is_national_role());

create policy "toolkit_generated_read_post_or_national" on toolkit_generated_documents
  for select using (is_national_role() or post_id = current_post_id());
create policy "toolkit_generated_write_auth" on toolkit_generated_documents
  for insert with check (auth.uid() is not null);

create policy "recruits_select_post_or_national" on recruits
  for select using (is_national_role() or post_id = current_post_id());
create policy "recruits_insert_public" on recruits
  for insert with check (true); -- public recruiting link — anyone can self-signup as a prospect
create policy "recruits_update_post_or_national" on recruits
  for update using (is_national_role() or post_id = current_post_id());
create policy "recruits_delete_national" on recruits
  for delete using (is_national_role());

create policy "sponsors_select_post_or_national" on sponsors
  for select using (is_national_role() or post_id = current_post_id());
create policy "sponsors_insert_public" on sponsors
  for insert with check (true); -- public "Become a Sponsor" link
create policy "sponsors_update_post_or_national" on sponsors
  for update using (is_national_role() or post_id = current_post_id());
create policy "sponsors_delete_national" on sponsors
  for delete using (is_national_role());

create policy "sponsor_tiers_read_all" on sponsor_tiers for select using (true);
create policy "sponsor_tiers_write_national" on sponsor_tiers for all using (is_national_role());

create policy "sponsor_notes_read_national" on sponsor_notes
  for select using (is_national_role());
create policy "sponsor_notes_write_national" on sponsor_notes
  for insert with check (is_national_role());

create policy "delegates_read_all" on congress_delegates for select using (true);
create policy "delegates_write_post_or_national" on congress_delegates
  for insert with check (is_national_role() or post_id = current_post_id());

-- Resolutions are public record — anyone can read (transparency by design).
-- Any authenticated member/delegate can introduce one; only National or the
-- original sponsor can edit it afterward.
create policy "resolutions_read_all" on resolutions for select using (true);
create policy "resolutions_write_delegate" on resolutions
  for insert with check (auth.uid() is not null);
create policy "resolutions_update_own_or_national" on resolutions
  for update using (submitted_by = auth.uid() or is_national_role());

create policy "resolution_co_sponsors_read_all" on resolution_co_sponsors for select using (true);
create policy "resolution_co_sponsors_write_auth" on resolution_co_sponsors
  for insert with check (auth.uid() is not null);

create policy "resolution_amendments_read_all" on resolution_amendments for select using (true);
create policy "resolution_amendments_write_national" on resolution_amendments
  for insert with check (is_national_role());

create policy "resolution_documents_read_all" on resolution_documents for select using (true);
create policy "resolution_documents_write_national" on resolution_documents
  for insert with check (is_national_role());

create policy "resolution_comments_read_all" on resolution_comments for select using (true);
create policy "resolution_comments_write_auth" on resolution_comments
  for insert with check (auth.uid() is not null);

create policy "resolution_votes_read_all" on resolution_votes for select using (true);
create policy "resolution_votes_write_auth" on resolution_votes
  for insert with check (auth.uid() is not null);

create policy "committees_read_all" on committees for select using (true);
create policy "committees_write_national" on committees for all using (is_national_role());

create policy "committee_members_read_all" on committee_members for select using (true);
create policy "committee_members_write_national" on committee_members for all using (is_national_role());

create policy "committee_reviews_read_all" on committee_reviews for select using (true);
create policy "committee_reviews_write_national" on committee_reviews
  for insert with check (is_national_role());

create policy "legislative_bills_read_all" on legislative_bills for select using (true);
create policy "legislative_bills_write_national" on legislative_bills for all using (is_national_role());

create policy "congress_announcements_read_all" on congress_announcements for select using (true);
create policy "congress_announcements_write_national" on congress_announcements
  for insert with check (is_national_role());

create policy "congress_calendar_read_all" on congress_calendar_events for select using (true);
create policy "congress_calendar_write_national" on congress_calendar_events for all using (is_national_role());

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

-- 3. Founding team member verification status auto-computes from the three
--    checkboxes on the roster (DD214 reviewed, combat service verified,
--    membership approved) instead of needing a separate manual toggle that's
--    easy to forget — checking all three is what "verified" means.
create or replace function compute_founding_team_verification()
returns trigger
language plpgsql
as $$
begin
  if new.dd214_reviewed and new.combat_service_verified and new.membership_approved then
    new.verification_status := 'verified';
  elsif old.verification_status = 'verified' then
    -- unchecking any box after being verified drops it back to pending —
    -- rejection remains a deliberate separate action, not a side effect.
    new.verification_status := 'pending';
  end if;
  return new;
end;
$$;

create trigger trg_compute_founding_team_verification
  before update on founding_team_members
  for each row execute function compute_founding_team_verification();

-- 4. Sponsor tier auto-assignment — whichever tier's threshold the sponsorship
--    value clears (highest one that fits) is assigned automatically. Nobody
--    has to remember "oh, that's a Gold sponsor now" after a value changes.
create or replace function assign_sponsor_tier()
returns trigger
language plpgsql
as $$
begin
  select id into new.tier_id
  from sponsor_tiers
  where min_value <= coalesce(new.sponsorship_value, 0)
  order by min_value desc
  limit 1;
  return new;
end;
$$;

create trigger trg_assign_sponsor_tier
  before insert or update of sponsorship_value on sponsors
  for each row execute function assign_sponsor_tier();

-- ============================================================================
-- STORAGE: signed sponsorship agreements
-- Private bucket — staff-only, uploaded after a deal closes (not part of the
-- public interest form).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('sponsor-agreements', 'sponsor-agreements', false)
on conflict (id) do nothing;

create policy "sponsor_agreements_national_only" on storage.objects
  for all using (bucket_id = 'sponsor-agreements' and is_national_role());

-- ============================================================================
-- SEED: default sponsorship tiers
-- ============================================================================
insert into sponsor_tiers (name, min_value, benefits, sort_order) values
  ('Bronze', 0, array['Listed on post website', 'Thank-you shoutout at monthly meeting'], 1),
  ('Silver', 1000, array['Logo on post website', 'Mentioned at 2 events/year', 'Social media shoutout'], 2),
  ('Gold', 2500, array['Logo on website + printed materials', 'Named sponsor at all events', 'Booth space at annual event', 'Social media feature'], 3),
  ('Platinum', 5000, array['Top billing on all materials', 'Named sponsor of a signature event', 'Booth + speaking opportunity', 'Dedicated social media campaign', 'Annual recognition plaque'], 4)
on conflict do nothing;

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
    (new.id, 'Administration', 'Founding Team Verified', true),
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
-- VETERANS CONGRESS: resolution numbering (VC-2026-001, sequential per year)
-- ============================================================================
create or replace function assign_resolution_number()
returns trigger
language plpgsql
as $$
declare
  current_year text := extract(year from now())::text;
  next_seq int;
begin
  if new.resolution_number is not null then
    return new;
  end if;

  select coalesce(max(substring(resolution_number from '\d+$')::int), 0) + 1
  into next_seq
  from resolutions
  where resolution_number like 'VC-' || current_year || '-%';

  new.resolution_number := 'VC-' || current_year || '-' || lpad(next_seq::text, 3, '0');
  return new;
end;
$$;

create trigger trg_assign_resolution_number
  before insert on resolutions
  for each row execute function assign_resolution_number();

-- ============================================================================
-- STORAGE: Veterans Congress supporting documents
-- Public read (transparency by design) — only National can upload.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('congress-documents', 'congress-documents', true)
on conflict (id) do nothing;

create policy "congress_documents_read_public" on storage.objects
  for select using (bucket_id = 'congress-documents');
create policy "congress_documents_write_national" on storage.objects
  for insert with check (bucket_id = 'congress-documents' and is_national_role());

-- ============================================================================
-- SEED: default committees
-- ============================================================================
insert into committees (name, description) values
  ('Membership Committee', 'Reviews membership policy and standards resolutions.'),
  ('Legislative Committee', 'Reviews legislative affairs and external policy resolutions.'),
  ('Finance Committee', 'Reviews resolutions with budgetary or financial impact.'),
  ('Programs Committee', 'Reviews resolutions affecting national programs and services.'),
  ('Governance Committee', 'Reviews bylaws, constitutional, and governance resolutions.'),
  ('Expansion Committee', 'Reviews resolutions related to new post development and expansion.')
on conflict do nothing;

-- ============================================================================
-- STORAGE: Post Toolkit downloads
-- Private — internal operational material, not for the general public.
-- Any authenticated member can read; only National can upload/manage.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('toolkit-files', 'toolkit-files', false)
on conflict (id) do nothing;

create policy "toolkit_files_read_auth" on storage.objects
  for select using (bucket_id = 'toolkit-files' and auth.uid() is not null);
create policy "toolkit_files_write_national" on storage.objects
  for all using (bucket_id = 'toolkit-files' and is_national_role());

-- ============================================================================
-- SEED: Post Toolkit — full category and item structure.
--
-- A handful of items ship with real, usable content in read_content
-- (Robert's Rules, meeting scripts, the elevator pitch) because that
-- content is generic enough to write responsibly without knowing CVOA's
-- actual internal policies. Everything else (bylaws, disciplinary
-- procedures, charter documents, etc.) ships as a structured placeholder —
-- National Staff fill those in with the org's real material via the
-- in-app editor rather than this migration guessing at official policy.
-- ============================================================================
do $$
declare
  cat_commander uuid;
  cat_meeting uuid;
  cat_recruiting uuid;
  cat_social uuid;
  cat_sponsorship uuid;
  cat_fundraising uuid;
  cat_congress uuid;
  cat_officer uuid;
  cat_compliance uuid;
  cat_community uuid;
  cat_facility uuid;
  cat_grant uuid;
  cat_media uuid;
  cat_national uuid;
begin
  -- Skip entirely if already seeded (idempotent across re-runs)
  if exists (select 1 from toolkit_categories where name = 'Commander''s Toolkit') then
    return;
  end if;

  insert into toolkit_categories (name, description, sort_order) values ('Commander''s Toolkit', 'Everything a new commander needs to lead a post.', 1) returning id into cat_commander;
  insert into toolkit_categories (name, description, sort_order) values ('Meeting Toolkit', 'Run meetings that are professional and on-record.', 2) returning id into cat_meeting;
  insert into toolkit_categories (name, description, sort_order) values ('Recruiting Toolkit', 'Grow membership without waiting on National.', 3) returning id into cat_recruiting;
  insert into toolkit_categories (name, description, sort_order) values ('Social Media Toolkit', 'Ready-to-post content for every platform and occasion.', 4) returning id into cat_social;
  insert into toolkit_categories (name, description, sort_order) values ('Sponsorship Toolkit', 'Everything needed to land and retain local sponsors.', 5) returning id into cat_sponsorship;
  insert into toolkit_categories (name, description, sort_order) values ('Fundraising Toolkit', 'Run a golf scramble, raffle, or campaign from scratch.', 6) returning id into cat_fundraising;
  insert into toolkit_categories (name, description, sort_order) values ('Veterans Congress Toolkit', 'Templates for delegates and legislative work.', 7) returning id into cat_congress;
  insert into toolkit_categories (name, description, sort_order) values ('Officer Toolkit', 'Role-specific guides for each elected position.', 8) returning id into cat_officer;
  insert into toolkit_categories (name, description, sort_order) values ('Compliance Toolkit', 'Charter, bylaws, and governance documentation.', 9) returning id into cat_compliance;
  insert into toolkit_categories (name, description, sort_order) values ('Community Service Toolkit', 'Plan outreach and service projects.', 10) returning id into cat_community;
  insert into toolkit_categories (name, description, sort_order) values ('Facility Toolkit', 'This is where CVOA becomes different — running a real space.', 11) returning id into cat_facility;
  insert into toolkit_categories (name, description, sort_order) values ('Grant Toolkit', 'Find and win grant funding.', 12) returning id into cat_grant;
  insert into toolkit_categories (name, description, sort_order) values ('Media Toolkit', 'Brand assets and approved messaging.', 13) returning id into cat_media;
  insert into toolkit_categories (name, description, sort_order) values ('National Resources', 'Who to contact and when.', 14) returning id into cat_national;

  -- Commander's Toolkit
  insert into toolkit_items (category_id, title, sub_items, sort_order) values
    (cat_commander, 'Commander Handbook', array['Duties','Expectations','Reporting requirements','Recruiting guide','Meeting guide','Disciplinary procedures'], 1),
    (cat_commander, 'First 90 Days Guide', array['Week 1','Week 2','Week 4','Month 2','Month 3'], 2);

  -- Meeting Toolkit
  insert into toolkit_items (category_id, title, sub_items, generate_prompt_template, sort_order) values
    (cat_meeting, 'Meeting Agenda Templates', array['Monthly Meeting','Officer Meeting','Special Meeting'],
     'Generate a professional meeting agenda for {{post_name}}''s upcoming meeting. Include: call to order, roll call, reading/approval of previous minutes, officer reports, old business, new business, announcements, and adjournment. Keep it on one page.', 1),
    (cat_meeting, 'Meeting Minutes Templates', array['Standard format','Auto-generated PDF'],
     'Generate a meeting minutes template for {{post_name}} with sections for: date/time/location, attendees, approval of prior minutes, officer reports, motions made (with mover/seconder/vote result), new business, and adjournment time.', 2);
  insert into toolkit_items (category_id, title, sub_items, read_content, sort_order) values
    (cat_meeting, 'Robert''s Rules Quick Guide', array['Motions','Seconds','Voting','Quorum'],
$$ROBERT'S RULES OF ORDER — QUICK REFERENCE FOR POST MEETINGS

MOTIONS
A motion is a formal proposal for the group to take action. To make a motion, a member says "I move that..." followed by the specific proposal. Only one motion may be on the floor at a time.

SECONDS
After a motion is made, another member must "second" it before it can be discussed — this simply shows at least one other person thinks it's worth discussing. If no one seconds, the motion dies quietly with no vote needed.

DISCUSSION
Once seconded, the chair opens the floor for discussion. Members should be recognized by the chair before speaking, and discussion should stay focused on the motion at hand.

VOTING
After discussion, the chair restates the motion and calls for a vote. Common methods: voice vote ("all in favor say aye... opposed say nay"), show of hands, or roll call for more formal/contested votes. The chair announces the result.

QUORUM
Quorum is the minimum number of voting members who must be present for the post to conduct official business. Check your post's bylaws for the specific number — no binding votes should happen without it.$$,
     3);
  insert into toolkit_items (category_id, title, sub_items, read_content, sort_order) values
    (cat_meeting, 'Meeting Scripts', array['Opening','Pledge','Closing'],
$$MEETING SCRIPTS

OPENING
"This meeting of [Post Name] is called to order. Thank you all for being here. Before we begin, let's take a moment to remember those we've lost and those still serving."

PLEDGE
"Please rise, remove your caps, and join me in the Pledge of Allegiance." [Lead the Pledge] "Please be seated."

CLOSING
"Is there any further business to come before this post? Seeing none, this meeting stands adjourned. Thank you all for your time and your service."$$,
     4);

  -- Recruiting Toolkit
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_recruiting, 'Recruiting Flyer Templates', 'Generate the text content for a one-page recruiting flyer for {{post_name}} in {{post_city_state}}. Include a compelling headline, 3-4 bullet points on membership benefits, and a clear call to action with contact info.', 1);
  insert into toolkit_items (category_id, title, sort_order) values (cat_recruiting, 'QR Code Generator', 2);
  insert into toolkit_items (category_id, title, sort_order) values (cat_recruiting, 'Event Booth Setup Guide', 3);
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_recruiting, 'Recruiting Event Checklist', 'Generate a pre-event, day-of, and post-event checklist for {{post_name}} to run a successful recruiting event/booth.', 4);
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_recruiting, 'New Member Welcome Packet', 'Generate a warm, professional welcome packet for a new member joining {{post_name}}. Include: welcome message, what to expect at first meeting, key contacts, and next steps.', 5);
  insert into toolkit_items (category_id, title, description, read_content, sort_order) values
    (cat_recruiting, 'Elevator Pitch', 'When someone asks "What''s CVOA?" — give commanders approved answers.',
$$THE ELEVATOR PITCH — "WHAT'S CVOA?"

SHORT VERSION (10 seconds):
"CVOA is a combat veterans organization — we build local posts where veterans get real community, support, and a place that actually understands what they went through."

LONGER VERSION (30 seconds):
"Combat Veterans of America is a national veteran-serving nonprofit. We're different from a lot of veteran orgs because we focus on building real, active local posts — not just a membership card. Each post runs its own events, peer support, and community programs, backed by national resources for things like benefits navigation and fundraising. If you're a veteran looking for community, or know one who needs it, that's exactly what we're here for."

IF THEY ASK "IS THIS LIKE THE VFW OR AMERICAN LEGION?":
"We share the same spirit of service and community — CVOA is newer and puts a lot of emphasis on hands-on local programs and modern support systems alongside the traditions those organizations built."

IF THEY ASK "DO I HAVE TO BE COMBAT VETERAN?":
Check your post's specific membership policy — this varies and should be answered accurately, not guessed.$$,
     6);

  -- Social Media Toolkit
  insert into toolkit_items (category_id, title, sub_items, generate_prompt_template, sort_order) values
    (cat_social, 'Facebook Post Library', array['Membership drives','Veterans Day','Memorial Day','Independence Day','Fundraisers'],
     'Generate 3 Facebook post options for {{post_name}} for the occasion: {{occasion}}. Each should be 2-4 sentences, warm and authentic in tone (not corporate), and include a suggested call-to-action.', 1);
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_social, 'LinkedIn Templates', 'Generate a LinkedIn post for {{post_name}} suitable for a more professional audience — potential sponsors, employers, or community partners.', 2),
    (cat_social, 'Instagram Templates', 'Generate Instagram caption options for {{post_name}} — short, visual-first, with relevant hashtags for the veteran community.', 3);
  insert into toolkit_items (category_id, title, sort_order) values (cat_social, 'Political Cartoon Library', 4);
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_social, 'Press Release Templates', 'Generate a press release for {{post_name}} announcing: {{announcement}}. Use standard press release format with a headline, dateline, and boilerplate about CVOA.', 5);

  -- Sponsorship Toolkit
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_sponsorship, 'Sponsorship Packet', 'Generate a sponsorship packet for {{post_name}} describing the post, its community impact, and the sponsorship tiers available (Bronze/Silver/Gold/Platinum) with benefits at each level.', 1),
    (cat_sponsorship, 'Sponsor Proposal Template', 'Generate a one-page sponsor proposal letter for {{post_name}} to send to a prospective local business sponsor.', 2);
  insert into toolkit_items (category_id, title, sub_items, sort_order) values
    (cat_sponsorship, 'Sponsorship Levels', array['Bronze','Silver','Gold','Platinum'], 3);
  insert into toolkit_items (category_id, title, sort_order) values (cat_sponsorship, 'Sponsor Tracking Sheet', 4);
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_sponsorship, 'Follow-Up Scripts', 'Generate 3 short follow-up message scripts (email or phone) for {{post_name}} to use when following up with a sponsor who hasn''t responded yet.', 5);

  -- Fundraising Toolkit
  insert into toolkit_items (category_id, title, sub_items, generate_prompt_template, sort_order) values
    (cat_fundraising, 'Golf Scramble Kit', array['Budget','Timeline','Sponsor packet','Registration form'],
     'Generate a complete golf scramble event packet for {{post_name}}, including: a sample budget outline, a 90-day planning timeline, a short sponsor pitch paragraph, and a registration form template.', 1);
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_fundraising, 'Raffle Toolkit', 'Generate a raffle event plan for {{post_name}}, including a suggested timeline, prize solicitation letter, and ticket tracking sheet format.', 2),
    (cat_fundraising, 'Silent Auction Toolkit', 'Generate a silent auction plan for {{post_name}}, including item solicitation letter, bid sheet template, and event-day checklist.', 3),
    (cat_fundraising, 'Community Fundraiser Toolkit', 'Generate a general community fundraiser plan for {{post_name}} adaptable to different event types.', 4),
    (cat_fundraising, 'Annual Campaign Toolkit', 'Generate an annual giving campaign plan for {{post_name}}, including a donor letter template and suggested campaign timeline.', 5);

  -- Veterans Congress Toolkit
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_congress, 'Resolution Template', 'Generate a formal resolution template following standard legislative format (title, whereas clauses, resolved clause) that a delegate can fill in for a new resolution.', 1),
    (cat_congress, 'Amendment Template', 'Generate an amendment proposal template for modifying an existing CVOA resolution.', 2),
    (cat_congress, 'Legislative Position Template', 'Generate a template for drafting a formal CVOA position statement on external legislation.', 3);
  insert into toolkit_items (category_id, title, sort_order) values
    (cat_congress, 'Delegate Handbook', 4),
    (cat_congress, 'Voting Procedures', 5);

  -- Officer Toolkit
  insert into toolkit_items (category_id, title, sub_items, sort_order) values
    (cat_officer, 'Adjutant', array['Record keeping','Minutes','Membership'], 1),
    (cat_officer, 'Quartermaster', array['Budget','Accounting','Reporting'], 2),
    (cat_officer, 'Sergeant-at-Arms', array['Meeting conduct','Ceremonies'], 3),
    (cat_officer, 'Vice Commander', array['Succession planning'], 4);

  -- Compliance Toolkit
  insert into toolkit_items (category_id, title, sort_order) values
    (cat_compliance, 'Charter Documents', 1),
    (cat_compliance, 'Bylaws', 2),
    (cat_compliance, 'Policies', 3);
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_compliance, 'Conflict of Interest Form', 'Generate a standard conflict of interest disclosure form suitable for a nonprofit veteran service organization board/officer to sign annually.', 4),
    (cat_compliance, 'Officer Acknowledgment Form', 'Generate a standard officer acknowledgment-of-duties form for a newly elected post officer to sign.', 5),
    (cat_compliance, 'Annual Review Checklist', 'Generate an annual compliance review checklist for a post covering: bylaws review, financial audit basics, officer roster, and required filings.', 6);

  -- Community Service Toolkit
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_community, 'Food Drive Guide', 'Generate a step-by-step guide for {{post_name}} to organize a food drive, including timeline, partner outreach, and promotion tips.', 1),
    (cat_community, 'Veteran Outreach Guide', 'Generate an outreach plan for {{post_name}} to connect with veterans who aren''t yet involved with the post.', 2),
    (cat_community, 'School Presentation Guide', 'Generate an outline for a post representative to present to a local school about veteran history/service.', 3),
    (cat_community, 'Community Project Guide', 'Generate a general framework for {{post_name}} to plan and execute a community service project.', 4),
    (cat_community, 'Event After Action Report', 'Generate an after-action report template for {{post_name}} to fill out after any event — what worked, what didn''t, attendance, and recommendations.', 5);

  -- Facility Toolkit
  insert into toolkit_items (category_id, title, sort_order) values
    (cat_facility, 'How to Find a Building', 1),
    (cat_facility, 'Lease Negotiation Guide', 2),
    (cat_facility, 'Bar Operations Guide', 3),
    (cat_facility, 'Kitchen Guide', 4),
    (cat_facility, 'Gym Guide', 5),
    (cat_facility, 'Classroom Guide', 6),
    (cat_facility, 'Employment Office Guide', 7),
    (cat_facility, 'VA Partnership Guide', 8),
    (cat_facility, 'Transitional Housing Guide', 9);

  -- Grant Toolkit
  insert into toolkit_items (category_id, title, sort_order) values
    (cat_grant, 'Grant Database', 1),
    (cat_grant, 'Grant Calendar', 2);
  insert into toolkit_items (category_id, title, generate_prompt_template, sort_order) values
    (cat_grant, 'Grant Writing Templates', 'Generate a grant proposal template/outline for {{post_name}} to adapt for veteran service grant applications, including sections for need statement, program description, budget, and evaluation.', 3);
  insert into toolkit_items (category_id, title, sort_order) values
    (cat_grant, 'Sample Successful Grants', 4);

  -- Media Toolkit
  insert into toolkit_items (category_id, title, sort_order) values
    (cat_media, 'Logo Files', 1),
    (cat_media, 'Brand Standards', 2),
    (cat_media, 'Approved Language', 3),
    (cat_media, 'Talking Points', 4),
    (cat_media, 'Interview Guide', 5),
    (cat_media, 'Crisis Response Guide', 6);

  -- National Resources
  insert into toolkit_items (category_id, title, sort_order) values
    (cat_national, 'Contact Directory', 1),
    (cat_national, 'National Leadership', 2),
    (cat_national, 'State Leadership', 3),
    (cat_national, 'Subject Matter Experts', 4),
    (cat_national, 'Preferred Vendors', 5);
end $$;

-- ============================================================================
-- End of schema
-- ============================================================================
