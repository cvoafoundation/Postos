import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import type { PostApplication } from '@/lib/types'

const CATEGORIES = ['leadership', 'communication', 'professionalism', 'reliability', 'mission_alignment'] as const

export default function VettingBoard() {
  const [applications, setApplications] = useState<PostApplication[]>([])
  const [selected, setSelected] = useState<PostApplication | null>(null)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('post_applications')
      .select('*')
      .in('status', ['interview_scheduled', 'vetting'])
      .then(({ data }) => setApplications((data ?? []) as PostApplication[]))
  }, [])

  async function submitScorecard() {
    if (!selected) return
    setSaving(true)
    await supabase.from('vetting_scorecards').insert({
      application_id: selected.id,
      leadership_score: scores.leadership ?? null,
      communication_score: scores.communication ?? null,
      professionalism_score: scores.professionalism ?? null,
      reliability_score: scores.reliability ?? null,
      mission_alignment_score: scores.mission_alignment ?? null,
      notes: notes || null,
    })
    setSaving(false)
    setScores({})
    setNotes('')
    setSelected(null)
  }

  return (
    <div>
      <PageHeader eyebrow="Module 2" title="Vetting System" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2">
          <div className="eyebrow mb-2">Candidates awaiting review</div>
          {applications.length === 0 ? (
            <EmptyState title="No candidates" hint="Applications in Interview or Vetting stage appear here." />
          ) : (
            applications.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className={`panel w-full text-left p-3 ${selected?.id === a.id ? 'border-gold' : ''}`}
              >
                <div className="text-sm font-medium">{a.name}</div>
                <div className="font-mono text-[11px] text-muted">{a.state}</div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-display text-2xl">{selected.name}</div>
                  <StatusBadge label={selected.status.replaceAll('_', ' ')} tone="developing" />
                </div>
              </div>

              <div className="eyebrow mb-3">Candidate Scorecard (1–10)</div>
              <div className="space-y-3 mb-5">
                {CATEGORIES.map((cat) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-sm capitalize text-muted">{cat.replace('_', ' ')}</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={scores[cat] ?? 5}
                      onChange={(e) => setScores((s) => ({ ...s, [cat]: Number(e.target.value) }))}
                      className="w-1/2 accent-[#C9A227]"
                    />
                    <span className="font-mono text-sm w-6 text-right">{scores[cat] ?? 5}</span>
                  </div>
                ))}
              </div>

              <textarea
                placeholder="Interview notes / follow-up tasks"
                className="input-field mb-4"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <button onClick={submitScorecard} disabled={saving} className="btn-gold disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Scorecard'}
              </button>
            </div>
          ) : (
            <EmptyState title="Select a candidate" hint="Choose someone from the list to score their interview." />
          )}
        </div>
      </div>
    </div>
  )
}
