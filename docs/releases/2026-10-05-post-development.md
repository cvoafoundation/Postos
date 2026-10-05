# Post Development release

## Result

Facility Planning and Fundraising share one Post Development workspace. Existing records stay in place. Legacy URLs preserve their post selection and open the relevant tab. National sees all assigned posts and a review queue; State sees its state, and post staff manage their own post. Ordinary members use National-approved public campaign pages; internal leases, budgets and reviews remain staff-only.

Launch stages: Planning, Fundraising & Location Search, National Location Review, Secure Location & Setup, National Opening Review, Open & Operating. The application must have National approval before the launch workspace starts. Existing active posts initialize at Open & Operating and are not retroactively demoted.

Location candidates include address, lease/purchase/donated arrangement, monthly/upfront cost, floor area, notes, private documents and standards checks. Education and employment services start as recommended. National can configure required location standards and opening-task templates. Opening templates apply to new workspaces; existing tasks are edited per post. Changes to global location standards return unopened approvals for review.

National location decisions retain the submitted revision, standards responses, documents, reviewer and feedback. Editing a location, its checklist or attached documents resets it to draft and requires another review. Local staff record that an approved space is secured. National-required tasks and facility projects block opening review until complete. National records the opening decision; opening changes the shared post status to active_post and removes a trailing (Forming) name. The old launch action opens this workspace instead. Managed launches cannot bypass the gate through direct post status updates.

The opening budget includes connected facility module budgets plus explicit space/setup/reserve items. A module can be excluded as a later improvement. Candidate location prices do not silently become budget commitments; staff must add the chosen costs deliberately. Required facility projects and their checklist text cannot be removed by local staff. Funding and readiness are separate; no arbitrary minimum balance or mandatory offices are hard-coded.

Campaigns can contribute to opening or remain separate. Sponsor receipts can be allocated once to a campaign, refunds reduce their contribution and test payments are excluded. New manual campaign entries create one linked ledger transaction. Incorrect or duplicate entries can be voided with a reason, retaining history and adding one offsetting ledger correction. Historical independent records must be reconciled; the system cannot infer whether older manual records represent the same money.

Public campaign pages require National approval. Changes to title, goal or story require republishing. Only active published campaigns accept donations. Donation Checkout uses existing Stripe credentials, service-only reservations, stable idempotency keys, a per-campaign limit of 200 new requests per hour, verified immutable receipts, refund reconciliation and a separate metadata kind from sponsorship and membership payments. Live online donations and refunds also create corresponding ledger records. Test receipts do not enter real totals or the ledger. The public response contains campaign story, post name/state, goal, received total, status and deadline; no private launch data.

Launch documents use the existing post drive and appear in Documents & Files. Launch history keeps its references to the uploaded version. Location and opening reviews, overdue launch tasks and help requests appear in the existing staff dashboard queue.

## Deploy order

1. Apply `supabase/migrations/20261005170000_post_development.sql` once, after all previous migrations including Sponsorship. Verify new tables have RLS, direct authenticated writes are revoked, and campaign fulfillment/request/refund RPCs are service-only.
2. Deploy `create-campaign-checkout` with gateway JWT verification OFF. The public create action can reserve payments only for active National-published campaigns. Receipt checking accepts only a saved unguessable Stripe session ID. No service key is exposed to the frontend. Existing `STRIPE_SECRET_KEY` or `STRIPE_KEY`, Supabase URL/service key and anon key are reused.
3. Deploy the updated `stripe-webhook`, retaining gateway JWT OFF and raw-body Stripe signature verification. Keep the existing checkout.session.completed subscription. Add charge.refunded to the Stripe endpoint if automatic refund notifications are wanted; the receipt status endpoint also reconciles refunds when checked.
4. Merge the frontend to main and verify Vercel READY before announcing it live.

## Validation and limits

102 automated tests pass, covering actual PostgreSQL migrations/RLS, cross-post/state scope, stale saves, required standards, National approval gates, versioned location decisions, private documents, linked expense deduplication, voided entries, dashboard queue, exact/idempotent Stripe receipts, refunds and test-mode exclusion. Production build and whitespace checks pass.

Authenticated browser flows and real Stripe payments have not been exercised in this environment. Verify one forming post's full launch process and a Stripe test-mode campaign donation after deployment. No real payment, lease signature, donor email or external invitation was performed.

National must decide its actual facility and opening standards. Default recommendations are workflow prompts, not claims of legal or regulatory compliance. Public campaign pages currently use text and progress; photos remain private review evidence. Existing post names and statuses are preserved until an explicit approved opening action.
