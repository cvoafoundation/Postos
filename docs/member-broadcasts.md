# Member Broadcasts

National Commander only: Members & Access → Member Broadcasts. National staff,
Battalion/Company staff, delegates and members cannot open or send broadcasts.
The endpoint revalidates Auth identity and current database role, suspension,
deletion and membership-only restrictions on every request. The background
worker also stops claiming mail if its originating commander loses authority.

Create a draft, enter a subject/message, add media, save, preview or send a test
to your verified sign-in email, then review and confirm Send to all members.
Tests never accept an arbitrary recipient address. Subjects reject line breaks.
Images appear below the message; PDF, DOCX, MP4 and MP3 files are attached.
8 files maximum, each up to 8 MiB, 10 MiB combined. Larger media can use HTTPS
sharing links. HTML is escaped; supplied HTML/scripts are never rendered.

The audience uses all undeleted membership records (including expired members
and members without a login) with valid emails. Linked deleted/test profiles are
excluded. Email addresses are normalized and deduplicated. Audience counts and
snapshot generation run in SQL, avoiding Data API pagination truncation. Each
recipient gets an individual message; no public To/CC/BCC recipient list.
Recipients removed after queuing are skipped before sending.

Sending is durable and idempotent per broadcast, with immutable content after
queuing and optimistic draft revision checks. A Vault-authenticated Cron worker
runs every minute, claiming up to 10 recipients. Broadcast attempts are limited
to 1,000 unique claimed deliveries in a rolling 24 hours to leave Workspace room
for transactional mail. Actual Google limits still apply. Provider failures
pause a broadcast for one hour. Sent means SMTP acceptance, not proof of inbox
placement or reading. Drafts/history list the latest 100 messages.

Explicit provider rejections can be manually retried. Interrupted/time-out
messages become unconfirmed and are never automatically resent. A stable SMTP
Message-ID is used per broadcast/recipient, but SMTP cannot guarantee exactly-once
receipt after a network interruption. Stop remaining emails skips pending
recipients; accepted/in-progress messages cannot be recalled.

Media is stored in a private bucket with Commander-only read and own-draft
upload policies, generated immutable paths, type/signature/size validation, and
no client overwrite/delete policy. Sent message media stays available for
historical preview. Deployment uses existing WORKSPACE_EMAIL and
WORKSPACE_APP_PASSWORD; no new credentials. The function's gateway JWT check is
disabled to permit Cron; all user paths explicitly validate Auth, and the worker
path validates an independent Vault secret. No test or broadcast is sent during
deployment.

Validation: database RLS/permissions, deduplicated audience, idempotent enqueue,
claim isolation, interrupted-send handling, retry restrictions, media policies,
mail escaping/personalization, endpoint unauthorized/forged-worker rejection,
navigation/minimal-workspace regressions, production frontend build.
