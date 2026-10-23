# Connected Company ratings

All operating health surfaces use `cvoa_post_health_evidence` and the same
`computePostHealth` calculation: Company dashboards/records, Battalion overview,
Company list, and National map. The National overdue-minutes count derives from
the same meeting dimension and National-configured thresholds. The former
stored posts.health_status value remains for compatibility but does not drive
these colors. Forming Companies have launch readiness, not an operating score;
archived Companies are excluded. A failed/missing rating is gray/unavailable.
Critical-red Companies sort ahead of yellow/green, even if their average is high.

The snapshot is scoped to live appointments and carries the database evaluation
time and policy version. It bundles the minimum fields needed for every signal:
verified current staff identities/positions, net actual sponsor receipts, dated
published minutes from all three meeting systems, member status/term/expiry,
identity-linked governance signatures, annual-review completion evidence,
community-service dates, and dated operating-ledger amounts/types. Financial
entries now include transaction_date, which the old loader omitted. Draft,
unfinished, and future meetings cannot provide published-meeting compliance.
Sponsor pledges remain separate from received money and operating ledger totals.
The score is an operational indicator, not a bank reconciliation.

Removed membership/account records and flagged test accounts are excluded.
Expired annual terms do not count as active; lifetime members remain active
regardless of an old expiry value. The Company dashboard, Battalion counts,
and rating use the same validity rule. This does not modify membership records
or payment entitlements. Congressional participation counts completed voting
opportunities (resolved outcomes or elapsed deadlines), so an open ballot is
not treated as missed while members still have time to vote. Current delegates
and officers must have active, undeleted, non-test accounts.

The policy's thresholds, equal signal weighting, critical overrides, and grace
periods are unchanged. National's current settings remain unconfirmed and are
shown as provisional. Missing financial records require attention; neutral
signals are excluded from the average. The evidence snapshot redacts unnecessary
contact fields, transaction descriptions and annual-review notes. No additional
jurisdiction permissions are granted. Source links lead to the relevant Company
tab; managers can open signature/review/service records directly, and Congress
participation opens Veterans Congress.

Ratings refresh on page entry, explicit refresh, window focus/visibility, and
account/member-change notifications. Stale responses from a previous account,
jurisdiction, or Company are ignored. The loader batches at most 500 Companies
per RPC and fails visibly if evidence is incomplete, replacing ten independent
raw-table queries that could return different visible records to different roles.

Validation covers the SQL migration in the full local PostgreSQL schema,
National/Battalion/Company scoping, removal/expiry counts, dated ledger and
published meeting evidence, open-ballot handling, model calculations, missing
snapshot handling, neutral/forming map colors, source routes, and frontend build.
No live member records, ratings policy, appointments, payments, or messages are
changed as part of testing.
