import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { POST_STATUS_LABELS, type PostApplication } from '@/lib/types'
import { format } from 'date-fns'
import { Trash2, Star } from 'lucide-react'

interface Scorecard {
  id: string
  leadership_score: number | null
  communication_score: number | null
  professionalism_score: number | null
  reliability_score: number | null
  mission_alignment_score: number | null
  notes: string | null
  created_at: string
}

const SCORE_CATEGORIES: { key: keyof Scorecard; label: string }[] = [
  { key: 'leadership_score', label: 'Leadership' },
  { key: 'communication_score', label: 'Communication' },
  { key: 'professionalism_score', label: 'Professionalism' },
  { key: 'reliability_score', label: 'Reliability' },
  { key: 'mission_alignment_score', label: 'Mission Alignment' },
]

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-sm text-ink whitespace-pre-wrap">
        {value === null || value === undefined || value === '' ? (
          <span className="text-muted">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  )
}

function average(scorecards: Scorecard[], key: keyof Scorecard): number | null {
  const values = scorecards.map((s) => s[key]).filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return null
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

function ScorecardSummary({ applicationId }: { applicationId: string }) {
  const [scorecards, setScorecards] = useState<Scorecard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('vetting_scorecards')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .then(({ data }: any) => {
        setScorecards((data ?? []) as Scorecard[])
        setLoading(false)
      })
  }, [applicationId])

  if (loading) return null
  if (scorecards.length === 0) {
    return (
      <div className="text-sm text-muted">
        No scorecards yet — score this candidate from the Vetting System module.
      </div>
    )
  }

  // Overall average across every category and every scorecard submitted
  const allScores = scorecards.flatMap((s) =>
    SCORE_CATEGORIES.map((c) => s[c.key]).filter((v): v is number => typeof v === 'number')
  )
  const overallAvg =
    allScores.length > 0 ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10 : null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">
          Vetting Score {scorecards.length > 1 ? `(avg of ${scorecards.length} scorecards)` : ''}
        </div>
        {overallAvg !== null && (
          <div className="flex items-center gap-1.5 text-gold font-display text-2xl">
            <Star size={16} className="fill-gold" />
            {overallAvg}
            <span className="text-muted text-sm font-body">/10</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2 mb-3">
        {SCORE_CATEGORIES.map((cat) => {
          const val = average(scorecards, cat.key)
          return (
            <div key={cat.key} className="border border-hairline rounded-sm p-2 text-center">
              <div className="font-display text-xl text-ink">{val ?? '—'}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide leading-tight mt-1">{cat.label}</div>
            </div>
          )
        })}
      </div>
      {scorecards[0].notes && (
        <div className="text-xs text-muted italic border-l-2 border-hairline pl-3">
          Latest note: "{scorecards[0].notes}"
        </div>
      )}
    </div>
  )
}

export function ApplicationDetailModal({
  application,
  onClose,
  onDeleted,
}: {
  application: PostApplication
  onClose: () => void
  onDeleted?: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const { error } = await supabase.from('post_applications').delete().eq('id', application.id)
    setDeleting(false)
    if (error) {
      setError(error.message)
      return
    }
    onDeleted?.()
    onClose()
  }

  return (
    <Modal title={application.name} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <StatusBadge label={POST_STATUS_LABELS[application.status]} tone="developing" />
          <span className="font-mono text-[11px] text-muted">
            Submitted {format(new Date(application.created_at), 'MMM d, yyyy')}
          </span>
        </div>

        <div className="border-t border-b border-hairline py-4">
          <ScorecardSummary applicationId={application.id} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" value={application.email} />
          <Field label="Phone" value={application.phone} />
          <Field label="Location" value={[application.city, application.state].filter(Boolean).join(', ')} />
          <Field label="Military Branch" value={application.military_branch} />
          <Field label="Years Served" value={application.years_served} />
          <Field label="Combat Service" value={application.combat_service ? 'Yes' : 'No'} />
        </div>

        <div className="border-t border-hairline pt-4 space-y-4">
          <Field label="Leadership Experience" value={application.leadership_experience} />
          <Field label="Existing Veteran Network" value={application.existing_veteran_network} />
          <Field label="Estimated Membership Potential" value={application.estimated_membership_potential} />
          <Field label="Why do you want to start a post?" value={application.motivation} />
        </div>

        <div className="border-t border-hairline pt-4">
          <Field
            label="DD214 Status"
            value={application.dd214_storage_path ? application.dd214_review_status : 'Not uploaded'}
          />
        </div>

        <div className="border-t border-hairline pt-4">
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-status-attention hover:text-status-attention/80"
            >
              <Trash2 size={14} /> Delete this application
            </button>
          ) : (
            <div className="border border-status-attention/40 bg-status-attention/10 rounded-sm p-3 space-y-3">
              <p className="text-sm text-ink">
                Permanently delete <strong>{application.name}</strong>'s application? This can't be undone —
                their DD214 file and any scorecards tied to this application will be orphaned.
              </p>
              {error && <p className="text-status-attention text-sm">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-status-attention text-base rounded-sm py-2 text-sm font-medium disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete permanently'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="flex-1 btn-ghost text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
