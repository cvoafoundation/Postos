import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { KanbanBoard, type KanbanColumn } from '@/components/ui/Kanban'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Recruit, RecruitStage } from '@/lib/types'

const STAGES: { key: RecruitStage; label: string }[] = [
  { key: 'prospect', label: 'Prospect' },
  { key: 'interested', label: 'Interested' },
  { key: 'attended_meeting', label: 'Attended Meeting' },
  { key: 'applied', label: 'Applied' },
  { key: 'member', label: 'Member' },
  { key: 'leader', label: 'Leader' },
  { key: 'officer', label: 'Officer' },
  { key: 'commander', label: 'Commander' },
]

export default function RecruitingPipeline() {
  const { profile } = useAuth()
  const [recruits, setRecruits] = useState<Recruit[]>([])

  useEffect(() => {
    if (!profile?.post_id) return
    supabase
      .from('recruits')
      .select('*')
      .eq('post_id', profile.post_id)
      .then(({ data }) => setRecruits((data ?? []) as Recruit[]))
  }, [profile?.post_id])

  const total = recruits.length
  const converted = recruits.filter((r) => STAGES.findIndex((s) => s.key === r.stage) >= 3).length
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0

  const columns: KanbanColumn<Recruit>[] = STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    items: recruits.filter((r) => r.stage === s.key),
  }))

  return (
    <div>
      <PageHeader
        eyebrow="Module 6"
        title="Recruiting Engine"
        action={<div className="font-mono text-sm text-muted">Conversion: <span className="text-gold">{conversionRate}%</span></div>}
      />
      <KanbanBoard
        columns={columns}
        keyExtractor={(r) => r.id}
        renderCard={(r) => (
          <div className="panel p-3">
            <div className="text-sm font-medium">{r.name}</div>
            <div className="font-mono text-[11px] text-muted">{r.source ?? 'unknown source'}</div>
          </div>
        )}
      />
    </div>
  )
}
