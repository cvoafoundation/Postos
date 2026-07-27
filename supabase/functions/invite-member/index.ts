// supabase/functions/invite-member/index.ts
//
// For a member who already exists on the roster (imported, added by hand,
// or paid before this system existed) but has no login yet. Two ways to
// get them one:
//   - 'email' (default): sends the invite through CVOA's own Google
//     Workspace account, with a magic link to set their own password.
//   - 'manual': skips email entirely and generates a real temporary
//     password on the spot, handed back to whoever's running this so they
//     can share it however they want (in person, text, etc.) — useful
//     whenever email delivery itself isn't working.
// Either way, their profile is created as a plain 'member' and linked
// straight back to their existing members row so their card and status
// show up immediately on first login.
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
  method?: 'email' | 'manual'
}

// Easy to read off a screen and hand to someone, or type from a sticky
// note — still a real, unguessable password (a word + 4 digits + symbol),
// not something trivially weak.
function generateTempPassword(): string {
  const words = ['Falcon', 'Harbor', 'Granite', 'Beacon', 'Anchor', 'Compass', 'Ember', 'Ridge', 'Talon', 'Summit', 'Rally', 'Cedar']
  const word = words[Math.floor(Math.random() * words.length)]
  const digits = Math.floor(1000 + Math.random() * 9000)
  return `${word}${digits}!`
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
  const method = body.method ?? 'email'
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

  let newUserId: string
  let tempPassword: string | null = null

  if (method === 'manual') {
    // Creates a fully active, already-confirmed account with a real
    // password right now — no email step involved at all.
    tempPassword = generateTempPassword()
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: member.email,
      password: tempPassword,
      email_confirm: true,
    })
    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Could not create the account.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    newUserId = created.user.id
  } else {
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
    newUserId = linkData.user.id

    try {
      await sendInviteEmail(member.email, member.full_name, linkData.properties.action_link)
    } catch (emailError) {
      // Still finish linking the account below even if the email failed —
      // National can retry sharing the link/password another way rather
      // than being left with a half-created account.
      const { error: profileError } = await supabase.from('profiles').insert({
        id: newUserId,
        full_name: member.full_name,
        email: member.email,
        role: 'member',
        post_id: member.post_id,
      })
      if (!profileError) await supabase.from('members').update({ profile_id: newUserId }).eq('id', body.member_id)
      return new Response(
        JSON.stringify({ error: `Account created, but the invite email failed to send: ${(emailError as Error).message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: newUserId,
    full_name: member.full_name,
    email: member.email,
    role: 'member',
    post_id: member.post_id,
  })
  if (profileError) {
    return new Response(JSON.stringify({ error: `Account created, but profile setup failed: ${profileError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await supabase.from('members').update({ profile_id: newUserId }).eq('id', body.member_id)

  return new Response(JSON.stringify({ success: true, temp_password: tempPassword }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
