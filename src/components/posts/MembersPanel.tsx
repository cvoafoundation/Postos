import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import type { Member } from '@/lib/types'
import { ArrowRight } from 'lucide-react'

// A live look at who's in this post, right on its own page — full editing
// (CSV import, add/edit a member, DD214 review) stays in Membership
// Roster, one click away, rather than duplicating that whole tool here.
export function MembersPanel({ postId }: { postId: string }) {
  const navigate = useNavigate()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('members')
      .select('*')
      .eq('post_id', postId)
      .order('full_name')
      .then(({ data }) => {
        setMembers((data ?? []) as Member[])
        setLoading(false)
      })
  }, [postId])

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">{members.length} member{members.length !== 1 ? 's' : ''} on file for this post.</p>
        <button
          onClick={() => navigate(`/members?post=${postId}`)}
          className="btn-ghost flex items-center gap-2 text-sm shrink-0"
        >
          Open Full Membership Roster <ArrowRight size={14} />
        </button>
      </div>

      {members.length === 0 ? (
        <EmptyState title="No members on file yet" hint="Add or import members from the full Membership Roster." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Member #</th>
                <th className="table-head">Name</th>
                <th className="table-head">Type</th>
                <th className="table-head">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/members?highlight=${m.id}`)}
                  className="cursor-pointer hover:bg-surface/60"
                >
                  <td className="table-cell font-mono text-xs text-gold">{m.membership_number ?? '—'}</td>
                  <td className="table-cell whitespace-nowrap">{m.full_name}</td>
                  <td className="table-cell capitalize">{m.membership_type}</td>
                  <td className="table-cell">
                    <StatusBadge
                      label={m.membership_status.replaceAll('_', ' ')}
                      tone={m.membership_status === 'active' ? 'active' : m.membership_status === 'lapsed' ? 'attention' : 'developing'}
                    />
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
