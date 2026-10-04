# Documents & Files release

Replaces NCC Drive and Post Drive with one organizational file system. National manages all workspaces; state commanders manage their state workspace and view their state's posts; post commanders/officers manage their post. Members retain existing shared resources. Explicit file/folder shares grant view, comment or edit access to another workspace, with optional expiry. Shared editors cannot re-share, move or delete the owner's records.

Native rich documents include autosave, optimistic save conflict protection, comments, templates, draft/review/approved/superseded statuses, immutable revision history, revision restoration, HTML export and browser Print/PDF. Uploaded files support immutable replacement versions, download and image/PDF preview. Trash is recoverable and is no longer automatically purged by the page. Content belongs to organizational workspaces rather than individual staff accounts.

This release does not implement an Excel/PowerPoint editor or simultaneous cursor collaboration. Spreadsheets/presentations can be uploaded and downloaded. A separately configured office editing server and licensing review are prerequisites for in-app Office editing. File uploads are limited to 50 MB. Native document JSON is limited to 2 MB. Signed download URLs expire after five minutes; revocation prevents new URLs, while previously issued URLs remain valid until expiration.

## Rollout

1. Apply `supabase/migrations/20261004220000_document_workspaces.sql` in Supabase after permission review.
2. Merge the matching frontend and deploy in Vercel immediately afterwards. No Edge Function or paid service provisioning is required.
3. Verify National/state/post workspaces with their corresponding accounts, upload a disposable file, create/save a document, share it, and restore a version.

The migration imports existing National folder/file IDs, paths, trash state and shares. Original tables and storage objects are retained. Storage policies move to registered-item access and immutable workspace paths: avoid using the old frontend to upload during the rollout window. Legacy broad shared folders are preserved as explicit all-member shares and can be revoked. Rollback must keep the database migration: reverting only the frontend preserves data but old upload paths will be rejected. No production records or real shares are changed by the automated tests.

## Validation

`node --test tests/connected-accounts.test.mjs tests/post-health.test.mjs`: 52 passing tests, executing migrations and permission rules in PostgreSQL via PGlite. `npm run build`: TypeScript and Vite production build pass. Staff UI validation against live accounts remains a rollout check.
