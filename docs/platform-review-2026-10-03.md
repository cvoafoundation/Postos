# CVOA.ONE platform review — October 3, 2026

## Scope and evidence

This is a route-level source review and targeted regression verification. It is **not a completed authenticated browser crawl**. The cloud browser reported native-credential protection while inspecting Supabase function details; production checkout source, live database policies, and all signed-in pages still require verification. No real payments, cancellations, or new invitations were submitted during this review.

Reviewed the App router, sidebar, all 58 page source files (547655 bytes), authentication/profile resolution, roster/account flows, source database policies, and membership Edge Functions. The inventory below identifies the routes and their client guards. Database RLS remains the authority for data access.

## Membership price

- Frontend: `MEMBERSHIP_PRICES.lifetime = 499.99`.
- Checkout: lifetime `unit_amount = 49999`, `currency = usd`, `mode = payment`; lifetime ignores auto-renew.
- Annual: $49.99 / 4,999 cents; optional yearly subscription.
- Regression tests capture the Stripe SDK request and the database amount, including a malicious browser-supplied amount and mismatched saved membership type.
- Deployed checkout function price has **not yet been read**; source confirmation alone does not establish production configuration.

## Implemented improvements

| Area | Result |
|---|---|
| Page loading | All routed pages load on demand. Main JavaScript decreased from 1,174.44 KB (324.43 KB gzip) to 255.58 KB (77.87 KB gzip). This measures the main bundle, not total bytes for every route or real-user latency. |
| Roster vs accounts | User Management is labeled Accounts & Access, with explicit purpose and links to Membership Roster. Roster retains dues, renewal, member details, and password setup emails. |
| Administrative lists | Read results in 500-row requests instead of silently accepting Supabase's default 1,000-row response cap. Render 50 rows per list page. Full list data is still loaded locally; server-side search/pagination is the next step for much larger installations. |
| Search | Ignore stale global-search responses and constrain raw PostgREST filter punctuation. Global search is explicitly limited to 100 matches. |
| CSV import | Submit 100 records per request; isolate rejected batches so valid rows can still import. Report successful and failed rows accurately; skip a recognized header. |
| Dashboard | Total Members counts membership records instead of login accounts; data failures produce a visible error instead of silently displaying zero totals. |
| Authentication | Token refresh does not refetch the profile for an unchanged user identity. Guard profile state against stale responses after identity changes. |
| Account edits | Show database failures; update displayed role/post/title only after a confirmed database write. Sending/deleting states recover after thrown errors. |
| Navigation | Members can open the already-shared Post Drive link. Post officers see Post Dashboard instead of Global Dashboard. Ethics Tribunal route excludes the standard National override. |
| Dialogs | Label dialogs and close buttons; support Escape, keyboard focus trapping, and focus restoration. |
| Payment messaging | Checkout return page explains that activation follows Stripe confirmation. Checkout failures show backend error details. |
| Auto-renew UI | Display cancellation errors and retain the On state until cancellation succeeds. |
| Checkout function — requires Supabase deployment | Validate method/body and saved member type/post before Stripe; accept existing STRIPE_KEY secret alias; expire a session if its payment record cannot be saved. Server price remains $499.99 / 49,999 cents. |
| Cancellation function — requires Supabase deployment | Verify caller identity and National/own-post officer permissions before Stripe or database writes. Preserve retryable state if Stripe cancellation fails. |

## Outstanding issues requiring live confirmation or a separate database change

1. **Highest priority: profile privilege escalation in source schema.** `profiles_update_own` and `profiles_insert_own` constrain the row ID but do not constrain role/post columns. If production uses these policies and normal table grants, a user could modify their own privileged fields outside the UI. Inspect deployed policies/triggers/grants before changing them; preserve National administration and trusted membership/founding-team promotion functions.
2. **Highest priority: overly broad post write/public insert policies in source schema.** Several post tables allow writes for any authenticated account or any same-post account. Public membership/founding-team/payment inserts are not limited to safe initial states. Inspect production policies, then constrain officer writes and public intake fields. Frontend role guards cannot enforce this.
3. **Staff invitation path still needs parity with member invitations.** `invite-user` retains a silent dry-run path, logs a setup link when mail settings are absent, uses an older redirect, and inserts an existing profile without a retry strategy. Member invitation repair is confirmed working by the administrator; the distinct staff function needs its own deployment/test.
4. **Webhook recovery and idempotency.** The source webhook logs some database failures but acknowledges the event. Check payment status before activation and return retryable errors on failed critical writes; add event/session uniqueness before relying on repeated Stripe events. A webhook/database migration must be reviewed together.
5. **Dashboard at scale.** Apart from the fixed member count, several metric queries download row-level histories and rely on default API limits. Move aggregate metrics to a scoped database function/view and verify source-data totals before replacing them.
6. **Unsupported role paths.** State commander and delegate-only accounts currently fall through to Account Pending at home. Confirm their intended responsibilities before assigning modules or granting additional access.
7. **Renewal record identity.** Public join/renew forms create new membership rows. Review renewal identity/account linkage before treating a fresh signup as renewal of an existing member.
8. **Deployment drift.** Supabase functions are deployed separately from Vercel/GitHub. Reconcile deployed source with GitHub and automate scoped deployment after secrets/permissions are confirmed.

## Route inventory

All rows below received source-level route/guard review, not live browser sign-in verification. National receives a standard override except where expressly excluded.

| Route | View | Client access |
|---|---|---|
| `/set-password` | SetPassword | Public |
| `/login` | Legacy password redirect | Public |
| `/join-founding-team/:postId` | JoinFoundingTeam | Public |
| `/post-checklist/:postId` | PublicChecklist | Public |
| `/join-post/:postId` | PublicRecruitSignup | Public |
| `/become-a-sponsor/:postId` | BecomeASponsor | Public |
| `/join-membership/:postId` | JoinMembership | Public |
| `/join` | JoinCVOA | Public |
| `/verify-membership/:memberId` | VerifyMembership | Public |
| `/membership-payment-result` | MembershipPaymentResult | Public |
| `/transparency` | TransparencyPortal | Public |
| `/` | HomeRoute | Signed in |
| `/applications` | ApplicationsPipeline | National |
| `/vetting` | VettingBoard | National |
| `/toolkit` | Toolkit | National + post_commander, post_officer |
| `/meetings` | Meetings | National + post_commander, post_officer |
| `/meetings/uro/:meetingId` | UroMeetingWizard | National + post_commander, post_officer |
| `/meetings/uro/:meetingId/view` | UroMeetingView | National + post_commander, post_officer |
| `/meetings/uro-compliance` | UroComplianceDashboard | National |
| `/meetings/uro-motions` | UroMotionSearch | National |
| `/meetings/uro-actions` | UroActionItemReport | National + post_commander, post_officer |
| `/recruiting` | RecruitingPipeline | National + post_commander, post_officer |
| `/sponsors` | SponsorsCRM | National + post_commander, post_officer |
| `/congress` | CongressRoute | Signed in |
| `/congress/resolutions/:id` | ResolutionDetail | Signed in |
| `/congress/committees` | Committees | National |
| `/congress/delegates` | Delegates | Signed in |
| `/congress/legislative` | LegislativeTracker | National |
| `/congress/calendar` | CongressCalendar | National |
| `/health` | PostHealth | National + post_commander, post_officer |
| `/health/:postId` | PostHealthDetail | National + post_commander, post_officer |
| `/build-a-post` | BuildAPost | National + post_commander, post_officer |
| `/build-a-post/:moduleId` | BuildAPostDetail | National + post_commander, post_officer |
| `/members` | MembershipRoster | National + post_commander, post_officer |
| `/my-membership` | MyMembership | Signed in |
| `/settings` | Settings | Signed in |
| `/file-complaint` | FileComplaint | Signed in |
| `/ethics-tribunal` | EthicsTribunalInbox | Ethics Tribunal only |
| `/membership-review` | MembershipReview | National + post_commander, post_officer |
| `/post-officers` | PostOfficersDirectory | Signed in |
| `/post-members` | PostMembersDirectory | Signed in |
| `/role-applications` | RoleApplications | National + post_commander |
| `/drive` | NCCDrive | National |
| `/shared-files` | SharedDriveView | National + member, post_commander, post_officer |
| `/users` | UserManagement | National |

## Validation and deployment status

- Production build: passed locally.
- Regression suite: 32 tests cover invitation retries/roles, row-cap pagination, actual checkout cents/modes, payment-record failure, cancellation permissions and retry failures, and the Tribunal role guard.
- Frontend release and Supabase function deployment statuses must be recorded after production checks; source edits alone are not a deployment.

## Read-only database confirmation query

Run as a database administrator. It changes no data:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'members', 'founding_team_members', 'membership_payments', 'uro_meetings', 'uro_motions')
order by tablename, policyname;

select trigger_name, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public' and event_object_table = 'profiles';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'profiles';
```
