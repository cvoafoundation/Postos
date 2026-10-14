# Membership workspace access

National administrators can open a linked account in Accounts & Access and select **Use membership-only access**, with a reason retained in National access history. **Restore standard access** reverses the setting. No accounts are changed by installation.

The member sees normal Membership Card, Veterans Congress, and Ethics Tribunal labels. They retain their existing Congress eligibility and can file/follow their own ethics complaints; the setting never grants confidential Tribunal access. Membership status and billing records are preserved. Full suspension remains a separate control.

Staff/Tribunal accounts or active staff appointments must be reviewed and ended before using this membership setting. New staff appointments are blocked while membership-only access is enabled. National cannot alter their own access through this setting.

The Data API pre-request hook `public.cvoa_membership_request_guard` checks the current database setting on every request, including old sessions. Explicit allowed endpoints retain existing RLS rules. Restrictive table and Storage policies cover direct table access and Realtime; service authorization and cancellation endpoints honor the setting. The interface refreshes access on focus and every 30 seconds. Previously delivered information cannot be recalled from a device.

Future migrations introducing member-readable tables should retain the `membership_workspace` restrictive policy. Keep the pre-request hook installed and compose any future hook with it. Avoid adding arbitrary RPCs to the endpoint allowlist; SECURITY DEFINER functions require review. Private `membership_private.account_limits` records and access reasons are never included in member-facing metadata.

Validation: `node --test tests/membership-access.test.mjs tests/membership-access-ui.test.mjs`; `npm run build`.
