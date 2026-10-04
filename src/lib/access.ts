import type { Profile, UserRole } from "./types";
export interface AccessScope {
  scope_id: string;
  role: UserRole;
  post_id: string | null;
  state: string | null;
  title: string | null;
  source: string;
  post_name: string | null;
}
export interface LinkedMembership {
  id: string;
  full_name: string;
  email: string | null;
  membership_type?: string;
  membership_status: string;
  post_id: string | null;
  post_name?: string | null;
  membership_number?: string | null;
  expires_at?: string | null;
  dd214_review_status?: string;
}
export interface AccountProfile extends Profile {
  access_version: number;
  access_suspended: boolean;
  is_test_account: boolean;
}
export interface AccountRow {
  profile: AccountProfile;
  email_confirmed: boolean;
  last_sign_in_at: string | null;
  memberships: LinkedMembership[];
  scopes: AccessScope[];
}
export interface AccessDirectory {
  counts: {
    ordinary: number;
    attention: number;
    unlinked: number;
    test: number;
    account_only: number;
  };
  total: number;
  accounts: AccountRow[];
  unlinked_members: (LinkedMembership & { candidate_id: string | null })[];
  posts: { id: string; name: string; state: string }[];
}
export const ROLE_LABELS: Record<UserRole, string> = {
  national_commander: "National Commander",
  national_staff: "National Staff",
  state_commander: "State Commander",
  post_commander: "Post Commander",
  post_officer: "Post Officer",
  member: "Member",
  delegate: "Congressional Delegate",
  ethics_tribunal: "Ethics Tribunal",
  guest_applicant: "Applicant / Unverified",
};
export function activationLabel(
  account: {
    access_suspended?: boolean;
    last_sign_in_at?: string | null;
    email_confirmed?: boolean;
  } | null,
) {
  if (!account) return "No account";
  if (account.access_suspended) return "Access suspended";
  if (account.last_sign_in_at) return "Activated";
  return account.email_confirmed
    ? "Email confirmed · first sign-in pending"
    : "Activation pending";
}
export function scopeLabel(scope: AccessScope) {
  if (scope.role.startsWith("national_"))
    return "Organization-wide · Ethics records restricted";
  if (scope.role === "ethics_tribunal") return "Separate Tribunal workspace";
  if (scope.role === "state_commander")
    return scope.state ? `State · ${scope.state}` : "State assignment missing";
  if (scope.role === "delegate")
    return `${scope.post_name ?? "Post designation required"} · ${scope.state ?? "State derived from designated post"}`;
  if (scope.role === "member") return "Member services · no staff authority";
  if (scope.role === "guest_applicant") return "Own application · no staff authority";
  return (
    scope.post_name ?? (scope.post_id ? "Assigned post" : "No post assignment")
  );
}
export function accountIssues(row: AccountRow) {
  const issues: string[] = [];
  if (!row.last_sign_in_at) issues.push("Activation pending");
  if (row.memberships.length > 1) issues.push("Multiple membership records");
  if (
    row.memberships.some(
      (m) =>
        m.email &&
        m.email.trim().toLowerCase() !== row.profile.email.trim().toLowerCase(),
    )
  )
    issues.push("Email differs between records");
  if (
    row.scopes.some(
      (s) =>
        (s.role === "state_commander" && !s.state) ||
        (["post_commander", "post_officer"].includes(s.role) && !s.post_id),
    )
  )
    issues.push("Appointment scope missing");
  if (
    row.profile.role === "delegate" &&
    !row.scopes.some((s) => s.source === "Congress designation")
  )
    issues.push("Congress designation missing");
  return issues;
}
