# Post dashboard release

The post dashboard now opens on an actionable Overview for National, State oversight, and assigned post staff. People, Meetings, Post Development, Sponsors, Finances, Documents, and Governance link to current workflows with the post retained. Delegates keep their existing designated Congress overview, and ordinary members keep their member portal with links to published meetings and shared documents.

## Behavior

- Status comes from the post record, and old Forming/Active suffixes are removed from display names. Existing statuses and names are not rewritten.
- A scoped database snapshot supplies launch funding, assigned accounts, officer roster reconciliation, renewals, current/legacy meetings, open actions, ledger metadata, and support requests. It does not expose credentials or uploaded identity documents.
- State commanders can read only appointed jurisdictions; the private snapshot denies members, delegates, and Tribunal accounts. Management authority is returned by the server.
- Health uses current verified officer records linked to unsuspended, non-test staff accounts with confirmed emails; sponsor receipts net of refunds; current eligible formal Congress votes in a rolling 365-day window; identity-linked recent signatures; supported annual reviews; completed events; and dated ledger entries. Future records do not improve current health. Missing ledger entries need attention.
- Health shows scored record coverage and critical issues separately. National can configure required positions, freshness and membership thresholds, grace periods, and critical signal overrides. Initial settings are explicitly provisional; changes are validated, versioned, and audited.
- Annual review completion requires all checklist items and supporting references. Changing its checklist clears completion and reviewer attribution. Historical reviews remain untouched until edited and incomplete historical completion timestamps no longer receive green.
- New signatures require a current linked officer identity, record the real recorder, and reject future dates. Existing name-only signatures are preserved and need reconciliation to count.
- Permanent post deletion is removed from the dashboard and revoked for authenticated clients. National can archive/restore with an append-only reason history. Archives preserve records and existing access, disappear from current operational/launch lists, and stop new public campaign checkout. Already-created Stripe sessions and paid receipts remain valid for reconciliation.
- Operating ledger totals are recorded entries through today, not bank reconciliation. Opening funding, sponsor pledges, sponsor receipts, and operating cash are clearly separated. Positive amounts are enforced for new financial rows; legacy rows are retained.
- Member drive links honor existing workspace/sharing permissions. State roster links retain the post and open the connected person record. Meetings links select the post governing body when one exists.

## Deployment order

1. Apply `supabase/migrations/20261005190000_post_dashboard.sql` once, after the already released Post Development migration.
2. Verify scoped snapshot/health RPC access, policy validation, review/signature guards, audited archive behavior, and revoked raw deletion.
3. Merge the frontend PR and deploy Vercel. No new Edge Function or secret is required.
4. Confirm the post Overview, every linked tab, a State-only post, a commander view, and a member's published minutes/shared files. Review existing name-only signatures and account/officer links through the authorized workflows.

## Validation

Automated PostgreSQL tests execute the full coordinated migrations and authorization rules. Unit tests cover scoring, configurable standards, and dashboard action ordering. The production TypeScript/Vite build passes. The changes have not been deployed or tested in an authenticated live browser in this coding turn; no real records were archived, signatures recorded, reviews completed, policy settings changed, emails sent, or payments made.
