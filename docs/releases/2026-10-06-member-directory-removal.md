# Accounts, Roster, and Member Directory

The default Accounts & Access list now contains both login accounts and roster members who do not yet have an account. Both types share one server-paginated list. Existing National test filtering, scoped appointments, and verification controls remain. Confirmed unique email matches link safely on membership creation/email edits and when this migration reconciles existing records. Conflicting identities remain unlinked for reviewed National repair. Member-role account names follow a single linked membership name; staff identity and roles are preserved.

National can remove a membership from either person's workspace or the visible roster Actions column. Removing only a membership retains its account and other memberships. Removing an account removes its linked memberships and suspends workspace access. Unlinked duplicates must be reviewed separately. Removal is recoverable, preserves payment, meeting, document, and audit history, and records an authority reason. It is not a Stripe refund or permanent Auth-user deletion. National can recover records from Removed Records in either screen. Restored accounts remain suspended until their retained appointments are reviewed; restore the account before its individual memberships. Self-removal and removal of current National/Tribunal primary accounts are blocked.

Active recurring Stripe billing must be canceled using the roster's existing Cancel Auto-Renew control before removal. Removed memberships cannot reserve a new checkout. A late payment notification can record a receipt but cannot reactivate a removed membership. Existing historical payment records are retained.

The Member Directory is available to signed-in CVOA member and staff accounts. Applicants without active membership, anonymous visitors, test accounts, and removed/suspended accounts cannot browse it. The directory exposes only member name, post name, city, and state, with search and pagination. It never returns email, phone, street address, membership numbers, dues, payments, DD214 files, or account authority. /members opens the directory for ordinary members; staff retain their scoped administrative roster. State commanders retain their assigned state roster while the shared directory supplies community names and affiliations across CVOA. This does not broaden access to post operations or private records.

## Release

1. Apply supabase/migrations/20261006150000_member_directory_removal.sql after the released dashboard migration.
2. Deploy the frontend. No new Edge functions or secrets are required.
3. Verify National's combined list and both removal controls, a roster-only record, and a member's directory search. Review unique identity matches and remaining conflicts. Verify a removed record restores correctly without silently re-enabling account permissions. Use test records for removal verification; do not remove real members as a smoke test.

## Validation

Production TypeScript/Vite build passes. The coordinated PostgreSQL permission and migration tests and related dashboard, payment, and meeting suites pass (130 tests). Tests cover cross-post directory field privacy, applicant/anonymous denial, National-only removal, audit guards, self-removal rejection, payment preservation, suspension, restoration, combined pagination, identity reconciliation, and billing safeguards. No real members were removed, emails sent, or payment settings changed during development. Authenticated live browser workflows have not been tested; the new migration has not been applied to production in this coding turn.
