# CVOA welcome packet

The guide is the exact four-page PDF approved October 8, 2026: justified paragraphs, a small logo on each page, and no repeated letterhead or footer. The card remains in My Membership.

The letter preserves the approved letterhead and uses the actual send date in Indianapolis, recipient name, available mailing address, and recorded annual/lifetime membership type. Missing fields are omitted. No placeholder EIN or address is printed. The letter welcomes the recipient; it does not certify payment, verification, or staff authority. Signup confirmations use the password already selected; invitations explain password setup; paid membership letters explain signing in or requesting an account.

Assets are bundled as base64 TypeScript modules because the Edge Function deployment API transfers source files. There are no runtime asset downloads. `guide.ts` contains the approved guide, `logo.ts` the seal from `public/images/cvoa-logo.png`, and the serif modules contain DejaVu Serif regular/bold. Font licensing is in FONT-LICENSE.txt. PDF/font dependencies are version pinned.

Deploy invite-member and invite-user with JWT verification enabled and all welcome module dependencies included. Send-auth-email verifies Standard Webhooks signatures itself, so its gateway JWT check is disabled.

Apply the membership_welcome_delivery migration before deploying stripe-webhook. First paid memberships receive the packet even without a login. The delivery row stores only member/session IDs and timestamps, with RLS and service-role-only access. SMTP failure releases the claim and returns a retryable webhook error without undoing payment. Replays and renewals do not repeat completed welcomes. A crash after SMTP acceptance but before recording completion can still cause a duplicate; SMTP cannot provide transactional exactly-once delivery.

Verification: `node --test tests/member-invitations.test.mjs tests/membership-webhook.test.mjs tests/welcome-delivery.test.mjs`; `deno test --node-modules-dir=none --allow-env tests/welcome-packet.test.ts`. The packet tests can also run through a TypeScript Node runner with the version-pinned dependencies and a Deno.test adapter. Check rendered letter PDFs before changing typography.

## Self-service confirmation setup

After testing and deploying send-auth-email:

1. In the Postos project, Authentication → Hooks → Send Email, create an HTTPS hook pointing to `https://mvlhtuoukhorxmmibruc.supabase.co/functions/v1/send-auth-email`.
2. Generate a signing secret and save that exact value as the Edge Function secret `SEND_EMAIL_HOOK_SECRET`.
3. Enable the hook only after the secret is saved. Keep Email Provider enabled and preserve email confirmation and secure email change settings.
4. Test a fresh signup with an authorized test mailbox. Confirm both PDFs, the recipient/date, and the confirmation link; then test password recovery and secure email changes. Do not use a real member as a test recipient.

The hook uses the existing WORKSPACE_EMAIL / WORKSPACE_APP_PASSWORD SMTP credentials, replaces Auth's SMTP sending, attaches the packet only for signup/invite, and keeps recovery and other authentication emails focused. It does not change roles, membership records, or authorization. Disable the hook to return Auth email sending to the existing SMTP configuration if delivery fails.
