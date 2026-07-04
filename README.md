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

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (military command-board theme: black/charcoal/white/gold)
- Supabase (Postgres, Auth, Row Level Security)
- react-router-dom for routing
- react-simple-maps + us-atlas for the national map (bundled at build time, no runtime map API key needed)
- lucide-react for icons

## Getting started

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
