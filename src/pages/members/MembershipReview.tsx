import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { isDemoMode, supabase } from '@/lib/supabase'
import { useMarkNotificationViewed } from '@/lib/notifications'
import { readAllRows } from '@/lib/readAllRows'
import { getFunctionError } from '@/lib/functionErrors'
import { membershipPlan, paymentAmount, paymentDate, paymentSummaryColumns, PaymentStatus, type PaymentSummary } from '@/components/membership/MembershipPaymentDetails'
import type { Member } from '@/lib/types'
import { FileText, CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'

type ReviewMember = Pick<Member, 'id' | 'post_id' | 'full_name' | 'membership_number' | 'membership_type' | 'created_at' | 'dd214_storage_path' | 'dd214_review_status' | 'dd214_reviewed_at'> & {
  latest_payment?: PaymentSummary[]
  confirmed_payment?: PaymentSummary[]
  approval_mail?: { review_at: string; status: 'sending' | 'sent' | 'failed'; claimed_at: string; sent_at: string | null } | null
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
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<'pending' | 'verified' | 'rejected' | 'all'>(() => params.get('status') === 'verified' ? 'verified' : 'pending')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionStatus, setActionStatus] = useState('')
  const [workingOn, setWorkingOn] = useState<string | null>(null)
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
            .select(`id,post_id,full_name,membership_number,membership_type,created_at,dd214_storage_path,dd214_review_status,dd214_reviewed_at,latest_payment:membership_payments(${paymentSummaryColumns}),confirmed_payment:membership_payments(${paymentSummaryColumns}),approval_mail:membership_verification_emails(review_at,status,claimed_at,sent_at)`)
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

  async function review(member: ReviewMember, action: 'approve' | 'reject' | 'retry') {
    if (workingOn) return
    setWorkingOn(member.id)
    setActionError('')
    setActionStatus('')
    try {
      if (action === 'reject' || isDemoMode) {
        const { data, error } = await supabase.from('members')
          .update({ dd214_review_status: action === 'reject' ? 'rejected' : 'verified', dd214_reviewed_by: profile?.id, dd214_reviewed_at: new Date().toISOString() })
          .eq('id', member.id).eq('dd214_storage_path', member.dd214_storage_path).eq('dd214_review_status', member.dd214_review_status)
          .select('id').maybeSingle()
        if (error || !data) throw new Error('The DD-214 decision could not be saved. Refresh and try again.')
        setActionStatus(action === 'reject' ? 'Review decision saved.' : 'Approved in demo mode. No email was sent.')
        return
      }
      const { data, error } = await supabase.functions.invoke('send-dd214-approval', {
        body: { action, member_id: member.id, document_path: member.dd214_storage_path, previous_status: member.dd214_review_status },
      })
      if (error || data?.error) throw new Error(await getFunctionError(error, data))
      if (data?.status === 'sent') setActionStatus('Approval saved. The member’s email was sent.')
      else if (data?.status === 'sending') setActionStatus(data.message ?? 'Approval saved. Email delivery is in progress.')
      else setActionError(data?.message ?? 'Approval saved. Check the email status in the Verified list.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not confirm the result. Refresh before trying again.')
    } finally {
      setWorkingOn(null)
      setRefresh((n) => n + 1)
    }
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
      {actionStatus && <p role="status" className="mb-4 text-sm text-status-active">{actionStatus}</p>}
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
              {filtered.map((m) => {
                const mail = m.dd214_review_status === 'verified' && m.approval_mail?.review_at === m.dd214_reviewed_at ? m.approval_mail : null
                const mayRetry = mail?.status === 'failed' || (mail?.status === 'sending' && Date.now() - Date.parse(mail.claimed_at) >= 300_000)
                return (
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
                    {mail && <p className="mt-1 text-xs text-muted">
                      {mail.status === 'sent' ? `Email sent${mail.sent_at ? ` ${paymentDate(mail.sent_at)}` : ''}` : mayRetry ? 'Email needs attention' : 'Sending approval email…'}
                    </p>}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      {m.dd214_review_status !== 'verified' && <button type="button" onClick={() => void review(m, 'approve')} disabled={workingOn !== null} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-status-active hover:opacity-80 disabled:opacity-50" aria-label={`Approve and email ${m.full_name}`}>
                        <CheckCircle2 size={16} /> {workingOn === m.id ? 'Working…' : 'Approve & email'}
                      </button>}
                      {m.dd214_review_status !== 'rejected' && <button type="button" onClick={() => void review(m, 'reject')} disabled={workingOn !== null} className="text-status-attention hover:opacity-80 disabled:opacity-50" title="Reject" aria-label={`Reject service verification for ${m.full_name}`}>
                        <XCircle size={16} />
                      </button>}
                      {mayRetry && <button type="button" onClick={() => void review(m, 'retry')} disabled={workingOn !== null} className="text-gold text-xs whitespace-nowrap hover:underline disabled:opacity-50">Retry email</button>}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
