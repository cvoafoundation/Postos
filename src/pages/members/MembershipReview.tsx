import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Member } from '@/lib/types'
import { FileText, CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'

export default function MembershipReview() {
  const { profile, isNational } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState<'pending' | 'verified' | 'rejected' | 'all'>('pending')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    let query = supabase.from('members').select('*').not('dd214_storage_path', 'is', null).order('created_at', { ascending: false })
    if (!isNational && profile?.post_id) {
      query = query.eq('post_id', profile.post_id)
    }
    const { data } = await query
    setMembers((data ?? []) as Member[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.post_id, isNational])

  async function review(member: Member, status: 'verified' | 'rejected') {
    await supabase
      .from('members')
      .update({ dd214_review_status: status, dd214_reviewed_by: profile?.id, dd214_reviewed_at: new Date().toISOString() })
      .eq('id', member.id)
    load()
  }

  async function openDocument(path: string) {
    const { data, error } = await supabase.storage.from('dd214-uploads').createSignedUrl(path, 600)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const filtered = members.filter((m) => filter === 'all' || m.dd214_review_status === filter)
  const pendingCount = members.filter((m) => m.dd214_review_status === 'pending').length

  return (
    <div>
      <PageHeader eyebrow={isNational ? 'National Only' : 'Your Post'} title="Membership DD214 Review" />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        A member's card activates instantly the moment payment clears — that never waits on this. This is a
        separate, second check: confirm the DD214 they uploaded actually holds up, at your own pace.
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

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={`No ${filter === 'all' ? '' : filter} DD214s`} />
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Member</th>
                <th className="table-head">Member #</th>
                <th className="table-head">Submitted</th>
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
