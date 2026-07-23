// supabase/functions/invite-user/index.ts
//
// Creates a real account the correct way: an auth user AND its matching
// profiles row, in one step. This is what was missing when a user was
// created directly in the Supabase Auth dashboard — that only creates the
// login, never the profile this app actually reads permissions from.
//
// Sends the invite through CVOA's own Google Workspace account (same
// mechanism as the membership notification emails), not Supabase's default
// email sender — generateLink() creates the account and hands back a
// magic-link URL without emailing anyone itself; we send that link
// ourselves via Gmail SMTP.
//
// DEPLOYING THIS (one-time setup): Deploy: `supabase functions deploy invite-user`

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import nodemailer from 'npm:nodemailer@6.9.16'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = Deno.env.get('SITE_URL')!
const WORKSPACE_EMAIL = Deno.env.get('WORKSPACE_EMAIL')
const WORKSPACE_APP_PASSWORD = Deno.env.get('WORKSPACE_APP_PASSWORD')

interface RequestBody {
  email: string
  full_name: string
  role: string
  post_id: string | null
}

async function sendInviteEmail(email: string, fullName: string, actionLink: string) {
  if (!WORKSPACE_EMAIL || !WORKSPACE_APP_PASSWORD) {
    console.warn('WORKSPACE_EMAIL/WORKSPACE_APP_PASSWORD not set — skipping invite email (dry run):', email, actionLink)
    return
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: WORKSPACE_EMAIL, pass: WORKSPACE_APP_PASSWORD },
  })
  await transporter.sendMail({
    from: `CVOA.ONE SYSTEM (COS) <${WORKSPACE_EMAIL}>`,
    to: email,
    subject: `You're invited to CVOA.ONE SYSTEM (COS)`,
    text: `Hi ${fullName},\n\nYou've been invited to create your account. Open this link to set your password and get started:\n\n${actionLink}\n\nIf you weren't expecting this, you can safely ignore this email.`,
    html: `<p>Hi ${fullName},</p>
           <p>You've been invited to create your account. Click below to set your password and get started:</p>
           <p><a href="${actionLink}">Set your password &amp; log in</a></p>
           <p>If you weren't expecting this, you can safely ignore this email.</p>`,
  })
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

  // generateLink (type: 'invite') creates the auth user and hands back a
  // magic-link URL, but — unlike inviteUserByEmail — never sends any email
  // itself. That's the whole point: it lets us send our own email instead.
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: body.email,
    options: { redirectTo: `${SITE_URL}/login` },
  })
  if (linkError || !linkData?.user) {
    return new Response(JSON.stringify({ error: linkError?.message ?? 'Could not create the invite.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: linkData.user.id,
    full_name: body.full_name,
    email: body.email,
    role: body.role,
    post_id: body.post_id,
  })
  if (profileError) {
    return new Response(JSON.stringify({ error: `Invite created, but profile creation failed: ${profileError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    await sendInviteEmail(body.email, body.full_name, linkData.properties.action_link)
  } catch (emailError) {
    return new Response(
      JSON.stringify({ error: `Account created, but the invite email failed to send: ${(emailError as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
