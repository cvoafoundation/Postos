# Connected accounts and jurisdiction access

Accounts & Access and the membership roster now open the same person record: membership, activation, verification, appointments, and access history. Directory search and pagination run on the server. Test accounts are explicitly marked by an operator; account-only staff records remain valid. Reconciliation requires a unique verified email match and never overwrites an existing link.

## Authority

| Appointment | Access |
| --- | --- |
| National staff | Organization-wide administration; no Ethics Tribunal case access |
| State commander | Read-only oversight of posts and memberships in assigned states |
| Congressional delegate | Designated post overview, congressional activity and own-state voting summaries; formal ballots require a current primary designation |
| Post commander/officer | Administration of assigned posts |
| Member | Own membership and existing member functions |
| Ethics Tribunal | Existing separate case permissions; no new jurisdiction model in this release |

Additional state/post appointments can be granted with a reason and revoked. Workspace selection cannot create authority. Primary access changes require a reason and current record version. Self-escalation, Ethics role changes and removal of the last active National Commander are blocked. Suspension preserves membership and blocks authenticated database/storage access and protected service functions.

## Coordinated deployment

1. Review current role assignments, scopes, storage paths and duplicate formal ballots. The migration rejects duplicate formal ballots rather than deleting them.
2. Apply `supabase/migrations/20261004190000_connected_accounts.sql` to the existing production schema. Its transaction must complete before deploying the frontend.
3. Deploy matching functions: `invite-user`, `invite-member`, `delete-user`, `cancel-membership-subscription`, `create-membership-checkout`, `generate-toolkit-document`, `generate-facility-plan`.
4. Deploy the frontend and verify National, state, post, delegate and member sessions with approved test accounts. Verify activation emails only with an approved recipient.

The frontend fails closed if the new access RPC is unavailable. Permanent account deletion is replaced by a message directing operators to reversible suspension. Existing signed storage URLs may remain valid until their expiry. Legacy files without a post path or associated record remain restricted to National. Future tables require the suspension restriction and appropriate jurisdiction policies.

Do not roll back the database by dropping permission guards. For an incident, pause access administration, restore the previous frontend if needed and deploy a reviewed forward migration. Preserve appointments and access audit history.

## Verification

`node --test tests/*.test.mjs`: 157 passing tests, including full-schema PostgreSQL-runtime tests for cross-state/post boundaries, actual delegate designations, private Ethics cases, direct permission bypasses, suspension, concurrent edits, account reconciliation and linked-guest activation.

`npm run build`: TypeScript and production bundle validation. These checks do not replace authenticated production UI verification or actual email delivery verification.
