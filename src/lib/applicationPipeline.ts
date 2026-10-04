import type { PostApplication, PostStatus } from './types'

export interface PipelineApplication extends PostApplication {
  assigned_reviewer_id: string | null
  next_action: string | null
  next_action_due_date: string | null
  workflow_version: number
}
export interface PipelineEvidence {
  score: number | null
  complete_scorecards: number
  signed_reviewers: string[]
  completed_interviews: number
  interview: {
    id: string
    scheduled_at: string
    interviewer_id: string
    notes: string | null
    completed_at: string | null
  } | null
  post_status: PostStatus | null
  team_verified: number
  founding_team_ready: boolean
  checklist_total: number
  checklist_complete: number
  latest_update: { kind: string; message: string; created_at: string } | null
}
export interface PipelineEntry {
  application: PipelineApplication
  evidence: PipelineEvidence
}
export interface PipelineSummary {
  reviewers: { id: string; name: string }[]
  applications: PipelineEntry[]
}
export const STAGE_GUIDES: Record<PostStatus, { goal: string; owner: string; action: string }> = {
  new_inquiry: {
    goal: 'Confirm the applicant and location, collect their service document, and assign a reviewer.',
    owner: 'Intake reviewer',
    action: 'Review intake details and record the application as submitted.',
  },
  application_submitted: {
    goal: 'Verify the DD214 and arrange an interview with a National reviewer.',
    owner: 'Assigned reviewer',
    action: 'Review the document, then use Schedule / record interview.',
  },
  interview_scheduled: {
    goal: 'Conduct the interview and record what was learned and any follow-up.',
    owner: 'Interviewing reviewer',
    action: 'Record a past interview date and notes, mark it completed, then move to vetting.',
  },
  vetting: {
    goal: 'Complete the five-category scorecard and collect all current National reviewers’ sign-offs.',
    owner: 'National reviewers',
    action: 'Complete the scorecard. Open Review & updates to sign off or request more information.',
  },
  approved: {
    goal: 'Create the forming post and its founding commander record together.',
    owner: 'Assigned reviewer',
    action: 'Create forming post. Then open its workspace to assemble the rest of the team.',
  },
  founding_team_building: {
    goal: 'Build and verify the founding team and work through the post launch checklist.',
    owner: 'Founding team and National',
    action: 'Open post workspace for invitations, verification and the launch checklist.',
  },
  charter_ready: {
    goal: 'Review the launch evidence and record the authorized charter decision.',
    owner: 'National',
    action:
      'Open post workspace. Complete the organization’s charter process before marking the post active.',
  },
  active_post: {
    goal: 'Hand the post over to its ongoing membership, meetings and operations workspace.',
    owner: 'Post staff',
    action: 'Open post workspace to begin regular operations.',
  },
}
export function signedCount(entry: PipelineEntry, reviewers: PipelineSummary['reviewers']) {
  return reviewers.filter((r) => entry.evidence.signed_reviewers.includes(r.id)).length
}
export function transitionBlockers(entry: PipelineEntry, reviewers: PipelineSummary['reviewers']): string[] {
  const a = entry.application,
    e = entry.evidence
  const blockers: string[] = []
  if (!a.dd214_storage_path) blockers.push('Upload the DD214 using Upload / replace DD214.')
  if (a.status !== 'new_inquiry' && a.dd214_review_status !== 'verified') blockers.push('Verify the DD214.')
  if (a.status === 'application_submitted' && !e.interview?.scheduled_at)
    blockers.push('Schedule an interview.')
  if (['interview_scheduled', 'vetting', 'approved'].includes(a.status) && e.completed_interviews === 0)
    blockers.push('Record a completed interview with notes.')
  if (['vetting', 'approved'].includes(a.status)) {
    if (e.complete_scorecards === 0) blockers.push('Complete all five scorecard categories.')
    if (!reviewers.length || signedCount(entry, reviewers) !== reviewers.length)
      blockers.push('Collect every current National reviewer’s sign-off.')
  }
  return blockers
}
export function applicationChecks(entry: PipelineEntry, reviewers: PipelineSummary['reviewers']) {
  const a = entry.application,
    e = entry.evidence
  const checks = [
    { label: 'Applicant contact and state recorded', done: !!(a.name && a.email && a.state) },
    { label: 'DD214 uploaded', done: !!a.dd214_storage_path },
  ]
  if (a.status !== 'new_inquiry')
    checks.push({
      label: 'DD214 verified',
      done: !!a.dd214_storage_path && a.dd214_review_status === 'verified',
    })
  if (['application_submitted', 'interview_scheduled', 'vetting', 'approved'].includes(a.status))
    checks.push({ label: 'Interview scheduled', done: !!e.interview?.scheduled_at })
  if (['interview_scheduled', 'vetting', 'approved'].includes(a.status))
    checks.push({ label: 'Interview completed with notes', done: e.completed_interviews > 0 })
  if (['vetting', 'approved'].includes(a.status))
    checks.push(
      { label: 'Five-category scorecard completed', done: e.complete_scorecards > 0 },
      {
        label: `National sign-offs: ${signedCount(entry, reviewers)}/${reviewers.length}`,
        done: reviewers.length > 0 && signedCount(entry, reviewers) === reviewers.length,
      }
    )
  if (['approved', 'founding_team_building', 'charter_ready', 'active_post'].includes(a.status))
    checks.push({ label: 'Forming post linked', done: !!a.post_id && !!e.post_status })
  if (['founding_team_building', 'charter_ready', 'active_post'].includes(a.status))
    checks.push(
      {
        label: `Required founding positions verified (${e.team_verified} verified people)`,
        done: e.founding_team_ready,
      },
      {
        label: `Recorded launch checklist: ${e.checklist_complete}/${e.checklist_total}`,
        done: e.checklist_total > 0 && e.checklist_complete === e.checklist_total,
      }
    )
  if (a.status === 'active_post')
    checks.push({ label: 'Linked post marked active', done: e.post_status === 'active_post' })
  return checks
}
