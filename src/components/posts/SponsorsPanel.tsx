import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import type { Sponsor } from '@/lib/types'
import { ArrowRight } from 'lucide-react'

// This post's own private sponsor list — National's Sponsorship CRM (its
// own sidebar item) additionally rolls this up across every post, so
// National can see what everyone's doing without losing each post's own
// private working view here. Payment collection (card or manual) is a
// separate, still-to-come piece of this tool — noted for later.
export function SponsorsPanel({ postId }: { postId: string }) {
  const navigate = useNavigate()
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('sponsors')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSponsors((data ?? []) as Sponsor[])
        setLoading(false)
      })
  }, [postId])

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  const wonValue = sponsors.filter((s) => s.stage === 'won').reduce((sum, s) => sum + (s.sponsorship_value ?? 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          {sponsors.length} sponsor{sponsors.length !== 1 ? 's' : ''} tracked · ${wonValue.toLocaleString()} won
        </p>
        <button onClick={() => navigate(`/sponsors?post=${postId}`)} className="btn-ghost flex items-center gap-2 text-sm shrink-0">
          Open Full Sponsorship CRM <ArrowRight size={14} />
        </button>
      </div>

      {sponsors.length === 0 ? (
        <EmptyState title="No sponsors tracked yet" hint="Add prospects from the full Sponsorship CRM." />
      ) : (
        <div className="space-y-2">
          {sponsors.map((s) => (
            <div key={s.id} className="panel p-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-ink truncate">{s.company}</div>
                {s.category && <div className="text-xs text-muted">{s.category}</div>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {s.stage === 'won' && <span className="text-xs font-mono text-status-active">${s.sponsorship_value.toLocaleString()}</span>}
                <StatusBadge label={s.stage.replaceAll('_', ' ')} tone={s.stage === 'won' ? 'active' : s.stage === 'lost' ? 'attention' : 'developing'} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
