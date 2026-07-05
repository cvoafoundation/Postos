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
