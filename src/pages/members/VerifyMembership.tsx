import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'

interface VerifyResult {
  full_name: string
  membership_number: string | null
  membership_type: 'annual' | 'lifetime'
  membership_status: 'active' | 'lapsed' | 'pending_payment'
  joined_at: string | null
  expires_at: string | null
}

export default function VerifyMembership() {
  const { memberId } = useParams<{ memberId: string }>()
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!memberId) return
    supabase
      .rpc('verify_membership', { p_member_id: memberId })
      .then(({ data }: any) => {
        setResult((data ?? [])[0] ?? null)
        setLoading(false)
      })
  }, [memberId])

  const isActive = result?.membership_status === 'active'

  return (
    <div className="min-h-screen bg-base px-4 py-16 flex items-start justify-center">
      <div className="w-full max-w-sm text-center">
        <img src="/images/cvoa-logo.png" alt="CVOA" className="w-20 h-20 object-contain mx-auto mb-8" />
        <div className="panel p-8">
          {loading ? (
            <p className="text-sm text-muted">Checking…</p>
          ) : !result ? (
            <>
              <XCircle className="mx-auto mb-4 text-status-attention" size={44} />
              <div className="font-display text-xl tracking-wide mb-2">Not Found</div>
              <p className="text-sm text-muted">This membership record doesn't exist.</p>
            </>
          ) : (
            <>
              {isActive ? (
                <CheckCircle2 className="mx-auto mb-4 text-status-active" size={44} />
              ) : (
                <XCircle className="mx-auto mb-4 text-status-attention" size={44} />
              )}
              <div className="font-display text-xl tracking-wide mb-1">
                {isActive ? 'Valid CVOA Member' : 'Membership Not Active'}
              </div>
              <p className="text-sm text-ink mb-4">{result.full_name}</p>
              <div className="text-xs text-muted space-y-1 font-mono">
                <div>{result.membership_number ?? 'No number on file'}</div>
                <div className="capitalize">{result.membership_type} Membership</div>
                {result.membership_type === 'annual' && result.expires_at && (
                  <div>Expires {format(new Date(result.expires_at), 'MMM d, yyyy')}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
