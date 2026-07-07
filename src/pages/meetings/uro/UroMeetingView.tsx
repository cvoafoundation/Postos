import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { UroActionItem, UroAttendance, UroMeeting, UroMotion } from '@/lib/types'
import { AlertTriangle, CheckSquare, Square } from 'lucide-react'
import { format } from 'date-fns'

export default function UroMeetingView() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const [meeting, setMeeting] = useState<UroMeeting | null>(null)
  const [attendance, setAttendance] = useState<UroAttendance[]>([])
  const [motions, setMotions] = useState<UroMotion[]>([])
  const [actionItems, setActionItems] = useState<UroActionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!meetingId) return
    Promise.all([
      supabase.from('uro_meetings').select('*').eq('id', meetingId).single(),
      supabase.from('uro_attendance').select('*').eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('uro_motions').select('*').eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('uro_action_items').select('*').eq('meeting_id', meetingId).order('created_at'),
    ]).then(([m, a, mo, ai]) => {
      setMeeting(m.data as UroMeeting)
      setAttendance((a.data ?? []) as UroAttendance[])
      setMotions((mo.data ?? []) as UroMotion[])
      setActionItems((ai.data ?? []) as UroActionItem[])
      setLoading(false)
    })
  }, [meetingId])

  if (loading || !meeting) return <p className="text-sm text-muted p-8">Loading…</p>

  const tone = meeting.compliance_level === 'fully_compliant' ? 'active' : meeting.compliance_level === 'minor_issues' ? 'developing' : 'attention'

  return (
    <div>
      <button onClick={() => navigate('/meetings')} className="text-xs font-mono text-muted hover:text-gold mb-4">
        ← Back to Meetings
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="eyebrow mb-1">
            {meeting.meeting_type.toUpperCase()} MEETING · {format(new Date(meeting.meeting_date), 'MMM d, yyyy')}
          </div>
          <h1 className="font-display text-3xl tracking-wide">{meeting.title}</h1>
        </div>
        {meeting.compliance_level && <StatusBadge label={meeting.compliance_level.replaceAll('_', ' ')} tone={tone} />}
      </div>

      {meeting.compliance_flags && meeting.compliance_flags.length > 0 && (
        <div className="panel p-4 mb-6 border-status-attention/40">
          <div className="eyebrow mb-2 flex items-center gap-1.5 text-status-attention">
            <AlertTriangle size={12} /> Compliance Flags
          </div>
          <ul className="text-sm text-muted list-disc list-inside space-y-0.5">
            {meeting.compliance_flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel p-5 mb-6">
        <pre className="text-sm text-ink whitespace-pre-wrap font-sans">{meeting.official_minutes_text}</pre>
      </div>

      {motions.length > 0 && (
        <div className="panel p-5">
          <div className="eyebrow mb-3">Motion Register</div>
          <div className="space-y-2">
            {motions.map((m, i) => (
              <div key={m.id} className="flex items-center justify-between border border-hairline rounded-sm p-2.5 text-sm">
                <div>
                  <span className="font-mono text-xs text-gold mr-2">#{i + 1}</span>
                  {m.motion_text}
                </div>
                <StatusBadge
                  label={m.vote_result ?? 'pending'}
                  tone={m.vote_result === 'passed' ? 'active' : m.vote_result === 'failed' ? 'attention' : 'developing'}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {actionItems.length > 0 && (
        <div className="panel p-5 mt-6">
          <div className="eyebrow mb-3">Action Items</div>
          <div className="space-y-1.5">
            {actionItems.map((item) => (
              <button
                key={item.id}
                onClick={async () => {
                  const next = item.status === 'done' ? 'open' : 'done'
                  setActionItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, status: next } : a)))
                  await supabase.from('uro_action_items').update({ status: next }).eq('id', item.id)
                }}
                className="w-full flex items-center justify-between border border-hairline rounded-sm p-2.5 text-left text-sm hover:border-gold"
              >
                <div className="flex items-center gap-2">
                  {item.status === 'done' ? <CheckSquare size={15} className="text-status-active" /> : <Square size={15} className="text-muted" />}
                  <span className={item.status === 'done' ? 'text-muted line-through' : ''}>{item.description}</span>
                </div>
                <span className="text-xs text-muted font-mono">
                  {item.owner_name ?? 'Unassigned'} {item.due_date ? `· due ${item.due_date}` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-muted font-mono">
        Attendance: {attendance.filter((a) => a.status === 'present').length} present of {meeting.total_voting_members ?? '—'} voting
        members · Quorum {meeting.quorum_achieved ? 'achieved' : 'not achieved'}
      </div>
    </div>
  )
}
