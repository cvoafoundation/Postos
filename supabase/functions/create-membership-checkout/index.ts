// supabase/functions/create-membership-checkout/index.ts
//
// Creates a real Stripe Checkout Session for a membership payment (annual
// $49.99 or lifetime $499.99) and returns the checkout URL for the browser
// to redirect to. No Stripe "Products" need to be pre-created in the
// dashboard — the price is defined inline per request.
//
// DEPLOYING THIS (one-time setup):
//   1. Create a Stripe account at stripe.com if you don't have one, and
//      complete their account verification (this is the part that connects
//      your actual bank account for payouts — Anthropic/Claude cannot do
//      this step, it requires your business's tax ID and banking details
//      directly with Stripe).
//   2. In Stripe Dashboard: Developers -> API keys -> copy the SECRET key
//      (starts with sk_live_... for real payments, sk_test_... to test
//      without moving real money first — strongly recommend testing first).
//   3. In Supabase: Edge Functions -> Secrets, add:
//        STRIPE_SECRET_KEY = <your Stripe secret key>
//        SITE_URL = <your deployed site URL, e.g. https://postos-nine.vercel.app>
//   4. Deploy: `supabase functions deploy create-membership-checkout`

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import Stripe from 'npm:stripe@14.21.0'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? Deno.env.get('STRIPE_KEY')
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PRICES: Record<string, number> = {
  annual: 4999, // $49.99, in cents
  lifetime: 49999, // $499.99, in cents
}

interface RequestBody {
  member_id: string
  post_id: string | null
  membership_type: 'annual' | 'lifetime'
  auto_renew?: boolean
  action?: 'join' | 'renew' | 'upgrade' | 'discard_checkout'
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Use POST to start checkout.' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not configured for this project.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: RequestBody
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid checkout request.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
  if (!body || typeof body.member_id !== 'string' || !body.member_id || !['annual', 'lifetime'].includes(body.membership_type)) {
    return new Response(JSON.stringify({ error: 'A member ID and valid membership type are required.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const amountCents = PRICES[body.membership_type]
  const action = body.action ?? 'join'
  if (!['join','renew','upgrade','discard_checkout'].includes(action)) return new Response(JSON.stringify({ error: 'Invalid membership action.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (!amountCents) {
    return new Response(JSON.stringify({ error: 'Invalid membership type.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Lifetime never auto-renews — one payment, done forever. Auto-renew only
  // makes sense (and is only honored) for annual.
  const isAutoRenew = action === 'join' && body.membership_type === 'annual' && !!body.auto_renew

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: member, error: memberError } = await supabase.from('members').select('id, post_id, membership_type, membership_status, profile_id, auto_renew, stripe_subscription_id').eq('id', body.member_id).single()
  if (memberError || !member) return new Response(JSON.stringify({ error: 'Membership record not found. Please contact CVOA.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if ((action !== 'upgrade' && action !== 'discard_checkout' && member.membership_type !== body.membership_type) || (member.post_id ?? null) !== (body.post_id ?? null)) {
    return new Response(JSON.stringify({ error: 'Checkout details do not match the saved membership.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (action !== 'join') {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    const { data: { user }, error } = token ? await supabase.auth.getUser(token) : { data: { user: null }, error: null }
    if (error || !user || member.profile_id !== user.id) return new Response(JSON.stringify({ error: 'Sign in to manage your own membership.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: accessAllowed, error: accessError } = await supabase.rpc('cvoa_service_authorized', { p_actor: user.id, p_post: null, p_capability: 'personal' })
    if (accessError || !accessAllowed) return new Response(JSON.stringify({ error: 'Account access is suspended or unavailable.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (action === 'discard_checkout') {
      const { data: attempt, error: attemptError } = await supabase.from('membership_checkout_attempts').select('token,session_id').eq('member_id',member.id).maybeSingle()
      if (attemptError) throw attemptError
      if (attempt?.session_id) {
        const existing = await stripe.checkout.sessions.retrieve(attempt.session_id)
        if (existing.status === 'complete') return new Response(JSON.stringify({ error: 'Payment is already complete. Wait for membership confirmation before another checkout.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        if (existing.status === 'open') await stripe.checkout.sessions.expire(existing.id)
        const cleanup = await supabase.from('membership_checkout_attempts').delete().eq('member_id',member.id).eq('token',attempt.token)
        if (cleanup.error) throw cleanup.error
      } else if(attempt) return new Response(JSON.stringify({ error: 'Checkout is being created. Wait a moment, then retry.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ success:true }), { headers: { ...corsHeaders, 'Content-Type':'application/json' } })
    }
    if (member.membership_type === 'lifetime' && member.membership_status === 'active') return new Response(JSON.stringify({ error: 'Your lifetime membership is already active.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if ((action === 'renew' && body.membership_type !== 'annual') || (action === 'upgrade' && body.membership_type !== 'lifetime')) return new Response(JSON.stringify({ error: 'Membership action and price do not match.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (member.auto_renew || member.stripe_subscription_id) return new Response(JSON.stringify({ error: 'Cancel future automatic billing before starting a manual renewal or lifetime upgrade.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } else if (member.membership_status === 'active' || member.membership_status === 'lapsed') {
    return new Response(JSON.stringify({ error: 'Use My Membership to renew or upgrade this existing membership.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  // Prices are set here on the server; browser-supplied amounts are ignored.
  const site = new URL(SITE_URL)
  if (!['https:', 'http:'].includes(site.protocol) || site.hostname === 'localhost') {
    return new Response(JSON.stringify({ error: 'Set SITE_URL to https://cvoa.one before accepting payments.' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const commonMetadata = {
    member_id: body.member_id,
    post_id: body.post_id ?? '', // Stripe metadata values must be strings; empty = no post (national at-large member)
    membership_type: body.membership_type,
    action,
  }

  // Serialize session creation for a member, reuse open checkouts, and use the
  // reservation token as Stripe's idempotency key. A second kind of checkout
  // must explicitly discard the unpaid one before it can start.
  let reservation: {token:string;session_id:string|null;busy:boolean} | null = null
  for(let attempt=0;attempt<2;attempt++) {
    const r=await supabase.rpc('cvoa_reserve_checkout',{p_member:member.id})
    if(r.error) throw r.error
    reservation=r.data
    if(!reservation || reservation.busy) return new Response(JSON.stringify({error:'Checkout is already being created. Wait a moment and retry.'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}})
    if(!reservation.session_id) break
    const existing=await stripe.checkout.sessions.retrieve(reservation.session_id)
    if(existing.status==='complete') return new Response(JSON.stringify({error:'Payment is complete and awaiting membership confirmation.'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}})
    if(existing.status==='open') {
      if(existing.metadata?.membership_type===body.membership_type && existing.metadata?.action===action && existing.mode===(isAutoRenew?'subscription':'payment')) return new Response(JSON.stringify({url:existing.url}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
      return new Response(JSON.stringify({error:'A different checkout is open. Clear the unfinished checkout in My Membership before changing your selection.'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}})
    }
    const cleanup=await supabase.from('membership_checkout_attempts').delete().eq('member_id',member.id).eq('token',reservation.token)
    if(cleanup.error) throw cleanup.error
    reservation=null
  }
  if(!reservation) throw new Error('Could not reserve checkout.')

  const session = isAutoRenew
    ? await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'CVOA Annual Membership (Auto-Renew)' },
              unit_amount: amountCents,
              recurring: { interval: 'year' },
            },
            quantity: 1,
          },
        ],
        metadata: commonMetadata,
        subscription_data: { metadata: commonMetadata },
        success_url: `${SITE_URL}/membership-payment-result?status=success`,
        cancel_url: `${SITE_URL}/membership-payment-result?status=cancelled`,
      }, {idempotencyKey:`membership-${reservation.token}`})
    : await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: body.membership_type === 'lifetime' ? 'CVOA Lifetime Membership' : 'CVOA Annual Membership',
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: commonMetadata,
        success_url: `${SITE_URL}/membership-payment-result?status=success`,
        cancel_url: `${SITE_URL}/membership-payment-result?status=cancelled`,
      }, {idempotencyKey:`membership-${reservation.token}`})


  const { error: paymentError } = await supabase.from('membership_payments').insert({
    member_id: body.member_id,
    post_id: body.post_id ?? null,
    membership_type: body.membership_type,
    amount: amountCents / 100,
    stripe_checkout_session_id: session.id,
    status: 'pending',
  })

  if (paymentError) {
    await stripe.checkout.sessions.expire(session.id)
    await supabase.from('membership_checkout_attempts').delete().eq('member_id',member.id).eq('token',reservation.token)
    return new Response(JSON.stringify({ error: 'Could not record the checkout. Please retry; no payment has been taken.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (isAutoRenew) {
    const { error } = await supabase.from('members').update({ auto_renew: true }).eq('id', body.member_id)
    if (error) {
      await stripe.checkout.sessions.expire(session.id)
      await supabase.from('membership_checkout_attempts').delete().eq('member_id',member.id).eq('token',reservation.token)
      return new Response(JSON.stringify({ error: 'Could not save auto-renew settings. Please retry.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  const savedAttempt=await supabase.from('membership_checkout_attempts').update({session_id:session.id}).eq('member_id',member.id).eq('token',reservation.token).select('member_id').single()
  if(savedAttempt.error) { await stripe.checkout.sessions.expire(session.id); throw savedAttempt.error }

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
  } catch {
    return new Response(JSON.stringify({ error: 'Could not start checkout. Please retry or contact CVOA.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
