import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { FoundingTeamMember } from '@/lib/types'
import { Mail, Phone } from 'lucide-react'

const POSITION_LABELS: Record<string, string> = {
  commander: 'Commander',
  vice_commander: 'Vice Commander',
  adjutant: 'Adjutant',
  quartermaster: 'Quartermaster',
  sergeant_at_arms: 'Sergeant-at-Arms',
  member: 'Additional Member',
}

export default function PostOfficers() {
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

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <PageHeader eyebrow="Your Post" title="Officers" />
      <p className="text-sm text-muted mb-6 max-w-xl">Who to reach out to at your post.</p>

      {officers.length === 0 ? (
        <EmptyState title="No officers on file yet" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {officers.map((o) => (
            <div key={o.id} className="panel p-4">
              <div className="text-sm font-medium">{o.name}</div>
              <div className="eyebrow mt-0.5 mb-2">{POSITION_LABELS[o.position] ?? o.position}</div>
              <div className="space-y-1 text-xs text-muted">
                {o.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail size={12} /> {o.email}
                  </div>
                )}
                {o.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={12} /> {o.phone}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
