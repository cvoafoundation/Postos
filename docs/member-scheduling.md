# CVOA personal scheduling

The CVOA customer workspace in Schedlr runs at `/?cvoa_workspace=1`. It receives a short-lived CVOA bearer token in memory through messages restricted to the exact CVOA parent window and origin. It never signs in to commercial Schedlr Auth. CVOA iframe remounts on account changes; the child clears identity and records when its parent stops renewing. Every backend request verifies CVOA Auth and the active account. Personal appointments have owner-only database policies and immutable ownership.

Members schedule personal meetings, invite up to 20 attendees, reschedule, cancel, and record completion. This is separate from formal governance meetings and from commercial Schedlr staff calendars. Personal meetings do not provision organization-wide staff access or external Google Calendar synchronization.

Meeting mutations atomically queue individual notification emails to the organizer and each attendee. Attendees removed from a meeting get cancellation notices without its new details. Changes supersede pending old messages and reminders. Calendar attachments use a stable UID and increasing sequence. Reminders are queued 24 hours and 1 hour beforehand if those times are still in the future.

The authenticated worker runs every minute through Supabase Cron and pg_net. Its random worker secret is generated and retained in Vault, and verified by a service-only RPC. Google Workspace SMTP uses the project's existing sending secrets. SMTP transport verification does not send mail. Messages are claimed atomically, retried with backoff, and marked sent after SMTP acceptance. SMTP acceptance does not guarantee inbox delivery. A crash between SMTP acceptance and recording delivery may cause a repeated message; a stable Message-ID reduces duplicates where supported. After five unsuccessful attempts, the UI reports that email needs attention.

Deploy the two new migrations, the `member-scheduling` Edge Function, then the Schedlr and CVOA frontend changes. `verify_jwt=false` permits the cron worker credential; the function explicitly authenticates either a live CVOA user JWT or the dedicated worker secret before accessing data. Existing Schedlr customer/staff policies and existing CVOA governance permissions are unchanged.

Validation: `node --test tests/member-scheduling.test.mjs` exercises PostgreSQL RLS, forgery/ownership restrictions, optimistic versions, notification supersession, cancellation, atomic claims, and calendar formatting. Both frontend projects also require their production builds.
