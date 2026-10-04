// Cancels future renewals without shortening the membership already paid for.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import Stripe from 'npm:stripe@14.21.0'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? Deno.env.get('STRIPE_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST to cancel auto-renew.' })
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return reply(401, { error: 'Please sign in again.' })
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return reply(401, { error: 'Please sign in again.' })
    const { data: caller, error: callerError } = await supabase.from('profiles').select('role, post_id, access_suspended').eq('id', user.id).single()
    if (callerError || !caller || caller.access_suspended) return reply(403, { error: 'Could not verify your account permissions.' })
    let body: { member_id?: string }
    try { body = await req.json() } catch { return reply(400, { error: 'Invalid cancellation request.' }) }
    if (!body || typeof body.member_id !== 'string' || !body.member_id) return reply(400, { error: 'A member ID is required.' })
    const { data: member, error: memberError } = await supabase.from('members').select('post_id, stripe_subscription_id, profile_id').eq('id', body.member_id).single()
    if (memberError || !member) return reply(404, { error: 'Member not found.' })
    const { data: canManage, error: permissionError } = await supabase.rpc('cvoa_service_authorized', { p_actor: user.id, p_post: member.post_id, p_capability: 'manage_post' })
    const ownsMembership = member.profile_id === user.id
    if (permissionError || (!canManage && !ownsMembership)) return reply(403, { error: 'You can cancel billing for your own membership. Staff access is limited to an assigned post or National.' })
    if (member.stripe_subscription_id) {
      if (!STRIPE_SECRET_KEY) return reply(503, { error: 'Stripe is not configured. Auto-renew has not been changed.' })
      const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
      try { await stripe.subscriptions.cancel(member.stripe_subscription_id) }
      catch (error) {
        // A missing Stripe subscription is already gone; all other failures must remain retryable.
        if ((error as { code?: string }).code !== 'resource_missing') return reply(502, { error: 'Stripe could not confirm cancellation. Auto-renew has not been changed; please retry.' })
      }
    }
    const { error: updateError } = await supabase.from('members').update({ auto_renew: false, stripe_subscription_id: null }).eq('id', body.member_id)
    if (updateError) return reply(500, { error: 'Could not save the cancellation. Please retry to synchronize the membership record.' })
    return reply(200, { success: true })
  } catch {
    return reply(500, { error: 'Could not cancel auto-renew. Please retry.' })
  }
})
