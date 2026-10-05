// supabase/functions/stripe-webhook/index.ts
//
// Listens for Stripe's checkout.session.completed event and, on success:
//   1. Marks the payment as paid and activates the member (sets
//      membership_status to 'active', joined_at if not already set, and
//      expires_at one year out for annual / null forever for lifetime).
//   2. Sends staff a generic payment notice directing them to the protected
//      membership roster. Member information stays inside CVOA.ONE.
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
import nodemailer from 'npm:nodemailer@6.9.16'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? Deno.env.get('STRIPE_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WORKSPACE_EMAIL = Deno.env.get('WORKSPACE_EMAIL')
const WORKSPACE_APP_PASSWORD = Deno.env.get('WORKSPACE_APP_PASSWORD')

const NOTIFY_RECIPIENTS = ['command@combatvetsofamerica.org', 'maddymarked@gmail.com']

async function sendMembershipNotification() {
  if (!WORKSPACE_EMAIL || !WORKSPACE_APP_PASSWORD) {
    console.warn('Membership recorded; notification email is not configured.')
    return
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: WORKSPACE_EMAIL, pass: WORKSPACE_APP_PASSWORD },
  })
  await transporter.sendMail({
    from: `CVOA Post OS <${WORKSPACE_EMAIL}>`,
    to: NOTIFY_RECIPIENTS.join(', '),
    subject: 'CVOA membership payment received',
    html: '<p>A membership payment has been recorded.</p><p>Sign in to <a href="https://cvoa.one/members">CVOA.ONE Membership Roster</a> to review the member record.</p>',
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST.', { status:405 })
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion:'2023-10-16' })
  let event: Stripe.Event
  try { event = await stripe.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature') ?? '', STRIPE_WEBHOOK_SECRET) }
  catch { return new Response('Invalid webhook signature.', { status:400 }) }
  const supabase = createClient(SUPABASE_URL,SERVICE_ROLE_KEY)
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status !== 'paid') return new Response(JSON.stringify({ received:true }), { headers:{'Content-Type':'application/json'} })
      if (session.metadata?.kind === 'sponsorship') {
        const receipt = await supabase.rpc('cvoa_fulfill_sponsor_payment', {
          p_request: session.metadata.sponsor_request_id, p_session: session.id,
          p_amount: session.amount_total, p_currency: session.currency,
          p_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          p_paid_at: new Date(event.created * 1000).toISOString(), p_live: session.livemode,
        })
        if (receipt.error) throw receipt.error
        return new Response(JSON.stringify({received:true}), {headers:{'Content-Type':'application/json'}})
      }
      const memberId = session.metadata?.member_id
      const type = session.metadata?.membership_type
      if (!memberId || !['annual','lifetime'].includes(type ?? '') || session.currency !== 'usd' || session.amount_total !== (type === 'lifetime' ? 49999 : 4999)) throw new Error('Checkout amount or metadata does not match membership pricing.')
      const { data: applied,error } = await supabase.rpc('cvoa_fulfill_membership', {
        p_session:session.id,p_member:memberId,p_type:type,
        p_intent:typeof session.payment_intent === 'string' ? session.payment_intent : null,
        p_subscription:session.mode === 'subscription' && typeof session.subscription === 'string' ? session.subscription : null,
        p_paid_at:new Date(event.created*1000).toISOString(),
      })
      if(error) throw error
      if(applied) {
        try { await sendMembershipNotification() }
        catch { console.error('Membership recorded; notification delivery failed.') }
      }
    }
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge
      if (typeof charge.payment_intent === 'string') {
        const refund = await supabase.rpc('cvoa_sponsor_refund', {p_intent:charge.payment_intent,p_refunded_cents:charge.amount_refunded})
        if (refund.error) throw refund.error
      }
    }
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice
      if(invoice.billing_reason === 'subscription_cycle' && typeof invoice.subscription === 'string') {
        if(invoice.currency !== 'usd' || invoice.amount_paid !== 4999) throw new Error('Unexpected recurring membership amount.')
        const periodEnd = Math.max(...invoice.lines.data.map(line => line.period.end))
        if(!Number.isFinite(periodEnd)) throw new Error('Recurring invoice period is missing.')
        const r = await supabase.rpc('cvoa_renew_subscription', {
          p_invoice:invoice.id,p_subscription:invoice.subscription,
          p_period_end:new Date(periodEnd*1000).toISOString().slice(0,10),
          p_paid_at:new Date(event.created*1000).toISOString(),
        })
        if(r.error) throw r.error
      }
    }
    if(event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      const r=await supabase.from('members').update({ auto_renew:false,stripe_subscription_id:null }).eq('stripe_subscription_id',subscription.id)
      if(r.error) throw r.error
    }
    return new Response(JSON.stringify({ received:true }), { headers:{'Content-Type':'application/json'} })
  } catch {
    console.error('Membership webhook persistence failed; Stripe should retry.',event.id)
    return new Response('Membership update failed; retry this event.', { status:500 })
  }
})
