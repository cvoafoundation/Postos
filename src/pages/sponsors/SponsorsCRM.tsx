import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { KanbanBoard, type KanbanColumn } from '@/components/ui/Kanban'
import { StatCard } from '@/components/ui/StatCard'
import { supabase } from '@/lib/supabase'
import type { Sponsor, SponsorStage } from '@/lib/types'

const STAGES: { key: SponsorStage; label: string }[] = [
  { key: 'identified', label: 'Identified' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]

export default function SponsorsCRM() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([])

  useEffect(() => {
    supabase
      .from('sponsors')
      .select('*')
      .then(({ data }) => setSponsors((data ?? []) as Sponsor[]))
  }, [])

  const wonRevenue = sponsors.filter((s) => s.stage === 'won').reduce((sum, s) => sum + Number(s.sponsorship_value), 0)
  const pendingRevenue = sponsors
    .filter((s) => !['won', 'lost'].includes(s.stage))
    .reduce((sum, s) => sum + Number(s.sponsorship_value), 0)
  const leaderboard = [...sponsors]
    .filter((s) => s.stage === 'won')
    .sort((a, b) => Number(b.sponsorship_value) - Number(a.sponsorship_value))
    .slice(0, 5)

  const columns: KanbanColumn<Sponsor>[] = STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    items: sponsors.filter((sp) => sp.stage === s.key),
  }))

  return (
    <div>
      <PageHeader eyebrow="Module 7" title="Sponsorship CRM" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Sponsorship Revenue" value={`$${wonRevenue.toLocaleString()}`} accent="active" />
        <StatCard label="Pending Revenue" value={`$${pendingRevenue.toLocaleString()}`} accent="developing" />
        <div className="panel p-5">
          <div className="eyebrow mb-3">Sponsor Leaderboard</div>
          {leaderboard.length === 0 ? (
            <div className="text-sm text-muted">No closed sponsors yet</div>
          ) : (
            <ol className="space-y-1.5">
              {leaderboard.map((s, i) => (
                <li key={s.id} className="flex justify-between text-sm">
                  <span>{i + 1}. {s.company}</span>
                  <span className="font-mono text-gold">${Number(s.sponsorship_value).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <KanbanBoard
        columns={columns}
        keyExtractor={(s) => s.id}
        renderCard={(s) => (
          <div className="panel p-3">
            <div className="text-sm font-medium">{s.company}</div>
            <div className="font-mono text-[11px] text-muted">{s.contact_name ?? '—'}</div>
            <div className="font-mono text-xs text-gold mt-1">${Number(s.sponsorship_value).toLocaleString()}</div>
          </div>
        )}
      />
    </div>
  )
}
