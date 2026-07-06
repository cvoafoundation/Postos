import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { RESOLUTION_STATUS_LABELS, type Resolution } from '@/lib/types'
import { ThumbsUp } from 'lucide-react'

export default function CongressMemberView() {
  const navigate = useNavigate()
  const [openVotes, setOpenVotes] = useState<Resolution[]>([])
  const [recentlyDecided, setRecentlyDecided] = useState<Resolution[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [votingRes, decidedRes] = await Promise.all([
        supabase.from('resolutions').select('*').eq('status', 'voting').order('created_at', { ascending: false }),
        supabase
          .from('resolutions')
          .select('*')
          .in('status', ['passed', 'rejected', 'implemented'])
          .order('created_at', { ascending: false })
          .limit(5),
      ])
      setOpenVotes((votingRes.data ?? []) as Resolution[])
      setRecentlyDecided((decidedRes.data ?? []) as Resolution[])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Veterans Congress" title="Open Votes" />
      <p className="text-sm text-muted mb-6 max-w-xl">
        Cast your vote on resolutions currently open — click any resolution to read the full text and vote.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : openVotes.length === 0 ? (
        <EmptyState title="No votes open right now" hint="Check back when National opens a resolution for voting." />
      ) : (
        <div className="space-y-3 mb-8">
          {openVotes.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/congress/resolutions/${r.id}`)}
              className="panel w-full p-4 text-left hover:border-gold transition-colors flex items-center justify-between"
            >
              <div>
                <div className="font-mono text-[11px] text-muted mb-1">{r.resolution_number}</div>
                <div className="text-sm font-medium text-ink">{r.title}</div>
              </div>
              <StatusBadge label="Voting Open" tone="developing" />
            </button>
          ))}
        </div>
      )}

      {recentlyDecided.length > 0 && (
        <div>
          <div className="eyebrow mb-3 flex items-center gap-1.5">
            <ThumbsUp size={12} /> Recently Decided
          </div>
          <div className="space-y-2">
            {recentlyDecided.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/congress/resolutions/${r.id}`)}
                className="w-full flex justify-between text-sm border border-hairline hover:border-gold rounded-sm p-2 text-left"
              >
                <span>{r.title}</span>
                <span className="font-mono text-[11px] text-muted">{RESOLUTION_STATUS_LABELS[r.status]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
