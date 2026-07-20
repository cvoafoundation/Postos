// supabase/functions/invite-user/index.ts
//
// Creates a real account the correct way: an auth user AND its matching
// profiles row, in one step. This is what was missing when a user was
// created directly in the Supabase Auth dashboard — that only creates the
// login, never the profile this app actually reads permissions from.
//
// Uses Supabase's built-in invite email — the person gets a link, clicks
// it, sets their own password, and is logged straight in with the role
// you assigned here already active. No separate signup step, no gap where
// they exist but can't do anything.
//
// DEPLOYING THIS (one-time setup):
//   1. Supabase Dashboard -> Authentication -> URL Configuration -> make
//      sure "Site URL" is set to your deployed app
//      (e.g. https://postos-nine.vercel.app) — this is where the invite
//      link sends them.
//   2. Deploy: `supabase functions deploy invite-user`
//      (uses the SUPABASE_SERVICE_ROLE_KEY that's already available to
//      every Edge Function automatically — nothing new to configure)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface RequestBody {
  email: string
  full_name: string
  role: string
  post_id: string | null
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = (await req.json()) as RequestBody
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // This call requires the caller to already be authenticated as National —
  // enforced by checking their own profile before doing anything.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', caller.id).single()
  if (!callerProfile || !['national_commander', 'national_staff'].includes(callerProfile.role)) {
    return new Response(JSON.stringify({ error: 'Only National accounts can invite new users.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(body.email)
  if (inviteError || !inviteData.user) {
    return new Response(JSON.stringify({ error: inviteError?.message ?? 'Could not create the invite.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: inviteData.user.id,
    full_name: body.full_name,
    email: body.email,
    role: body.role,
    post_id: body.post_id,
  })

  if (profileError) {
    return new Response(JSON.stringify({ error: `Invite sent, but profile creation failed: ${profileError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
