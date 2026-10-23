# Member Broadcasts and event RSVPs

Members & Access → Member Broadcasts is available to the National Commander and
accounts with an active Battalion Commander, Company Commander, or Company
Officer workspace. National staff and delegates receive no broadcast authority
from those roles alone. State officers use their assigned Battalion workspace;
the existing access model calls that appointment state_commander. No account
roles or appointments are changed by this release.

The National Commander can manage all broadcasts. Battalion officers can manage
Battalion broadcasts and Company broadcasts within their state. Company officers
can manage broadcasts for their assigned Company. Creation requires an actual
workspace assignment; stored scope boundaries cannot be edited by the client.
National Command can narrow to a state or Company, Battalion officers to one of
their Companies, and all senders can narrow by membership term/status. Content,
media, recipients, results, and responses follow the same scope checks.

The state audience follows the member's Company state, falling back to the member
record's state when unaffiliated. Company audiences use membership affiliation,
never a person's staff/delegate workspace. The SQL audience includes undeleted
members with valid emails, excludes linked removed/test profiles, normalizes and
deduplicates email addresses, and avoids the Data API pagination limit. A worker
rechecks live appointment authority and current audience membership per claim;
revocation/suspension or reassignment stops further inappropriate delivery.

Create a draft, choose filters, enter a message, optionally add event details,
add media, save, preview/test, and review the count before confirming Send to
selected members. Tests go exclusively to the verified sign-in email. A cached
Commander-only client retains its National create/count behavior. Each real
recipient receives an individually addressed email through the existing CVOA
Google Workspace sender; no recipient list is disclosed in the message.

Invitations include a signed-in RSVP link and event details. Members record Yes,
Maybe, or No and can change their response until the event starts. Times are
entered/displayed in the device's time zone and stored as UTC. The organizing
officers see counts and the latest 500 responses. RSVP identity is checked
against the verified Auth email and the addressed delivery; request-supplied
emails, profile IDs, and delivery IDs are never used for identity. A forwarded
link does not grant another account access, and reading a link never submits a
response. Test links become usable for actual addressed recipients after sending.
Roster-only recipients need a CVOA sign-in with the email that received the
invitation. Minimal-membership accounts can open their own invitation without
receiving broadcast-management access. Stopping remaining emails does not cancel
the event or close delivered invitations' RSVPs.

Draft revision checks and a transactional recipient snapshot prevent repeated
send clicks from creating duplicate delivery rows. A Vault-authenticated Cron
worker claims up to 10 deliveries each minute and continues after a browser
closes. Broadcasts share the existing 1,000-recipient rolling 24-hour budget;
Google imposes its own account limits. Sending and media limits are unchanged:
8 files, 8 MiB each, 10 MiB combined; JPG, PNG, WebP, GIF, PDF, DOCX, MP4, MP3.
Images appear below the message. Larger media can use HTTPS links. Media remains
private and immutable after upload; client reads/uploads are scoped, and there
are no client overwrite/delete grants. Source HTML is escaped.

Sent means SMTP acceptance, not proof of inbox placement/reading. Explicit
rejections can be manually retried; uncertain/time-out sends are not automatically
resent. Provider failures pause the broadcast for an hour. Stop remaining emails
skips pending messages; messages already sent/in progress cannot be recalled.
The latest 100 broadcasts and first 100 delivery issues are displayed.

Deployment uses the existing WORKSPACE_EMAIL and WORKSPACE_APP_PASSWORD and the
existing member-broadcast-mail job. Gateway JWT checking remains disabled for
Cron, while every user operation validates Auth identity and every worker call
validates an independent Vault secret. This release does not send test or
broadcast mail during deployment. No recurring reminders, cross-module event
creation, or scheduled broadcasts are introduced.

Validation includes RLS/media isolation across states/Companies, forged-scope
rejection, filtering, revocation and reassignment behavior, RSVP identity and
privacy, email rendering, original broadcast protections, navigation/minimal
workspace regressions, and the production build.
