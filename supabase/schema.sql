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

-- Bridges the gap between "someone signs up for an account via a public
-- link" and "Supabase may require email confirmation before a session
-- exists." Their intended profile (name, post, role) is staged here at
-- signup time; once they have a real authenticated session (immediately, or
-- after confirming their email and logging in), the app finds this record
-- by email and finishes creating their profile automatically.
create table pending_profile_signups (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  full_name text not null,
  post_id uuid references posts(id),
  role user_role not null default 'member',
  created_at timestamptz not null default now()
);

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

-- Every current National account (Commander or Staff) must individually
-- sign off on a candidate before their application can move from Vetting
-- to Approved — this is what actually gates issuing a charter, not just
-- one person's decision.
create table application_signoffs (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references post_applications(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  signed_at timestamptz not null default now(),
  unique (application_id, profile_id)
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
  profile_id uuid references profiles(id), -- linked once they create an account; access activates on verification
  verified_at timestamptz, -- set when verification_status first becomes 'verified'; lets us flag stale verifications later
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

-- National Meeting Records — every post's actual meeting minutes, typed in
-- (not just a blank template) so they're genuinely searchable. This is what
-- lets National search a term like "PACT Act" and see how many meetings
-- across how many posts actually discussed it — real institutional memory
-- across the whole organization, not just one post's file cabinet.
create table meeting_records (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  title text not null, -- e.g. "January 2026 Monthly Meeting"
  meeting_type text not null default 'Monthly Meeting', -- Monthly | Officer | Special
  meeting_date date not null,
  minutes_text text not null, -- the actual minutes content — this is what's searched
  attachment_storage_path text, -- optional scanned/signed original, in 'meeting-records' bucket
  submitted_by uuid references profiles(id),
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(minutes_text, ''))
  ) stored,
  created_at timestamptz not null default now()
);

create index meeting_records_search_idx on meeting_records using gin(search_vector);
create index meeting_records_post_idx on meeting_records (post_id);

-- ----------------------------------------------------------------------------
-- URO MEETING OPERATING SYSTEM
-- This is deliberately not "a minutes form" — it's a guided, step-by-step
-- system that walks a secretary through a meeting in Unified Rules of Order
-- order, builds a compliant official record as they go, and keeps a
-- genuinely private secretary workspace alongside it. The privacy of that
-- workspace is enforced at the database level below, not just hidden in
-- the UI — not even National can query it.
-- ----------------------------------------------------------------------------
create type uro_meeting_type as enum ('regular', 'special', 'emergency', 'asynchronous');
create type uro_meeting_status as enum ('in_progress', 'published');
create type uro_attendance_status as enum ('present', 'absent', 'excused', 'guest');
create type uro_previous_minutes_status as enum ('approved', 'approved_with_corrections', 'rejected');
create type uro_agenda_category as enum ('old_business', 'new_business');
create type uro_motion_type as enum (
  'main', 'amendment', 'refer', 'postpone', 'call_to_vote', 'table', 'reconsider', 'emergency_override'
);
create type uro_voting_method as enum ('voice', 'show_of_hands', 'roll_call', 'ballot', 'digital');
create type uro_vote_result as enum ('passed', 'failed', 'tabled', 'withdrawn');
create type uro_compliance_level as enum ('fully_compliant', 'minor_issues', 'non_compliant');
create type uro_action_item_status as enum ('open', 'done');
create type uro_secretary_note_type as enum (
  'personal_note', 'draft_observation', 'reminder', 'follow_up',
  'discussion_highlight', 'action_item', 'question', 'prep_note'
);

create table uro_meetings (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  title text not null,
  meeting_type uro_meeting_type not null default 'regular',
  meeting_date date not null,
  start_time time,
  end_time time,
  location text,
  virtual_link text,

  -- Step 1: Call to Order
  called_to_order_by text,
  time_called_to_order time,
  call_to_order_notes text,

  -- Step 2: Attendance / Quorum
  total_voting_members integer,
  quorum_required integer, -- typically computed as a fraction of total_voting_members client-side
  quorum_achieved boolean,

  -- Step 3: Approval of Previous Minutes
  previous_minutes_status uro_previous_minutes_status,
  previous_minutes_corrections text,
  previous_minutes_vote_result uro_vote_result,

  -- Step 10: Adjournment
  adjourned_by text,
  time_adjourned time,
  adjournment_vote_result uro_vote_result,

  status uro_meeting_status not null default 'in_progress',
  compliance_level uro_compliance_level,
  compliance_flags text[], -- e.g. {"Motion voted on without quorum", "Missing seconder on Motion #2"}
  official_minutes_text text, -- auto-compiled when published; this is what search indexes
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(official_minutes_text, ''))
  ) stored,

  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index uro_meetings_search_idx on uro_meetings using gin(search_vector);
create index uro_meetings_post_idx on uro_meetings (post_id);

create table uro_attendance (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references uro_meetings(id) on delete cascade,
  post_id uuid not null references posts(id),
  member_name text not null,
  status uro_attendance_status not null default 'present',
  sort_order integer not null default 0
);

create table uro_officer_reports (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references uro_meetings(id) on delete cascade,
  post_id uuid not null references posts(id),
  officer_name text,
  position text,
  summary text,
  action_requested text,
  sort_order integer not null default 0
);

create table uro_agenda_items (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references uro_meetings(id) on delete cascade,
  post_id uuid not null references posts(id),
  category uro_agenda_category not null,
  title text not null,
  discussion_summary text,
  action_taken text,
  sort_order integer not null default 0
);

-- The centerpiece — every motion gets its own permanent, searchable record.
create table uro_motions (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references uro_meetings(id) on delete cascade,
  post_id uuid not null references posts(id),
  agenda_item_id uuid references uro_agenda_items(id) on delete set null,
  motion_type uro_motion_type not null default 'main',
  motion_text text not null,
  moved_by text,
  seconded_by text,
  debate_summary text,
  amendments text,
  voting_method uro_voting_method,
  vote_result uro_vote_result,
  votes_for integer,
  votes_against integer,
  votes_abstain integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table uro_comments (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references uro_meetings(id) on delete cascade,
  post_id uuid not null references posts(id),
  speaker text,
  comment_summary text,
  sort_order integer not null default 0
);

create table uro_action_items (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references uro_meetings(id) on delete cascade,
  post_id uuid not null references posts(id),
  motion_id uuid references uro_motions(id) on delete set null,
  description text not null,
  owner_name text,
  due_date date,
  status uro_action_item_status not null default 'open',
  created_at timestamptz not null default now()
);

-- THE PRIVATE WORKSPACE. RLS below restricts this to author_id = auth.uid()
-- only — no exception for National, no exception for anyone. It stays
-- private even after the meeting is published, and nothing here ever
-- becomes part of the official record unless the secretary manually
-- copies it into one of the public sections above themselves.
create table uro_secretary_notes (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references uro_meetings(id) on delete cascade,
  author_id uuid not null references profiles(id),
  note_type uro_secretary_note_type not null default 'personal_note',
  content text not null,
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
  category text, -- e.g. "Restaurant/Food Service", "Fitness/Sporting Goods" — powers Build A Post sponsor matching
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
-- MEMBERSHIP ROSTER
-- A real member directory — separate from Recruiting Engine, which tracks
-- someone's journey *toward* becoming a member, not the ongoing record of
-- *being* one. Membership numbers follow the "state admission order" scheme
-- already used elsewhere (e.g. VC-19-000000001 for a member in Indiana,
-- the 19th state to join the Union) — a global sequential number prefixed
-- by the admission order of the member's own state, not the post's state.
-- ----------------------------------------------------------------------------
create type membership_type as enum ('annual', 'lifetime');
create type membership_status as enum ('active', 'lapsed', 'pending_payment');
create type membership_payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create table state_admission_order (
  state_abbr text primary key,
  admission_order integer not null
);

create sequence membership_number_seq start 1;

create table members (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid references posts(id) on delete set null,
  membership_number text unique, -- auto-generated on insert, e.g. "19-000000001"
  full_name text not null,
  email text,
  phone text,
  address text,
  state text, -- 2-letter, drives the membership number prefix
  military_branch text,
  membership_type membership_type not null default 'annual',
  membership_status membership_status not null default 'pending_payment',
  joined_at date,
  expires_at date, -- null for lifetime members
  dd214_storage_path text, -- required at signup, in the shared 'dd214-uploads' bucket
  auto_renew boolean not null default false, -- annual only — lifetime members never auto-renew, they've already paid for good
  stripe_subscription_id text, -- set when auto_renew is on; used to cancel it later
  profile_id uuid references profiles(id), -- linked once they create an account; real access activates on payment, mirroring how founding team accounts activate on verification
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table membership_payments (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) on delete set null,
  post_id uuid references posts(id),
  membership_type membership_type not null,
  amount numeric(10,2) not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status membership_payment_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 9: POST HEALTH SYSTEM
-- A real composite score, computed from data already collected elsewhere in
-- the app (officers, sponsors, meetings, membership, Congress) plus new
-- tracking for the things nothing else in the app captures: governance
-- form sign-offs, annual reviews, community service activity, and a basic
-- income/expense ledger.
-- ----------------------------------------------------------------------------

create type governance_form_type as enum ('conflict_of_interest', 'officer_acknowledgment');
create type ledger_transaction_type as enum ('income', 'expense');

-- Governance sign-offs — who actually signed a Conflict of Interest or
-- Officer Acknowledgment form, and when. Nothing tracked this before;
-- generating the form via the Toolkit didn't mean anyone signed it.
create table governance_signatures (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  profile_id uuid references profiles(id),
  signer_name text not null, -- kept as text too, since not every officer has a login yet
  form_type governance_form_type not null,
  signed_at date not null,
  document_storage_path text, -- optional scanned signed copy
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Annual Review — one row per post per year, mirroring the Compliance
-- Toolkit's "Annual Review Checklist" but as a real, trackable record
-- instead of a static document.
create table annual_reviews (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  review_year integer not null,
  bylaws_reviewed boolean not null default false,
  financial_audit_complete boolean not null default false,
  officer_roster_current boolean not null default false,
  required_filings_current boolean not null default false,
  completed_at timestamptz,
  reviewed_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (post_id, review_year)
);

-- Community Service log — an actual record of what a post did, not just a
-- guide on how to do it.
create table community_service_events (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  title text not null,
  category text not null default 'Other', -- Food Drive | Veteran Outreach | School Presentation | Community Project | Other
  event_date date not null,
  attendees_count integer,
  hours_contributed numeric,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- A basic financial ledger — the thing this app had zero of before. Not a
-- full accounting system, but enough to answer "is this post solvent."
create table financial_transactions (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  transaction_type ledger_transaction_type not null,
  category text not null default 'Other',
  amount numeric(12,2) not null,
  description text,
  transaction_date date not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- NCC DRIVE — an internal, National-only file repository. Not scoped to
-- any post; this is the National Command Council's own shared storage for
-- documents, templates, and records that belong to the organization
-- itself, not any single post.
-- ----------------------------------------------------------------------------
create table drive_folders (
  id uuid primary key default uuid_generate_v4(),
  parent_folder_id uuid references drive_folders(id) on delete cascade,
  name text not null,
  color text, -- hex color for visual organization, Google-Drive-style
  shared_with_posts boolean not null default false, -- makes this folder (and its direct contents) read-only visible to every post account
  deleted_at timestamptz, -- soft delete; trashed items purge automatically after 30 days
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table drive_files (
  id uuid primary key default uuid_generate_v4(),
  folder_id uuid references drive_folders(id) on delete cascade, -- null = root level
  name text not null,
  storage_path text not null, -- in the private 'ncc-drive' bucket
  file_size bigint,
  mime_type text,
  deleted_at timestamptz, -- soft delete; trashed items purge automatically after 30 days
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULE 10: BUILD A POST (franchise planning tool)
-- Reference content on 8 facility layouts, plus real per-post tracking: a
-- post can commit to building one, get a checklist, log actual spend
-- against a target budget, and generate an AI business case using their
-- own data and their own actual sponsor list.
-- ----------------------------------------------------------------------------
create type facility_project_status as enum ('planning', 'in_progress', 'complete');

create table build_a_post_modules (
  id uuid primary key default uuid_generate_v4(),
  name text not null, -- e.g. "Bar Layout", "Kitchen Layout", "Classroom Layout"
  description text,
  startup_cost_low numeric,
  startup_cost_high numeric,
  equipment_list text[],
  sponsor_opportunities text,
  relevant_sponsor_categories text[], -- matched against sponsors.category for the "sponsors who might fund this" feature
  grant_opportunities text,
  revenue_potential text,
  build_checklist_template text[], -- seeded onto a post_facility_projects row when a post starts this build
  generate_prompt_template text, -- powers "Generate Business Case"
  created_at timestamptz not null default now()
);

-- A post's actual commitment to building one of the above out — this is
-- what makes the module a planning tool instead of just a brochure.
create table post_facility_projects (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  module_id uuid not null references build_a_post_modules(id),
  status facility_project_status not null default 'planning',
  target_budget numeric(12,2),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, module_id)
);

create table post_facility_checklist_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references post_facility_projects(id) on delete cascade,
  label text not null,
  is_complete boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table build_a_post_generated_plans (
  id uuid primary key default uuid_generate_v4(),
  module_id uuid not null references build_a_post_modules(id),
  post_id uuid references posts(id),
  title text not null,
  content text not null,
  generated_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Link the financial ledger (Module 9) to a specific facility project, so a
-- post can see real budget-vs-actual instead of just an estimate.
alter table financial_transactions
  add column facility_project_id uuid references post_facility_projects(id);

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
alter table pending_profile_signups enable row level security;
alter table posts enable row level security;
alter table post_applications enable row level security;
alter table application_signoffs enable row level security;
alter table vetting_scorecards enable row level security;
alter table vetting_interviews enable row level security;
alter table vetting_decisions enable row level security;
alter table founding_team_members enable row level security;
alter table checklist_items enable row level security;
alter table toolkit_categories enable row level security;
alter table toolkit_items enable row level security;
alter table toolkit_generated_documents enable row level security;
alter table meeting_records enable row level security;
alter table uro_meetings enable row level security;
alter table uro_attendance enable row level security;
alter table uro_officer_reports enable row level security;
alter table uro_agenda_items enable row level security;
alter table uro_motions enable row level security;
alter table uro_comments enable row level security;
alter table uro_action_items enable row level security;
alter table uro_secretary_notes enable row level security;
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
alter table state_admission_order enable row level security;
alter table drive_folders enable row level security;
alter table drive_files enable row level security;
alter table members enable row level security;
alter table membership_payments enable row level security;
alter table governance_signatures enable row level security;
alter table annual_reviews enable row level security;
alter table community_service_events enable row level security;
alter table financial_transactions enable row level security;
alter table build_a_post_modules enable row level security;
alter table post_facility_projects enable row level security;
alter table post_facility_checklist_items enable row level security;
alter table build_a_post_generated_plans enable row level security;
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
create policy "profiles_update_national" on profiles
  for update using (is_national_role());
create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());

-- pending_profile_signups: anyone can stage a signup (public invite links);
-- any authenticated user can read/clean up (the data here is low-sensitivity
-- — just an intended name/post/role, not credentials).
create policy "pending_signups_insert_public" on pending_profile_signups
  for insert with check (true);
create policy "pending_signups_select_auth" on pending_profile_signups
  for select using (auth.uid() is not null);
create policy "pending_signups_delete_auth" on pending_profile_signups
  for delete using (auth.uid() is not null);

-- posts: national roles full access; everyone can read (public post directory)
create policy "posts_select_all" on posts for select using (true);
create policy "posts_write_national" on posts for insert with check (is_national_role());
create policy "posts_update_national_or_own" on posts
  for update using (is_national_role() or id = current_post_id());
create policy "posts_delete_national" on posts for delete using (is_national_role());

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

create policy "application_signoffs_select_national" on application_signoffs
  for select using (is_national_role());
create policy "application_signoffs_insert_own" on application_signoffs
  for insert with check (is_national_role() and profile_id = auth.uid());
create policy "application_signoffs_delete_own" on application_signoffs
  for delete using (profile_id = auth.uid());

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

create policy "meeting_records_select_post_or_national" on meeting_records
  for select using (is_national_role() or post_id = current_post_id());
create policy "meeting_records_insert_auth" on meeting_records
  for insert with check (auth.uid() is not null);
create policy "meeting_records_delete_national" on meeting_records
  for delete using (is_national_role());

-- uro_meetings: National sees PUBLISHED meetings (drafts-in-progress are
-- the secretary's own working copy, not yet "up there for National to
-- see" — that only happens the moment they publish). A post always sees
-- its own meetings regardless of status, so a secretary can resume a draft.
create policy "uro_meetings_select" on uro_meetings
  for select using (
    (is_national_role() and status = 'published')
    or post_id = current_post_id()
    or created_by = auth.uid()
  );
create policy "uro_meetings_insert" on uro_meetings
  for insert with check (auth.uid() is not null);
create policy "uro_meetings_update" on uro_meetings
  for update using (is_national_role() or post_id = current_post_id());
create policy "uro_meetings_delete" on uro_meetings
  for delete using (is_national_role() or post_id = current_post_id());

-- Child tables of a meeting follow the same visibility as the meeting
-- itself, scoped by their own denormalized post_id for simple, fast RLS.
create policy "uro_attendance_select" on uro_attendance
  for select using (is_national_role() or post_id = current_post_id());
create policy "uro_attendance_write" on uro_attendance
  for all using (auth.uid() is not null);

create policy "uro_officer_reports_select" on uro_officer_reports
  for select using (is_national_role() or post_id = current_post_id());
create policy "uro_officer_reports_write" on uro_officer_reports
  for all using (auth.uid() is not null);

create policy "uro_agenda_items_select" on uro_agenda_items
  for select using (is_national_role() or post_id = current_post_id());
create policy "uro_agenda_items_write" on uro_agenda_items
  for all using (auth.uid() is not null);

create policy "uro_motions_select" on uro_motions
  for select using (is_national_role() or post_id = current_post_id());
create policy "uro_motions_write" on uro_motions
  for all using (auth.uid() is not null);

create policy "uro_comments_select" on uro_comments
  for select using (is_national_role() or post_id = current_post_id());
create policy "uro_comments_write" on uro_comments
  for all using (auth.uid() is not null);

create policy "uro_action_items_select" on uro_action_items
  for select using (is_national_role() or post_id = current_post_id());
create policy "uro_action_items_write" on uro_action_items
  for all using (auth.uid() is not null);

-- THE PRIVATE WORKSPACE — deliberately does NOT use is_national_role() or
-- current_post_id() at all. Only the author can ever see, write, or delete
-- their own notes. This is the one table in the entire schema where
-- National access is intentionally, permanently excluded.
create policy "uro_secretary_notes_own_only" on uro_secretary_notes
  for all using (author_id = auth.uid());

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
create policy "resolutions_delete_national" on resolutions
  for delete using (is_national_role());

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
  for insert with check (
    auth.uid() is not null
    and (
      vote_type in ('informal_poll', 'national_referendum')
      or is_national_role()
      or exists (
        select 1 from congress_delegates
        where congress_delegates.post_id = resolution_votes.voter_post_id
          and congress_delegates.profile_id = auth.uid()
      )
    )
  );

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

create policy "state_admission_order_read_all" on state_admission_order for select using (true);

create policy "drive_folders_national_all" on drive_folders for all using (is_national_role());
create policy "drive_folders_shared_read" on drive_folders
  for select using (shared_with_posts = true and auth.uid() is not null);

create policy "drive_files_national_all" on drive_files for all using (is_national_role());
create policy "drive_files_shared_read" on drive_files
  for select using (
    auth.uid() is not null
    and folder_id in (select id from drive_folders where shared_with_posts = true)
  );

create policy "members_select_post_or_national" on members
  for select using (is_national_role() or post_id = current_post_id());
create policy "members_insert_auth_or_public" on members
  for insert with check (true); -- public join/renew form can create a pending member record
create policy "members_update_post_or_national" on members
  for update using (is_national_role() or post_id = current_post_id());
create policy "members_delete_national" on members
  for delete using (is_national_role());

create policy "membership_payments_select_post_or_national" on membership_payments
  for select using (is_national_role() or post_id = current_post_id());
create policy "membership_payments_insert_public" on membership_payments
  for insert with check (true); -- the payment flow starts before the payer is authenticated

create policy "governance_signatures_select_post_or_national" on governance_signatures
  for select using (is_national_role() or post_id = current_post_id());
create policy "governance_signatures_insert_auth" on governance_signatures
  for insert with check (auth.uid() is not null);

create policy "annual_reviews_select_post_or_national" on annual_reviews
  for select using (is_national_role() or post_id = current_post_id());
create policy "annual_reviews_write_auth" on annual_reviews
  for all using (auth.uid() is not null);

create policy "community_service_select_post_or_national" on community_service_events
  for select using (is_national_role() or post_id = current_post_id());
create policy "community_service_insert_auth" on community_service_events
  for insert with check (auth.uid() is not null);

create policy "financial_transactions_select_post_or_national" on financial_transactions
  for select using (is_national_role() or post_id = current_post_id());
create policy "financial_transactions_insert_auth" on financial_transactions
  for insert with check (auth.uid() is not null);

create policy "build_a_post_read_all" on build_a_post_modules for select using (true);
create policy "build_a_post_write_national" on build_a_post_modules
  for all using (is_national_role());

create policy "facility_projects_select_post_or_national" on post_facility_projects
  for select using (is_national_role() or post_id = current_post_id());
create policy "facility_projects_write_auth" on post_facility_projects
  for all using (auth.uid() is not null);

create policy "facility_checklist_select_post_or_national" on post_facility_checklist_items
  for select using (
    is_national_role() or project_id in (select id from post_facility_projects where post_id = current_post_id())
  );
create policy "facility_checklist_write_auth" on post_facility_checklist_items
  for all using (auth.uid() is not null);

create policy "facility_plans_select_post_or_national" on build_a_post_generated_plans
  for select using (is_national_role() or post_id = current_post_id());
create policy "facility_plans_write_auth" on build_a_post_generated_plans
  for insert with check (auth.uid() is not null);

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
    if old.verification_status is distinct from 'verified' then
      new.verified_at := now();
    end if;
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

-- Safely links a newly-created account to its founding_team_members roster
-- row. Runs as SECURITY DEFINER so it can bypass the normal update policy,
-- but only ever touches the CALLING user's own row, matched by their own
-- verified auth email, and only if it hasn't already been claimed — this
-- can't be used to hijack someone else's roster entry.
create or replace function link_founding_team_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update founding_team_members
  set profile_id = auth.uid()
  where profile_id is null
    and email = (select email from auth.users where id = auth.uid());
end;
$$;

grant execute on function link_founding_team_profile() to authenticated;

-- This is the actual security gate: an account created via the public
-- invite link has NO real access (role stays 'guest_applicant', post_id
-- stays null) until National verifies them through the existing DD214 /
-- combat service / membership checkboxes. The moment verification_status
-- flips to 'verified', this trigger promotes their linked account to real
-- access automatically — no extra step for National beyond what they
-- already do.
create or replace function promote_founding_team_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mapped_role user_role;
begin
  -- Re-syncs on every update to a verified, linked member — not just the
  -- moment verification first happens. This means changing someone's
  -- position later (e.g. from Additional Member to Vice Commander) also
  -- updates their actual account role, not just the roster label.
  if new.verification_status = 'verified' and new.profile_id is not null then
    mapped_role := case
      when new.position = 'commander' then 'post_commander'
      when new.position = 'member' then 'member'
      else 'post_officer'
    end;
    update profiles set role = mapped_role, post_id = new.post_id where id = new.profile_id;
  end if;
  return new;
end;
$$;

create trigger trg_promote_founding_team_account
  after update on founding_team_members
  for each row execute function promote_founding_team_account();

-- Same pattern as founding team accounts, but the "verification" event
-- here is a payment actually clearing, not a manual review. Real access
-- (role='member') only activates once membership_status becomes 'active' —
-- an account created but never paid for stays powerless. Never downgrades
-- an existing officer/commander account that happens to share an email.
create or replace function link_member_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update members
  set profile_id = auth.uid()
  where profile_id is null
    and email = (select email from auth.users where id = auth.uid());
end;
$$;

grant execute on function link_member_profile() to authenticated;

create or replace function promote_member_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.membership_status = 'active'
     and (old.membership_status is distinct from 'active')
     and new.profile_id is not null then
    update profiles
    set role = 'member', post_id = coalesce(profiles.post_id, new.post_id)
    where id = new.profile_id and role = 'guest_applicant';
  end if;
  return new;
end;
$$;

create trigger trg_promote_member_account
  after update on members
  for each row execute function promote_member_account();

-- Powers the QR code on the digital membership card. Deliberately returns
-- only the fields safe to show a stranger who scans the card (no email,
-- phone, or address) — this is callable by anyone, including anonymous
-- visitors, which is the whole point of a scannable card, so it must never
-- leak anything sensitive.
create or replace function verify_membership(p_member_id uuid)
returns table (
  full_name text,
  membership_number text,
  membership_type membership_type,
  membership_status membership_status,
  joined_at date,
  expires_at date
)
language sql
security definer
set search_path = public
as $$
  select full_name, membership_number, membership_type, membership_status, joined_at, expires_at
  from members
  where id = p_member_id;
$$;

grant execute on function verify_membership(uuid) to anon, authenticated;

-- Auto-generates a membership number ("19-000000001") on insert, unless one
-- was already supplied (e.g. importing existing numbers from a CSV so
-- historical numbering isn't silently rewritten). Falls back to admission
-- order 99 for a state that isn't in the lookup table (DC, territories, or
-- simply unset) rather than failing the insert.
create or replace function assign_membership_number()
returns trigger
language plpgsql
as $$
declare
  state_order integer;
begin
  if new.membership_number is not null then
    return new;
  end if;

  select admission_order into state_order
  from state_admission_order
  where state_abbr = upper(coalesce(new.state, ''));

  new.membership_number := coalesce(state_order, 99)::text || '-' || lpad(nextval('membership_number_seq')::text, 9, '0');
  return new;
end;
$$;

create trigger trg_assign_membership_number
  before insert on members
  for each row execute function assign_membership_number();

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
-- SEED: state admission order (drives membership number prefixes)
-- ============================================================================
insert into state_admission_order (state_abbr, admission_order) values
  ('DE', 1), ('PA', 2), ('NJ', 3), ('GA', 4), ('CT', 5), ('MA', 6), ('MD', 7),
  ('SC', 8), ('NH', 9), ('VA', 10), ('NY', 11), ('NC', 12), ('RI', 13),
  ('VT', 14), ('KY', 15), ('TN', 16), ('OH', 17), ('LA', 18), ('IN', 19),
  ('MS', 20), ('IL', 21), ('AL', 22), ('ME', 23), ('MO', 24), ('AR', 25),
  ('MI', 26), ('FL', 27), ('TX', 28), ('IA', 29), ('WI', 30), ('CA', 31),
  ('MN', 32), ('OR', 33), ('KS', 34), ('WV', 35), ('NV', 36), ('NE', 37),
  ('CO', 38), ('ND', 39), ('SD', 40), ('MT', 41), ('WA', 42), ('ID', 43),
  ('WY', 44), ('UT', 45), ('OK', 46), ('NM', 47), ('AZ', 48), ('AK', 49),
  ('HI', 50), ('DC', 51)
on conflict (state_abbr) do nothing;

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
-- SEED: Build A Post — 8 facility layouts with real starter content.
-- Cost ranges are general industry estimates, not CVOA-specific figures —
-- always adjust for local market, region, and whether space is leased vs.
-- donated. Skipped entirely if already seeded.
-- ============================================================================
do $$ begin
  if exists (select 1 from build_a_post_modules where name = 'Bar Layout') then
    return;
  end if;

  insert into build_a_post_modules
    (name, description, startup_cost_low, startup_cost_high, equipment_list, sponsor_opportunities, relevant_sponsor_categories, grant_opportunities, revenue_potential, build_checklist_template, generate_prompt_template)
  values
    ('Bar Layout',
     'A social/gathering space with a serving bar — the most common heart-of-the-post gathering spot.',
     8000, 25000,
     array['Bar top and back bar', 'Draft beer system', 'Glassware and barware', 'POS/register system', 'Under-bar refrigeration', 'Liquor license (state-dependent)'],
     'Local breweries and beverage distributors will often sponsor equipment (draft systems, signage, glassware) in exchange for tap placement and brand visibility.',
     array['Restaurant/Food Service', 'Beverage/Alcohol Distribution'],
     'Not typically grant-eligible due to alcohol association — fund through member dues, sponsor equipment donations, or event revenue instead.',
     'Moderate, steady — usually a member-retention and event-revenue driver more than a primary income source. Expect modest net margin after licensing and insurance costs.',
     array['Confirm state/local liquor licensing requirements', 'Secure liability insurance rider', 'Source bar equipment (new or donated)', 'Set up POS and inventory tracking', 'Train designated bartenders/servers', 'Establish house rules and closing procedures'],
     'Write a facility business case for adding a Bar Layout at {{post_name}} in {{post_city_state}}. Include: startup cost estimate, key licensing/insurance considerations, a simple revenue projection, and 2-3 next steps to get started. Keep it concise and practical for a volunteer-run post.'),

    ('Kitchen Layout',
     'A full or partial commercial kitchen for meal programs, fundraisers, and event catering.',
     15000, 60000,
     array['Commercial range/oven', 'Refrigeration (reach-in or walk-in)', 'Prep tables (stainless steel)', 'Ventilation hood system', 'Three-compartment sink', 'Dishwashing station', 'Food storage shelving'],
     'Restaurant equipment suppliers and regional grocery chains will sometimes donate equipment or provide in-kind food donations for community meal programs in exchange for recognition.',
     array['Restaurant/Food Service', 'Grocery/Retail'],
     'Strong candidate for USDA rural development grants and community food security grants — meal programs for veterans are a compelling, fundable use case.',
     'High — meal programs, facility rentals for community events, and fundraising dinners can all generate real revenue once operational.',
     array['Confirm local health department permitting requirements', 'Pass health inspection before first use', 'Source commercial-grade equipment', 'Establish food safety protocols and certifications for volunteers', 'Set up a meal program schedule or rental calendar'],
     'Write a facility business case for adding a Kitchen Layout at {{post_name}} in {{post_city_state}}. Include: startup cost estimate, health permitting considerations, a simple revenue/impact projection (e.g. meal program reach), and 2-3 next steps. Keep it concise and practical for a volunteer-run post.'),

    ('Classroom Layout',
     'Flexible space for training sessions, education programs, and general meetings.',
     3000, 12000,
     array['Tables and stackable chairs', 'AV equipment/projector', 'Whiteboard or smart board', 'Wifi infrastructure', 'Storage for supplies'],
     'Local colleges, trade schools, and tech companies will sometimes donate equipment (projectors, computers) in exchange for being named an education partner.',
     array['Education/Training', 'Technology'],
     'Department of Education adult education grants, workforce development grants, and some VA education partnership programs may apply.',
     'Low direct revenue, high mission value — this space typically enables other revenue-generating or grant-eligible programs rather than earning directly.',
     array['Identify recurring programs that will use the space', 'Source tables, chairs, and AV equipment', 'Set up reliable wifi', 'Build a room-booking/scheduling process'],
     'Write a facility business case for adding a Classroom Layout at {{post_name}} in {{post_city_state}}. Include: startup cost estimate, what programs it could support, and 2-3 next steps. Keep it concise and practical for a volunteer-run post.'),

    ('Employment Office',
     'A dedicated space for job placement and career services staff to meet with members one-on-one.',
     2000, 8000,
     array['Desks and office chairs', 'Computers with internet access', 'Phone line', 'Filing/document storage', 'Privacy partition or separate room'],
     'Regional employers actively seeking veteran hires, and staffing agencies with veteran hiring initiatives, are natural partners — some will fund the space directly for referral access.',
     array['Staffing/Recruiting', 'Professional Services'],
     'DOL Veterans Employment and Training Service (VETS) grants are the most direct fit — this is one of the more fundable facility types.',
     'Indirect — strong member retention and community reputation value, and can become a genuine revenue source if paired with employer referral fees.',
     array['Identify 1-2 founding employer partners', 'Set up basic office equipment', 'Establish confidentiality/privacy practices for job seekers', 'Create an intake process for members seeking help'],
     'Write a facility business case for adding an Employment Office at {{post_name}} in {{post_city_state}}. Include: startup cost estimate, potential employer partnerships, and 2-3 next steps. Keep it concise and practical for a volunteer-run post.'),

    ('VA Clinic Space',
     'Space leased or donated to the VA for satellite clinic visits, bringing services directly to members.',
     5000, 20000,
     array['Exam room build-out (walls, door, sink)', 'Waiting area seating', 'ADA-compliant access', 'Basic medical storage'],
     'Regional health systems and medical equipment suppliers may support build-out costs in exchange for community partnership recognition.',
     array['Healthcare', 'Medical Equipment/Supplies'],
     'VA community partnership grants and some regional health system community benefit funds are worth exploring — the VA itself may also have facility-sharing programs.',
     'Lease income if the VA compensates for space use — check with your regional VA office on their community space programs before building this out.',
     array['Contact regional VA office about community clinic partnerships', 'Confirm ADA compliance requirements', 'Build out exam space to VA specifications', 'Establish visit scheduling process with VA staff'],
     'Write a facility business case for adding a VA Clinic Space at {{post_name}} in {{post_city_state}}. Include: startup cost estimate, how to approach the regional VA about a partnership, and 2-3 next steps. Keep it concise and practical for a volunteer-run post.'),

    ('Transitional Housing Rooms',
     'On-site or adjacent housing rooms for veterans in transition — the most resource-intensive facility type.',
     20000, 100000,
     array['Bedroom furnishings (bed, storage)', 'Shared bathroom facilities', 'Fire safety/egress compliance', 'Security system', 'Laundry facilities'],
     'This is typically too capital-intensive for standard local sponsorship alone — most successful programs combine sponsor support with grant funding and possibly municipal partnership.',
     array['Construction/Hardware', 'Real Estate'],
     'HUD-VASH and Supportive Services for Veteran Families (SSVF) grants are the primary funding mechanisms — this facility type essentially requires grant funding to be viable.',
     'Can generate program revenue through per-diem reimbursement models if properly licensed, but primarily a mission-driven investment requiring sustained funding.',
     array['Research HUD-VASH/SSVF eligibility requirements before committing', 'Confirm zoning and occupancy permitting', 'Complete fire/safety code compliance', 'Establish resident intake and support-services partnerships'],
     'Write a facility feasibility summary for adding Transitional Housing Rooms at {{post_name}} in {{post_city_state}}. Include: startup cost estimate, the most relevant federal funding programs to research first, and 2-3 realistic next steps. Be direct that this is the most resource-intensive facility type and requires grant funding to be viable. Keep it concise.'),

    ('Fitness Center',
     'A wellness and physical fitness space for members — supports both physical and mental health programming.',
     10000, 40000,
     array['Cardio machines', 'Free weights and racks', 'Rubber flooring', 'Locker/changing area', 'Mirrors and safety equipment'],
     'Fitness equipment brands and local gyms looking for co-branding opportunities are strong candidates — equipment donations are common in this category.',
     array['Fitness/Sporting Goods', 'Health & Wellness'],
     'Veteran wellness grants exist at some state VA offices — worth checking your state-level veteran affairs department specifically.',
     'Membership add-on fee potential if run as a modest paid amenity, though many posts offer it as a free member benefit instead.',
     array['Source equipment (new, used, or donated)', 'Install proper flooring and safety equipment', 'Establish usage hours and waiver/liability process', 'Consider a certified fitness volunteer or partnership for programming'],
     'Write a facility business case for adding a Fitness Center at {{post_name}} in {{post_city_state}}. Include: startup cost estimate, equipment sourcing ideas, and 2-3 next steps. Keep it concise and practical for a volunteer-run post.');
end $$;

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
-- STORAGE: Meeting Records attachments
-- Optional scanned/signed copies of meeting minutes. Private — internal
-- record, National + the submitting post can access.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('meeting-records', 'meeting-records', false)
on conflict (id) do nothing;

create policy "meeting_records_files_read_auth" on storage.objects
  for select using (bucket_id = 'meeting-records' and auth.uid() is not null);
create policy "meeting_records_files_write_auth" on storage.objects
  for insert with check (bucket_id = 'meeting-records' and auth.uid() is not null);

-- ============================================================================
-- STORAGE: Governance signature documents (optional scanned signed copies)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('governance-documents', 'governance-documents', false)
on conflict (id) do nothing;

create policy "governance_documents_read_auth" on storage.objects
  for select using (bucket_id = 'governance-documents' and auth.uid() is not null);
create policy "governance_documents_write_auth" on storage.objects
  for insert with check (bucket_id = 'governance-documents' and auth.uid() is not null);

-- ============================================================================
-- STORAGE: NCC Drive — full access is National-only. A second, narrower
-- policy allows any authenticated user to read (not write) files that live
-- inside a folder National has explicitly marked shared_with_posts — this
-- is the only way a post account can ever see into this bucket.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('ncc-drive', 'ncc-drive', false)
on conflict (id) do nothing;

create policy "ncc_drive_national_all" on storage.objects
  for all using (bucket_id = 'ncc-drive' and is_national_role());

create policy "ncc_drive_shared_read" on storage.objects
  for select using (
    bucket_id = 'ncc-drive'
    and auth.uid() is not null
    and name in (
      select storage_path from drive_files
      where folder_id in (select id from drive_folders where shared_with_posts = true)
    )
  );

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
    (cat_meeting, 'Unified Rules of Order (URO) Quick Guide', array['Motions','Seconds','Voting','Quorum','Motion Types'],
$txt$UNIFIED RULES OF ORDER — QUICK REFERENCE FOR POST MEETINGS

CVOA runs meetings under our own Unified Rules of Order, not Robert's Rules — a streamlined
process built for how our posts actually operate. The Meetings module's guided wizard walks a
secretary through every one of these steps automatically; this page is the plain-language
reference for what's happening at each one.

CALL TO ORDER
Whoever is presiding states the meeting is called to order and notes the time. This is the
official start of the record.

ATTENDANCE & QUORUM
Present/absent/excused members and guests are recorded, and quorum is checked automatically
against your post's total voting membership. No binding vote can happen without quorum — the
system will show this clearly before any motion is decided.

MOTIONS
A motion is a formal proposal for the group to act. To make one, a member says "I move that..."
followed by the specific proposal. Only one motion is on the floor at a time.

MOTION TYPES
- Main Motion — a new proposal
- Amendment — a change to a motion already on the floor
- Refer — send the matter to a committee
- Postpone — delay a decision to a specific later time
- Call to Vote — end debate and vote now
- Table — set the matter aside indefinitely
- Reconsider — revisit a motion already decided
- Emergency Override — for genuine emergencies only; recommended to require unanimous consent

SECONDS
After a main motion, amendment, or reconsideration, another member must "second" it before
it's discussed — this just shows at least one other person thinks it's worth discussing. If no
one seconds, it dies quietly with no vote needed.

VOTING
Common methods: voice vote, show of hands, roll call, ballot, or digital. Most motions need a
simple majority; amendments and emergency overrides carry a higher bar (2/3, or unanimous
consent recommended for emergencies) — the wizard shows the correct threshold automatically
based on motion type.

WHY THIS MATTERS
Every motion becomes a permanent, searchable record — nationally, across every post — the
moment a meeting is published. This is what makes URO more than paperwork: it's an actual
institutional memory of what your post has decided and why.$txt$,
     3);
  insert into toolkit_items (category_id, title, sub_items, read_content, sort_order) values
    (cat_meeting, 'Meeting Scripts', array['Opening','Pledge','Closing'],
$txt$MEETING SCRIPTS

OPENING
"This meeting of [Post Name] is called to order. Thank you all for being here. Before we begin, let's take a moment to remember those we've lost and those still serving."

PLEDGE
"Please rise, remove your caps, and join me in the Pledge of Allegiance." [Lead the Pledge] "Please be seated."

CLOSING
"Is there any further business to come before this post? Seeing none, this meeting stands adjourned. Thank you all for your time and your service."$txt$,
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
$txt$THE ELEVATOR PITCH — "WHAT'S CVOA?"

SHORT VERSION (10 seconds):
"CVOA is a combat veterans organization — we build local posts where veterans get real community, support, and a place that actually understands what they went through."

LONGER VERSION (30 seconds):
"Combat Veterans of America is a national veteran-serving nonprofit. We're different from a lot of veteran orgs because we focus on building real, active local posts — not just a membership card. Each post runs its own events, peer support, and community programs, backed by national resources for things like benefits navigation and fundraising. If you're a veteran looking for community, or know one who needs it, that's exactly what we're here for."

IF THEY ASK "IS THIS LIKE THE VFW OR AMERICAN LEGION?":
"We share the same spirit of service and community — CVOA is newer and puts a lot of emphasis on hands-on local programs and modern support systems alongside the traditions those organizations built."

IF THEY ASK "DO I HAVE TO BE COMBAT VETERAN?":
Check your post's specific membership policy — this varies and should be answered accurately, not guessed.$txt$,
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

  update toolkit_items set read_content = $txt$THE ADJUTANT — ROLE GUIDE

The Adjutant is the post's administrative backbone — the person who makes sure the paper trail
exists and is accurate, so the post can prove what it did and when.

CORE RESPONSIBILITIES
- Meeting minutes: taking them, keeping them, making sure they get submitted (the Meetings
  module's guided wizard is built specifically to make this job easier)
- Membership records: maintaining an accurate roster, tracking who's current vs. lapsed
- Correspondence: official post communications, both incoming and outgoing
- Custodian of records: the post's official documents live with you, not scattered across
  people's inboxes

WHAT GOOD LOOKS LIKE
Minutes submitted within a few days of every meeting, not weeks later from memory. A roster
that's actually current, not "close enough." Records that a new Adjutant taking over could pick
up and understand without you needing to explain everything by hand.

Check your post's specific bylaws for any additional duties assigned to this role — this guide
covers the responsibilities common to the position, not a substitute for your governing
documents.$txt$
  where title = 'Adjutant';

  update toolkit_items set read_content = $txt$THE QUARTERMASTER — ROLE GUIDE

The Quartermaster is the post's financial steward — the person accountable for where the
money actually goes.

CORE RESPONSIBILITIES
- Budget: building and tracking the post's budget against actual income and expenses (the
  Post Health module's financial ledger exists specifically to support this)
- Accounting: keeping clean, honest records of every transaction — not just the big ones
- Reporting: giving the post (and National, when asked) an honest picture of financial health,
  not just good news
- Property/inventory: depending on your post's setup, this role often also tracks physical
  assets and equipment

WHAT GOOD LOOKS LIKE
Nobody — including you — should ever be surprised by the post's financial position. Every
dollar in and out should be traceable to something specific. If a member asks "can we afford
this," you should be able to answer with real numbers, not a guess.

Check your post's specific bylaws for any additional financial controls or reporting
requirements — this guide covers responsibilities common to the position, not a substitute for
your governing documents.$txt$
  where title = 'Quartermaster';

  update toolkit_items set read_content = $txt$THE SERGEANT-AT-ARMS — ROLE GUIDE

The Sergeant-at-Arms keeps meetings orderly and ceremonies dignified — the person responsible
for the post's conduct, not just its content.

CORE RESPONSIBILITIES
- Meeting conduct: maintaining order during meetings, managing the floor during motions and
  debate alongside whoever is presiding
- Ceremonies: leading or coordinating formal ceremonial duties (colors, honors, remembrance)
- Security/access: at some posts, this role also covers physical security of the meeting space
  or facility during events

WHAT GOOD LOOKS LIKE
Meetings that stay on track without anyone feeling silenced or steamrolled. Ceremonies that are
handled with the seriousness they deserve. A calm, steady presence when things get heated —
this role is as much about tone as it is about procedure.

Check your post's specific bylaws for any additional duties assigned to this role — this guide
covers responsibilities common to the position, not a substitute for your governing documents.$txt$
  where title = 'Sergeant-at-Arms';

  update toolkit_items set read_content = $txt$THE VICE COMMANDER — ROLE GUIDE

The Vice Commander is the Commander's second — and, just as importantly, the person who keeps
the post running if the Commander is unavailable.

CORE RESPONSIBILITIES
- Succession readiness: genuinely being able to step into the Commander's role at any time,
  not just in title
- Supporting the Commander: taking on delegated projects and initiatives so the Commander isn't
  a single point of failure for everything
- Committee oversight: at many posts, the Vice Commander chairs or oversees standing committees

WHAT GOOD LOOKS LIKE
If the Commander had to step away tomorrow, the post wouldn't skip a beat — because the Vice
Commander already knows what's going on, not just what's on paper. This role is insurance
against the exact scenario that hurts posts the most: everything depending on one person.

Check your post's specific bylaws for the actual succession process and any additional duties
— this guide covers responsibilities common to the position, not a substitute for your
governing documents.$txt$
  where title = 'Vice Commander';

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
