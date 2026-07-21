import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Member, UserRole } from '@/lib/types'
import { format } from 'date-fns'

// The label that appears bottom-right on the card, under the membership
// type. This is the person's standing within CVOA, separate from whether
// their membership itself is paid/active. Roles not listed here (delegate
// aside) fall back to plain "Member" — there is no lower rung on the card.
function roleLabel(role: UserRole | undefined): string {
  switch (role) {
    case 'national_commander':
    case 'national_staff':
      return 'National Command Council'
    case 'delegate':
      return 'Veterans Congress'
    case 'post_officer':
      return 'Post Officer'
    case 'post_commander':
      return 'Post Commander'
    case 'state_commander':
      return 'State Commander'
    default:
      return 'Member'
  }
}

export function MembershipCardVisual({ member, role }: { member: Member; role?: UserRole }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const verifyUrl = `${window.location.origin}/verify-membership/${member.id}`
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, color: { dark: '#0A0A0B', light: '#EDEBE4' } }).then(setQrDataUrl)
  }, [member.id])

  const isActive = member.membership_status === 'active'

  return (
    <div className="relative w-full max-w-md mx-auto rounded-xl overflow-hidden border border-gold/30 bg-charcoal shadow-2xl select-none">
      {/* Repeating watermark seal — sits behind every layer of real content.
          A screenshot-and-crop duplicate loses this because it's rendered,
          not an image asset that can be swapped out. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.05] pointer-events-none flex flex-wrap content-start gap-6 -rotate-[18deg] scale-125"
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="text-ink text-[11px] font-mono uppercase tracking-widest whitespace-nowrap">
            COMBAT VETERANS OF AMERICA · OFFICIAL
          </span>
        ))}
      </div>

      {/* Foil accent bar — a thin gradient sweep, the kind of detail that's
          easy to see is "off" in a flat screenshot recreation. */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-ink to-transparent" />

      <div className="relative bg-gradient-to-br from-surface to-base p-5 border-b border-hairline">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <img src="/images/cvoa-logo.png" alt="CVOA" className="w-12 h-12 object-contain drop-shadow" />
            <div className="text-[9px] text-muted font-mono uppercase tracking-wide leading-tight">
              Combat Veterans
              <br />
              of America
            </div>
          </div>
          <div className={`text-[10px] font-mono uppercase tracking-wide ${isActive ? 'text-status-active' : 'text-status-attention'}`}>
            {isActive ? '● Active' : member.membership_status.replaceAll('_', ' ')}
          </div>
        </div>
      </div>

      <div className="relative p-5 flex items-center gap-4">
        <div className="flex-1">
          <div className="text-lg font-medium text-ink mb-3">{member.full_name}</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="eyebrow mb-0.5">WarFighter No.</div>
              <div className="font-mono text-gold">{member.membership_number ?? 'Pending'}</div>
            </div>
            <div>
              <div className="eyebrow mb-0.5">Joined</div>
              <div className="text-muted">{member.joined_at ? format(new Date(member.joined_at), 'MMM d, yyyy') : '—'}</div>
            </div>
            <div>
              <div className="eyebrow mb-0.5">Expires</div>
              <div className="text-muted">
                {member.membership_type === 'lifetime' ? 'Never' : member.expires_at ? format(new Date(member.expires_at), 'MMM d, yyyy') : '—'}
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 bg-ink rounded-sm p-1.5">
          {qrDataUrl ? <img src={qrDataUrl} alt="Membership QR code" className="w-20 h-20" /> : <div className="w-20 h-20 bg-hairline animate-pulse" />}
        </div>
      </div>

      {/* Bottom-right standing block — membership type, then role. This is
          the at-a-glance "who is this person" read, separate from the
          active/pending status shown up top. */}
      <div className="relative bg-base px-5 py-3 border-t border-hairline flex items-end justify-between">
        <div>
          <div className="text-[9px] text-muted font-mono">Scan to verify membership status</div>
          {member.dd214_review_status === 'pending' && (
            <div className="text-[9px] text-status-developing font-mono uppercase mt-0.5">DD214 Review Pending</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-white text-sm font-display tracking-wide uppercase">
            {member.membership_type === 'lifetime' ? 'Lifetime' : 'Annual'}
          </div>
          <div className="text-gold text-[11px] font-mono uppercase tracking-wide">{roleLabel(role)}</div>
        </div>
      </div>
    </div>
  )
}
