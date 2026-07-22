import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { Recruit, RecruitStage } from '@/lib/types'
import { ArrowRight } from 'lucide-react'

const STAGE_LABELS: Record<RecruitStage, string> = {
  prospect: 'Prospect',
  interested: 'Interested',
  attended_meeting: 'Attended Meeting',
  applied: 'Applied',
  member: 'Member',
  leader: 'Leader',
  officer: 'Officer',
  commander: 'Commander',
}

// This post's own private pipeline — National's Recruiting Engine (its own
// sidebar item) additionally rolls this up across every post at once, so
// National can see what everyone's doing without losing each post's own
// private working view here.
export function RecruitingPanel({ postId }: { postId: string }) {
  const navigate = useNavigate()
  const [recruits, setRecruits] = useState<Recruit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('recruits')
      .select('*')
      .eq('post_id', postId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setRecruits((data ?? []) as Recruit[])
        setLoading(false)
      })
  }, [postId])

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  const byStage = recruits.reduce<Record<string, number>>((acc, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">{recruits.length} recruit{recruits.length !== 1 ? 's' : ''} in this post's pipeline.</p>
        <button onClick={() => navigate(`/recruiting?post=${postId}`)} className="btn-ghost flex items-center gap-2 text-sm shrink-0">
          Open Full Recruiting Engine <ArrowRight size={14} />
        </button>
      </div>

      {recruits.length === 0 ? (
        <EmptyState title="No recruits logged yet" hint="Add prospects from the full Recruiting Engine." />
      ) : (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(byStage).map(([stage, count]) => (
            <div key={stage} className="panel px-3 py-2 text-sm">
              <span className="text-gold font-mono mr-1.5">{count}</span>
              {STAGE_LABELS[stage as RecruitStage] ?? stage}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
