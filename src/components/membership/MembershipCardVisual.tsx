import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Member } from '@/lib/types'
import { format } from 'date-fns'

export function MembershipCardVisual({ member }: { member: Member }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const verifyUrl = `${window.location.origin}/verify-membership/${member.id}`
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, color: { dark: '#0A0A0B', light: '#EDEBE4' } }).then(setQrDataUrl)
  }, [member.id])

  const isActive = member.membership_status === 'active'

  return (
    <div className="relative w-full max-w-sm mx-auto rounded-lg overflow-hidden border border-hairline bg-charcoal shadow-lg">
      <div className="bg-gradient-to-br from-surface to-base p-5 border-b border-hairline">
        <div className="flex items-center justify-between mb-1">
          <div className="font-display text-2xl tracking-wide text-gold">CVOA</div>
          <div className="text-right">
            <div className="eyebrow text-[10px]">{member.membership_type === 'lifetime' ? 'Lifetime Member' : 'Annual Member'}</div>
            <div className={`text-[10px] font-mono uppercase tracking-wide ${isActive ? 'text-status-active' : 'text-status-attention'}`}>
              {isActive ? '● Active' : member.membership_status.replaceAll('_', ' ')}
            </div>
          </div>
        </div>
        <div className="text-[10px] text-muted font-mono uppercase tracking-wide">Combat Veterans of America</div>
      </div>

      <div className="p-5 flex items-center gap-4">
        <div className="flex-1">
          <div className="text-lg font-medium text-ink mb-3">{member.full_name}</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="eyebrow mb-0.5">Member ID</div>
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
            <div>
              <div className="eyebrow mb-0.5">Level</div>
              <div className="text-muted capitalize">{member.membership_type}</div>
            </div>
          </div>
        </div>
        <div className="shrink-0 bg-ink rounded-sm p-1.5">
          {qrDataUrl ? <img src={qrDataUrl} alt="Membership QR code" className="w-20 h-20" /> : <div className="w-20 h-20 bg-hairline animate-pulse" />}
        </div>
      </div>

      <div className="bg-base px-5 py-2 border-t border-hairline">
        <div className="text-[9px] text-muted font-mono">Scan to verify membership status</div>
      </div>
    </div>
  )
}
