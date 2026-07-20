# CVOA Post OS

A franchise-style operating system for launching, managing, and scaling local CVOA posts —
so a veteran can go from "I want to start a post" to "I have a functioning chartered post"
without calling National Headquarters.

This is a **real, runnable scaffold**, not a mockup: React + Vite + TypeScript + Tailwind on
the frontend, Supabase (Postgres + Auth + RLS) on the backend, deployable to Vercel. It's a
standalone project — its own repo, its own Supabase project, separate from VHI.

## What's built vs. what's scaffolded

| Module | Status |
|---|---|
| Global Dashboard | Fully wired — live metrics, interactive US map colored by post health, activity feed |
| 1. Post Application Pipeline | Fully wired — kanban board + public application form, live Supabase writes |
| 2. Vetting System | Fully wired — scorecards (1–10 across 5 categories), notes |
| 3. Founding Team Builder | Fully wired — required positions, DD214/combat/membership verification checkboxes |
| 4. Post Launch Checklist | Fully wired — progress bar, categorized checklist, auto-seeded per new post |
| 5. Post Toolkit | List/download view wired to a `toolkit_templates` table — **you still need to upload the actual template files** to Supabase Storage and add rows |
| 6. Recruiting Engine | Fully wired — 8-stage kanban, conversion rate |
| 7. Sponsorship CRM | Fully wired — pipeline, revenue totals, leaderboard |
| 8. Veterans Congress | Fully wired for reading resolutions + vote counts; **submission/voting UI is a next step** |
| 9. Post Health System | Read view wired; **the health-scoring logic itself (rolling up attendance, retention, etc. into green/yellow/red) still needs to be written**, either as a SQL view or a scheduled function |
| 10. Build A Post | Wired to a `build_a_post_modules` table; **content (cost estimates, equipment lists per layout) needs to be seeded** — this is editorial content, not code |
| Role-based permissions | Enforced at the database level via Postgres RLS (see `supabase/schema.sql`); the `RoleGuard` component is available for UI-level gating too |

Everything reads and writes real Supabase tables. There's no mock data anywhere — until you
seed the database, screens will correctly show empty states.

## DD214 upload gate + hands-off intake automation

The public application form now requires a DD214 upload as Step 1 — the rest of the form
stays disabled until a file is attached. This is enforced two ways:

- **UI**: `PostApplicationForm` disables the entire form via a `<fieldset disabled>` until
  `dd214_storage_path` is set from a successful upload.
- **Staff pipeline**: an application without a DD214 on file shows a red "No DD214 on file"
  flag on its kanban card, and the "Advance" button is disabled — nobody can accidentally move
  an application forward without one.

Files upload to a private Supabase Storage bucket (`dd214-uploads`, created by `schema.sql`).
Only national roles can read them; this is enforced at the storage RLS level, not just in the
UI.

### Making intake actually hands-off

Two Postgres triggers already run with zero setup once you run `schema.sql`:
- Every new application logs itself to the Global Dashboard's activity feed automatically.
- A DD214 being attached (if uploaded after initial submission) also logs to the feed.

That covers *visibility* — you'll never have to remember to check. It does **not** cover
*emailing anyone*, because Postgres can't send email on its own. For that:

1. Sign up for [Resend](https://resend.com) (or Postmark/SendGrid — same pattern).
2. In Supabase: **Edge Functions → Secrets**, add `RESEND_API_KEY` and `STAFF_ALERT_EMAIL`.
3. Deploy the included function: `supabase functions deploy notify-new-application`
   (the code is at `supabase/functions/notify-new-application/index.ts` and is fully written —
   nothing to fill in besides the secrets above).
4. In Supabase: **Database → Webhooks → Create a new webhook** on `post_applications`,
   event = Insert, type = Edge Function, target = `notify-new-application`.

Once that's wired up, every submission automatically emails the applicant a confirmation and
alerts National Staff — no one has to check the dashboard for it to happen.

## Vetting scores, the Approved → Founding Team handoff, and the invite link

**Scores are now always visible.** Every application's detail view (the "View" button on its
pipeline card) shows a live average across every submitted scorecard, broken out by category
(Leadership, Communication, Professionalism, Reliability, Mission Alignment), plus a quick
score badge directly on the kanban card itself — no need to open anything to see where a
candidate stands.

**The Approved → Founding Team Building handoff is now real, not just a label change.**
Previously, advancing an application's status didn't actually connect it to anything — Module
3 (Founding Team Builder) and Module 4 (Launch Checklist) both key off a real `posts` row, not
`post_applications`. Now, the moment an application is advanced into Founding Team Building:
1. A new `posts` row is created automatically (status `founding_team_building`).
2. The application is linked to it (`post_applications.post_id` gets set).
3. The applicant is automatically added to `founding_team_members` as Commander — they already
   did the work to get here, so they shouldn't have to be manually re-entered.
4. The Post Launch Checklist auto-seeds for the new post (this trigger already existed).

**Founding Team Builder now has a shareable public invite link**, the same pattern as the
public application form. National Staff (or the Post Commander, once post-scoped logins exist)
click "Copy Invite Link" on the Founding Team module, send it to whoever's building out their
team, and everyone who fills out that link is added to `founding_team_members` automatically —
no manual data entry required to populate the roster. National roles see a post selector at
the top of the module if there's more than one post currently in formation.

## Veterans Congress (Module 8) — full build

This went from a read-only resolutions list to an actual legislative system: numbered
resolutions, full detail pages, amendment history, a real debate floor, a multi-type voting
engine, committees, a delegate dashboard, a legislative tracker, a calendar, and a public
Transparency Portal.

**What's real and working:**
- **Resolution numbering** — `VC-2026-001` format, auto-assigned by a database trigger, never
  reused, sequential per year.
- **Full resolution detail pages** (`/congress/resolutions/:id`) — executive summary, full
  text, purpose, financial impact (cost/funding source), organizational impact, supporting
  documents (public storage bucket), and amendment history that's genuinely append-only — the
  previous text is preserved in `resolution_amendments`, never overwritten.
- **Debate Floor** — categorized responses (Support/Oppose/Question/Amendment/Clarification),
  one level of threading via replies.
- **Real voting engine** — all four vote types from the spec (informal poll, binding delegate
  vote, constitutional amendment with a configurable supermajority threshold, national
  referendum). Casting a vote updates live participation numbers and a post-by-post breakdown.
- **Committees** — six seeded by default (Membership, Legislative, Finance, Programs,
  Governance, Expansion). National Staff can submit a recommendation (approve/reject/request
  revisions) against any resolution.
- **Delegate Dashboard** (`/congress/delegates`) — votes cast and resolutions sponsored per
  delegate, computed live from actual data, plus term dates.
- **Legislative Affairs Tracker** (`/congress/legislative`) — external federal/state bills,
  separate from CVOA's own resolutions, each with a summary and a formal CVOA position.
- **Congressional Calendar** (`/congress/calendar`) — hearings, votes, deadlines, meetings.
- **Public Transparency Portal** (`/transparency`, no login required) — every passed/rejected
  resolution, official positions, and legislative priorities, publicly readable. This directly
  answers the spec's core requirement: a member should never have to ask "who decided this?"

**Where I simplified, on purpose, rather than silently under-build:**
- **Vote-casting isn't restricted by role at the database level.** The spec distinguishes
  "informal poll = any member" from "delegate vote = binding, delegates only." Right now, RLS
  allows any authenticated user to cast a vote of any type — the UI labels it correctly, but
  nothing stops a non-delegate from casting a "binding" vote server-side. Tightening this needs
  a real decision about how delegate status maps to auth (there's no delegate login flow yet,
  same gap as Post Commanders) — flagging it rather than half-enforcing it.
- **Supermajority pass/fail isn't auto-computed.** The threshold is stored and displayed, but
  nothing automatically flips a resolution to "Passed" vs. "Rejected" when voting closes —
  National Staff makes that call manually via the status-advance button, using the displayed
  vote count as reference.
- **Co-sponsors and committee membership don't have dedicated management UI yet** — the tables
  exist and are readable, but adding a co-sponsor or assigning someone to a committee currently
  needs a direct SQL insert.
- **The AI Policy Analyst was explicitly out of scope** — the spec itself calls it a "future
  module."

### Deploying the Congress upgrade

This migration changes an existing enum type, which Postgres won't let you use in the same
transaction it's created in. **Run these as two separate steps, not pasted together:**

1. Run `veterans-congress-upgrade-part1.sql` in the SQL Editor. Wait for it to say success.
2. Open a **fresh query tab**, paste `veterans-congress-upgrade-part2.sql`, and run that.

Then push the updated `src` folder as usual.

## Post Toolkit (Module 5) — full rebuild

This went from 5 flat, generic templates to a real hierarchical operations manual matching a
franchise playbook: 14 categories, ~70 items, each with sub-items where you specified them, and
three actions per item — **Read, Download, Generate** — exactly as requested.

**Read** — opens the actual guide content. A handful of items ship with real, usable content
I wrote directly (Robert's Rules Quick Guide, Meeting Scripts, the Elevator Pitch) because
that material is generic enough to write responsibly without guessing at CVOA's actual internal
policy. **Everything else — Bylaws, Disciplinary Procedures, Charter Documents, and similar —
ships empty on purpose.** I'm not going to fabricate your organization's actual governing
documents. National Staff can click "Write This Guide" on any empty item and fill in the real
content directly in the app; it saves immediately and is live for every post from then on.

**Download** — private file storage, scoped to logged-in members only (not public — this is
internal operational material). National Staff can upload a file to any item; any authenticated
member can then download it.

**Generate** — the standout feature you called out. This is real, not a stub: clicking Generate
calls a Supabase Edge Function (`generate-toolkit-document`) that fills in a prompt template
with the post's actual data (name, city, state) and asks Claude to write the document live —
a golf scramble packet, a sponsorship packet, a recruiting flyer, meeting agendas, grant
proposal outlines, and about 15 other items all have this wired up. Every generated document is
saved so a commander can come back to a previous one instead of regenerating from scratch.

### Deploying Generate (one-time setup)

The Edge Function code is fully written — nothing to fill in besides secrets:

1. In Supabase: **Edge Functions → Secrets**, add `ANTHROPIC_API_KEY` (get one at
   console.anthropic.com — this is billed separately from your Claude.ai usage).
2. Deploy: `supabase functions deploy generate-toolkit-document`

Until that's deployed, clicking Generate will show a clear error rather than failing silently.
In demo mode (no Supabase connected), Generate returns an obvious placeholder so you can see the
interaction without needing a real API key.

### Deploying this migration

Run `post-toolkit-upgrade.sql` in the SQL Editor, then push the updated `src` folder and
`supabase/functions/generate-toolkit-document` as usual. The old `toolkit_templates` table is
left in place untouched (just unused now) — nothing is deleted.

## National Meeting Records — search across every post's actual minutes

This is new: posts submit their **actual** meeting minutes (typed in, not just a template),
and National gets a search bar across all of them. Search "PACT Act" and see how many meetings,
across how many posts, actually discussed it — real institutional memory across the whole
organization instead of 100 separate file cabinets.

- Reachable from the top of the **Post Toolkit** page, or directly at `/meeting-records`.
- **Submit Minutes**: title, meeting type, date, the actual minutes text (this is what gets
  searched), and an optional attachment (scanned/signed original) stored privately.
- **Search**: matches against title and minutes text, shows a result count and how many
  distinct posts are represented, with a highlighted snippet around the matching term for each
  result.
- RLS means a post-scoped account only ever sees its own meetings; National sees everything —
  the cross-post search is inherently a National-level capability, enforced at the database
  level, not just hidden in the UI.

**One honest limitation:** search currently matches on typed-in text (`ilike`, case-insensitive
substring), not the *attached file* — if a post uploads a scanned PDF and doesn't also type the
minutes into the text box, that PDF's contents won't be searchable. The schema is built with a
proper Postgres full-text search index (`tsvector`/`GIN`) ready to swap in — the search
currently uses simple substring matching, which will need to change to `.textSearch()` if this
becomes the org's primary meeting-record archive and search quality/ranking matters more.

Run `meeting-records.sql` in Supabase, then push the updated code.

## Post Health System (Module 9) — full rebuild

This went from a manually-set color dropdown nobody was updating to a real composite score
computed from ten signals across the app — most of it from data that already existed elsewhere,
plus new tracking for the things nothing captured before.

**Computed from data you already have (zero new data entry):**
- Officer position completeness (Founding Team)
- Sponsor revenue concentration — is funding diversified or one business away from a cliff (Sponsorship CRM)
- Meeting compliance (Meetings module)
- Membership count + recent growth (Recruiting Engine)
- Veterans Congress participation — has a delegate, have they actually voted

**New tracking, built specifically to close real gaps:**
- **Governance sign-offs** — who actually signed a Conflict of Interest or Officer Acknowledgment
  form, and when (previously: generating the form via the Toolkit didn't mean anyone signed it)
- **Annual Review** — a real, trackable per-year record (bylaws reviewed, financial audit,
  officer roster, filings), not just a static checklist document
- **Community Service log** — an actual record of what a post did and when, not just a guide on
  how to do it
- **A basic financial ledger** — income/expense entries per post, giving a real balance. This is
  new: there was zero financial tracking anywhere in the app before this.

**One dimension is an honest proxy, not the real thing:** "Member Engagement" flags members whose
record hasn't been touched in 90+ days as possibly disengaged. That's a proxy — it's not real
attendance tracking or a true churn history, because the app doesn't log a member's stage-change
history over time, only their current stage. If retention becomes a bigger priority, the next
step is logging every stage transition instead of overwriting it.

**Judgment calls that are visible, not hidden:** a post under 6 months old isn't penalized on
membership size or dinged for not having an annual review yet — those dimensions show as
"neutral" (excluded from the score) rather than red, so a new post and a 5-year post aren't
graded on the same curve. The score itself is a simple average of whichever dimensions actually
apply — transparent, not a black box.

Click into any post from the Post Health list for the full breakdown and to log new data
(signatures, service events, transactions, annual review progress) directly.

Run `post-health-upgrade.sql` in Supabase, then push the code. The old `post_health_metrics`
table is left in place untouched — nothing is deleted.

## Build A Post (Module 10) — full rebuild, all 3 levels

This went from an empty, unseeded table to a real franchise planning tool with all three levels
we discussed built in.

**Level 1 — Reference content**, for all 8 facility layouts from the spec (Bar, Kitchen,
Classroom, Employment Office, VA Clinic Space, Transitional Housing, Fitness Center): real cost
ranges, equipment lists, sponsor angles, grant angles, and revenue potential. These are general
industry-standard estimates, not CVOA-specific figures — always worth adjusting for local
market and region, which the content itself says.

**Level 2 — Real per-post tracking.** A post can click "Start Project" on any layout, which
seeds a real build checklist (sourced from that module's template) and lets them set a target
budget. Actual spend is logged directly against the project and pulled from the same financial
ledger built into Post Health — so "budget vs. actual" is real math on real data, not a
separate spreadsheet.

**Level 3 — Smart matching + AI generation.**
- Sponsors now have an optional `category` field (Restaurant/Food Service, Fitness/Sporting
  Goods, Healthcare, etc.). Each facility module lists which categories are relevant to it, so
  a post opening the Fitness Center module sees which of *their own actual sponsors* are
  plausible funders for it — not a generic suggestion, a real match against their CRM data.
- "Generate Business Case" calls a new Edge Function (`generate-facility-plan`) that writes a
  real, post-specific business case using Claude — pulling in the post's name, location, target
  budget if set, and any matched sponsors, the same pattern as the Toolkit's Generate feature.

**Honest limitation:** sponsor category matching only works going forward — any sponsors
already in your database from before this update won't have a category until someone sets one
(there's a dropdown on the "Add Sponsor" form now). The public "Become a Sponsor" form doesn't
ask for it either, since a business self-categorizing isn't reliable — staff should set it when
reviewing a new sponsor instead.

### Deploying this

1. Run `build-a-post-upgrade.sql` in the SQL Editor.
2. Push the updated `src` folder and the new `supabase/functions/generate-facility-plan` folder.
3. If you haven't already deployed `generate-toolkit-document`'s `ANTHROPIC_API_KEY` secret,
   set it up now (Project Settings → Edge Functions → Secrets) and deploy
   `generate-facility-plan` — same key works for both functions.

## Self-serve post accounts + role-restricted access (the foundation for everything post-facing)

Until now, every login had to be created by hand via SQL — there was no way for a post to get
their own account, and there was a real gap where the `profiles` table had no INSERT policy at
all, meaning self-serve signup was structurally impossible even if the UI had asked for it.

**What's fixed:**
- `profiles` now has an INSERT policy (`id = auth.uid()`) — the actual missing piece.
- The **Founding Team invite link** now has an optional "Create an account" step. Whoever joins
  can set a password right there. Their role is inferred from their position (Commander →
  `post_commander`, other named officer roles → `post_officer`, Additional Member → `member`)
  and their `post_id` is set automatically.
- This works whether or not your Supabase project requires email confirmation before a session
  exists — a `pending_profile_signups` table stages the intended profile, and `AuthContext`
  finishes creating it automatically the first time that person gets a real authenticated
  session (immediately, or after they confirm their email and log in).

**Role-restricted sidebar and routes:**
- A post-scoped account (`post_commander`, `post_officer`, `member`) now sees a smaller sidebar:
  Founding Team, Launch Checklist, Meetings, Post Toolkit, Recruiting Engine, Sponsorship CRM,
  Veterans Congress, Post Health, Build A Post. No Application Pipeline, no Vetting System —
  those are National-only and now enforced with `RoleGuard` at the route level, not just hidden
  from the sidebar (typing the URL directly now shows "Access Restricted" instead of the page).
- Their "Post Health" sidebar link points straight at their own post's detail page, not the
  National list view (which they wouldn't see anything on anyway, since Post Health's list page
  is National-only).
- **Veterans Congress now branches by role**: National sees the full admin dashboard
  (introduce resolutions, manage committees, open voting, etc.). Everyone else sees a
  stripped-down "Open Votes" view — just resolutions currently open for voting and a way to
  cast a ballot, no admin controls. This is the "customer-facing, vote-only" experience you
  asked for.

**What this unlocks, mostly for free:** Sponsorship CRM and Build A Post already worked
correctly for a post-scoped account once they had a real login — both already default to the
logged-in user's own `post_id` instead of needing a National post-selector. Getting real
accounts working was the actual blocker, not those pages themselves.

**Still genuinely missing, called out honestly:** a real Membership Roster. Recruiting Engine
tracks pipeline *stage* (prospect → member → officer), not a clean directory of every member
with contact info that a post could self-maintain. If "posts upload all their members and
contact info" is the next priority, that's a new feature — not covered by this pass.

Run `self-serve-accounts-foundation.sql` in Supabase, then push the code.

### Security fix: account activation is gated behind National verification

Before this was ever deployed, a real gap got caught: creating an account via the Founding
Team invite link would grant real `post_commander`/`post_officer`/`member` access — full
sponsor/health/build-a-post access to that post — immediately, with zero verification by
National. Anyone with the invite link could self-grant real access.

**Fixed.** Creating an account now grants nothing on its own — the account is created with the
lowest-privilege role and no post assigned. Real access only activates the moment National
verifies that person through the DD214/combat service/membership checkboxes already built into
Founding Team Builder — the exact same review step you already do for everyone on a founding
team. There's no new step for National; verifying someone now does double duty as approving
their account.

The Founding Team Builder roster now shows an "Account" column so you can see at a glance
whether a given person has actually created a login, and whether it's active or still pending
your verification.

Run `verified-account-activation.sql` in Supabase, then push the code.

## Membership Roster + real payment collection (Stripe)

A real member directory — separate from Recruiting Engine, which tracks someone's journey
*toward* membership, not the record of *being* a member.

**Matches your existing sheet layout.** CSV import expects columns in this order: [an unused
leading flag column, kept for compatibility with your existing sheet], Name, Email, Phone,
Membership Number, Address, Branch. Existing membership numbers in your sheet import as-is —
nothing gets renumbered on import.

**The numbering system is real and automatic**, using the same state-admission-order scheme
already used elsewhere (e.g. Indiana, the 19th state, produces `19-000000001`). A Postgres
trigger assigns this automatically on every new member — global sequential number, prefixed by
the admission order of *that member's own state* (not the post's state), matching what your
sheet already does. If you supply a number yourself (via CSV import or manual entry), it's kept
exactly as given rather than overwritten.

**Real payment collection via Stripe** — Annual ($49.99) and Lifetime ($499.99), exactly as you
specified. A public "Join / Renew" link (copyable from the Membership Roster page, per post)
lets anyone pay by card. The moment Stripe confirms the charge, a webhook automatically marks
the payment paid and activates the membership (setting a one-year expiration for annual, no
expiration for lifetime) — nobody has to manually reconcile a bank statement against a roster.

**The one thing I genuinely cannot do for you:** connecting your actual bank account for
payouts. That's identity and tax verification (KYC) that Stripe requires directly from the
business owner — it can't be automated or done on your behalf by me or by code. Everything up
to that point (checkout, charging cards, tracking payments, activating memberships) is fully
built and working; the bank connection is a ~10-minute form you fill out once in Stripe's own
dashboard.

### Deploying this (in order)

1. Run `membership-roster.sql` in the SQL Editor.
2. Create a Stripe account at stripe.com if you don't have one (start in **test mode** —
   there's a toggle in their dashboard — so you can try the whole flow without moving real
   money first).
3. Stripe Dashboard → Developers → API keys → copy the **Secret key**.
4. Supabase → Edge Functions → Secrets, add:
   - `STRIPE_SECRET_KEY` = the key from step 3
   - `SITE_URL` = your deployed site URL (e.g. `https://postos-nine.vercel.app`)
5. Deploy both functions:
   ```
   supabase functions deploy create-membership-checkout
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
6. Stripe Dashboard → Developers → Webhooks → Add endpoint. URL:
   `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`, event:
   `checkout.session.completed`. Copy the **Signing secret** it shows you.
7. Add that signing secret to Supabase as `STRIPE_WEBHOOK_SECRET`, redeploy `stripe-webhook`.
8. Test with a card number Stripe provides for test mode (`4242 4242 4242 4242`, any future
   date/CVC) before flipping to live keys and completing Stripe's account verification.

Push the updated `src` folder and the two new `supabase/functions` folders as usual.

**Updates since this was first written:**
- The `stripe-webhook` function now also emails `command@combatvetsofamerica.org` and
  `maddymarked@gmail.com` the moment a membership payment clears — full name, address, and
  membership number, so the card maker doesn't need to be told separately. Uses the same
  `RESEND_API_KEY` secret pattern as the Toolkit's other email notification, if you've already
  set that up.
- Clicking any row in the Membership Roster now opens an edit view — update contact info,
  change membership type/status, or click **"Renew +1 Year"** on an annual membership to push
  its expiration out (from today, or from its current expiration if it hasn't lapsed yet).
- **Bank account changes belong in Stripe's own dashboard**, not this app — Settings → Bank
  accounts and scheduling. Building that into our own app would mean handling real bank account
  numbers ourselves, which is a compliance burden Stripe already solves for you safely. Nothing
  on our end needs to change when you switch banks.

## URO Meeting Operating System — built to your Unified Rules of Order spec

This is not a form. It's a guided, step-by-step system that walks a secretary through a meeting
in URO order and builds a compliant official record as they go, with a genuinely private
workspace alongside it.

**The privacy guarantee is real, enforced at the database level:** the Secretary Workspace
(`uro_secretary_notes`) has exactly one RLS policy — `author_id = auth.uid()` — and nothing
else. Not National, not other post officers, nobody but the person who wrote a note can ever
read it, even after the meeting is published. This is the one table in the entire schema where
National access is deliberately, permanently excluded.

**The 10-step wizard**, exactly as specified: Setup → Call to Order → Attendance (with live
quorum calculation) → Approval of Previous Minutes → Officer Reports → Old Business → New
Business → Motion Manager → Member Comments → Adjournment. Every field saves as you go, so
nothing is lost if a secretary steps away mid-meeting — meetings sit in `in_progress` status
until deliberately published.

**The Motion Manager** is the centerpiece, as specified: every motion gets its own permanent
record — type, text, mover/seconder, debate summary, amendments, voting method, and vote count.
The system computes and displays the required threshold (majority / 2/3 / unanimous
recommended) based on motion type, and suggests a pass/fail result from the vote count — but
the secretary always makes the final call, the system never overrides them.

**The Compliance Engine** flags real issues automatically at publish time: motions without
quorum, missing seconders, missing vote results, missing attendance — and computes a
Fully Compliant / Minor Issues / Non-Compliant score, all visible on the published record.

**Automatic outputs**, generated on publish: the official formatted minutes (searchable, same
as before), a Motion Register, and attendance/quorum data. Action Item tracking exists in the
schema (`uro_action_items`) — wiring a dedicated report view for it is a natural next step if
it becomes a priority.

**National Dashboard Integration**, both National-only via `RoleGuard`:
- **URO Compliance Dashboard** (`/meetings/uro-compliance`) — meetings submitted, posts missing
  recent minutes, compliance percentage breakdown, and a feed of recent meetings by compliance
  level.
- **National Motion Search** (`/meetings/uro-motions`) — every motion, at any post, searchable
  by text and filterable by vote result.

**What's kept, deliberately:** the old freeform "paste your minutes" flow still exists as a
secondary option (small link near the search bar) — some posts may already have their own
format and shouldn't be forced to redo it. But the guided wizard is now the primary, prominent
path.

Run `uro-meeting-system.sql` in Supabase, then push the code.

## Post Health now uses real Membership Roster data

The "Membership" and "Membership Retention" (formerly "Member Engagement") scores no longer
proxy off Recruiting Engine pipeline stage — they now read directly from the real
Membership Roster. This is a genuine accuracy upgrade, not just a data-source swap:
"Membership Retention" used to be a guess based on how recently a record was touched; now it's
real — the actual percentage of the roster that's lapsed vs. active, straight from the same
data your members pay dues against.

No new SQL for this — it's a pure application-code change.

## NCC Drive — internal file storage for National

A real internal file system, National-only, not tied to any post — folders, upload, download,
rename, delete, and search by filename across the entire drive regardless of folder. This is
deliberately more locked-down than every other storage bucket in the app: the `ncc-drive`
bucket's policy requires `is_national_role()`, not just "any authenticated user" — a post-level
account can't browse into it even if they tried.

**Known limitation, stated plainly:** deleting a folder removes it and its database records
(cascading), but doesn't currently clean up the underlying files in storage — they become
orphaned (invisible in the UI, but still taking up storage space). This is a minor cleanup
task, not a functional bug, and worth fixing later with a small Edge Function that walks a
folder's contents before deleting.

Run `ncc-drive.sql` in Supabase, then push the code.

## The "1-7" batch — seven flagged gaps closed

**1. Action Item Report** — the Adjournment step of the URO wizard now has a real "Action
Items — Who Owns What" section: description, owner, due date, optionally tied to a specific
motion. A new **Action Items** page (linked from Meetings) shows open items with an overdue
flag — scoped to your own post automatically, or every post's items if you're National.

**2. Congress delegate voting is now enforced at the database level.** Previously any
authenticated account could cast any vote type. Now `delegate_vote` and
`constitutional_amendment` votes require either National or an actual delegate record for that
post — `informal_poll` and `national_referendum` stay open to any member, matching their
intended purpose as broader-participation vote types.

**3. DD214 re-verification tracking.** A `verified_at` timestamp is now set the moment
verification happens. Founding Team Builder flags anyone verified more than a year ago with a
small note — nothing is auto-revoked, it's a prompt to double-check, not an automatic lockout.

**4. Sponsor category backfill.** Opening any existing sponsor's detail view now shows an
editable Business Category dropdown — staff can set it retroactively the next time they review
that sponsor, closing the gap for everyone added before Build A Post's matching feature shipped.

**5. Delete Post now works for active posts too**, not just posts still in formation — a
"Delete Post" link sits next to the header on Post Health's detail page, National-only, with
the same confirmation-before-destroying pattern used everywhere else.

**6. Toolkit content fixes.** The "Robert's Rules Quick Guide" — which no longer matched how
this app actually runs meetings — is now a real "Unified Rules of Order (URO) Quick Guide"
reflecting your actual system. The four Officer role guides (Adjutant, Quartermaster,
Sergeant-at-Arms, Vice Commander) now have real, generically-safe content instead of empty
placeholders. Everything requiring your actual bylaws/policy still ships blank, deliberately.

**7. NCC Drive — move, trash, and sharing.**
- **Move**: every file and folder now has a Move button opening a folder picker.
- **Trash, not permanent delete**: deleting now moves something to Trash instead of destroying
  it immediately. Items sit there for 30 days with Restore / Delete Forever options — the purge
  happens lazily (checked whenever someone opens the Trash), no cron job required.
- **Sharing**: any folder can be marked "Shared" — its direct contents become read-only visible
  to every post account, on a new **Shared Files** page. Known limitation: sharing is
  per-folder, not automatically recursive — a shared folder's own subfolders need to be marked
  shared individually too if you want posts to see into them.
- **Multi-file upload made obvious**: a proper drag-and-drop zone now sits at the top of the
  file list, and the upload button explicitly says "Upload Files" (plural) and accepts multiple
  at once.

Run `batch-1-7-schema.sql`, then push the code.

## "Join CVOA" — one stable link for your main website

The existing `/join-membership/:postId` link only works if someone already knows their
specific post — fine for a post's own recruiting materials, but not what you need for a single
"Join CVOA" button on your main website that has to work for anyone, anywhere.

**New: `/join`** — no post required. Someone fills out their info, optionally picks their local
post from a dropdown (or leaves it as "No local post yet / not sure" if they don't have one or
aren't sure), picks Annual or Lifetime, and pays. The membership number still works exactly
right — it's generated from **their own state**, the same system as before, regardless of
whether they picked a post.

This is the link to paste under "Join CVOA" on your actual website:
`https://<your-deployed-site>/join`

Same automatic backend as before: the moment Stripe confirms payment, the webhook activates the
membership and the roster updates — no CSV, no manual step, nothing for you to do. The
`/join-membership/:postId` link still exists too, for when a specific post wants to hand out
their own direct signup link.

No new SQL for this — reuses everything already in place. Push the code, and make sure the
Stripe/Resend Edge Function secrets from the earlier Membership Roster setup are already
deployed (they don't need to change).

## Member accounts + the funnel

**Real accounts for paying members**, following the exact same pattern as founding team
accounts, with the equivalent "verification" being different: a founding team account
activates on National's manual DD214 review; a member account activates the moment their
**payment actually clears**, via the same webhook that already marks the roster active — no
new manual step, no new Stripe work. An account created but never paid for stays completely
powerless (lowest-privilege role, no post) until that happens, exactly like the founding team
gate.

Both `/join` and `/join-membership/:postId` now offer this as an optional checkbox, same UX as
the Founding Team flow.

**The funnel** — a member's home screen (`/` for anyone with the `member` role) is not a
generic dashboard. It shows their real membership card (number, type, renewal date) and three
genuine next steps, each wired into a module that already exists rather than a new one:

- **Start a Post** — a real form that inserts directly into the same Application Pipeline
  National already reviews everything else through. Honest scope note: this skips the DD214
  upload gate the anonymous public form requires — a paying, account-holding member is a
  meaningfully different trust level than an anonymous visitor, so I made that call
  deliberately rather than re-litigating identity verification they've already been through.
- **Veterans Congress** — links straight to the existing vote-only view.
- **Volunteer Locally** — browses real active posts and a "Request to Join" button that drops
  a real lead into that post's Recruiting Engine pipeline (same `recruits` table, same board
  the post's own recruiters already work from) — a real person there follows up, not a black
  hole.

**Sidebar is scoped down accordingly** — a plain member sees Meetings, Post Toolkit, Shared
Files, and Veterans Congress. Not Founding Team, Launch Checklist, Recruiting Engine,
Sponsorship CRM, Post Health, or Build A Post — those stay post-officer tools.

Run `member-accounts.sql`, then push the code.

## Four real fixes from the "hold on, you're confused" round

**1. `/join` now has a real 3-way funnel.** First question: "Join an existing post," "Start a
new post," or "Just become a member for now." Choosing an existing post shows a required
dropdown of active posts. Starting a new post routes straight into the same Application
Pipeline National already reviews everything else through — no payment required for that path,
since starting a post and paying dues are two different things. `/join-membership/:postId`
still exists separately for a specific post's own recruiting materials — that one still says
"join this post" by design, since it's meant to be shared by that post specifically.

**2. DD214 upload is now required on every membership signup path** — `/join` and
`/join-membership/:postId` both gate the rest of the form behind it, same pattern as the
Founding Team flow. Stored in the same private `dd214-uploads` bucket. Staff can view it
directly from the Membership Roster (new "DD214" column, "View" button). Deliberately
non-blocking for activation, though — the upload is required to submit, but membership still
activates automatically the moment payment clears, same as before. If you'd rather require
manual DD214 review *before* activation (closer to how founding team accounts work), tell me
and I'll add that gate — it's a real design choice, not an oversight.

**3. New "Posts Management" page** (sidebar, National-only) — every post, any status, in one
table, with an inline "advance to next status" button and a delete button per row. This is now
the one obvious place to manage a post's lifecycle, instead of split awkwardly between Launch
Checklist (forming posts only) and Post Health (active posts only).

**4. New "User Management" page** (sidebar, National-only) — the actual root cause of the new
NCC account not seeing what you see: **National had no permission to update anyone else's
profile, not even to grant National access.** That's fixed at the database level, and this page
is where you use it — every account, its role, and its post assignment, all editable directly.
This is how you promote someone to National Staff, fix a wrong post assignment, or correct any
account's access level going forward.

Run `access-and-dd214-fix.sql`, then push the code.

## Invite User — the real fix for adding NCC/National accounts

**Root cause of the earlier confusion:** creating a user directly in Supabase's Auth dashboard
only creates the login — it does not create the `profiles` row this app actually reads roles
and permissions from. That's why the manually-created account was invisible in User Management
and couldn't see anything after logging in — it existed, but had no role, no post, nothing.

**Fixed properly** — User Management now has an "Invite User" button. Enter their name, email,
role, and post (if any), and it does both steps correctly in one action: creates the real
account and its profile together, using Supabase's own invite email. They get a link, click it,
set their own password, and are logged in with the role you assigned already active — no gap,
no manual database step, ever again.

**Yes — once someone has a National role (Commander or Staff), they see exactly what you see.**
Access in this app is based entirely on role, not on which specific account it is. There's
nothing special about your account beyond its role; grant that same role to someone else and
their experience is identical.

**To fix the account you already created manually**, run `fix-cory-profile.sql` once — this
creates the missing profile for that specific account using the UID from your Auth dashboard,
so they don't have to be re-invited from scratch. Going forward, always use "Invite User"
instead of the Supabase dashboard directly.

Run `fix-cory-profile.sql`, deploy the new `invite-user` Edge Function, and push the code. Also
double check in Supabase → Authentication → URL Configuration that "Site URL" is set to your
actual deployed site — that's where invite links send people.

## Membership Roster round — four real fixes

**1. Your CSV data isn't lost.** `members.post_id` uses "on delete set null," not cascade — when
you deleted those two test posts, their members became *unassigned*, not deleted. The bug was
that the Membership Roster page had no way to view unassigned members at all. Fixed: the post
selector now always includes an **"Unassigned Members (National)"** option, so nothing tied to
a deleted (or never-assigned) post is invisible again.

**2. Renewals due, 30 days out.** The roster page now shows a banner when any annual
memberships are renewing within 30 days. For actual proactive notification (not just "check
when you remember to look"), a new scheduled function `send-renewal-reminders` emails a digest
to National every day it finds anything due in exactly 30 days. This needs to be scheduled —
either Supabase's `pg_cron` (setup command is in the function's own file comments) or any
external cron service hitting the function's URL daily. Doesn't run itself; something has to
trigger it once a day.

**3. Real auto-renew, only for Annual.** Both `/join` and `/join-membership/:postId` now ask
annual signups if they want to auto-renew. If yes, this uses a genuine Stripe **subscription**
(not a one-time payment) — Stripe charges their card automatically every year, and a new
webhook handler extends their membership another year automatically each time it succeeds.
Lifetime members never see this option — there's no yearly charge to auto-renew. Staff can
cancel a member's auto-renew from the Edit Member view, which actually cancels the Stripe
subscription, not just a local flag.

**4. Membership → Founding Team bridge.** Any member's edit view now has an **"Add to a Post's
Founding Team"** button — pick a post and position, and it creates their founding team entry
pre-filled with their existing name/email/phone, **reusing their already-uploaded DD214** so
they never have to submit it twice. They still go through the same verification checkboxes as
anyone else before real officer access activates.

### Deploying this

1. Run `membership-big-fixes.sql`.
2. Deploy the two new Edge Functions: `cancel-membership-subscription` and
   `send-renewal-reminders` (the latter with `--no-verify-jwt`, same as the Stripe webhook).
3. In Stripe Dashboard → Webhooks → your existing endpoint → add two more events:
   `invoice.payment_succeeded` and `customer.subscription.deleted` (on top of
   `checkout.session.completed`, which should already be there).
4. Push the code.
5. Optional but recommended: schedule `send-renewal-reminders` to actually run daily (see the
   function file for the exact `pg_cron` command).

## Walkthrough optimization round — five items from the tab-by-tab review

**1. Post-scoped home for Commanders/Officers.** Logging into a post-level account no longer
shows the full National dashboard (org-wide sponsor revenue, every post's health, national
recruiting totals — data that account shouldn't see). Post Commanders and Officers now land on
their own post's home: their member count, sponsor pipeline, last meeting, and either their
Post Health score (active posts) or Launch Checklist progress (forming posts).

**2. Plain "member" role locked to Veterans Congress only.** Sidebar now shows just Congress for
that role — and this is enforced at the route level too, not just hidden from the menu. Typing
any other module's URL directly now shows "Access Restricted."

**3. Founding Team Builder is now list-then-detail.** National sees a list of every post
currently building its team first (`/founding-team`), clicks one, and lands on that post's full
roster (`/founding-team/:postId`) — same pattern as Post Health. Post-scoped accounts skip the
list entirely and go straight to their own team, since they only ever have one.

**4. Meetings organized by phase.** The Compliance Dashboard now has a month selector —
pick "July 2026 URO," see every active post with a clear Submitted/Not Submitted status for
that specific period, click a submitted post to pull up their actual meeting. The existing
cross-post search stays exactly as it was.

**5. Multi-signer NCC sign-off before a charter is issued.** An application sitting in Vetting
now shows every current National account and whether they've individually signed off — and the
"Advance to Approved" button is disabled until every one of them has. This is a real database
constraint, not just a UI suggestion — one person can no longer unilaterally move a candidate
to Approved.

Run `walkthrough-optimizations.sql`, then push the code — you've got GitHub Desktop set up now,
so this is just: drop the new files into your local `Postos` folder (replacing what's there),
GitHub Desktop will show the changes, commit, push.

## Digital membership card — generated automatically, no one has to make it

**"My Membership"** is a new page (sidebar, for members and post officers) showing a real digital
card: CVOA branding, membership number, join date, expiration (or "Never" for Lifetime), and a
QR code. There's nothing to generate — it always reflects your actual, current membership
record. Renew, and the expiration date on the card is already right the next time you open it.

**The QR code is real, not decorative.** Scanning it opens a public verification page —
`/verify-membership/:memberId` — showing a simple "✓ Valid CVOA Member" or "Membership Not
Active" with their name and number. Deliberately shows *only* what's safe for a stranger to see
if they scan someone's card at a discount counter or event check-in: no email, phone, or
address. That's enforced by a dedicated database function, not just something the page chooses
not to display — even a direct API call can't pull those fields through this path.

**Where it lives**: `/my-membership` inside the app, linked from the Member Home screen's
membership summary ("View Digital Card →"). Available to plain members and post
officers/commanders alike, since either could be a dues-paying member.

Run `digital-membership-card.sql`, then push the code — a new `qrcode` package is included in
`package.json`, so make sure whatever build step you use picks up the updated dependencies
(GitHub Desktop push → Vercel rebuild handles this automatically, nothing extra needed on your
end).

## Stack




















- React 18 + TypeScript + Vite
- Tailwind CSS (military command-board theme: black/charcoal/white/gold)
- Supabase (Postgres, Auth, Row Level Security)
- react-router-dom for routing
- react-simple-maps + us-atlas for the national map (bundled at build time, no runtime map API key needed)
- lucide-react for icons

## Running with no backend at all (demo mode)

**You don't need Supabase to work on this right now.** If `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` aren't set — i.e. there's no `.env.local`, or it's missing those
values — the app automatically runs on an in-memory mock client (`src/lib/mockClient.ts`)
seeded with realistic sample data (`src/lib/mockData.ts`): a few posts in different pipeline
stages, applications, a founding team, a partially-complete checklist, sponsors, recruits,
resolutions, and the Build A Post content. You'll see a small "Demo Mode" badge in the
sidebar whenever this is active. You're logged in automatically as a demo National Commander
— no login screen needed.

Every page reads/writes through the exact same `supabase.from(...)` calls either way, so
nothing changes in the page code when you're ready to connect a real project — you just add
the two env vars and it switches over. The mock client supports `select`, `insert`, `update`,
`delete`, `eq`, `in`, `order`, `limit`, `single`, and the `{count:'exact', head:true}` pattern
used on the dashboard — everything this app currently calls. Data resets on page reload since
it's in-memory only.

## Getting started with a real Supabase backend (when you're ready)

### 1. Create a Supabase project

Create a new project at [supabase.com](https://supabase.com). In **Project Settings → API**,
copy your Project URL and anon public key.

### 2. Run the schema

Open **SQL Editor** in your Supabase project and run the entire contents of
`supabase/schema.sql`. This creates every table, enum, RLS policy, and the trigger that
auto-seeds a launch checklist whenever a new post is created.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### 4. Install and run

```bash
npm install
npm run dev
```

### 5. Create your first user

Supabase Auth doesn't create a `profiles` row automatically. Easiest path for your first
National Commander account:

1. In Supabase Dashboard → Authentication → Users, add a user with your email/password.
2. In SQL Editor, insert a matching profile:
   ```sql
   insert into profiles (id, full_name, email, role)
   values ('<the-user-uuid-from-step-1>', 'Your Name', 'you@cvoa.org', 'national_commander');
   ```
3. Log in at `/` with that email/password.

Once you have a National Commander account, all modules and posts are visible (RLS grants
national roles full read access everywhere).

## Deploying

This is a standard Vite app — deploys to Vercel the same way VHI does:

```bash
npm run build
```

Push to a new GitHub repo, import it into Vercel, and set the same two environment variables
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the Vercel project settings.

## Roles

Defined in the `user_role` enum: `national_commander`, `national_staff`, `state_commander`,
`post_commander`, `post_officer`, `member`, `delegate`, `guest_applicant`.

RLS policies currently follow one baseline pattern: national roles (`national_commander`,
`national_staff`) see and edit everything; post-scoped roles see/edit rows tied to their own
`post_id`. As real workflows solidify (e.g., should a Post Officer edit the checklist but not
approve vetting decisions?), tighten individual policies in `supabase/schema.sql` — they're
organized by module so it's easy to find the one to adjust.

## Design system

- **Palette**: black `#0A0A0B`, charcoal `#17181A`, surface `#1F2023`, hairline border
  `#2E2F33`, off-white ink `#EDEBE4`, gold `#C9A227` / bright gold `#E8C468`. Status colors are
  muted military tones rather than stoplight brights: olive-green `#4A7C59` (active), gold
  (developing), muted red `#A3423D` (needs attention).
- **Type**: Bebas Neue for display/headers (stencil, condensed, military feel), IBM Plex Sans
  for body text, IBM Plex Mono for data, IDs, and status labels.
- **Signature element**: the national dashboard's interactive US map, colored by post health
  status, is the one place the "command board" concept is most literal — everywhere else stays
  quieter (Notion/Linear-style panels, hairline borders, no gradients or shadows).

All tokens live in `tailwind.config.js` and `src/index.css` if you want to adjust them.

## Suggested next build sessions

Roughly in the order they'll matter most as the first real post moves through the pipeline:

1. **Auth signup flow** — right now user creation is manual via SQL. A self-serve signup +
   post-assignment flow matters once you have more than a couple of National Staff accounts.
2. **Toolkit file uploads** — wire an admin upload UI to Supabase Storage instead of manually
   inserting rows.
3. **Post Health scoring** — decide the formula (weights for growth/attendance/fundraising/
   retention/compliance/service) and implement it as a SQL view or scheduled Edge Function
   that writes `computed_status` back onto `posts.health_status`.
4. **Veterans Congress submission + voting UI** — the schema and read views exist; the
   resolution-authoring form, comment threads, and one-vote-per-delegate enforcement UI don't
   yet.
5. **Build A Post content** — this is the one module that's mostly content work, not code:
   real cost estimates, equipment lists, and sponsor/grant opportunities per facility layout.
6. **PDF generation for the Toolkit** — the spec calls for PDF generation support for
   templates; that's a separate integration (e.g. a serverless function using a PDF library)
   once the base templates exist.
