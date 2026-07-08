// supabase/functions/send-renewal-reminders/index.ts
//
// Finds every annual membership expiring in exactly 30 days and emails a
// digest to National so nobody has to remember to check the roster. This
// is meant to run on a schedule, not be triggered by a user action.
//
// DEPLOYING THIS:
//   1. Deploy: `supabase functions deploy send-renewal-reminders --no-verify-jwt`
//   2. Schedule it to run daily. Supabase supports this via pg_cron:
//      In the SQL Editor, run (adjust the URL/keys for your project):
//
//      select cron.schedule(
//        'send-renewal-reminders-daily',
//        '0 13 * * *', -- 1pm UTC daily; adjust to your preferred time
//        $$
//        select net.http_post(
//          url := 'https://<your-project-ref>.supabase.co/functions/v1/send-renewal-reminders',
//          headers := jsonb_build_object('Authorization', 'Bearer <your-service-role-key>')
//        );
//        $$
//      );
//
//      This requires the pg_cron and pg_net extensions enabled — Database ->
//      Extensions in the Supabase dashboard, search for each, enable both.
//      If you'd rather not touch pg_cron, any external scheduler (a free
//      cron service, GitHub Actions on a schedule, etc.) hitting this same
//      URL once a day works exactly as well.

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const NOTIFY_FROM_ADDRESS = Deno.env.get('NOTIFY_FROM_ADDRESS') ?? 'CVOA Post OS <onboarding@resend.dev>'
const NOTIFY_RECIPIENTS = ['command@combatvetsofamerica.org', 'maddymarked@gmail.com']

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + 30)
  const targetDateStr = targetDate.toISOString().slice(0, 10)

  const { data: members } = await supabase
    .from('members')
    .select('full_name, membership_number, email, expires_at, auto_renew')
    .eq('membership_type', 'annual')
    .eq('membership_status', 'active')
    .eq('expires_at', targetDateStr)

  if (!members || members.length === 0) {
    return new Response(JSON.stringify({ sent: false, reason: 'No renewals due in 30 days.' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping renewal reminder email (dry run):', members)
    return new Response(JSON.stringify({ sent: false, reason: 'RESEND_API_KEY not configured.' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rows = members
    .map(
      (m: any) =>
        `<li>${m.full_name} (${m.membership_number ?? 'no number'}) — ${m.auto_renew ? 'auto-renews automatically' : 'manual renewal, no auto-renew on file'}</li>`
    )
    .join('')

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: NOTIFY_FROM_ADDRESS,
      to: NOTIFY_RECIPIENTS,
      subject: `${members.length} membership${members.length !== 1 ? 's' : ''} renewing in 30 days`,
      html: `<p>The following annual memberships expire on ${targetDateStr}:</p><ul>${rows}</ul>`,
    }),
  })

  return new Response(JSON.stringify({ sent: true, count: members.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
