import { Link } from 'react-router-dom'
import type { Member } from '@/lib/types'

export function MembershipProgress({ member, hasDocument }: {
  member: Pick<Member, 'membership_status' | 'membership_type' | 'expires_at' | 'dd214_review_status'> | null
  hasDocument?: boolean
}) {
  const today = new Date().toLocaleDateString('en-CA')
  const dues = !member ? 'Membership record needed'
    : member.membership_status === 'pending_payment' ? 'Payment pending'
    : member.membership_status === 'lapsed' || (member.membership_type === 'annual' && member.expires_at && member.expires_at < today)
      ? 'Renewal needed' : 'Membership term active'
  const verification = !member ? 'Waiting for a linked membership'
    : member.dd214_review_status === 'verified' ? 'Verified'
    : member.dd214_review_status === 'rejected' ? 'Updated document needed'
    : hasDocument === true ? 'In staff review — no action needed'
    : hasDocument === false ? 'Upload your DD-214' : 'Check verification status'
  return (
    <section className="panel p-5 mb-5" aria-label="Membership progress">
      <h2 className="font-display text-xl mb-3">Membership progress</h2>
      <dl className="grid gap-4 sm:grid-cols-3 text-sm">
        <div><dt className="text-muted">Dues</dt><dd className="mt-1">{dues}</dd></div>
        <div><dt className="text-muted">Account</dt><dd className="mt-1">{member ? 'Signed in and linked' : 'Signed in · membership not linked'}</dd></div>
        <div><dt className="text-muted">Service verification</dt><dd className="mt-1">
          {member && ['Upload your DD-214', 'Updated document needed', 'Check verification status'].includes(verification)
            ? <Link className="text-gold hover:underline" to="/membership-verification">{verification} →</Link> : verification}
        </dd></div>
      </dl>
      {!member && <p className="text-xs text-muted mt-3">Already paid? Ask National to link your existing membership before starting another checkout.</p>}
    </section>
  )
}
