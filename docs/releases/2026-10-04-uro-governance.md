# Unified Rules of Order meeting workspace

This release adds a separate governance engine while preserving legacy meeting records. National, state and post bodies have explicit participant and voting rosters. Application roles provide jurisdiction oversight; they do not automatically grant a vote or Chair/Secretary authority.

## Release order

1. Apply `supabase/migrations/20261004230000_uro_governance.sql` after the existing document workspace migration. The migration is transactional and adds new tables; it does not rewrite legacy records.
2. Deploy `supabase/functions/send-meeting-notice/index.ts` with JWT verification enabled. It reuses `WORKSPACE_EMAIL` and `WORKSPACE_APP_PASSWORD`. Supabase URL, anon and service keys are platform-provided secrets. Never put the service key in Vercel frontend variables.
3. Merge/deploy the frontend only after those backend changes succeed.
4. Configure each governing body's actual voter roster, Chair, Secretary and superior notice/voting authority. Remote participation and recusal treatment require explicit configuration. Refresh an existing preparation meeting after editing the body configuration.

## Workflows

- Prepare and classify agenda items, decision briefs, written reports and source documents. Record notices, packet review, RSVPs and advance questions.
- Call to order with explicit quorum calculation, attendance changes, floor requests, Chair recognition, speaking clocks, recess accounting and procedural stages.
- Submit and second exact-text motions, record germaneness findings, resolve amendments, objections to consent and challenges to Chair rulings.
- Freeze eligible present voters at vote opening. Majority is `floor(present/2)+1`; two thirds is `ceil(2*present/3)`. Abstentions and noncast votes remain in this denominator. Guests and nonvoting participants are excluded. Quorum is a separate test of body membership.
- Digital votes are authenticated. Roll calls permit auditable Chair-assisted entries. Voice/show-of-hands totals require Chair attestation. Secret votes hide individual choices from meeting readers; this is application-level confidentiality, not cryptographic anonymity from database operators.
- Review action owners, due dates and unfinished matters before adjournment. Generate factual minutes, certify as Secretary, formally approve through a later same-body decision specifically referencing the prior minutes, and publish separately.
- Preserve corrections as addenda. Export text/PDF or save an explicitly labeled copy to the jurisdiction's Drive. A Drive copy is not the authoritative governance record.
- Search meeting history, motions, decisions, reports, procedure and assignments. Unfinished agenda items carry forward once. Delegated interim actions record actual authority and can require future ratification.
- Private working notes are returned only to their author and are excluded from the shared event log and minutes. Ethics complaints remain in the separate restricted process.
- Post health, state oversight and staff action queues include the new meetings and assignments.

## Notice delivery

Sending requires the assigned Chair or Secretary and an explicit send action. Jobs are idempotent per packet revision, with a snapshot of notice content. Recipient addresses come from linked account/membership records. Each recipient is sent a separate email linking to the authenticated packet; source files retain their existing Drive permissions. A changed packet or meeting setup creates a new revision that can be sent deliberately.

SMTP acceptance is recorded with time and recipient counts, not described as proof of receipt or legal compliance. Missing addresses, uncertain sends and partial delivery remain visible. Uncertain deliveries are not automatically retried; verify the sender before recording manual delivery. Sender credentials are checked before any delivery is claimed. No test emails were sent during development.

## Scope and limitations

Superior governing documents still determine eligibility, notice, remote authorization, recusal treatment and protected rights. A recorded vote does not establish legal validity. The software records suspension/override decisions but never disables quorum, authorization or protected-rights checks. Chairs retain procedural judgment; no AI determines meaning, fairness or germaneness.

Remote meetings use an authorized external meeting link; this release does not provide video hosting. Notice is delivered when the facilitator clicks Send, not through an unattended scheduler. The new workflow intentionally does not reinterpret old vote results using the new denominator. Existing legacy forms and published records remain available under Legacy records.

## Validation

`npm run build`

`node --test tests/connected-accounts.test.mjs tests/post-health.test.mjs tests/uro-notice.test.mjs`

The database suite executes the migration in PostgreSQL through PGlite and tests transitions and permissions as actual authenticated roles. Coverage includes exact two-thirds approval, abstentions/noncast denominator, Chair-challenge reversal, scoped oversight, private notes, secret ballots, guest exclusion, quorum loss, stale writes, frozen electorates, immutable corrections, notice authorization/idempotency, amendment germaneness and carry-forward/action-queue integration. Live email and signed-in production UI must be verified after backend deployment.
