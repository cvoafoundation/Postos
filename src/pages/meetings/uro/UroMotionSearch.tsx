import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import type { UroMotion } from '@/lib/types'
import { Search } from 'lucide-react'

interface MotionRow extends UroMotion {
  uro_meetings: { title: string; meeting_date: string; post_id: string } | null
  posts: { name: string } | null
}

export default function UroMotionSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [voteFilter, setVoteFilter] = useState('')
  const [results, setResults] = useState<MotionRow[]>([])
  const [loading, setLoading] = useState(false)

  async function runSearch(e?: FormEvent) {
    e?.preventDefault()
    setLoading(true)
    let q = supabase
      .from('uro_motions')
      .select('*, uro_meetings(title, meeting_date, post_id), posts(name)')
      .order('created_at', { ascending: false })
    if (query.trim()) q = q.ilike('motion_text', `%${query}%`)
    if (voteFilter) q = q.eq('vote_result', voteFilter)
    const { data } = await q
    setResults((data ?? []) as any as MotionRow[])
    setLoading(false)
  }

  useEffect(() => {
    runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Across Every Post" title="National Motion Search" />
      <p className="text-sm text-muted mb-6 max-w-xl">
        Every motion ever made, at any post, permanently searchable — the full history of what's been proposed
        and how it was decided.
      </p>

      <form onSubmit={runSearch} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search motion text…"
            className="input-field pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input-field w-44" value={voteFilter} onChange={(e) => setVoteFilter(e.target.value)}>
          <option value="">Any result</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="tabled">Tabled</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <button type="submit" className="btn-gold px-6">
          Search
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-muted">Searching…</p>
      ) : results.length === 0 ? (
        <EmptyState title="No motions found" />
      ) : (
        <div className="space-y-2">
          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/meetings/uro/${m.meeting_id}/view`)}
              className="w-full panel p-4 text-left hover:border-gold transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-ink">{m.motion_text}</span>
                <StatusBadge
                  label={m.vote_result ?? 'pending'}
                  tone={m.vote_result === 'passed' ? 'active' : m.vote_result === 'failed' ? 'attention' : 'developing'}
                />
              </div>
              <div className="text-[11px] text-muted font-mono">
                {m.posts?.name ?? 'Unknown post'} · {m.uro_meetings?.title} · {m.uro_meetings?.meeting_date} ·{' '}
                {m.motion_type.replaceAll('_', ' ')} · For {m.votes_for ?? 0} / Against {m.votes_against ?? 0} / Abstain {m.votes_abstain ?? 0}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
