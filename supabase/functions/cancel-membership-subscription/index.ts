// supabase/functions/cancel-membership-subscription/index.ts
//
// Cancels a member's Stripe subscription when staff turns off auto-renew
// from the Membership Roster. Their membership stays active through
// whatever they already paid for (expires_at) — this just stops the next
// automatic charge.
//
// DEPLOYING THIS: `supabase functions deploy cancel-membership-subscription`
// (uses the same STRIPE_SECRET_KEY already configured for the other
// membership functions — nothing new to set up)

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface RequestBody {
  member_id: string
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = (await req.json()) as RequestBody
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })

  const { data: member } = await supabase.from('members').select('stripe_subscription_id').eq('id', body.member_id).single()

  if (member?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(member.stripe_subscription_id)
    } catch (err) {
      // If it's already cancelled on Stripe's side, don't block turning off
      // auto_renew locally — just log it.
      console.warn('Stripe cancellation warning:', err)
    }
  }

  await supabase.from('members').update({ auto_renew: false, stripe_subscription_id: null }).eq('id', body.member_id)

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
