# Sponsorship workflow release

The horizontal CRM becomes a vertical pipeline. Contacted requires a named contact, method, contact details and conversation notes. Meeting scheduled requires start/end and meeting partner, with Google Calendar draft and interoperable ICS export. Proposal sent requires typed proposal or a private PDF/Word file. All stages allow agreement amount changes. Signed agreements, dates, business categories, tiers, notes and offline receipts remain available.

Members manage their affiliated post's sponsors. Post staff have their post, State commanders their state's posts, and National all ordinary sponsorships. Public sponsor interest remains a new lead only; anonymous visitors cannot read or update records. Stage/amount changes use version checks and append-only activity. Card receipts cannot be forged or deleted by authenticated clients.

## Deploy order

1. Apply `supabase/migrations/20261005160000_sponsorship_workflow.sql`.
2. Deploy `create-sponsorship-checkout` with gateway JWT verification OFF. Public receipt lookup requires an unguessable saved Stripe Session ID and returns limited payment status/amount. Creation independently verifies the user's token and performs the scoped authenticated reservation RPC before creating a Stripe session.
3. Update `stripe-webhook`, keeping gateway JWT verification OFF and Stripe signature verification ON. Existing membership and subscription handling stays in place; sponsorship metadata routes to a separate service-only fulfillment RPC.
4. Deploy the frontend.

Both Edge functions reuse `STRIPE_SECRET_KEY` (fallback `STRIPE_KEY`); the existing webhook reuses `STRIPE_WEBHOOK_SECRET`. Do not expose or replace these values. Immediate card checkout uses the existing `checkout.session.completed` event. If `charge.refunded` is enabled in the Stripe webhook, refunds reconcile automatically. Otherwise `Check Stripe payment` refreshes the actual refund total from Stripe. No refund is initiated by CVOA.ONE.

`Collect payment` creates a fixed-amount, idempotent checkout and offers open/copy link. Stripe accepts card details. Editing the agreed donation amount does not rewrite previously issued payment requests or paid receipts. Offline methods remain cash/check/wire/other. Test receipts are labeled and excluded from revenue; totals subtract recorded refunds. One dollar minimum is an application choice. Payment link lifetime follows Stripe's default 24 hours.

Google Calendar opens a prefilled event for the user to save. ICS files import into Apple Calendar, Outlook and other providers. No calendar account is connected, no invitations are sent automatically, and later rescheduling in CVOA does not update previously imported events.

## Validation

Production build passes. 86 tests pass, including PGlite execution of the new migration with actual authenticated/anonymous/service roles, cents/currency/live-mode validation, idempotent receipts/refunds, CAS updates, scoped files, public lead restrictions, Edge authorization and webhook dispatch, and calendar timezone/escaping checks. No real payment or email was sent. Signed-in browser, calendar save and actual Stripe checkout remain to be verified live after deployment.
