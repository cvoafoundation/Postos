// supabase/functions/stripe-webhook/index.ts
//
// Listens for Stripe's checkout.session.completed event and, on success:
//   1. Marks the payment as paid and activates the member (sets
//      membership_status to 'active', joined_at if not already set, and
//      expires_at one year out for annual / null forever for lifetime).
//   2. Emails command@combatvetsofamerica.org and maddymarked@gmail.com with
//      the new/renewing member's full name, address, and membership number.
// This is what makes the whole flow hands-off — nobody has to manually mark
// someone as paid after checking a bank statement, and nobody has to
// remember to tell the card maker a new member signed up.
//
// DEPLOYING THIS (one-time setup):
//   1. In Supabase: Edge Functions -> Secrets, add:
//        STRIPE_SECRET_KEY = <same key as create-membership-checkout>
//        STRIPE_WEBHOOK_SECRET = <see step 3 below>
//        RESEND_API_KEY = <from resend.com — same key as any other
//          notification function you've already deployed, if you have one>
//   2. Deploy: `supabase functions deploy stripe-webhook --no-verify-jwt`
//      (--no-verify-jwt is required — Stripe calls this endpoint directly,
//      it doesn't have a Supabase auth token)
//   3. In Stripe Dashboard: Developers -> Webhooks -> Add endpoint.
//      URL: https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
//      Events to send: checkout.session.completed, invoice.payment_succeeded,
//        customer.subscription.deleted (the last two power auto-renew —
//        annual memberships where the member opted into automatic billing)
//      Copy the "Signing secret" shown after creating it — that's your
//      STRIPE_WEBHOOK_SECRET from step 1.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import Stripe from 'npm:stripe@14.21.0'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const NOTIFY_FROM_ADDRESS = Deno.env.get('NOTIFY_FROM_ADDRESS') ?? 'CVOA Post OS <onboarding@resend.dev>'

const NOTIFY_RECIPIENTS = ['command@combatvetsofamerica.org', 'maddymarked@gmail.com']

async function sendMembershipNotification(member: { full_name: string; address: string | null; membership_number: string | null; membership_type: string }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping membership notification email (dry run):', member)
    return
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: NOTIFY_FROM_ADDRESS,
      to: NOTIFY_RECIPIENTS,
      subject: `New ${member.membership_type} membership: ${member.full_name}`,
      html: `<p>A membership payment just cleared:</p>
             <ul>
               <li><strong>Name:</strong> ${member.full_name}</li>
               <li><strong>Address:</strong> ${member.address ?? 'Not provided'}</li>
               <li><strong>Membership Number:</strong> ${member.membership_number ?? 'Pending assignment'}</li>
               <li><strong>Type:</strong> ${member.membership_type}</li>
             </ul>`,
    }),
  })
}

Deno.serve(async (req) => {
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  const signature = req.headers.get('stripe-signature')!
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err}`, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const memberId = session.metadata?.member_id
    const membershipType = session.metadata?.membership_type as 'annual' | 'lifetime' | undefined

    await supabase
      .from('membership_payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      })
      .eq('stripe_checkout_session_id', session.id)

    if (memberId) {
      const now = new Date()
      const expiresAt =
        membershipType === 'lifetime' ? null : new Date(now.setFullYear(now.getFullYear() + 1)).toISOString().slice(0, 10)

      const patch: Record<string, unknown> = {
        membership_status: 'active',
        joined_at: new Date().toISOString().slice(0, 10),
        expires_at: expiresAt,
      }
      if (session.mode === 'subscription' && typeof session.subscription === 'string') {
        patch.stripe_subscription_id = session.subscription
      }

      const { data: updatedMember } = await supabase.from('members').update(patch).eq('id', memberId).select().single()

      if (updatedMember) {
        await sendMembershipNotification({
          full_name: updatedMember.full_name,
          address: updatedMember.address,
          membership_number: updatedMember.membership_number,
          membership_type: updatedMember.membership_type,
        })
      }
    }
  }

  // This is the actual auto-renew mechanism: Stripe charges the saved card
  // automatically every year for an active subscription, and fires this
  // event each time it succeeds — including the very first charge, which
  // this skips (billing_reason distinguishes it) since checkout.session.completed
  // already activated the membership above.
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    if (invoice.billing_reason === 'subscription_cycle' && typeof invoice.subscription === 'string') {
      const { data: member } = await supabase
        .from('members')
        .select('*')
        .eq('stripe_subscription_id', invoice.subscription)
        .single()

      if (member) {
        const newExpiry = new Date()
        newExpiry.setFullYear(newExpiry.getFullYear() + 1)
        await supabase
          .from('members')
          .update({ membership_status: 'active', expires_at: newExpiry.toISOString().slice(0, 10) })
          .eq('id', member.id)
      }
    }
  }

  // A subscription actually ending (cancelled, or payment ultimately failed
  // and Stripe gave up retrying) — stop treating it as auto-renewing, but
  // don't touch membership_status; they already paid through expires_at.
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    await supabase.from('members').update({ auto_renew: false, stripe_subscription_id: null }).eq('stripe_subscription_id', subscription.id)
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
})
