# Guided post application pipeline

This independent PR starts from the released main tree. It does not merge the separate Congress/Tribunal or National Dashboard drafts.

## Staff experience

Eight stages now run vertically, with arrows, stage goals, responsible roles, and plain-language instructions. Applicant cards show evidence-based checkmarks/exclamation marks; reviewer assignment; a concrete next action and optional due date; the most recent applicant update; and descriptive action buttons. Search covers name, email, city and state; stage jump links wrap instead of requiring horizontal scrolling. Applications are shown oldest first.

Reviewers can upload or replace the application DD214, review it, schedule/record an interview, complete all five scorecard categories, open the existing feedback/document-request timeline, and collect current National reviewers’ sign-offs from the same pipeline. Interview completion needs a past date and written notes. Merely reaching a stage does not mark its evidence complete.

Forward progress requires:

| Transition | Evidence |
|---|---|
| Inquiry → submitted | Service document on file |
| Submitted → interview scheduled | Verified DD214 and an interview record |
| Interview scheduled → vetting | Recorded completed interview with notes |
| Vetting → approved | Verified current DD214, completed interview, a complete five-category scorecard, and all current National reviewers’ sign-offs |
| Approved → founding team | The same approval evidence, followed by an atomic post/commander-record/application link creation |

These are product workflow gates. The existing all-current-National-accounts sign-off rule is retained, with departed roles excluded; this is not a claim that technical National accounts are a certified constitutional NCC voting roster. Governing-body approval records and the organization’s charter authority remain separate.

After handoff, the linked post workspace owns founding-team/charter/active progress. Its launch status updates synchronize linked application stages. Pipeline cards show recorded launch checklist totals and required-position verification. Existing post-workspace authority to advance manually is not replaced with an invented charter rule. Creating a forming record does not itself issue a charter, grant a person account permissions, change their post affiliation, or sell/approve a new membership.

## Reliability and privacy

- National-only snapshot RPC provides all applicant evidence and narrow reviewer names without API row-cap truncation. Raw intake and staff handoff fields are National-only; applicants retain their existing safe status/feedback endpoint.
- Stage changes lock the application, move one stage at a time, reject stale submissions, and record a reason/next steps in the applicant-visible feedback timeline and stage history. Failure rolls back the post, founding record, application link and stage together; repeated stale advancement cannot create another post.
- Replacement DD214s must exist at a reviewer-owned path for that application. Replacement clears verification. Sign-offs refer to the document actually reviewed; an older document’s signatures do not count, and signing again/withdrawals are retained in a National-only event history. Existing signature paths are backfilled from current application references for preflight review; they are not proof of a historical review never recorded.
- Reviewer handoffs use version checks to prevent overwriting a concurrent edit. Ordinary clients cannot forge official stage/link changes or pre-approved public intake. Sign-off errors remain visible instead of reporting apparent success.
- The existing checklist-seeding trigger receives a fixed public/pg_temp search path so it works when called from the new fixed-path creation RPC; its template contents are preserved.

## Checks and release

All 107 tests on this independent branch pass, including 17 full-schema PostgreSQL/PGlite tests covering authorization, forged intake, stale/adjacent transitions, interview and approval evidence, current reviewer/document signatures, applicant privacy, document ownership, versioned handoffs, atomic rollback and launch synchronization. The production TypeScript/Vite build and whitespace checks pass.

A local visual preview with fictional applicants was prepared, but browser execution was blocked: the cloud browser denied loopback navigation, and local browser installation could not retrieve a usable browser archive. No desktop/mobile or authenticated production browser pass is claimed. These remain release verification steps.

Before deployment:

1. Inspect live application/read/write policies, interview evidence, current reviewer roles and legacy sign-offs; verify they match the rehearsed source schema.
2. Review applications without a linked post, mismatched application/post launch stages, and any earlier partial handoff records. Reconcile legitimate existing records without creating duplicate posts or fabricating interview/approval evidence. Unlinked legacy launch applications show an explicit reconciliation warning.
3. Rehearse and apply `20261004150000_application_pipeline.sql` after the two released October 3 migrations. It can also follow the two independent October 4 drafts.
4. Deploy the matching frontend, then verify the vertical flow on desktop/mobile, search, modal actions, signed document access, applicant feedback, and post workspace navigation with authorized test accounts.

This PR is prepared, not deployed. No real applicant, service document, interview, sign-off, post or membership was changed while developing or testing it. Existing interview entries are not retrospectively marked complete.
