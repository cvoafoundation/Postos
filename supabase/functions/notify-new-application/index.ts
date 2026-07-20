// supabase/functions/notify-new-application/index.ts
//
// WHAT THIS DOES
// Fires automatically whenever someone submits a Post Application, with zero
// manual involvement from National Command:
//   1. Sends the applicant a confirmation email.
//   2. Sends National Staff an alert email with a direct link to review.
//
// Sends through CVOA's own Google Workspace account via SMTP — no
// third-party email service, no separate bill. Uses an "App Password"
// (not your real login password) so this code never actually has your
// real Workspace credentials.
//
// DEPLOYING THIS (one-time setup):
//   1. Turn on 2-Step Verification for the sending account if it isn't on
//      already (Google Account -> Security -> 2-Step Verification).
//   2. Google Account -> Security -> App Passwords -> create one, name it
//      something like "CVOA Post OS" -> copy the 16-character password.
//   3. In Supabase: Edge Functions -> Secrets, add:
//        WORKSPACE_EMAIL = command@combatvetsofamerica.org (the sending address)
//        WORKSPACE_APP_PASSWORD = <the 16-character app password from step 2>
//        STAFF_ALERT_EMAIL = <the inbox that should get new-application alerts>
//   4. Deploy this function.
//   5. In Supabase Dashboard -> Database -> Webhooks -> Create a new webhook:
//        Table: post_applications
//        Events: Insert
//        Type: Supabase Edge Function
//        Function: notify-new-application

import nodemailer from 'npm:nodemailer@6.9.16'

const WORKSPACE_EMAIL = Deno.env.get('WORKSPACE_EMAIL')
const WORKSPACE_APP_PASSWORD = Deno.env.get('WORKSPACE_APP_PASSWORD')
const STAFF_ALERT_EMAIL = Deno.env.get('STAFF_ALERT_EMAIL')

interface WebhookPayload {
  type: 'INSERT'
  table: string
  record: {
    id: string
    name: string
    email: string
    city: string | null
    state: string
    military_branch: string | null
  }
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!WORKSPACE_EMAIL || !WORKSPACE_APP_PASSWORD) {
    console.warn('WORKSPACE_EMAIL/WORKSPACE_APP_PASSWORD not set — skipping email send (dry run):', { to, subject })
    return
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: WORKSPACE_EMAIL, pass: WORKSPACE_APP_PASSWORD },
  })
  await transporter.sendMail({
    from: `CVOA Post OS <${WORKSPACE_EMAIL}>`,
    to,
    subject,
    html,
  })
}

Deno.serve(async (req) => {
  const payload = (await req.json()) as WebhookPayload
  const app = payload.record

  await sendEmail(
    app.email,
    'Your CVOA Post application was received',
    `<p>Hi ${app.name},</p>
     <p>Thanks for stepping up to start a CVOA post in ${app.city ? app.city + ', ' : ''}${app.state}.
     Your application is in our queue for review. We'll be in touch with next steps —
     no need to follow up with National Headquarters in the meantime.</p>
     <p>— CVOA National Staff</p>`
  )

  if (STAFF_ALERT_EMAIL) {
    await sendEmail(
      STAFF_ALERT_EMAIL,
      `New post application: ${app.name} (${app.state})`,
      `<p>New application requires review:</p>
       <ul>
         <li><strong>Name:</strong> ${app.name}</li>
         <li><strong>Location:</strong> ${app.city ?? ''} ${app.state}</li>
         <li><strong>Branch:</strong> ${app.military_branch ?? 'n/a'}</li>
       </ul>`
    )
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
