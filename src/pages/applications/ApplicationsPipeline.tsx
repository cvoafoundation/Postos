import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/lib/workspaces'
import { WorkspaceStatus } from '@/components/workspaces/WorkspaceStatus'
import { useMarkNotificationViewed } from '@/lib/notifications'
import { POST_STATUS_LABELS, POST_STATUS_ORDER, type PostStatus } from '@/lib/types'
import {
  STAGE_GUIDES,
  applicationChecks,
  transitionBlockers,
  type PipelineEntry,
  type PipelineSummary,
} from '@/lib/applicationPipeline'
import { ArrowDown, Plus, CheckCircle2, CircleAlert, Search } from 'lucide-react'
import { NewApplicationModal } from './NewApplication'
import { Dd214ReviewModal } from './Dd214Review'
import { ApplicationDetailModal } from './ApplicationDetail'

type Editor = {
  kind: 'handoff' | 'interview' | 'score' | 'transition' | 'document'
  entry: PipelineEntry
  next?: PostStatus
}
const SCORE_FIELDS = [
  'leadership',
  'communication',
  'professionalism',
  'reliability',
  'mission_alignment',
] as const

export default function ApplicationsPipeline() {
  useMarkNotificationViewed('applications')
  const { data, error, loading, refresh } = useWorkspace<PipelineSummary>('cvoa_application_pipeline')
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [reviewing, setReviewing] = useState<PipelineEntry | null>(null)
  const [viewing, setViewing] = useState<PipelineEntry | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const entries = data?.applications ?? []
  const reviewers = data?.reviewers ?? []
  const term = query.trim().toLowerCase()
  const filtered = entries.filter(({ application: a }) =>
    [a.name, a.email, a.city, a.state].some((v) => v?.toLowerCase().includes(term))
  )
  function updated() {
    setEditor(null)
    refresh()
    setNotice('Saved. The pipeline now shows the latest recorded progress.')
  }

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Post development"
        title="Post Application Pipeline"
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={refresh} disabled={loading}>
              Refresh
            </button>
            <button onClick={() => setShowNew(true)} className="btn-gold flex items-center gap-2">
              <Plus size={16} /> New Application
            </button>
          </div>
        }
      />
      <p className="text-sm text-muted mb-4">
        Follow the stages from top to bottom. Each applicant shows recorded evidence, outstanding work, and
        the next action. Checkmarks confirm records; exclamation marks identify work still needed.
      </p>
      <label className="block mb-4">
        <span className="eyebrow flex items-center gap-2 mb-2">
          <Search size={14} /> Find an applicant
        </span>
        <input
          className="input-field w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, email, city or state"
        />
      </label>
      <nav aria-label="Jump to pipeline stage" className="flex flex-wrap gap-2 mb-5">
        {POST_STATUS_ORDER.map((s, i) => (
          <a
            key={s}
            className="text-xs border border-hairline rounded-sm px-2 py-1 hover:border-gold"
            href={`#stage-${s}`}
          >
            {i + 1}. {POST_STATUS_LABELS[s]}
          </a>
        ))}
      </nav>
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {notice && (
        <p role="status" className="panel p-3 mb-4 text-sm text-status-active">
          {notice}
        </p>
      )}
      {data && (
        <p className="text-xs text-muted mb-4">
          {filtered.length} of {entries.length} applicants shown · oldest applications first ·{' '}
          {reviewers.length} current National reviewers
        </p>
      )}
      {data && (
        <ol className="space-y-0">
          {POST_STATUS_ORDER.map((status, index) => {
            const stageEntries = filtered.filter((e) => e.application.status === status)
            const guide = STAGE_GUIDES[status]
            return (
              <li key={status} id={`stage-${status}`} className="scroll-mt-6 min-w-0">
                <section className="panel p-4 md:p-5 min-w-0" aria-labelledby={`heading-${status}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className="w-8 h-8 shrink-0 rounded-full border border-gold text-gold flex items-center justify-center font-mono">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 id={`heading-${status}`} className="font-display text-xl">
                        {POST_STATUS_LABELS[status]}{' '}
                        <span className="text-sm font-body text-muted">({stageEntries.length})</span>
                      </h2>
                      <p className="text-sm text-muted mt-1">{guide.goal}</p>
                      <p className="text-xs text-muted mt-2">
                        Responsible: {guide.owner} · {guide.action}
                      </p>
                    </div>
                  </div>
                  {stageEntries.length === 0 ? (
                    <p className="text-xs text-muted pl-11">
                      {term ? 'No matching applicants in this stage.' : 'No applicants in this stage.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {stageEntries.map((entry) => (
                        <ApplicationCard
                          key={entry.application.id}
                          entry={entry}
                          reviewers={reviewers}
                          onView={() => setViewing(entry)}
                          onReview={() => setReviewing(entry)}
                          onEdit={(kind, next) => setEditor({ kind, entry, next })}
                        />
                      ))}
                    </div>
                  )}
                </section>
                {index < POST_STATUS_ORDER.length - 1 && (
                  <div className="flex justify-center py-3" aria-hidden="true">
                    <ArrowDown size={24} className="text-gold" />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {showNew && (
        <NewApplicationModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            refresh()
          }}
        />
      )}
      {reviewing && (
        <Dd214ReviewModal
          application={reviewing.application}
          onClose={() => setReviewing(null)}
          onReviewed={() => {
            setReviewing(null)
            refresh()
          }}
        />
      )}
      {viewing && (
        <ApplicationDetailModal
          application={viewing.application}
          onClose={() => {
            setViewing(null)
            refresh()
          }}
          onDeleted={refresh}
        />
      )}
      {editor && (
        <PipelineEditor
          key={`${editor.kind}:${editor.entry.application.id}`}
          editor={editor}
          reviewers={reviewers}
          onClose={() => setEditor(null)}
          onSaved={updated}
        />
      )}
    </div>
  )
}

function ApplicationCard({
  entry,
  reviewers,
  onView,
  onReview,
  onEdit,
}: {
  entry: PipelineEntry
  reviewers: PipelineSummary['reviewers']
  onView: () => void
  onReview: () => void
  onEdit: (kind: Editor['kind'], next?: PostStatus) => void
}) {
  const a = entry.application,
    e = entry.evidence
  const index = POST_STATUS_ORDER.indexOf(a.status)
  const next = POST_STATUS_ORDER[index + 1],
    previous = POST_STATUS_ORDER[index - 1]
  const isLaunch = index >= 5
  const blockers = transitionBlockers(entry, reviewers)
  const checks = applicationChecks(entry, reviewers)
  const assigned = reviewers.find((r) => r.id === a.assigned_reviewer_id)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? ''
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const overdue = a.next_action_due_date && a.next_action_due_date < today
  return (
    <article className="border border-hairline rounded-sm p-4 min-w-0">
      <h3 className="text-base font-medium break-words">{a.name}</h3>
      <p className="text-xs text-muted mt-1 break-words">
        {[a.city, a.state].filter(Boolean).join(', ')} · Submitted {a.created_at.slice(0, 10)}
      </p>
      <a href={`mailto:${a.email}`} className="text-xs text-gold break-all">
        {a.email}
      </a>
      <div className="text-xs text-muted mt-3 mb-3">
        <span className={assigned ? '' : 'text-status-attention'}>
          Reviewer: {assigned?.name ?? 'Assign a National reviewer'}
        </span>
        {a.next_action_due_date && (
          <span className={overdue ? 'block text-status-attention' : 'block'}>
            {overdue ? 'Overdue' : 'Due'}: {a.next_action_due_date}
          </span>
        )}
      </div>
      <ul className="space-y-2 text-xs">
        {checks.map((c) => (
          <li key={c.label} className="flex gap-2 items-start">
            <span className="shrink-0 mt-0.5">
              {c.done ? (
                <CheckCircle2 aria-label="Completed" size={14} className="text-status-active" />
              ) : (
                <CircleAlert aria-label="Outstanding" size={14} className="text-status-attention" />
              )}
            </span>
            <span className="break-words">{c.label}</span>
          </li>
        ))}
      </ul>
      {e.score !== null && <p className="text-xs text-muted mt-3">Recorded score average: {e.score}/10</p>}
      <div className="border-l-2 border-gold pl-3 my-4">
        <p className="eyebrow mb-1">Next action</p>
        <p className="text-sm whitespace-pre-wrap break-words">
          {a.next_action ||
            (isLaunch
              ? STAGE_GUIDES[a.status].action
              : blockers[0] ||
                (a.status === 'approved'
                  ? 'Create the forming post and hand over to its launch workspace.'
                  : `Ready to move to ${POST_STATUS_LABELS[next]}.`))}
        </p>
      </div>
      {e.latest_update && (
        <details className="text-xs text-muted mb-3">
          <summary className="cursor-pointer text-gold">
            Latest applicant update · {e.latest_update.created_at.slice(0, 10)}
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{e.latest_update.message}</p>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost text-xs" onClick={onView}>
          Review & updates
        </button>
        <button className="btn-ghost text-xs" onClick={() => onEdit('handoff')}>
          Assign / next action
        </button>
        {index < 4 && (
          <button className="btn-ghost text-xs" onClick={() => onEdit('document')}>
            Upload / replace DD214
          </button>
        )}
        {a.dd214_storage_path && (
          <button className="btn-ghost text-xs" onClick={onReview}>
            Review DD214
          </button>
        )}
        {['application_submitted', 'interview_scheduled', 'vetting', 'approved'].includes(a.status) && (
          <button className="btn-ghost text-xs" onClick={() => onEdit('interview')}>
            Schedule / record interview
          </button>
        )}
        {['vetting', 'approved'].includes(a.status) && (
          <button className="btn-ghost text-xs" onClick={() => onEdit('score')}>
            Complete scorecard
          </button>
        )}
        {isLaunch && a.post_id ? (
          <Link className="btn-gold text-xs" to={`/health/${a.post_id}`}>
            Open post workspace
          </Link>
        ) : (
          next && (
            <button
              className="btn-gold text-xs disabled:opacity-50"
              onClick={() => onEdit('transition', next)}
              disabled={blockers.length > 0}
            >
              {a.status === 'approved' ? 'Create forming post' : `Move to ${POST_STATUS_LABELS[next]}`}
            </button>
          )
        )}
        {!isLaunch && previous && !a.post_id && (
          <button className="text-xs text-muted underline" onClick={() => onEdit('transition', previous)}>
            Return to {POST_STATUS_LABELS[previous]}
          </button>
        )}
      </div>
      {!isLaunch && blockers.length > 0 && (
        <p className="text-xs text-status-attention mt-3">Before advancing: {blockers.join(' ')}</p>
      )}
      {isLaunch && !a.post_id && (
        <p role="alert" className="text-xs text-status-attention mt-3">
          This legacy application has no linked post. National must reconcile its records before launch can
          continue.
        </p>
      )}
    </article>
  )
}

function PipelineEditor({
  editor,
  reviewers,
  onClose,
  onSaved,
}: {
  editor: Editor
  reviewers: PipelineSummary['reviewers']
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const { entry, kind, next } = editor
  const a = entry.application,
    interview = entry.evidence.interview
  const [reviewer, setReviewer] = useState(a.assigned_reviewer_id ?? '')
  const [action, setAction] = useState(a.next_action ?? '')
  const [due, setDue] = useState(a.next_action_due_date ?? '')
  const [scheduled, setScheduled] = useState(
    interview?.scheduled_at ? toLocalInput(interview.scheduled_at) : ''
  )
  const [interviewer, setInterviewer] = useState(interview?.interviewer_id ?? profile?.id ?? '')
  const [notes, setNotes] = useState(kind === 'interview' ? (interview?.notes ?? '') : '')
  const [completed, setCompleted] = useState(!!interview?.completed_at)
  const [scores, setScores] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title =
    kind === 'document'
      ? 'Upload / replace DD214'
      : kind === 'handoff'
        ? 'Assign reviewer & next action'
        : kind === 'interview'
          ? 'Schedule / record interview'
          : kind === 'score'
            ? 'Complete vetting scorecard'
            : `Move to ${next ? POST_STATUS_LABELS[next] : ''}`
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      let result
      if (kind === 'document') {
        if (!profile || !file) throw new Error('Choose a service document to upload.')
        if (
          file.size > 10 * 1024 * 1024 ||
          !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)
        )
          throw new Error('Choose a PDF, PNG or JPEG under 10 MB.')
        const path = `${profile.id}/applications/${a.id}/${crypto.randomUUID()}`
        const upload = await supabase.storage
          .from('dd214-uploads')
          .upload(path, file, { contentType: file.type })
        if (upload.error) throw upload.error
        result = await supabase.rpc('cvoa_replace_application_document', {
          p_application: a.id,
          p_version: a.workflow_version,
          p_path: path,
        })
        if (result.error) {
          await supabase.storage.from('dd214-uploads').remove([path])
          throw result.error
        }
      } else if (kind === 'handoff')
        result = await supabase.rpc('cvoa_save_application_handoff', {
          p_application: a.id,
          p_version: a.workflow_version,
          p_reviewer: reviewer || null,
          p_next_action: action,
          p_due: due || null,
        })
      else if (kind === 'interview')
        result = await supabase.rpc('cvoa_record_application_interview', {
          p_application: a.id,
          p_interview: interview?.id ?? null,
          p_scheduled: new Date(scheduled).toISOString(),
          p_interviewer: interviewer,
          p_notes: notes,
          p_complete: completed,
        })
      else if (kind === 'score') {
        if (SCORE_FIELDS.some((f) => !scores[f] || Number(scores[f]) < 1 || Number(scores[f]) > 10))
          throw new Error('Enter a score from 1 to 10 for all five categories.')
        result = await supabase.from('vetting_scorecards').insert({
          application_id: a.id,
          scored_by: profile?.id,
          ...Object.fromEntries(SCORE_FIELDS.map((f) => [`${f}_score`, Number(scores[f])])),
          notes: notes.trim() || null,
        })
      } else
        result = await supabase.rpc('cvoa_move_application', {
          p_application: a.id,
          p_expected: a.status,
          p_next: next,
          p_reason: reason,
        })
      if (result.error) throw result.error
      onSaved()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : ((e as { message?: string }).message ?? 'Could not save. Your application has not been advanced.')
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`${title} — ${a.name}`}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form onSubmit={save} className="space-y-4">
        {kind === 'document' && (
          <>
            <p className="text-sm text-muted">
              The current service document will need fresh verification and sign-offs. Earlier sign-offs stay
              in the history and do not count for a different document.
            </p>
            <label className="block text-sm">
              Service document (PDF, PNG or JPEG, up to 10 MB)
              <input
                className="input-field mt-2"
                type="file"
                required
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </>
        )}
        {kind === 'handoff' && (
          <>
            <label className="block text-sm">
              Assigned reviewer
              <select
                className="input-field w-full mt-1"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
              >
                <option value="">Unassigned</option>
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Concrete next action
              <textarea
                className="input-field w-full mt-1"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                maxLength={1000}
                placeholder="Who should do what next?"
              />
            </label>
            <label className="block text-sm">
              Due date
              <input
                className="input-field w-full mt-1"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted">
              This is the staff handoff. Use Review & updates to send instructions to the applicant.
            </p>
          </>
        )}
        {kind === 'interview' && (
          <>
            <label className="block text-sm">
              Interview date and time (your local time)
              <input
                className="input-field w-full mt-1"
                required
                type="datetime-local"
                value={scheduled}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Interviewer
              <select
                required
                className="input-field w-full mt-1"
                value={interviewer}
                onChange={(e) => setInterviewer(e.target.value)}
              >
                <option value="">Choose interviewer</option>
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Interview notes
              <textarea
                className="input-field w-full mt-1"
                maxLength={5000}
                required={completed}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
              Interview has taken place; notes record the outcome
            </label>
          </>
        )}
        {kind === 'score' && (
          <>
            <p className="text-sm text-muted">
              Record the review actually performed. Every category is required; saving adds a scorecard to the
              history.
            </p>
            {SCORE_FIELDS.map((f) => (
              <label key={f} className="flex items-center justify-between text-sm gap-3">
                <span className="capitalize">{f.replaceAll('_', ' ')}</span>
                <input
                  className="input-field w-20"
                  required
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={scores[f] ?? ''}
                  onChange={(e) => setScores((s) => ({ ...s, [f]: e.target.value }))}
                />
              </label>
            ))}
            <label className="block text-sm">
              Review notes
              <textarea
                className="input-field w-full mt-1"
                maxLength={5000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </>
        )}
        {kind === 'transition' && (
          <>
            <p className="text-sm">
              {POST_STATUS_LABELS[a.status]} → {next && POST_STATUS_LABELS[next]}
            </p>
            {next === 'founding_team_building' && (
              <p className="text-sm text-muted">
                This creates and links the forming post and founding commander record together. Account
                permissions and memberships are managed separately.
              </p>
            )}
            <label className="block text-sm">
              Reason and next steps (visible to the applicant)
              <textarea
                className="input-field w-full mt-1"
                required
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-status-attention">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button className="btn-gold" disabled={busy}>
            {busy ? 'Saving…' : kind === 'transition' ? 'Confirm stage change' : 'Save'}
          </button>
          <button className="btn-ghost" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
function toLocalInput(value: string) {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
