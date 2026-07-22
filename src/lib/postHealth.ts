import type {
  AnnualReview,
  CommunityServiceEvent,
  FinancialTransaction,
  FoundingTeamMember,
  GovernanceSignature,
  Member,
  Post,
  Recruit,
  Sponsor,
} from './types'

export type DimensionStatus = 'green' | 'yellow' | 'red' | 'neutral'

export interface HealthDimension {
  key: string
  label: string
  status: DimensionStatus
  detail: string
}

export interface PostHealthResult {
  overall: 'green' | 'yellow' | 'red'
  score: number
  dimensions: HealthDimension[]
}

const REQUIRED_POSITIONS = ['commander', 'vice_commander', 'adjutant', 'quartermaster', 'sergeant_at_arms']

function daysAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 86400000
}

export interface PostHealthInputs {
  post: Post
  foundingTeam: FoundingTeamMember[]
  sponsors: Sponsor[]
  meetingDates: string[]
  recruits: Recruit[]
  members: Member[]
  hasDelegate: boolean
  delegateVotesCast: number
  governanceSignatures: GovernanceSignature[]
  annualReview: AnnualReview | null
  communityServiceEvents: CommunityServiceEvent[]
  financialTransactions: FinancialTransaction[]
}

export function computePostHealth(inputs: PostHealthInputs): PostHealthResult {
  const {
    post,
    foundingTeam,
    sponsors,
    meetingDates,
    recruits,
    members,
    hasDelegate,
    delegateVotesCast,
    governanceSignatures,
    annualReview,
    communityServiceEvents,
    financialTransactions,
  } = inputs

  const postAgeDays = post.charter_date ? daysAgo(post.charter_date) : daysAgo(post.created_at)
  const isNewPost = postAgeDays < 180

  const dimensions: HealthDimension[] = []

  // 1. Officer completeness
  const filledPositions = new Set(foundingTeam.map((m) => m.position))
  const filledCount = REQUIRED_POSITIONS.filter((p) => filledPositions.has(p as any)).length
  dimensions.push({
    key: 'officers',
    label: 'Officer Positions',
    status: filledCount === 5 ? 'green' : filledCount >= 3 ? 'yellow' : 'red',
    detail: `${filledCount}/5 required positions filled`,
  })

  // 2. Sponsor concentration
  const wonSponsors = sponsors.filter((s) => s.stage === 'won')
  const totalRevenue = wonSponsors.reduce((sum, s) => sum + Number(s.sponsorship_value), 0)
  if (wonSponsors.length === 0) {
    dimensions.push({ key: 'sponsors', label: 'Sponsor Diversification', status: 'neutral', detail: 'No closed sponsors yet' })
  } else {
    const topValue = Math.max(...wonSponsors.map((s) => Number(s.sponsorship_value)))
    const concentration = totalRevenue > 0 ? topValue / totalRevenue : 0
    dimensions.push({
      key: 'sponsors',
      label: 'Sponsor Diversification',
      status: concentration <= 0.5 ? 'green' : concentration <= 0.8 ? 'yellow' : 'red',
      detail: `Top sponsor is ${Math.round(concentration * 100)}% of $${totalRevenue.toLocaleString()} raised`,
    })
  }

  // 3. Meeting compliance
  const lastMeeting = meetingDates.sort().slice(-1)[0] ?? null
  const meetingStatus: DimensionStatus = !lastMeeting ? 'red' : daysAgo(lastMeeting) <= 30 ? 'green' : daysAgo(lastMeeting) <= 60 ? 'yellow' : 'red'
  dimensions.push({
    key: 'meetings',
    label: 'Meeting Compliance',
    status: meetingStatus,
    detail: lastMeeting ? `Last minutes submitted ${Math.round(daysAgo(lastMeeting))} days ago` : 'No minutes ever submitted',
  })

  // 4. Membership — now sourced from the real Membership Roster instead of
  // a Recruiting Engine proxy. Softened for young posts, since a 6-month
  // post shouldn't be judged on the same curve as a 5-year post.
  const activeMembers = members.filter((m) => m.membership_status === 'active')
  const newMembers90d = activeMembers.filter((m) => m.joined_at && daysAgo(m.joined_at) <= 90).length
  let membershipStatus: DimensionStatus = activeMembers.length >= 25 ? 'green' : activeMembers.length >= 10 ? 'yellow' : 'red'
  if (isNewPost && membershipStatus === 'red') membershipStatus = 'yellow'
  dimensions.push({
    key: 'membership',
    label: 'Membership',
    status: membershipStatus,
    detail: `${activeMembers.length} active members${newMembers90d > 0 ? ` (+${newMembers90d} in last 90 days)` : ''}`,
  })

  // 5. Congress participation
  dimensions.push({
    key: 'congress',
    label: 'Congress Participation',
    status: !hasDelegate ? 'red' : delegateVotesCast === 0 ? 'yellow' : 'green',
    detail: !hasDelegate ? 'No delegate assigned' : `Delegate has cast ${delegateVotesCast} vote${delegateVotesCast !== 1 ? 's' : ''}`,
  })

  // 6. Governance sign-offs — do current officers have both forms on file,
  // signed within the last year
  const currentOfficers = foundingTeam.filter((m) => REQUIRED_POSITIONS.includes(m.position))
  if (currentOfficers.length === 0) {
    dimensions.push({ key: 'governance', label: 'Governance Sign-offs', status: 'neutral', detail: 'No officers on file yet' })
  } else {
    const validSigs = governanceSignatures.filter((s) => daysAgo(s.signed_at) <= 365)
    const neededPairs = currentOfficers.length * 2
    let foundPairs = 0
    for (const officer of currentOfficers) {
      for (const formType of ['conflict_of_interest', 'officer_acknowledgment'] as const) {
        if (validSigs.some((s) => s.signer_name === officer.name && s.form_type === formType)) foundPairs++
      }
    }
    const pct = neededPairs > 0 ? foundPairs / neededPairs : 0
    dimensions.push({
      key: 'governance',
      label: 'Governance Sign-offs',
      status: pct >= 0.9 ? 'green' : pct >= 0.5 ? 'yellow' : 'red',
      detail: `${foundPairs}/${neededPairs} required signatures current`,
    })
  }

  // 7. Annual Review
  const currentYear = new Date().getFullYear()
  if (isNewPost && (!annualReview || annualReview.review_year !== currentYear)) {
    dimensions.push({ key: 'annual_review', label: 'Annual Review', status: 'neutral', detail: 'Not due yet — post is under 6 months old' })
  } else if (!annualReview || annualReview.review_year !== currentYear) {
    dimensions.push({ key: 'annual_review', label: 'Annual Review', status: 'red', detail: `${currentYear} annual review not started` })
  } else if (annualReview.completed_at) {
    dimensions.push({ key: 'annual_review', label: 'Annual Review', status: 'green', detail: `${currentYear} annual review completed` })
  } else {
    const itemsDone = [
      annualReview.bylaws_reviewed,
      annualReview.financial_audit_complete,
      annualReview.officer_roster_current,
      annualReview.required_filings_current,
    ].filter(Boolean).length
    dimensions.push({ key: 'annual_review', label: 'Annual Review', status: 'yellow', detail: `${itemsDone}/4 items complete` })
  }

  // 8. Community service
  if (communityServiceEvents.length === 0 && isNewPost) {
    dimensions.push({ key: 'community_service', label: 'Community Service', status: 'neutral', detail: 'No events logged yet' })
  } else {
    const lastEvent = [...communityServiceEvents].sort((a, b) => b.event_date.localeCompare(a.event_date))[0]
    const status: DimensionStatus = !lastEvent ? 'red' : daysAgo(lastEvent.event_date) <= 90 ? 'green' : daysAgo(lastEvent.event_date) <= 180 ? 'yellow' : 'red'
    dimensions.push({
      key: 'community_service',
      label: 'Community Service',
      status,
      detail: lastEvent ? `Last event ${Math.round(daysAgo(lastEvent.event_date))} days ago` : 'No events ever logged',
    })
  }

  // 9. Financial health
  if (financialTransactions.length === 0) {
    dimensions.push({ key: 'financial', label: 'Financial Health', status: 'neutral', detail: 'No transactions logged yet' })
  } else {
    const income = financialTransactions.filter((t) => t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const expense = financialTransactions.filter((t) => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const balance = income - expense
    dimensions.push({
      key: 'financial',
      label: 'Financial Health',
      status: balance >= 0 ? 'green' : 'red',
      detail: `Balance: $${balance.toLocaleString()} (${'$' + income.toLocaleString()} in / ${'$' + expense.toLocaleString()} out)`,
    })
  }

  const scored = dimensions.filter((d) => d.status !== 'neutral')
  const points = { green: 100, yellow: 50, red: 0 } as const
  const score = scored.length > 0 ? Math.round(scored.reduce((sum, d) => sum + points[d.status as 'green' | 'yellow' | 'red'], 0) / scored.length) : 50

  const overall: 'green' | 'yellow' | 'red' = score >= 75 ? 'green' : score >= 40 ? 'yellow' : 'red'

  return { overall, score, dimensions }
}
