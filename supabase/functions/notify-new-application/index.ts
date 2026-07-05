// supabase/functions/notify-new-application/index.ts
//
// WHAT THIS DOES
// Fires automatically whenever someone submits a Post Application, with zero
// manual involvement from National Command:
//   1. Sends the applicant a confirmation email.
//   2. Sends National Staff an alert email with a direct link to review.
//
// This is what makes intake "hands-off" — without it, applications land in
// the database silently and someone has to remember to check the dashboard.
//
// DEPLOYING THIS (one-time setup, ~10 minutes):
//   1. Sign up for Resend (or any transactional email API — SendGrid, Postmark,
//      etc. work the same way, just swap the fetch call below).
//   2. In Supabase: Project Settings -> Edge Functions -> add a secret:
//        RESEND_API_KEY = <your Resend API key>
//        STAFF_ALERT_EMAIL = <the inbox that should get new-application alerts>
//   3. Deploy: `supabase functions deploy notify-new-application`
//   4. In Supabase Dashboard -> Database -> Webhooks -> Create a new webhook:
//        Table: post_applications
//        Events: Insert
//        Type: Supabase Edge Function
//        Function: notify-new-application
//   From that point on, every new application triggers this automatically —
//   nobody has to remember to check anything.

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const STAFF_ALERT_EMAIL = Deno.env.get('STAFF_ALERT_EMAIL')
const FROM_ADDRESS = Deno.env.get('NOTIFY_FROM_ADDRESS') ?? 'CVOA Post OS <onboarding@resend.dev>'

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
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send (dry run):', { to, subject })
    return
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  })
}

serve(async (req) => {
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
