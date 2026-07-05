import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CongressSubNav } from './CongressSubNav'
import { NewResolutionModal } from './NewResolution'
import { supabase } from '@/lib/supabase'
import { RESOLUTION_STATUS_LABELS, type CongressAnnouncement, type Resolution } from '@/lib/types'
import { Plus, ThumbsUp, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

function statusTone(status: string) {
  if (status === 'passed' || status === 'implemented') return 'active' as const
  if (status === 'rejected' || status === 'archived') return 'neutral' as const
  return 'developing' as const
}

export default function VeteransCongress() {
  const navigate = useNavigate()
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  const [announcements, setAnnouncements] = useState<CongressAnnouncement[]>([])
  const [showNew, setShowNew] = useState(false)

  async function load() {
    const { data } = await supabase.from('resolutions').select('*').order('created_at', { ascending: false })
    setResolutions((data ?? []) as Resolution[])

    const { data: votes } = await supabase.from('resolution_votes').select('resolution_id, vote')
    const counts: Record<string, number> = {}
    for (const v of votes ?? []) {
      if (v.vote) counts[v.resolution_id] = (counts[v.resolution_id] ?? 0) + 1
    }
    setVoteCounts(counts)

    const { data: ann } = await supabase
      .from('congress_announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    setAnnouncements((ann ?? []) as CongressAnnouncement[])
  }

  useEffect(() => {
    load()
  }, [])

  const open = resolutions.filter((r) => !['passed', 'rejected', 'implemented', 'archived'].includes(r.status))
  const upcomingVotes = resolutions.filter((r) => r.status === 'voting')
  const recentlyPassed = resolutions.filter((r) => ['passed', 'implemented'].includes(r.status)).slice(0, 5)
  const recentlyRejected = resolutions.filter((r) => r.status === 'rejected').slice(0, 5)
  const trending = [...resolutions].sort((a, b) => (voteCounts[b.id] ?? 0) - (voteCounts[a.id] ?? 0)).slice(0, 3)

  return (
    <div>
      <PageHeader
        eyebrow="Module 8 — Flagship"
        title="Veterans Congress"
        action={
          <div className="flex gap-2">
            <a
              href="/transparency"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost flex items-center gap-2"
            >
              <ExternalLink size={16} /> Transparency Portal
            </a>
            <button onClick={() => setShowNew(true)} className="btn-gold flex items-center gap-2">
              <Plus size={16} /> Introduce Resolution
            </button>
          </div>
        }
      />
      <CongressSubNav />

      {trending.length > 0 && (
        <div className="panel p-5 mb-6">
          <div className="eyebrow mb-3">Trending</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {trending.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/congress/resolutions/${r.id}`)}
                className="border border-hairline rounded-sm p-3 text-left hover:border-gold transition-colors"
              >
                <div className="font-mono text-[10px] text-muted mb-1">{r.resolution_number}</div>
                <div className="text-sm font-medium mb-1">{r.title}</div>
                <div className="font-mono text-xs text-gold flex items-center gap-1">
                  <ThumbsUp size={12} /> {voteCounts[r.id] ?? 0} support
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="panel overflow-hidden">
            <div className="eyebrow p-4 pb-0">Open Resolutions ({open.length})</div>
            <table className="w-full mt-2">
              <thead>
                <tr>
                  <th className="table-head">#</th>
                  <th className="table-head">Title</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Support</th>
                </tr>
              </thead>
              <tbody>
                {open.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/congress/resolutions/${r.id}`)}
                    className="cursor-pointer hover:bg-surface/60"
                  >
                    <td className="table-cell font-mono text-xs text-muted">{r.resolution_number}</td>
                    <td className="table-cell">{r.title}</td>
                    <td className="table-cell">
                      <StatusBadge label={RESOLUTION_STATUS_LABELS[r.status]} tone={statusTone(r.status)} />
                    </td>
                    <td className="table-cell font-mono">{voteCounts[r.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {open.length === 0 && (
              <div className="p-4">
                <EmptyState title="No open resolutions" hint="Introduce one to get the process started." />
              </div>
            )}
          </div>

          {upcomingVotes.length > 0 && (
            <div className="panel p-4">
              <div className="eyebrow mb-3">Upcoming / Active Votes</div>
              <div className="space-y-2">
                {upcomingVotes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/congress/resolutions/${r.id}`)}
                    className="w-full flex justify-between text-sm border border-hairline hover:border-gold rounded-sm p-2 text-left"
                  >
                    <span>{r.title}</span>
                    <span className="font-mono text-[11px] text-muted">{r.resolution_number}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="panel p-4">
              <div className="eyebrow mb-3 text-status-active">Recently Passed</div>
              {recentlyPassed.length === 0 ? (
                <p className="text-xs text-muted">Nothing passed yet.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {recentlyPassed.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => navigate(`/congress/resolutions/${r.id}`)} className="hover:text-gold text-left">
                        {r.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel p-4">
              <div className="eyebrow mb-3 text-status-attention">Recently Rejected</div>
              {recentlyRejected.length === 0 ? (
                <p className="text-xs text-muted">Nothing rejected yet.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {recentlyRejected.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => navigate(`/congress/resolutions/${r.id}`)} className="hover:text-gold text-left">
                        {r.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <div className="eyebrow mb-4">National Announcements</div>
          {announcements.length === 0 ? (
            <EmptyState title="No announcements yet" />
          ) : (
            <ul className="space-y-4">
              {announcements.map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="font-mono text-[10px] text-gold uppercase mb-0.5">{a.category}</div>
                  <div className="text-ink font-medium">{a.title}</div>
                  <div className="text-muted text-xs mt-0.5">{a.body}</div>
                  <div className="font-mono text-[11px] text-muted mt-1">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showNew && (
        <NewResolutionModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            load()
          }}
        />
      )}
    </div>
  )
}
