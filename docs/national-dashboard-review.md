# National Dashboard improvements

Prepared as an independent change from the currently released main tree. The Congress/Tribunal draft is a separate PR; this migration works after the two released October 3 migrations and does not depend on the governance draft.

## Behavior

- One National-only database RPC calculates all dashboard totals, returns the map's post fields, and includes the eight latest activity summaries. Totals are computed before any API row limit; individual member, payment, recruit, or judicial records are not sent to the browser.
- Won sponsorship agreement values are labeled **Committed Sponsorships**. **Collected Sponsorships** sums recorded payments tied to sponsors through today. **Recorded Receipts This Month** sums paid membership dues plus recorded sponsor payments and standalone donations. It excludes promised deals, unpaid/failed dues and future payments. This is recorded gross receipts, not a complete ledger or net income/refund calculation. Payment amounts remain dollars, with two-decimal display; Stripe cents are unchanged.
- Monthly boundaries use America/New_York. The previous full month is shown as context, without a red/green comparison against an unfinished current month.
- A shared, scoped minutes helper identifies active posts with past unfinished URO meetings, no published URO minutes, or a latest published meeting older than 60 days. Future meetings and legacy uploads do not establish published URO compliance. The dashboard counts posts; the queue lists individual unfinished meetings, or one post-level follow-up if no draft already exists. National links go to the actual meeting or the post-selected meetings page; state links retain the state workspace.
- Total Members links to the roster. In Development opens forming posts. Charter Ready opens a server-filtered charter-ready list with a clear-filter action; query-string navigation survives reload and browser back. The destination paginates post requests, handles errors and avoids health-scoring requests while viewing forming posts.
- Membership, recruiting and sponsor pipeline colors are independent of receipts. A positive minutes-attention count is red; zero is green. Refresh reloads the dashboard and queue, and a returned server timestamp identifies the snapshot. Loading/errors do not show a false empty activity list.

## Validation and release

All 98 tests on this independent branch pass, including eight full-schema PostgreSQL/PGlite dashboard tests. Tests cover authorization, zero values, more than 1,000 members/posts, commitments versus payments, month boundaries, legacy/future minutes, multiple unfinished meetings, matching queue behavior and post-officer scope. TypeScript/Vite production build and git diff whitespace checks pass.

Before the frontend is merged/deployed, rehearse and apply `20261004140000_national_dashboard.sql` against the live schema. It adds scoped summary/helper functions, three read indexes, and updates the existing queue; it does not create financial entries or modify votes/accounts. After deployment, verify the National dashboard and card destinations with authorized accounts. No production database migration or authenticated browser check was performed while preparing this PR.

Further tab audits can address the Meetings page's legacy compliance panel, complete financial-ledger reconciliation/refunds, post health scoring at national scale, and paginated roster interfaces. Those are separate from this dashboard change.
