import type { AccessScope } from '@/lib/access'
import { ROLE_LABELS, scopeLabel } from '@/lib/access'
export function permissionSummary(scopes: AccessScope[], suspended = false, membershipOnly = false): string[] {
  if (suspended) return ['Workspace sign-in is suspended; membership records are preserved.']
  if (membershipOnly) return ['Membership card and private DD-214 submission.', 'Existing Veterans Congress participation and voting eligibility.', 'File and follow personal ethics complaints.']
  return [...new Set(scopes.flatMap(scope => {
    const area = scopeLabel(scope)
    switch (scope.role) {
      case 'national_commander': case 'national_staff': return ['Organization-wide operational administration and member management.', 'National Operations workspace.', 'Congress administration and organizational meetings.', 'Confidential Tribunal case access requires a separate Tribunal role.']
      case 'state_commander': return scope.state ? [`Oversee posts and members in ${scope.state}.`, `State meetings, documents, sponsorship and development in ${scope.state}.`] : ['State oversight requires an assigned state.']
      case 'post_commander': case 'post_officer': return scope.post_id ? [`Manage members and operations for ${area}.`, 'Assigned-post documents, sponsorship, recruiting and development.', ...(scope.role === 'post_commander' ? ['Start assigned-post meetings and review officer requests.'] : [])] : ['Post staff authority requires an assigned post.']
      case 'delegate': return ['Member services and designated-post visibility.', scope.post_id ? `Congress participation for ${area}; formal ballots require an active primary delegate designation.` : 'Formal voting requires a current post designation.']
      case 'ethics_tribunal': return ['Separate Ethics Tribunal case workspace; access follows Tribunal permissions.']
      case 'guest_applicant': return ['Own application and membership setup; no staff administration.']
      default: return ['Personal membership and service verification.', 'Member directory, member-accessible files, sponsorship and meeting records.', 'Congress participation subject to membership and ballot eligibility.', 'File and follow personal ethics complaints; no staff administration.']
    }
  }))]
}
export default function PermissionPreview({ scopes, suspended = false, membershipOnly = false }: { scopes: AccessScope[]; suspended?: boolean; membershipOnly?: boolean }) {
  return <div className="bg-surface/60 p-4 mt-4 rounded-sm space-y-3">
    <p className="eyebrow">Access summary</p>
    <ul className="space-y-2 text-sm leading-relaxed list-disc pl-5">{permissionSummary(scopes, suspended, membershipOnly).map(item => <li key={item}>{item}</li>)}</ul>
    {!suspended && !membershipOnly && scopes.length > 1 && <p className="text-xs text-muted">Combined appointments: {scopes.map(s => ROLE_LABELS[s.role]).join(', ')}. Changing the primary role preserves additional appointments.</p>}
  </div>
}
