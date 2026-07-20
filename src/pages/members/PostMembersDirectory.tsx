import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Member } from '@/lib/types'

export default function PostMembersDirectory() {
  const { profile } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.post_id) {
      setLoading(false)
      return
    }
    supabase
      .from('members')
      .select('*')
      .eq('post_id', profile.post_id)
      .order('full_name')
      .then(({ data }: any) => {
        setMembers((data ?? []) as Member[])
        setLoading(false)
      })
  }, [profile?.post_id])

  return (
    <div>
      <PageHeader eyebrow="Your Post" title="Post Members" />
      <p className="text-sm text-muted mb-6 max-w-xl">
        Everyone in your post. Contact info stays private between each member and staff — this is just who's here.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : members.length === 0 ? (
        <EmptyState title="No members on file yet" />
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Name</th>
                <th className="table-head">WarFighter No.</th>
                <th className="table-head">Type</th>
                <th className="table-head">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="table-cell">{m.full_name}</td>
                  <td className="table-cell font-mono text-xs text-gold">{m.membership_number ?? '—'}</td>
                  <td className="table-cell capitalize">{m.membership_type}</td>
                  <td className="table-cell">
                    <StatusBadge label={m.membership_status.replaceAll('_', ' ')} tone={m.membership_status === 'active' ? 'active' : 'developing'} />
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
