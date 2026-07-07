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

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
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
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not configured for this project.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = (await req.json()) as RequestBody
  const amountCents = PRICES[body.membership_type]
  if (!amountCents) {
    return new Response(JSON.stringify({ error: 'Invalid membership type.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const session = await stripe.checkout.sessions.create({
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
    metadata: {
      member_id: body.member_id,
      post_id: body.post_id ?? '', // Stripe metadata values must be strings; empty = no post (national at-large member)
      membership_type: body.membership_type,
    },
    success_url: `${SITE_URL}/membership-payment-result?status=success`,
    cancel_url: `${SITE_URL}/membership-payment-result?status=cancelled`,
  })

  await supabase.from('membership_payments').insert({
    member_id: body.member_id,
    post_id: body.post_id ?? null,
    membership_type: body.membership_type,
    amount: amountCents / 100,
    stripe_checkout_session_id: session.id,
    status: 'pending',
  })

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
