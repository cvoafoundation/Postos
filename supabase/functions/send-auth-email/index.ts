import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import nodemailer from 'npm:nodemailer@6.9.16'
import { authMessages, AuthEmailPayload, escapeHtml } from '../_shared/welcome/auth-email.ts'
import { welcomeAttachments, WelcomeRecipient } from '../_shared/welcome/packet.ts'

const response = (status: number, message?: string) => new Response(JSON.stringify(message ? { error: { http_code: status, message } } : {}), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method !== 'POST') return response(405, 'Use POST.')
  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  if (!secret) return response(503, 'Authentication email hook is not configured.')
  let payload: AuthEmailPayload
  try {
    const raw = await req.text()
    if (raw.length > 100_000) return response(413, 'Invalid authentication email request.')
    payload = new Webhook(secret.replace(/^v1,whsec_/, '')).verify(raw, Object.fromEntries(req.headers)) as AuthEmailPayload
  } catch { return response(401, 'Invalid authentication email signature.') }
  try {
    const workspace = Deno.env.get('WORKSPACE_EMAIL')
    const password = Deno.env.get('WORKSPACE_APP_PASSWORD')
    const url = Deno.env.get('SUPABASE_URL')!
    const site = Deno.env.get('SITE_URL') || 'https://www.cvoa.one'
    if (!workspace || !password) return response(503, 'Authentication email delivery is not configured.')
    const messages = authMessages(payload, url, site)
    const metadataName = payload.user.user_metadata?.full_name
    let recipient: WelcomeRecipient = { full_name: typeof metadataName === 'string' && metadataName.trim() ? metadataName.trim().slice(0, 200) : 'CVOA Member' }
    if (messages.some(message => message.welcome)) {
      const supabase = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', payload.user.id).maybeSingle()
      const { data: members } = await supabase.from('members').select('full_name,address,membership_type').eq('profile_id', payload.user.id).is('deleted_at', null).limit(2)
      if (members?.length === 1) recipient = members[0]
      else if (profile?.full_name) recipient.full_name = profile.full_name
      else if (recipient.full_name === 'CVOA Member') {
        const { data: pending } = await supabase.from('pending_profile_signups').select('full_name').eq('email', payload.user.email).limit(2)
        if (pending?.length === 1 && pending[0].full_name) recipient.full_name = pending[0].full_name
      }
    }
    const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: workspace, pass: password.replace(/\s/g, '') }, connectionTimeout: 2000, greetingTimeout: 2000, socketTimeout: 3500 })
    try {
      for (const message of messages) {
        await transporter.sendMail({
          from: `CVOA.ONE <${workspace}>`, to: message.to, subject: message.subject,
          text: `Hi ${recipient.full_name},\n\n${message.text}${message.link ? `\n\n${message.link}` : ''}`,
          html: `<p>Hi ${escapeHtml(recipient.full_name)},</p><p>${escapeHtml(message.text)}</p>${message.link ? `<p><a href="${escapeHtml(message.link)}">${escapeHtml(message.action!)}</a></p>` : ''}`,
          attachments: message.welcome ? await welcomeAttachments(recipient, message.welcome) : [],
        })
      }
    } finally { transporter.close() }
    return response(200)
  } catch {
    // Never log request bodies, OTPs, action links, credentials or raw SMTP errors.
    console.error('Authentication email delivery failed.')
    return response(502, 'Could not send the authentication email. Please try again.')
  }
})
