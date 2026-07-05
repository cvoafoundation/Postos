import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CongressSubNav } from './CongressSubNav'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Committee, CommitteeRecommendation, CommitteeReview, Resolution } from '@/lib/types'

export default function Committees() {
  const { isNational } = useAuth()
  const [committees, setCommittees] = useState<Committee[]>([])
  const [selected, setSelected] = useState<Committee | null>(null)
  const [reviews, setReviews] = useState<CommitteeReview[]>([])
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [resolutionId, setResolutionId] = useState('')
  const [recommendation, setRecommendation] = useState<CommitteeRecommendation>('approve')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('committees').select('*').order('name').then(({ data }: any) => {
      const list = (data ?? []) as Committee[]
      setCommittees(list)
      if (list.length > 0) setSelected(list[0])
    })
    supabase.from('resolutions').select('*').order('title').then(({ data }: any) => setResolutions((data ?? []) as Resolution[]))
  }, [])

  async function loadReviews(committeeId: string) {
    const { data } = await supabase.from('committee_reviews').select('*').eq('committee_id', committeeId).order('created_at', { ascending: false })
    setReviews((data ?? []) as CommitteeReview[])
  }

  useEffect(() => {
    if (selected) loadReviews(selected.id)
  }, [selected])

  async function submitReview() {
    if (!selected || !resolutionId) return
    setSaving(true)
    await supabase.from('committee_reviews').insert({
      resolution_id: resolutionId,
      committee_id: selected.id,
      recommendation,
      notes: notes || null,
    })
    setSaving(false)
    setNotes('')
    loadReviews(selected.id)
  }

  const resolutionTitle = (id: string) => resolutions.find((r) => r.id === id)?.title ?? 'Unknown'

  return (
    <div>
      <PageHeader eyebrow="Module 8" title="Veterans Congress" />
      <CongressSubNav />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          {committees.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`panel w-full text-left p-3 ${selected?.id === c.id ? 'border-gold' : ''}`}
            >
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-muted mt-0.5">{c.description}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="space-y-6">
              {isNational && (
                <div className="panel p-4">
                  <div className="eyebrow mb-3">Submit Review — {selected.name}</div>
                  <div className="space-y-2">
                    <select className="input-field" value={resolutionId} onChange={(e) => setResolutionId(e.target.value)}>
                      <option value="">Select a resolution…</option>
                      {resolutions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.resolution_number} — {r.title}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input-field"
                      value={recommendation}
                      onChange={(e) => setRecommendation(e.target.value as CommitteeRecommendation)}
                    >
                      <option value="approve">Recommend Approval</option>
                      <option value="reject">Recommend Rejection</option>
                      <option value="request_revisions">Request Revisions</option>
                    </select>
                    <textarea
                      placeholder="Notes"
                      className="input-field"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <button onClick={submitReview} disabled={saving || !resolutionId} className="btn-gold w-full disabled:opacity-50">
                      {saving ? 'Submitting…' : 'Submit Review'}
                    </button>
                  </div>
                </div>
              )}

              <div className="panel overflow-hidden">
                <div className="eyebrow p-4 pb-0">Review History</div>
                {reviews.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="No reviews yet" />
                  </div>
                ) : (
                  <table className="w-full mt-2">
                    <thead>
                      <tr>
                        <th className="table-head">Resolution</th>
                        <th className="table-head">Recommendation</th>
                        <th className="table-head">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviews.map((r) => (
                        <tr key={r.id}>
                          <td className="table-cell">{resolutionTitle(r.resolution_id)}</td>
                          <td className="table-cell">
                            <StatusBadge
                              label={r.recommendation.replaceAll('_', ' ')}
                              tone={r.recommendation === 'approve' ? 'active' : r.recommendation === 'reject' ? 'attention' : 'developing'}
                            />
                          </td>
                          <td className="table-cell text-muted">{r.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <EmptyState title="No committees" />
          )}
        </div>
      </div>
    </div>
  )
}
