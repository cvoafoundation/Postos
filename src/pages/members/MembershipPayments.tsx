import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListPagination, LIST_PAGE_SIZE } from '@/components/ui/ListPagination'
import { membershipPlan, paymentAmount, paymentDate, paymentSummaryColumns, PaymentStatus, type PaymentSummary } from '@/components/membership/MembershipPaymentDetails'
import { supabase } from '@/lib/supabase'

type Entry = PaymentSummary & {
  member: { id: string; full_name: string; membership_number: string | null } | null
}
type Filter = 'paid' | 'pending' | 'all'

export default function MembershipPayments() {
  const [filter, setFilter] = useState<Filter>('paid')
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ entries: Entry[]; total: number } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    setResult(null)
    setError(false)
    async function load() {
      try {
        let query = supabase.from('membership_payments')
          .select(`${paymentSummaryColumns},member:members(id,full_name,membership_number)`, { count: 'exact' })
        if (filter !== 'all') query = query.eq('status', filter)
        const { data, count, error } = await query
          .order(filter === 'paid' ? 'paid_at' : 'created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .range(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE - 1)
        if (error) throw error
        if (!current) return
        const total = count ?? 0
        if (page > 0 && page * LIST_PAGE_SIZE >= total) setPage(Math.max(0, Math.ceil(total / LIST_PAGE_SIZE) - 1))
        else setResult({ entries: data ?? [], total })
      } catch {
        if (current) setError(true)
      }
    }
    void load()
    return () => { current = false }
  }, [filter, page, refresh])

  return (
    <div>
      <PageHeader eyebrow="National · Membership" title="Membership Payments"
        description="See which membership each payment was for, the amount recorded, and when it was paid."
        action={<button type="button" className="btn-ghost" onClick={() => setRefresh((n) => n + 1)}>Refresh</button>} />
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Link className="text-gold hover:underline" to="/members">Membership Roster</Link>
        <Link className="text-gold hover:underline" to="/membership-review">DD-214 Review</Link>
      </div>
      <label className="block text-sm mb-4">
        <span className="mr-3 text-muted">Show</span>
        <select className="input-field w-auto" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(0) }}>
          <option value="paid">Paid</option>
          <option value="pending">Unconfirmed checkouts</option>
          <option value="all">All recorded entries</option>
        </select>
      </label>
      {error ? <p role="alert" className="text-status-attention text-sm">Payments could not be loaded. Use Refresh to try again.</p>
        : !result ? <p role="status" className="text-muted text-sm">Loading payments…</p>
        : result.entries.length === 0 ? <EmptyState title="No payments match this filter" />
        : <>
          <ul className="panel divide-y divide-hairline" aria-label="Membership payment records">
            {result.entries.map((entry) => (
              <li key={entry.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)] sm:items-center">
                <div className="min-w-0">
                  {entry.member ? <Link to={`/members?highlight=${entry.member.id}`} className="text-gold hover:underline break-words">{entry.member.full_name}</Link>
                    : <span className="text-muted">Member record unavailable</span>}
                  {entry.member?.membership_number && <div className="text-xs text-muted">{entry.member.membership_number}</div>}
                </div>
                <div>{membershipPlan(entry.membership_type)}<div className="font-medium tabular-nums">{paymentAmount(entry.amount)}</div></div>
                <div><PaymentStatus status={entry.status} />
                  <div className="mt-1 text-xs text-muted">{entry.paid_at ? `Paid ${paymentDate(entry.paid_at)}` : `Recorded ${paymentDate(entry.created_at)}`}</div>
                </div>
              </li>
            ))}
          </ul>
          <ListPagination page={page} total={result.total} onPageChange={setPage} />
        </>}
      <p className="text-xs text-muted mt-4">This list shows payments recorded in CVOA.ONE. Manually activated memberships may have no payment record. Check Stripe for refunds and cardholder details.</p>
    </div>
  )
}
