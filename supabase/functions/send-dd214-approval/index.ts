import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import nodemailer from 'npm:nodemailer@6.9.16'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const site = 'https://cvoa.one'
const support = 'command@combatvetsofamerica.org'
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: cors })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return reply(401, { error: 'Sign in again before reviewing a document.' })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return reply(401, { error: 'Sign in again before reviewing a document.' })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.member_id !== 'string' || !uuid.test(body.member_id)) return reply(400, { error: 'Choose a member.' })
  const retry = body.action === 'retry'
  if (!retry && (body.action !== 'approve' || typeof body.document_path !== 'string' || !['pending', 'rejected'].includes(body.previous_status))) {
    return reply(400, { error: 'Refresh the review before approving.' })
  }

  const { data: job, error: prepareError } = await admin.rpc('cvoa_prepare_dd214_approval_mail', {
    p_actor: auth.user.id, p_member: body.member_id,
    p_path: retry ? null : body.document_path, p_previous: retry ? null : body.previous_status,
  })
  if (prepareError || !job) return reply(500, { error: 'The approval could not be confirmed. Refresh before trying again.' })
  if (job.status === 'forbidden') return reply(403, { error: 'You cannot review this member.' })
  if (job.status === 'stale') return reply(409, { error: 'The review changed. Refresh and open the current document.' })
  if (job.status === 'no_notice') return reply(409, { error: 'This review has no pending approval email.' })
  if (job.status !== 'claimed') return reply(200, { status: job.status, message: job.message })

  let accepted = false
  let message: string | undefined
  try {
    const user = Deno.env.get('WORKSPACE_EMAIL')
    const pass = Deno.env.get('WORKSPACE_APP_PASSWORD')?.replace(/\s/g, '')
    if (!user || !pass) throw new Error('Email delivery is unavailable.')

    let next = ''
    if (job.membership_status === 'pending_payment') {
      next = `Your membership is still awaiting payment. If you have already paid or need help completing checkout, contact ${support}.`
    } else if (!job.membership_current) {
      next = `Please contact ${support} for help with your membership status or renewal.`
    } else if (job.account === 'ready') {
      next = `Sign in to view your digital card and membership information: ${site}/my-membership`
    } else if (job.account === 'setup_new' || job.account === 'setup_linked') {
      const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email: job.email, options: { redirectTo: `${site}/set-password` } })
      if (error || !data?.user?.id || !data.properties?.action_link || (job.profile_id && job.profile_id !== data.user.id)) {
        message = 'Account setup needs attention. Check the linked login in the roster, then retry the email.'
        throw new Error('Could not create a matching setup link.')
      }
      if (job.account === 'setup_new') {
        const linked = await admin.rpc('cvoa_link_dd214_approval_account', { p_member: body.member_id, p_attempt: job.attempt, p_user: data.user.id })
        if (linked.error || linked.data !== true) {
          message = 'Account setup needs attention. Check the linked login in the roster, then retry the email.'
          throw new Error('Account could not be linked.')
        }
      }
      next = `Your membership is active. Set your password using this secure link, then open My Membership to view your digital card:\n${data.properties.action_link}`
    } else {
      next = `Your service verification is complete. Contact ${support} for help accessing the account linked to your membership.`
    }

    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 })
    try {
      const mail = await transport.sendMail({
        from: `CVOA.ONE <${user}>`, to: { name: '', address: job.email },
        messageId: `<dd214-approval-${body.member_id}-${Date.parse(job.review_at)}@combatvetsofamerica.org>`,
        subject: 'CVOA service verification complete',
        text: `Hi ${job.full_name},\n\nCVOA has approved your service verification.\n\n${next}\n\nCombat Veterans of America`,
      })
      accepted = mail.accepted.length > 0
    } finally { transport.close() }
  } catch {
    // Avoid logging personal information, SMTP responses, or setup links.
    console.error('DD-214 approval email could not be delivered.')
  }

  const result = await admin.rpc('cvoa_finish_dd214_approval_mail', { p_member: body.member_id, p_attempt: job.attempt, p_sent: accepted })
  if (result.error || result.data !== true) return reply(200, { status: 'sending', message: 'Delivery status could not be confirmed. Refresh the review.' })
  return reply(200, { status: accepted ? 'sent' : 'failed', message: accepted ? undefined : message ?? 'Approval saved. The email could not be sent. Retry from this review.' })
})
