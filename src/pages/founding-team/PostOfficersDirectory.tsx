import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { FoundingTeamMember } from '@/lib/types'
import { Users } from 'lucide-react'

const POSITION_LABELS: Record<string, string> = {
  commander: 'Commander',
  vice_commander: 'Vice Commander',
  adjutant: 'Adjutant',
  quartermaster: 'Quartermaster',
  sergeant_at_arms: 'Sergeant-at-Arms',
  member: 'Additional Member',
}

export default function PostOfficersDirectory() {
  const { profile } = useAuth()
  const [officers, setOfficers] = useState<FoundingTeamMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.post_id) {
      setLoading(false)
      return
    }
    supabase
      .from('founding_team_members')
      .select('*')
      .eq('post_id', profile.post_id)
      .neq('position', 'member')
      .then(({ data }: any) => {
        setOfficers((data ?? []) as FoundingTeamMember[])
        setLoading(false)
      })
  }, [profile?.post_id])

  return (
    <div>
      <PageHeader eyebrow="Your Post" title="Post Officers" />
      <p className="text-sm text-muted mb-6 max-w-xl">Who's currently leading your post.</p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : officers.length === 0 ? (
        <EmptyState title="No officers on file yet" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {officers.map((o) => (
            <div key={o.id} className="panel p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
                <Users className="text-gold" size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{o.name}</div>
                <div className="text-xs text-muted">{POSITION_LABELS[o.position] ?? o.position}</div>
              </div>
              {o.verification_status === 'verified' && (
                <StatusBadge label="Verified" tone="active" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
