import type { UroAttendance, UroMeeting, UroMotion } from '@/lib/types'

export interface ComplianceResult {
  level: 'fully_compliant' | 'minor_issues' | 'non_compliant'
  flags: string[]
}

const MOTIONS_REQUIRING_SECOND: string[] = ['main', 'amendment', 'reconsider']
const TWO_THIRDS_MOTION_TYPES: string[] = ['amendment', 'emergency_override']

export function voteThresholdLabel(motionType: string): string {
  if (motionType === 'emergency_override') return 'Unanimous consent recommended'
  if (TWO_THIRDS_MOTION_TYPES.includes(motionType)) return '2/3 required'
  return 'Majority required'
}

export function suggestedResult(motion: UroMotion): 'passed' | 'failed' | null {
  if (motion.votes_for == null || motion.votes_against == null) return null
  const total = motion.votes_for + motion.votes_against + (motion.votes_abstain ?? 0)
  if (total === 0) return null
  const threshold = TWO_THIRDS_MOTION_TYPES.includes(motion.motion_type) ? 2 / 3 : 0.5
  return motion.votes_for / total > threshold ? 'passed' : 'failed'
}

export function computeCompliance(meeting: UroMeeting, attendance: UroAttendance[], motions: UroMotion[]): ComplianceResult {
  const flags: string[] = []

  if (attendance.length === 0) {
    flags.push('Missing attendance record')
  }

  if (meeting.quorum_achieved === false && motions.length > 0) {
    flags.push('Motions recorded without quorum')
  }

  motions.forEach((m, i) => {
    const label = `Motion #${i + 1}`
    if (MOTIONS_REQUIRING_SECOND.includes(m.motion_type) && !m.seconded_by) {
      flags.push(`${label}: missing seconder`)
    }
    if (!m.vote_result) {
      flags.push(`${label}: missing vote result`)
    }
    if (!m.moved_by) {
      flags.push(`${label}: missing "moved by"`)
    }
  })

  if (!meeting.called_to_order_by) flags.push('Missing "called to order by"')
  if (!meeting.adjourned_by) flags.push('Missing "adjourned by"')

  const level: ComplianceResult['level'] = flags.length === 0 ? 'fully_compliant' : flags.length <= 2 ? 'minor_issues' : 'non_compliant'
  return { level, flags }
}

export function compileOfficialMinutes(
  meeting: UroMeeting,
  attendance: UroAttendance[],
  officerReports: { officer_name: string | null; position: string | null; summary: string | null; action_requested: string | null }[],
  agendaItems: { category: string; title: string; discussion_summary: string | null; action_taken: string | null }[],
  motions: UroMotion[],
  comments: { speaker: string | null; comment_summary: string | null }[]
): string {
  const lines: string[] = []
  lines.push(`${meeting.title}`)
  lines.push(`${meeting.meeting_type.toUpperCase()} MEETING — ${meeting.meeting_date}`)
  if (meeting.location) lines.push(`Location: ${meeting.location}`)
  lines.push('')

  lines.push('CALL TO ORDER')
  lines.push(`Called to order by ${meeting.called_to_order_by ?? '—'} at ${meeting.time_called_to_order ?? '—'}.`)
  if (meeting.call_to_order_notes) lines.push(meeting.call_to_order_notes)
  lines.push('')

  lines.push('ATTENDANCE')
  const present = attendance.filter((a) => a.status === 'present')
  const absent = attendance.filter((a) => a.status === 'absent')
  const excused = attendance.filter((a) => a.status === 'excused')
  const guests = attendance.filter((a) => a.status === 'guest')
  lines.push(`Present (${present.length}): ${present.map((a) => a.member_name).join(', ') || '—'}`)
  if (absent.length) lines.push(`Absent (${absent.length}): ${absent.map((a) => a.member_name).join(', ')}`)
  if (excused.length) lines.push(`Excused (${excused.length}): ${excused.map((a) => a.member_name).join(', ')}`)
  if (guests.length) lines.push(`Guests (${guests.length}): ${guests.map((a) => a.member_name).join(', ')}`)
  lines.push(`Quorum required: ${meeting.quorum_required ?? '—'} | Quorum achieved: ${meeting.quorum_achieved ? 'YES' : 'NO'}`)
  lines.push('')

  if (meeting.previous_minutes_status) {
    lines.push('APPROVAL OF PREVIOUS MINUTES')
    lines.push(`Status: ${meeting.previous_minutes_status.replaceAll('_', ' ')}`)
    if (meeting.previous_minutes_corrections) lines.push(`Corrections: ${meeting.previous_minutes_corrections}`)
    lines.push('')
  }

  if (officerReports.length > 0) {
    lines.push('OFFICER REPORTS')
    officerReports.forEach((r) => {
      lines.push(`${r.position ?? 'Officer'} (${r.officer_name ?? '—'}): ${r.summary ?? '—'}`)
      if (r.action_requested) lines.push(`  Action requested: ${r.action_requested}`)
    })
    lines.push('')
  }

  const oldBusiness = agendaItems.filter((a) => a.category === 'old_business')
  if (oldBusiness.length > 0) {
    lines.push('OLD BUSINESS')
    oldBusiness.forEach((a) => {
      lines.push(`- ${a.title}: ${a.discussion_summary ?? '—'}`)
      if (a.action_taken) lines.push(`  Action taken: ${a.action_taken}`)
    })
    lines.push('')
  }

  const newBusiness = agendaItems.filter((a) => a.category === 'new_business')
  if (newBusiness.length > 0) {
    lines.push('NEW BUSINESS')
    newBusiness.forEach((a) => {
      lines.push(`- ${a.title}: ${a.discussion_summary ?? '—'}`)
      if (a.action_taken) lines.push(`  Action taken: ${a.action_taken}`)
    })
    lines.push('')
  }

  if (motions.length > 0) {
    lines.push('MOTIONS')
    motions.forEach((m, i) => {
      lines.push(`Motion #${i + 1} (${m.motion_type}): ${m.motion_text}`)
      lines.push(`  Moved by ${m.moved_by ?? '—'}, seconded by ${m.seconded_by ?? '—'}`)
      if (m.debate_summary) lines.push(`  Debate: ${m.debate_summary}`)
      lines.push(
        `  Vote (${m.voting_method ?? '—'}): For ${m.votes_for ?? 0}, Against ${m.votes_against ?? 0}, Abstain ${m.votes_abstain ?? 0} — ${m.vote_result?.toUpperCase() ?? 'PENDING'}`
      )
    })
    lines.push('')
  }

  if (comments.length > 0) {
    lines.push('MEMBER COMMENTS')
    comments.forEach((c) => lines.push(`${c.speaker ?? 'Member'}: ${c.comment_summary ?? '—'}`))
    lines.push('')
  }

  lines.push('ADJOURNMENT')
  lines.push(`Adjourned by ${meeting.adjourned_by ?? '—'} at ${meeting.time_adjourned ?? '—'}.`)

  return lines.join('\n')
}
