import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import type { Resolution } from '@/lib/types'
import { ThumbsUp } from 'lucide-react'

export default function VeteransCongress() {
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})

  async function load() {
    const { data } = await supabase
      .from('resolutions')
      .select('*')
      .order('created_at', { ascending: false })
    setResolutions((data ?? []) as Resolution[])

    const { data: votes } = await supabase.from('resolution_votes').select('resolution_id, vote')
    const counts: Record<string, number> = {}
    for (const v of votes ?? []) {
      if (v.vote) counts[v.resolution_id] = (counts[v.resolution_id] ?? 0) + 1
    }
    setVoteCounts(counts)
  }

  useEffect(() => {
    load()
  }, [])

  const trending = [...resolutions]
    .sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0))
    .slice(0, 3)

  return (
    <div>
      <PageHeader eyebrow="Module 8 — Flagship" title="Veterans Congress" />

      {trending.length > 0 && (
        <div className="panel p-5 mb-6">
          <div className="eyebrow mb-3">Trending Resolutions</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {trending.map((r) => (
              <div key={r.id} className="border border-hairline rounded-sm p-3">
                <div className="text-sm font-medium mb-1">{r.title}</div>
                <div className="font-mono text-xs text-gold flex items-center gap-1">
                  <ThumbsUp size={12} /> {voteCounts[r.id] ?? 0} support
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Title</th>
              <th className="table-head">Category</th>
              <th className="table-head">Status</th>
              <th className="table-head">Support</th>
            </tr>
          </thead>
          <tbody>
            {resolutions.map((r) => (
              <tr key={r.id}>
                <td className="table-cell">{r.title}</td>
                <td className="table-cell text-muted">{r.category ?? '—'}</td>
                <td className="table-cell">
                  <StatusBadge
                    label={r.status.replaceAll('_', ' ')}
                    tone={r.status === 'adopted' ? 'active' : r.status === 'archived' ? 'neutral' : 'developing'}
                  />
                </td>
                <td className="table-cell font-mono">{voteCounts[r.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {resolutions.length === 0 && (
          <EmptyState
            title="No resolutions submitted yet"
            hint="Post delegates submit resolutions, legislative priorities, national concerns, and constitutional amendments here."
          />
        )}
      </div>
    </div>
  )
}
