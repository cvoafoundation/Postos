// supabase/functions/invite-member/index.ts
//
// For a member who already exists on the roster (imported, added by hand,
// or paid before this system existed) but has no login yet. Sends them
// the invite through CVOA's own Google Workspace account (same mechanism
// as invite-user and the membership notification emails) — creates their
// profile as a plain 'member', and links it straight back to their
// existing members row so their card and status show up immediately on
// first login — no waiting on the email-matching auto-link to catch up.
//
// DEPLOYING THIS (one-time setup): Deploy: `supabase functions deploy invite-member`

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import nodemailer from 'npm:nodemailer@6.9.16'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = Deno.env.get('SITE_URL')!
const WORKSPACE_EMAIL = Deno.env.get('WORKSPACE_EMAIL')
const WORKSPACE_APP_PASSWORD = Deno.env.get('WORKSPACE_APP_PASSWORD')

interface RequestBody {
  member_id: string
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
    subject: `Create your CVOA account`,
    text: `Hi ${fullName},\n\nYour CVOA membership is already active — just set a password to create your login and see your membership card:\n\n${actionLink}\n\nIf you weren't expecting this, you can safely ignore this email.`,
    html: `<p>Hi ${fullName},</p>
           <p>Your CVOA membership is already active — just set a password to create your login and see your
           membership card:</p>
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
  const { data: callerProfile } = await supabase.from('profiles').select('role, post_id').eq('id', caller.id).single()
  const isNational = callerProfile && ['national_commander', 'national_staff'].includes(callerProfile.role)
  const isOwnPost = callerProfile && ['post_commander', 'post_officer'].includes(callerProfile.role)
  if (!isNational && !isOwnPost) {
    return new Response(JSON.stringify({ error: "You don't have permission to send member invites." }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: member, error: memberError } = await supabase.from('members').select('*').eq('id', body.member_id).single()
  if (memberError || !member) {
    return new Response(JSON.stringify({ error: 'Member not found.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!isNational && member.post_id !== callerProfile?.post_id) {
    return new Response(JSON.stringify({ error: "You can only invite members from your own post." }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (member.profile_id) {
    return new Response(JSON.stringify({ error: 'This member already has an account.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!member.email) {
    return new Response(JSON.stringify({ error: 'This member has no email on file to invite.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: member.email,
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
    full_name: member.full_name,
    email: member.email,
    role: 'member',
    post_id: member.post_id,
  })
  if (profileError) {
    return new Response(JSON.stringify({ error: `Invite created, but profile setup failed: ${profileError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await supabase.from('members').update({ profile_id: linkData.user.id }).eq('id', body.member_id)

  try {
    await sendInviteEmail(member.email, member.full_name, linkData.properties.action_link)
  } catch (emailError) {
    return new Response(
      JSON.stringify({ error: `Account linked, but the invite email failed to send: ${(emailError as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
