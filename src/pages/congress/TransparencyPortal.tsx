import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RESOLUTION_STATUS_LABELS, type CongressAnnouncement, type LegislativeBill, type Resolution } from '@/lib/types'
import { format } from 'date-fns'

export default function TransparencyPortal() {
  const [passed, setPassed] = useState<Resolution[]>([])
  const [positions, setPositions] = useState<CongressAnnouncement[]>([])
  const [bills, setBills] = useState<LegislativeBill[]>([])
  const [voteCounts, setVoteCounts] = useState<Record<string, { yes: number; no: number }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [resRes, annRes, billsRes, votesRes] = await Promise.all([
        supabase.from('resolutions').select('*').in('status', ['passed', 'implemented', 'rejected']).order('created_at', { ascending: false }),
        supabase.from('congress_announcements').select('*').eq('category', 'Official Position').order('created_at', { ascending: false }),
        supabase.from('legislative_bills').select('*').order('created_at', { ascending: false }),
        supabase.from('resolution_votes').select('resolution_id, vote'),
      ])
      setPassed((resRes.data ?? []) as Resolution[])
      setPositions((annRes.data ?? []) as CongressAnnouncement[])
      setBills((billsRes.data ?? []) as LegislativeBill[])

      const counts: Record<string, { yes: number; no: number }> = {}
      for (const v of (votesRes.data ?? []) as any[]) {
        if (!counts[v.resolution_id]) counts[v.resolution_id] = { yes: 0, no: 0 }
        v.vote ? counts[v.resolution_id].yes++ : counts[v.resolution_id].no++
      }
      setVoteCounts(counts)
      setLoading(false)
    }
    load()
  }, [])

  const totalResolutions = passed.length
  const passedCount = passed.filter((r) => ['passed', 'implemented'].includes(r.status)).length

  return (
    <div className="min-h-screen bg-base px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="font-display text-4xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-1">Veterans Congress — Transparency Portal</div>
          <p className="text-sm text-muted max-w-lg mx-auto mt-4">
            Every resolution CVOA has passed, rejected, or taken a formal position on — public record,
            searchable, permanent. No member should ever have to ask "who decided this?"
          </p>
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="panel p-4 text-center">
                <div className="stat-number text-gold">{totalResolutions}</div>
                <div className="eyebrow mt-1">Resolutions Decided</div>
              </div>
              <div className="panel p-4 text-center">
                <div className="stat-number text-status-active">{passedCount}</div>
                <div className="eyebrow mt-1">Passed / Implemented</div>
              </div>
              <div className="panel p-4 text-center">
                <div className="stat-number text-ink">{bills.length}</div>
                <div className="eyebrow mt-1">Bills Tracked</div>
              </div>
            </div>

            {positions.length > 0 && (
              <div className="panel p-5 mb-6">
                <div className="eyebrow mb-3">Official CVOA Positions</div>
                <div className="space-y-3">
                  {positions.map((p) => (
                    <div key={p.id} className="border-l-2 border-gold/40 pl-3">
                      <div className="text-sm font-medium text-ink">{p.title}</div>
                      <p className="text-xs text-muted mt-0.5">{p.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="panel overflow-hidden mb-6">
              <div className="eyebrow p-4 pb-0">Resolution Record</div>
              <table className="w-full mt-2">
                <thead>
                  <tr>
                    <th className="table-head">#</th>
                    <th className="table-head">Title</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Vote Record</th>
                    <th className="table-head">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {passed.map((r) => (
                    <tr key={r.id}>
                      <td className="table-cell font-mono text-xs text-muted">{r.resolution_number}</td>
                      <td className="table-cell">{r.title}</td>
                      <td className="table-cell">{RESOLUTION_STATUS_LABELS[r.status]}</td>
                      <td className="table-cell font-mono text-xs">
                        {voteCounts[r.id] ? `${voteCounts[r.id].yes} - ${voteCounts[r.id].no}` : '—'}
                      </td>
                      <td className="table-cell text-muted text-xs">{format(new Date(r.created_at), 'MMM d, yyyy')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {passed.length === 0 && <p className="p-4 text-sm text-muted">No decided resolutions yet.</p>}
            </div>

            {bills.length > 0 && (
              <div className="panel p-5">
                <div className="eyebrow mb-3">Legislative Priorities</div>
                <div className="space-y-3">
                  {bills
                    .filter((b) => b.cvoa_position)
                    .map((b) => (
                      <div key={b.id} className="border-l-2 border-hairline pl-3">
                        <div className="text-sm font-medium text-ink">{b.title}</div>
                        <div className="text-xs text-gold mt-0.5">{b.cvoa_position}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
