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

// 128 bits of randomness; only returned once to the authorized administrator.
function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `Cvoa!${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

async function sendInviteEmail(email: string, fullName: string, actionLink: string) {
  if (!WORKSPACE_EMAIL || !WORKSPACE_APP_PASSWORD) {
    throw new Error('Email delivery is not configured. Set WORKSPACE_EMAIL and WORKSPACE_APP_PASSWORD in Supabase Edge Function secrets.')
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: WORKSPACE_EMAIL, pass: WORKSPACE_APP_PASSWORD.replace(/\s/g, '') },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })
  await transporter.sendMail({
    from: `CVOA.ONE SYSTEM (COS) <${WORKSPACE_EMAIL}>`,
    to: email,
    subject: `Create your CVOA account`,
    text: `Hi ${fullName},\n\nYour CVOA membership record is ready. Set a password to access your membership screen:\n\n${actionLink}\n\nIf you weren't expecting this, you can safely ignore this email.`,
    html: `<p>Hi ${escapeHtml(fullName)},</p>
           <p>Your CVOA membership record is ready. Set a password to access your membership screen:</p>
           <p><a href="${escapeHtml(actionLink)}">Set your password &amp; log in</a></p>
           <p>If you weren't expecting this, you can safely ignore this email.</p>`,
  })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST for member invitations.' })
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return reply(500, { error: 'The account service is not configured.' })
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return reply(401, { error: 'Please sign in again before sending an invitation.' })
    // Validate with Auth itself, including projects using new JWT signing keys.
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !caller) return reply(401, { error: 'Your session has expired. Please sign in again.' })
    const { data: callerProfile, error: callerError } = await supabase.from('profiles').select('role, post_id').eq('id', caller.id).single()
    if (callerError) return reply(500, { error: 'Could not verify your account permissions.' })
    const isNational = callerProfile && ['national_commander', 'national_staff'].includes(callerProfile.role)
    const isPostOfficer = callerProfile && ['post_commander', 'post_officer'].includes(callerProfile.role)
    if (!isNational && !isPostOfficer) return reply(403, { error: "You don't have permission to send member invites." })

    let body: RequestBody
    try { body = await req.json() } catch { return reply(400, { error: 'Invalid invitation request.' }) }
    if (!body || typeof body.member_id !== 'string' || !body.member_id) return reply(400, { error: 'A member ID is required.' })
    const method = body.method ?? 'email'
    if (!['email', 'manual'].includes(method)) return reply(400, { error: 'Choose email or manual account creation.' })
    const { data: member, error: memberError } = await supabase.from('members').select('*').eq('id', body.member_id).single()
    if (memberError || !member) return reply(404, { error: 'Member not found.' })
    if (!isNational && (!callerProfile?.post_id || member.post_id !== callerProfile.post_id)) {
      return reply(403, { error: 'You can only invite members from your own post.' })
    }
    if (!member.email) return reply(400, { error: 'Add and save an email address for this member first.' })
    if (method === 'manual' && member.profile_id) return reply(409, { error: 'This member already has an account. Send a password setup email instead.' })
    let redirectTo = ''
    if (method === 'email') {
      if (!WORKSPACE_EMAIL || !WORKSPACE_APP_PASSWORD) return reply(503, { error: 'Email delivery is not configured. Set WORKSPACE_EMAIL and WORKSPACE_APP_PASSWORD in Supabase Edge Function secrets.' })
      try {
        const site = new URL(SITE_URL)
        if (!['https:', 'http:'].includes(site.protocol)) throw new Error('Invalid protocol')
        redirectTo = new URL('/set-password', site).href
      } catch { return reply(503, { error: 'Set SITE_URL to https://cvoa.one in Supabase Edge Function secrets.' }) }
    }

    let userId: string
    let actionLink: string | null = null
    let tempPassword: string | null = null
    if (method === 'manual') {
      tempPassword = generateTempPassword()
      const { data, error } = await supabase.auth.admin.createUser({ email: member.email, password: tempPassword, email_confirm: true })
      if (error || !data?.user) return reply(400, { error: error?.message ?? 'Could not create the account.' })
      userId = data.user.id
    } else {
      // A retry reuses the linked account; it never creates a second roster entry
      // or changes an existing user's password or role.
      let linkType: 'invite' | 'recovery' = 'invite'
      if (member.profile_id) {
        const { data, error } = await supabase.auth.admin.getUserById(member.profile_id)
        if (error || !data?.user) return reply(409, { error: 'The linked login account could not be found.' })
        if (data.user.email?.toLowerCase() !== member.email.trim().toLowerCase()) {
          return reply(409, { error: 'The roster email differs from the linked login email. Correct it before sending a setup link.' })
        }
        if (data.user.email_confirmed_at) linkType = 'recovery'
      }
      const { data, error } = await supabase.auth.admin.generateLink({ type: linkType, email: member.email, options: { redirectTo } })
      if (error || !data?.user || !data.properties?.action_link) return reply(400, { error: error?.message ?? 'Could not create the password setup link.' })
      userId = data.user.id
      if (member.profile_id && userId !== member.profile_id) return reply(409, { error: 'The invitation does not match the linked account.' })
      actionLink = data.properties.action_link
    }

    // Finish the membership linkage before emailing so the first login is ready.
    // An existing profile can have staff privileges: preserve them on retries.
    const { data: profile, error: lookupError } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (lookupError) return reply(500, { error: `Could not check the login profile: ${lookupError.message}` })
    if (!profile) {
      const { error } = await supabase.from('profiles').insert({ id: userId, full_name: member.full_name, email: member.email, role: 'member', post_id: member.post_id })
      if (error) return reply(500, { error: `Account created, but profile setup failed: ${error.message}. Retry from this member's roster entry.` })
    }
    const { error: linkError } = await supabase.from('members').update({ profile_id: userId }).eq('id', body.member_id)
    if (linkError) return reply(500, { error: `Account created, but membership linking failed: ${linkError.message}. Retry from this member's roster entry.` })
    if (actionLink) {
      try { await sendInviteEmail(member.email, member.full_name, actionLink) }
      catch (err) {
        const smtpError = err as Error & { code?: string; responseCode?: number }
        const message = smtpError.code === 'EAUTH' || smtpError.responseCode === 535
          ? 'Google rejected the email credentials. Create a new Google App Password for the sending account and update WORKSPACE_APP_PASSWORD in Supabase.'
          : 'The email service could not send the invitation. Check the Google Workspace settings and Supabase function logs, then retry.'
        // Never log invite tokens, credentials, or raw SMTP responses.
        console.error('Member invitation delivery failed', { code: smtpError.code, responseCode: smtpError.responseCode })
        return reply(502, { error: `Account created and linked, but email delivery failed. ${message}`, account_created: true })
      }
    }
    return reply(200, { success: true, temp_password: tempPassword })
  } catch {
    console.error('Unexpected member invitation failure')
    return reply(500, { error: 'The invitation service encountered an unexpected error. Check Supabase function logs and retry from the roster.' })
  }
})
