import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { isDemoMode, supabase } from '@/lib/supabase'
import { useMarkNotificationViewed } from '@/lib/notifications'
import { readAllRows } from '@/lib/readAllRows'
import { membershipPlan, paymentAmount, paymentDate, paymentSummaryColumns, PaymentStatus, type PaymentSummary } from '@/components/membership/MembershipPaymentDetails'
import type { Member } from '@/lib/types'
import { FileText, CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'

type ReviewMember = Pick<Member, 'id' | 'post_id' | 'full_name' | 'membership_number' | 'membership_type' | 'created_at' | 'dd214_storage_path' | 'dd214_review_status' | 'dd214_reviewed_at'> & {
  latest_payment?: PaymentSummary[]
  confirmed_payment?: PaymentSummary[]
}

function PurchaseDetails({ member }: { member: ReviewMember }) {
  const confirmed = member.confirmed_payment?.[0]
  const latest = member.latest_payment?.[0]
  if (!latest && !confirmed) return <>
    <div>{membershipPlan(member.membership_type)}</div>
    <div className="text-xs text-muted mt-1">No payment record</div>
  </>

  const entries = [confirmed, !confirmed || latest?.status !== 'paid' ? latest : undefined].filter((entry): entry is PaymentSummary => !!entry)
  return <div className="space-y-2">
    {entries.map((entry) => <div key={entry.id}>
      <div>{membershipPlan(entry.membership_type)} · {paymentAmount(entry.amount)}</div>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <PaymentStatus status={entry.status} />
        {entry.paid_at && <span className="text-xs text-muted">{paymentDate(entry.paid_at)}</span>}
      </div>
    </div>)}
  </div>
}

export default function MembershipReview() {
  useMarkNotificationViewed('dd214_review')
  const { profile, isNational } = useAuth()
  const [members, setMembers] = useState<ReviewMember[]>([])
  const [filter, setFilter] = useState<'pending' | 'verified' | 'rejected' | 'all'>('pending')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let current = true
    setLoading(true)
    setLoadError(false)
    setMembers([])
    async function load() {
      try {
        const postId = profile?.post_id
        if (!isNational && !postId) return
        const rows = await readAllRows<ReviewMember>(() => {
          let query = supabase.from('members')
            .select(`id,post_id,full_name,membership_number,membership_type,created_at,dd214_storage_path,dd214_review_status,dd214_reviewed_at,latest_payment:membership_payments(${paymentSummaryColumns}),confirmed_payment:membership_payments(${paymentSummaryColumns})`)
            .is('deleted_at', null).not('dd214_storage_path', 'is', null)
            .order('created_at', { ascending: false }).order('id', { ascending: false })
          if (!isDemoMode) query = query.eq('confirmed_payment.status', 'paid')
            .order('created_at', { referencedTable: 'latest_payment', ascending: false })
            .order('id', { referencedTable: 'latest_payment', ascending: false })
            .limit(1, { referencedTable: 'latest_payment' })
            .order('paid_at', { referencedTable: 'confirmed_payment', ascending: false, nullsFirst: false })
            .order('id', { referencedTable: 'confirmed_payment', ascending: false })
            .limit(1, { referencedTable: 'confirmed_payment' })
          if (!isNational) query = query.eq('post_id', postId)
          return query
        })
        if (current) setMembers(rows)
      } catch {
        if (current) setLoadError(true)
      } finally {
        if (current) setLoading(false)
      }
    }
    void load()
    return () => { current = false }
  }, [profile?.post_id, isNational, refresh])

  async function review(member: ReviewMember, status: 'verified' | 'rejected') {
    setActionError('')
    const { data, error } = await supabase
      .from('members')
      .update({ dd214_review_status: status, dd214_reviewed_by: profile?.id, dd214_reviewed_at: new Date().toISOString() })
      .eq('id', member.id)
      .select('id').maybeSingle()
    if (error || !data) setActionError('The DD-214 decision could not be saved. Please try again.')
    else setRefresh((n) => n + 1)
  }

  async function openDocument(path: string) {
    const { data, error } = await supabase.storage.from('dd214-uploads').createSignedUrl(path, 600)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const filtered = members.filter((m) => filter === 'all' || m.dd214_review_status === filter)
  if (filter === 'verified' || filter === 'rejected') {
    filtered.sort((a, b) => (b.dd214_reviewed_at ?? '').localeCompare(a.dd214_reviewed_at ?? ''))
  }
  const pendingCount = members.filter((m) => m.dd214_review_status === 'pending').length

  return (
    <div>
      <PageHeader eyebrow={isNational ? 'National · Membership' : 'Your Company'} title="Membership DD-214 Review"
        action={<div className="flex flex-wrap items-center gap-2">
          {isNational && <Link className="btn-ghost" to="/members/payments">Membership Payments</Link>}
          <button type="button" className="btn-ghost" onClick={() => setRefresh((n) => n + 1)}>Refresh</button>
        </div>} />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Review service documents and see the membership purchase alongside each submission. Payment and document verification are tracked separately.
        {pendingCount > 0 && <span className="text-status-developing"> {pendingCount} awaiting review.</span>}
      </p>

      <div className="flex gap-2 mb-6">
        {(['pending', 'verified', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-sm border capitalize ${
              filter === f ? 'border-gold text-gold' : 'border-hairline text-muted hover:border-gold'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {actionError && <p role="alert" className="mb-4 text-sm text-status-attention">{actionError}</p>}
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-status-attention">The review queue could not be loaded. Use Refresh to try again.</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={`No ${filter === 'all' ? '' : filter} DD214s`} />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Member</th>
                <th className="table-head">Member #</th>
                <th className="table-head">Membership purchase</th>
                <th className="table-head">Record created</th>
                <th className="table-head">DD214</th>
                <th className="table-head">Status</th>
                <th className="table-head"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="table-cell">{m.full_name}</td>
                  <td className="table-cell font-mono text-xs text-gold">{m.membership_number ?? '—'}</td>
                  <td className="table-cell min-w-44"><PurchaseDetails member={m} /></td>
                  <td className="table-cell text-xs text-muted">{format(new Date(m.created_at), 'MMM d, yyyy')}</td>
                  <td className="table-cell">
                    <button onClick={() => openDocument(m.dd214_storage_path!)} className="text-gold hover:text-gold-bright text-xs flex items-center gap-1">
                      <FileText size={13} /> View
                    </button>
                  </td>
                  <td className="table-cell">
                    <StatusBadge
                      label={m.dd214_review_status}
                      tone={m.dd214_review_status === 'verified' ? 'active' : m.dd214_review_status === 'rejected' ? 'attention' : 'developing'}
                    />
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <button onClick={() => review(m, 'verified')} className="text-status-active hover:opacity-80" title="Approve">
                        <CheckCircle2 size={16} />
                      </button>
                      <button onClick={() => review(m, 'rejected')} className="text-status-attention hover:opacity-80" title="Reject">
                        <XCircle size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
