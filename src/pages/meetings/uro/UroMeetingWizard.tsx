import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type {
  UroAgendaItem,
  UroAttendance,
  UroComment,
  UroMeeting,
  UroMotion,
  UroOfficerReport,
  UroSecretaryNote,
  UroSecretaryNoteType,
} from '@/lib/types'
import { computeCompliance, compileOfficialMinutes, suggestedResult, voteThresholdLabel } from './uroCompliance'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Plus, Trash2, Lock, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'

const STEPS = [
  'Setup',
  'Call to Order',
  'Attendance',
  'Previous Minutes',
  'Officer Reports',
  'Old Business',
  'New Business',
  'Motions',
  'Comments',
  'Adjournment',
]

const SECRETARY_NOTE_TYPES: { value: UroSecretaryNoteType; label: string }[] = [
  { value: 'personal_note', label: 'Personal Note' },
  { value: 'draft_observation', label: 'Draft Observation' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'follow_up', label: 'Follow-up Task' },
  { value: 'discussion_highlight', label: 'Discussion Highlight' },
  { value: 'action_item', label: 'Action Item' },
  { value: 'question', label: 'Question Needing Clarification' },
  { value: 'prep_note', label: 'Prep Note' },
]

export default function UroMeetingWizard() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [meeting, setMeeting] = useState<UroMeeting | null>(null)
  const [attendance, setAttendance] = useState<UroAttendance[]>([])
  const [officerReports, setOfficerReports] = useState<UroOfficerReport[]>([])
  const [agendaItems, setAgendaItems] = useState<UroAgendaItem[]>([])
  const [motions, setMotions] = useState<UroMotion[]>([])
  const [comments, setComments] = useState<UroComment[]>([])
  const [secretaryNotes, setSecretaryNotes] = useState<UroSecretaryNote[]>([])
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [newNoteType, setNewNoteType] = useState<UroSecretaryNoteType>('personal_note')

  async function load() {
    if (!meetingId) return
    setLoading(true)
    const [meetingRes, attendanceRes, reportsRes, agendaRes, motionsRes, commentsRes, notesRes] = await Promise.all([
      supabase.from('uro_meetings').select('*').eq('id', meetingId).single(),
      supabase.from('uro_attendance').select('*').eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('uro_officer_reports').select('*').eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('uro_agenda_items').select('*').eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('uro_motions').select('*').eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('uro_comments').select('*').eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('uro_secretary_notes').select('*').eq('meeting_id', meetingId).order('created_at', { ascending: false }),
    ])
    setMeeting(meetingRes.data as UroMeeting)
    setAttendance((attendanceRes.data ?? []) as UroAttendance[])
    setOfficerReports((reportsRes.data ?? []) as UroOfficerReport[])
    setAgendaItems((agendaRes.data ?? []) as UroAgendaItem[])
    setMotions((motionsRes.data ?? []) as UroMotion[])
    setComments((commentsRes.data ?? []) as UroComment[])
    setSecretaryNotes((notesRes.data ?? []) as UroSecretaryNote[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId])

  async function updateMeeting(patch: Partial<UroMeeting>) {
    if (!meeting) return
    setMeeting({ ...meeting, ...patch })
    await supabase.from('uro_meetings').update(patch).eq('id', meeting.id)
  }

  async function addNote() {
    if (!newNote.trim() || !meeting || !profile) return
    const { data } = await supabase
      .from('uro_secretary_notes')
      .insert({ meeting_id: meeting.id, author_id: profile.id, note_type: newNoteType, content: newNote.trim() })
      .select()
      .single()
    if (data) setSecretaryNotes((prev) => [data as UroSecretaryNote, ...prev])
    setNewNote('')
  }

  async function deleteNote(id: string) {
    setSecretaryNotes((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('uro_secretary_notes').delete().eq('id', id)
  }

  async function publish() {
    if (!meeting) return
    setPublishing(true)
    const compliance = computeCompliance(meeting, attendance, motions)
    const officialText = compileOfficialMinutes(meeting, attendance, officerReports, agendaItems, motions, comments)
    await supabase
      .from('uro_meetings')
      .update({
        status: 'published',
        compliance_level: compliance.level,
        compliance_flags: compliance.flags,
        official_minutes_text: officialText,
      })
      .eq('id', meeting.id)
    setPublishing(false)
    navigate(`/meetings/uro/${meeting.id}/view`)
  }

  if (loading || !meeting) return <p className="text-sm text-muted p-8">Loading…</p>

  const isPublished = meeting.status === 'published'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 h-full">
      {/* PUBLIC PANE — becomes the official record */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="eyebrow mb-1">Meeting Record {isPublished && '(Published)'}</div>
            <h1 className="font-display text-3xl tracking-wide">{meeting.title}</h1>
          </div>
          {isPublished && (
            <StatusBadge
              label={meeting.compliance_level ?? ''}
              tone={meeting.compliance_level === 'fully_compliant' ? 'active' : meeting.compliance_level === 'minor_issues' ? 'developing' : 'attention'}
            />
          )}
        </div>

        {/* Step nav */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => setStep(i)}
              disabled={isPublished}
              className={`shrink-0 px-3 py-1.5 text-xs font-mono uppercase tracking-wide rounded-sm border ${
                step === i ? 'border-gold text-gold' : 'border-hairline text-muted hover:text-ink'
              } disabled:opacity-50`}
            >
              {i}. {label}
            </button>
          ))}
        </div>

        <div className="panel p-5 mb-4">
          {step === 0 && <SetupStep meeting={meeting} onUpdate={updateMeeting} disabled={isPublished} />}
          {step === 1 && <CallToOrderStep meeting={meeting} onUpdate={updateMeeting} disabled={isPublished} />}
          {step === 2 && (
            <AttendanceStep
              meetingId={meeting.id}
              postId={meeting.post_id}
              attendance={attendance}
              setAttendance={setAttendance}
              meeting={meeting}
              onUpdate={updateMeeting}
              disabled={isPublished}
            />
          )}
          {step === 3 && <PreviousMinutesStep meeting={meeting} onUpdate={updateMeeting} disabled={isPublished} />}
          {step === 4 && (
            <OfficerReportsStep meetingId={meeting.id} postId={meeting.post_id} reports={officerReports} setReports={setOfficerReports} disabled={isPublished} />
          )}
          {step === 5 && (
            <AgendaStep
              category="old_business"
              title="Old Business"
              meetingId={meeting.id}
              postId={meeting.post_id}
              items={agendaItems.filter((a) => a.category === 'old_business')}
              allItems={agendaItems}
              setItems={setAgendaItems}
              disabled={isPublished}
            />
          )}
          {step === 6 && (
            <AgendaStep
              category="new_business"
              title="New Business"
              meetingId={meeting.id}
              postId={meeting.post_id}
              items={agendaItems.filter((a) => a.category === 'new_business')}
              allItems={agendaItems}
              setItems={setAgendaItems}
              disabled={isPublished}
            />
          )}
          {step === 7 && (
            <MotionManagerStep
              meetingId={meeting.id}
              postId={meeting.post_id}
              motions={motions}
              setMotions={setMotions}
              agendaItems={agendaItems}
              disabled={isPublished}
            />
          )}
          {step === 8 && (
            <CommentsStep meetingId={meeting.id} postId={meeting.post_id} comments={comments} setComments={setComments} disabled={isPublished} />
          )}
          {step === 9 && <AdjournmentStep meeting={meeting} onUpdate={updateMeeting} disabled={isPublished} />}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-ghost flex items-center gap-1 text-sm disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} className="btn-gold flex items-center gap-1">
              Next <ChevronRight size={14} />
            </button>
          ) : !isPublished ? (
            <button onClick={publish} disabled={publishing} className="btn-gold flex items-center gap-2 disabled:opacity-50">
              <CheckCircle2 size={16} /> {publishing ? 'Publishing…' : 'Publish Meeting'}
            </button>
          ) : (
            <button onClick={() => navigate(`/meetings/uro/${meeting.id}/view`)} className="btn-gold">
              View Official Record
            </button>
          )}
        </div>
      </div>

      {/* SECRETARY WORKSPACE — private, never published, never visible to
          anyone but the person who wrote it, even after this meeting is
          published. */}
      <div className="panel p-4 h-fit sticky top-6">
        <div className="eyebrow mb-1 flex items-center gap-1.5">
          <Lock size={12} /> Secretary Workspace
        </div>
        <p className="text-[11px] text-muted mb-3">
          Private to you. Never published, never visible to National or anyone else — even after this meeting
          is finalized. Nothing here transfers to the official record unless you manually type it into a
          public section yourself.
        </p>

        <div className="space-y-2 mb-3">
          <select className="input-field text-xs" value={newNoteType} onChange={(e) => setNewNoteType(e.target.value as UroSecretaryNoteType)}>
            {SECRETARY_NOTE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Jot something down…"
            className="input-field text-xs"
            rows={2}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <button onClick={addNote} className="btn-ghost w-full text-xs py-1.5">
            Add Note
          </button>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {secretaryNotes.map((n) => (
            <div key={n.id} className="border border-hairline rounded-sm p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono uppercase text-gold">{n.note_type.replaceAll('_', ' ')}</span>
                <button onClick={() => deleteNote(n.id)} className="text-muted hover:text-status-attention">
                  <Trash2 size={11} />
                </button>
              </div>
              <p className="text-xs text-ink whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
          {secretaryNotes.length === 0 && <p className="text-xs text-muted">No notes yet.</p>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function SetupStep({ meeting, onUpdate, disabled }: { meeting: UroMeeting; onUpdate: (p: Partial<UroMeeting>) => void; disabled: boolean }) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <input className="input-field" placeholder="Meeting title (e.g. July Board Meeting)" value={meeting.title} onChange={(e) => onUpdate({ title: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <select className="input-field" value={meeting.meeting_type} onChange={(e) => onUpdate({ meeting_type: e.target.value as UroMeeting['meeting_type'] })}>
          <option value="regular">Regular Meeting</option>
          <option value="special">Special Meeting</option>
          <option value="emergency">Emergency Meeting</option>
          <option value="asynchronous">Asynchronous Meeting</option>
        </select>
        <input type="date" className="input-field" value={meeting.meeting_date} onChange={(e) => onUpdate({ meeting_date: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input type="time" className="input-field" placeholder="Start time" value={meeting.start_time ?? ''} onChange={(e) => onUpdate({ start_time: e.target.value })} />
        <input type="time" className="input-field" placeholder="End time" value={meeting.end_time ?? ''} onChange={(e) => onUpdate({ end_time: e.target.value })} />
      </div>
      <input className="input-field" placeholder="Location" value={meeting.location ?? ''} onChange={(e) => onUpdate({ location: e.target.value })} />
      <input className="input-field" placeholder="Virtual link (optional)" value={meeting.virtual_link ?? ''} onChange={(e) => onUpdate({ virtual_link: e.target.value })} />
    </fieldset>
  )
}

function CallToOrderStep({ meeting, onUpdate, disabled }: { meeting: UroMeeting; onUpdate: (p: Partial<UroMeeting>) => void; disabled: boolean }) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input className="input-field" placeholder="Called to order by" value={meeting.called_to_order_by ?? ''} onChange={(e) => onUpdate({ called_to_order_by: e.target.value })} />
        <input type="time" className="input-field" value={meeting.time_called_to_order ?? ''} onChange={(e) => onUpdate({ time_called_to_order: e.target.value })} />
      </div>
      <textarea className="input-field" rows={3} placeholder="Optional notes" value={meeting.call_to_order_notes ?? ''} onChange={(e) => onUpdate({ call_to_order_notes: e.target.value })} />
    </fieldset>
  )
}

function AttendanceStep({
  meetingId,
  postId,
  attendance,
  setAttendance,
  meeting,
  onUpdate,
  disabled,
}: {
  meetingId: string
  postId: string
  attendance: UroAttendance[]
  setAttendance: (a: UroAttendance[]) => void
  meeting: UroMeeting
  onUpdate: (p: Partial<UroMeeting>) => void
  disabled: boolean
}) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<UroAttendance['status']>('present')

  async function add() {
    if (!name.trim()) return
    const { data } = await supabase
      .from('uro_attendance')
      .insert({ meeting_id: meetingId, post_id: postId, member_name: name.trim(), status, sort_order: attendance.length })
      .select()
      .single()
    if (data) setAttendance([...attendance, data as UroAttendance])
    setName('')
  }

  async function remove(id: string) {
    setAttendance(attendance.filter((a) => a.id !== id))
    await supabase.from('uro_attendance').delete().eq('id', id)
  }

  const presentCount = attendance.filter((a) => a.status === 'present').length
  const quorumRequired = meeting.quorum_required ?? (meeting.total_voting_members ? Math.ceil(meeting.total_voting_members / 2) : null)
  const quorumAchieved = quorumRequired != null ? presentCount >= quorumRequired : null

  useEffect(() => {
    if (quorumAchieved !== meeting.quorum_achieved) {
      onUpdate({ quorum_achieved: quorumAchieved, quorum_required: quorumRequired })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentCount, meeting.total_voting_members])

  return (
    <div>
      <fieldset disabled={disabled} className="mb-4">
        <input
          type="number"
          min={0}
          className="input-field mb-3"
          placeholder="Total voting members"
          value={meeting.total_voting_members ?? ''}
          onChange={(e) => onUpdate({ total_voting_members: e.target.value ? Number(e.target.value) : null })}
        />
        <div className="flex gap-2 mb-3">
          <input className="input-field" placeholder="Member name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input-field w-40 shrink-0" value={status} onChange={(e) => setStatus(e.target.value as UroAttendance['status'])}>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
            <option value="guest">Guest</option>
          </select>
          <button type="button" onClick={add} className="btn-gold px-4 shrink-0">
            <Plus size={16} />
          </button>
        </div>
      </fieldset>

      <div className="panel p-3 mb-4 bg-surface/50">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="font-display text-2xl">{meeting.total_voting_members ?? '—'}</div>
            <div className="eyebrow">Total Voting</div>
          </div>
          <div>
            <div className="font-display text-2xl text-gold">{presentCount}</div>
            <div className="eyebrow">Present</div>
          </div>
          <div>
            <div className={`font-display text-2xl ${quorumAchieved ? 'text-status-active' : 'text-status-attention'}`}>
              {quorumAchieved === null ? '—' : quorumAchieved ? 'YES' : 'NO'}
            </div>
            <div className="eyebrow">Quorum Achieved</div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {attendance.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-sm border border-hairline rounded-sm p-2">
            <span>{a.member_name}</span>
            <div className="flex items-center gap-2">
              <StatusBadge label={a.status} tone={a.status === 'present' ? 'active' : a.status === 'guest' ? 'neutral' : 'developing'} />
              {!disabled && (
                <button onClick={() => remove(a.id)} className="text-muted hover:text-status-attention">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviousMinutesStep({ meeting, onUpdate, disabled }: { meeting: UroMeeting; onUpdate: (p: Partial<UroMeeting>) => void; disabled: boolean }) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <select
        className="input-field"
        value={meeting.previous_minutes_status ?? ''}
        onChange={(e) => onUpdate({ previous_minutes_status: (e.target.value || null) as UroMeeting['previous_minutes_status'] })}
      >
        <option value="">Select status…</option>
        <option value="approved">Approved</option>
        <option value="approved_with_corrections">Approved with Corrections</option>
        <option value="rejected">Rejected</option>
      </select>
      {meeting.previous_minutes_status === 'approved_with_corrections' && (
        <textarea
          className="input-field"
          rows={2}
          placeholder="Correction notes"
          value={meeting.previous_minutes_corrections ?? ''}
          onChange={(e) => onUpdate({ previous_minutes_corrections: e.target.value })}
        />
      )}
      <select
        className="input-field"
        value={meeting.previous_minutes_vote_result ?? ''}
        onChange={(e) => onUpdate({ previous_minutes_vote_result: (e.target.value || null) as UroMeeting['previous_minutes_vote_result'] })}
      >
        <option value="">Vote result…</option>
        <option value="passed">Passed</option>
        <option value="failed">Failed</option>
      </select>
    </fieldset>
  )
}

function OfficerReportsStep({
  meetingId,
  postId,
  reports,
  setReports,
  disabled,
}: {
  meetingId: string
  postId: string
  reports: UroOfficerReport[]
  setReports: (r: UroOfficerReport[]) => void
  disabled: boolean
}) {
  async function add() {
    const { data } = await supabase
      .from('uro_officer_reports')
      .insert({ meeting_id: meetingId, post_id: postId, sort_order: reports.length })
      .select()
      .single()
    if (data) setReports([...reports, data as UroOfficerReport])
  }

  async function update(id: string, patch: Partial<UroOfficerReport>) {
    setReports(reports.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    await supabase.from('uro_officer_reports').update(patch).eq('id', id)
  }

  async function remove(id: string) {
    setReports(reports.filter((r) => r.id !== id))
    await supabase.from('uro_officer_reports').delete().eq('id', id)
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <fieldset key={r.id} disabled={disabled} className="border border-hairline rounded-sm p-3 space-y-2">
          <div className="flex justify-between gap-2">
            <div className="grid grid-cols-2 gap-2 flex-1">
              <input className="input-field" placeholder="Officer name" value={r.officer_name ?? ''} onChange={(e) => update(r.id, { officer_name: e.target.value })} />
              <input className="input-field" placeholder="Position" value={r.position ?? ''} onChange={(e) => update(r.id, { position: e.target.value })} />
            </div>
            {!disabled && (
              <button onClick={() => remove(r.id)} className="text-muted hover:text-status-attention shrink-0">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <textarea className="input-field" rows={2} placeholder="Summary" value={r.summary ?? ''} onChange={(e) => update(r.id, { summary: e.target.value })} />
          <input className="input-field" placeholder="Action requested (optional)" value={r.action_requested ?? ''} onChange={(e) => update(r.id, { action_requested: e.target.value })} />
        </fieldset>
      ))}
      {!disabled && (
        <button onClick={add} className="btn-ghost w-full flex items-center justify-center gap-2 text-sm">
          <Plus size={14} /> Add Officer Report
        </button>
      )}
    </div>
  )
}

function AgendaStep({
  category,
  title,
  meetingId,
  postId,
  items,
  allItems,
  setItems,
  disabled,
}: {
  category: 'old_business' | 'new_business'
  title: string
  meetingId: string
  postId: string
  items: UroAgendaItem[]
  allItems: UroAgendaItem[]
  setItems: (a: UroAgendaItem[]) => void
  disabled: boolean
}) {
  async function add() {
    const { data } = await supabase
      .from('uro_agenda_items')
      .insert({ meeting_id: meetingId, post_id: postId, category, title: 'Untitled item', sort_order: items.length })
      .select()
      .single()
    if (data) setItems([...allItems, data as UroAgendaItem])
  }

  async function update(id: string, patch: Partial<UroAgendaItem>) {
    setItems(allItems.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    await supabase.from('uro_agenda_items').update(patch).eq('id', id)
  }

  async function remove(id: string) {
    setItems(allItems.filter((a) => a.id !== id))
    await supabase.from('uro_agenda_items').delete().eq('id', id)
  }

  return (
    <div className="space-y-3">
      <div className="eyebrow">{title}</div>
      {items.map((item) => (
        <fieldset key={item.id} disabled={disabled} className="border border-hairline rounded-sm p-3 space-y-2">
          <div className="flex gap-2">
            <input className="input-field flex-1" placeholder="Item title" value={item.title} onChange={(e) => update(item.id, { title: e.target.value })} />
            {!disabled && (
              <button onClick={() => remove(item.id)} className="text-muted hover:text-status-attention shrink-0">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <textarea className="input-field" rows={2} placeholder="Discussion summary" value={item.discussion_summary ?? ''} onChange={(e) => update(item.id, { discussion_summary: e.target.value })} />
          <input className="input-field" placeholder="Action taken" value={item.action_taken ?? ''} onChange={(e) => update(item.id, { action_taken: e.target.value })} />
        </fieldset>
      ))}
      {!disabled && (
        <button onClick={add} className="btn-ghost w-full flex items-center justify-center gap-2 text-sm">
          <Plus size={14} /> Add {title} Item
        </button>
      )}
    </div>
  )
}

function MotionManagerStep({
  meetingId,
  postId,
  motions,
  setMotions,
  agendaItems,
  disabled,
}: {
  meetingId: string
  postId: string
  motions: UroMotion[]
  setMotions: (m: UroMotion[]) => void
  agendaItems: UroAgendaItem[]
  disabled: boolean
}) {
  async function add() {
    const { data } = await supabase
      .from('uro_motions')
      .insert({ meeting_id: meetingId, post_id: postId, motion_type: 'main', motion_text: '', sort_order: motions.length })
      .select()
      .single()
    if (data) setMotions([...motions, data as UroMotion])
  }

  async function update(id: string, patch: Partial<UroMotion>) {
    setMotions(motions.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    await supabase.from('uro_motions').update(patch).eq('id', id)
  }

  async function remove(id: string) {
    setMotions(motions.filter((m) => m.id !== id))
    await supabase.from('uro_motions').delete().eq('id', id)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Every motion becomes its own permanent, searchable record.</p>
      {motions.map((m, i) => {
        const suggestion = suggestedResult(m)
        return (
          <fieldset key={m.id} disabled={disabled} className="border border-gold/30 rounded-sm p-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-gold">Motion #{i + 1}</span>
              {!disabled && (
                <button onClick={() => remove(m.id)} className="text-muted hover:text-status-attention">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="input-field" value={m.motion_type} onChange={(e) => update(m.id, { motion_type: e.target.value as UroMotion['motion_type'] })}>
                <option value="main">Main Motion</option>
                <option value="amendment">Amendment</option>
                <option value="refer">Refer</option>
                <option value="postpone">Postpone</option>
                <option value="call_to_vote">Call to Vote</option>
                <option value="table">Table</option>
                <option value="reconsider">Reconsider</option>
                <option value="emergency_override">Emergency Override</option>
              </select>
              <select className="input-field" value={m.agenda_item_id ?? ''} onChange={(e) => update(m.id, { agenda_item_id: e.target.value || null })}>
                <option value="">Not tied to an agenda item</option>
                {agendaItems.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </div>
            <textarea className="input-field" rows={2} placeholder="Motion text" value={m.motion_text} onChange={(e) => update(m.id, { motion_text: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input-field" placeholder="Moved by" value={m.moved_by ?? ''} onChange={(e) => update(m.id, { moved_by: e.target.value })} />
              <input className="input-field" placeholder="Seconded by" value={m.seconded_by ?? ''} onChange={(e) => update(m.id, { seconded_by: e.target.value })} />
            </div>
            <textarea className="input-field" rows={2} placeholder="Debate summary" value={m.debate_summary ?? ''} onChange={(e) => update(m.id, { debate_summary: e.target.value })} />
            <input className="input-field" placeholder="Amendments (if any)" value={m.amendments ?? ''} onChange={(e) => update(m.id, { amendments: e.target.value })} />

            <div className="border-t border-hairline pt-2">
              <div className="text-[11px] font-mono text-gold uppercase mb-2">{voteThresholdLabel(m.motion_type)}</div>
              <select className="input-field mb-2" value={m.voting_method ?? ''} onChange={(e) => update(m.id, { voting_method: (e.target.value || null) as UroMotion['voting_method'] })}>
                <option value="">Voting method…</option>
                <option value="voice">Voice</option>
                <option value="show_of_hands">Show of Hands</option>
                <option value="roll_call">Roll Call</option>
                <option value="ballot">Ballot</option>
                <option value="digital">Digital</option>
              </select>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input type="number" min={0} className="input-field" placeholder="For" value={m.votes_for ?? ''} onChange={(e) => update(m.id, { votes_for: e.target.value ? Number(e.target.value) : null })} />
                <input type="number" min={0} className="input-field" placeholder="Against" value={m.votes_against ?? ''} onChange={(e) => update(m.id, { votes_against: e.target.value ? Number(e.target.value) : null })} />
                <input type="number" min={0} className="input-field" placeholder="Abstain" value={m.votes_abstain ?? ''} onChange={(e) => update(m.id, { votes_abstain: e.target.value ? Number(e.target.value) : null })} />
              </div>
              {suggestion && <p className="text-[11px] text-muted mb-2">Suggested result based on vote count: <span className="text-gold uppercase">{suggestion}</span></p>}
              <select className="input-field" value={m.vote_result ?? ''} onChange={(e) => update(m.id, { vote_result: (e.target.value || null) as UroMotion['vote_result'] })}>
                <option value="">Vote result…</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="tabled">Tabled</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>
          </fieldset>
        )
      })}
      {!disabled && (
        <button onClick={add} className="btn-gold w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Add Motion
        </button>
      )}
    </div>
  )
}

function CommentsStep({
  meetingId,
  postId,
  comments,
  setComments,
  disabled,
}: {
  meetingId: string
  postId: string
  comments: UroComment[]
  setComments: (c: UroComment[]) => void
  disabled: boolean
}) {
  async function add() {
    const { data } = await supabase
      .from('uro_comments')
      .insert({ meeting_id: meetingId, post_id: postId, sort_order: comments.length })
      .select()
      .single()
    if (data) setComments([...comments, data as UroComment])
  }

  async function update(id: string, patch: Partial<UroComment>) {
    setComments(comments.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    await supabase.from('uro_comments').update(patch).eq('id', id)
  }

  async function remove(id: string) {
    setComments(comments.filter((c) => c.id !== id))
    await supabase.from('uro_comments').delete().eq('id', id)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Optional. Summary only — not a verbatim transcript.</p>
      {comments.map((c) => (
        <fieldset key={c.id} disabled={disabled} className="border border-hairline rounded-sm p-3 space-y-2">
          <div className="flex gap-2">
            <input className="input-field flex-1" placeholder="Speaker" value={c.speaker ?? ''} onChange={(e) => update(c.id, { speaker: e.target.value })} />
            {!disabled && (
              <button onClick={() => remove(c.id)} className="text-muted hover:text-status-attention shrink-0">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <textarea className="input-field" rows={2} placeholder="Comment summary" value={c.comment_summary ?? ''} onChange={(e) => update(c.id, { comment_summary: e.target.value })} />
        </fieldset>
      ))}
      {!disabled && (
        <button onClick={add} className="btn-ghost w-full flex items-center justify-center gap-2 text-sm">
          <Plus size={14} /> Add Comment
        </button>
      )}
    </div>
  )
}

function AdjournmentStep({ meeting, onUpdate, disabled }: { meeting: UroMeeting; onUpdate: (p: Partial<UroMeeting>) => void; disabled: boolean }) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input className="input-field" placeholder="Adjourned by" value={meeting.adjourned_by ?? ''} onChange={(e) => onUpdate({ adjourned_by: e.target.value })} />
        <input type="time" className="input-field" value={meeting.time_adjourned ?? ''} onChange={(e) => onUpdate({ time_adjourned: e.target.value })} />
      </div>
      <select className="input-field" value={meeting.adjournment_vote_result ?? ''} onChange={(e) => onUpdate({ adjournment_vote_result: (e.target.value || null) as UroMeeting['adjournment_vote_result'] })}>
        <option value="">Vote result…</option>
        <option value="passed">Passed</option>
        <option value="failed">Failed</option>
      </select>
      <p className="text-xs text-muted">
        Ready to finish? Click "Publish Meeting" below to generate the official minutes and make this visible
        to National.
      </p>
    </fieldset>
  )
}
