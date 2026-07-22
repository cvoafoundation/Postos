// supabase/functions/delete-user/index.ts
//
// The other half of invite-user: fully removes an account — both the
// actual login (auth.users) and its profiles row — not just the app-level
// record. Deleting only the profiles row would leave a dangling login
// behind that still occupies that email address forever, which is exactly
// the kind of half-cleaned-up state this avoids.
//
// DEPLOYING THIS (one-time setup):
//   Deploy: `supabase functions deploy delete-user`
//   (uses the SUPABASE_SERVICE_ROLE_KEY that's already available to every
//   Edge Function automatically — nothing new to configure)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface RequestBody {
  user_id: string
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const body = (await req.json()) as RequestBody
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

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
    return new Response(JSON.stringify({ error: 'Only National accounts can delete users.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Guard against deleting your own account by accident through this tool
  // — that's what "Sign Out" is for, not a destructive admin action.
  if (body.user_id === caller.id) {
    return new Response(JSON.stringify({ error: "You can't delete your own account this way." }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // The profile row first — if this fails partway, we're left with a login
  // and no profile (recoverable/visible), rather than a profile pointing at
  // a login that no longer exists (a broken, confusing state).
  await supabase.from('profiles').delete().eq('id', body.user_id)
  const { error: authError } = await supabase.auth.admin.deleteUser(body.user_id)

  if (authError) {
    return new Response(JSON.stringify({ error: `Profile removed, but login deletion failed: ${authError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
