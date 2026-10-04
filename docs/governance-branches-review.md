# Congress and Ethics Tribunal: branch workflow review

Source: supplied **CVA | Bylaws | 20250819(4).pdf**, Articles IX, X, XIII, XIV and Appendix B1. The PDF lists B3 and B4 but does not supply the adopted Congress operating resolution or Tribunal procedural rules.

## Prepared behavior

| Branch | Workspace and authority | Safeguards |
|---|---|---|
| Veterans Congress | A shared member-facing legislative dashboard; elected delegate registry; formal ballots opened and certified by a currently seated Congress Presiding Officer; committee members record recommendations. | National does not gain a formal ballot solely through executive status. Every ballot fixes its eligible delegates and chapter denominator, records attendance separately from votes, enforces its deadline, and records the result. |
| National Command Council | Records completed delegate election certifications and the certified Combat Member roster count. Executive ratification and implementation remain distinct from Congress adoption. | A certification is an attestation to an actual election, not an election or appointment by the application. Seat entitlement is `ceil(certified Combat Members / 10)`, with current active membership as an upper bound. |
| Ethics Tribunal | A protected judicial docket with notice, defense deadline, hearing, findings, governing provisions, rationale, sanction proposal, deliberations, approval votes, recusals and case history. | Filers receive a status-only RPC. Named complainants cannot review their own cases as judges. Recused judges lose case access. Editing invalidates approvals, and version checks prevent approving or overwriting an unseen revision. |

The case workflow requires at least fourteen days after recorded service of written charges before a sanction can issue. It requires clear and convincing findings and three affirmative approvals from currently authorized, non-recused Tribunal members on the saved opinion. A sanction requires a five-to-eight-member Tribunal; four votes for removal/disqualification remain recommended best practice, as the text states. Closed opinions are preserved. The screen records actual notice served elsewhere; it does not deliver notice or change a person's account, membership or office automatically.

National account administration cannot add or remove the Tribunal role or delete a Tribunal account. Matching `invite-user` and `delete-user` changes close the service-role paths. Judicial seating and removal require a separately documented Article X process and authorized implementation. Trusted database/service administrators retain operational access; this release does not claim that application permissions prevent a database owner from accessing records.

The Congress overview computes current-ballot support in one database request. Historic polls are excluded from formal tallies. Resolution and amendment history cannot be deleted through ordinary application access. An amendment is explicitly a proposal; it does not silently rewrite the original text or ballot. One formal ballot is supported per resolution; an invalid ballot remains on record and a later vote requires a new linked measure rather than overwriting history.

## Rules implemented for supported Congress motions

| Motion | Threshold | Quorum |
|---|---|---|
| Ordinary resolution | More yes than no votes; no votes cannot yield adoption | Delegates representing at least one-third of active chapters |
| Bylaws proposal | More than half of the seated delegate electorate | Same |
| Structural change | At least two-thirds of seated delegates | Same |
| Executive override | At least two-thirds of all seated delegates | Same |
| Recall initiation | At least three-fifths of all seated delegates | Same |

Chapter quorum counts represented **chapters**, not individual votes. Attendance without a vote is available. A ballot without quorum records `no_quorum`, returns the measure to discussion, and produces no valid decision. Delegate credentials require a current primary seat, a certification reference, a chartered active post and current active membership. Alternates and unverified legacy records cannot cast formal votes. The Presiding Officer's election reference must also be recorded. Certification records should include Appendix B1 election notice, candidate eligibility, the twenty-five-percent election participation quorum, results and the certified roster.

## Matters requiring governing-body procedure

1. **Amendment notice:** §14.1 says fourteen days to Council and delegates; §14.2 says ten days to Council and chapters. Both provisions must be addressed in the adopted process. This code does not declare amendments effective or replace the NCC two-thirds approval required by Article XIV.
2. **Recall removal:** §9.2 requires a subsequent session after initiation. This release blocks the final removal ballot rather than inferring an unspecified denominator or bypassing the separate session.
3. **Constitutional/mission ratification:** §9.2(d) refers to standards defined by Council resolutions. Constitutional-category ballots remain blocked pending that governing procedure.
4. **Appeals:** The Tribunal is the original judicial body; §10.5 assigns appellate review to Congress. An appeal requires written grounds within thirty days and ten-percent delegate endorsements; changing the ruling requires a two-thirds vote at a duly called session. This release displays the deadline and rules but does not automate appeal filing, endorsement collection, record disclosure or appellate adjudication.
5. **Judicial appointments and terms:** §10.2 requires five to eight members, mixed appointment/election routes, staggered three-year terms, a two-consecutive-term limit and a Tribunal-elected Presiding Officer. Existing judicial role records are not proof those procedures occurred. A complete election/ratification registry is still required before claiming full institutional compliance.
6. **Record publication and closed sessions:** §9.6 requires member publication within thirty days and allows approved executive sessions. The existing public transparency behavior remains; this release does not supply a sealed Congress session system, notifications, automatic summons, respondent portal, evidence file storage or annual anonymized judicial report.

These limitations are visible design boundaries, not a statement that the entire 129-page bylaws have been automated. An organization-wide legal-compliance conclusion would require the adopted procedures, actual election/appointment records and operation of the system.

## Release order and preflight

This change is prepared on a feature branch and is **not deployed**. The prior organizational-workspaces release remains live.

1. Review the actual live governance policies, existing votes, delegate credentials and judicial role roster; reconcile any legacy data without granting unearned credentials. Review the B3/B4 operating rules before using binding workflows.
2. Deploy matching `invite-user` and `delete-user` functions, preventing executive appointment/deletion of Tribunal accounts through privileged endpoints. No test invitation or deletion should be performed against a real person.
3. Rehearse `20261004010000_governance_branches.sql` against the live schema in a transaction ending with rollback; then apply the approved migration. It follows the two already-deployed October 3 migrations.
4. Record actual certified delegate elections and the Congress Presiding Officer under the adopted operating resolution. Do not fabricate a certification to make the interface work.
5. Merge and deploy the matching frontend. Verify member, certified delegate, Congress Presiding Officer, National, Tribunal member and recused member experiences using authorized test accounts. Verify that private deliberations never appear in filer responses.

Verification uses the full source PostgreSQL schema with both prior migrations and the new governance migration, real RLS roles and RPC execution in PGlite, plus the TypeScript/Vite production build. No production permissions, cases, elections, votes, invitations, deletions or sanctions are changed by preparing this branch.
