export type UserRole =
  | 'national_commander'
  | 'national_staff'
  | 'state_commander'
  | 'post_commander'
  | 'post_officer'
  | 'member'
  | 'delegate'
  | 'guest_applicant'

export type PostStatus =
  | 'new_inquiry'
  | 'application_submitted'
  | 'interview_scheduled'
  | 'vetting'
  | 'approved'
  | 'founding_team_building'
  | 'charter_ready'
  | 'active_post'

export const POST_STATUS_ORDER: PostStatus[] = [
  'new_inquiry',
  'application_submitted',
  'interview_scheduled',
  'vetting',
  'approved',
  'founding_team_building',
  'charter_ready',
  'active_post',
]

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  new_inquiry: 'New Inquiry',
  application_submitted: 'Application Submitted',
  interview_scheduled: 'Interview Scheduled',
  vetting: 'Vetting',
  approved: 'Approved',
  founding_team_building: 'Founding Team Building',
  charter_ready: 'Charter Ready',
  active_post: 'Active Post',
}

export type PostHealthStatus = 'green' | 'yellow' | 'red'

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: UserRole
  post_id: string | null
  state: string | null
  created_at: string
}

export interface Post {
  id: string
  name: string
  city: string | null
  state: string
  status: PostStatus
  health_status: PostHealthStatus
  lat: number | null
  lng: number | null
  charter_date: string | null
  created_at: string
  updated_at: string
}

export interface PostApplication {
  id: string
  post_id: string | null
  name: string
  email: string
  phone: string | null
  city: string | null
  state: string
  military_branch: string | null
  years_served: number | null
  combat_service: boolean
  leadership_experience: string | null
  existing_veteran_network: string | null
  estimated_membership_potential: number | null
  motivation: string | null
  status: PostStatus
  dd214_storage_path: string | null
  dd214_uploaded_at: string | null
  dd214_review_status: 'pending' | 'verified' | 'rejected'
  dd214_reviewed_by: string | null
  dd214_reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type SponsorStage =
  | 'identified'
  | 'contacted'
  | 'meeting_scheduled'
  | 'proposal_sent'
  | 'won'
  | 'lost'

export interface Sponsor {
  id: string
  post_id: string | null
  company: string
  contact_name: string | null
  email: string | null
  phone: string | null
  sponsorship_value: number
  stage: SponsorStage
  notes: string | null
  tier_id: string | null
  agreement_start_date: string | null
  agreement_end_date: string | null
  agreement_storage_path: string | null
  created_at: string
  updated_at: string
}

export interface SponsorTier {
  id: string
  name: string
  min_value: number
  benefits: string[] | null
  sort_order: number
  created_at: string
}

export interface SponsorNote {
  id: string
  sponsor_id: string
  author_id: string | null
  note: string
  created_at: string
}

export type RecruitStage =
  | 'prospect'
  | 'interested'
  | 'attended_meeting'
  | 'applied'
  | 'member'
  | 'leader'
  | 'officer'
  | 'commander'

export interface Recruit {
  id: string
  post_id: string
  name: string
  email: string | null
  phone: string | null
  stage: RecruitStage
  source: string | null
  created_at: string
  updated_at: string
}

export interface ToolkitCategory {
  id: string
  name: string
  description: string | null
  sort_order: number
  created_at: string
}

export interface ToolkitItem {
  id: string
  category_id: string
  title: string
  sub_items: string[] | null
  description: string | null
  read_content: string | null
  file_storage_path: string | null
  generate_prompt_template: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MeetingRecord {
  id: string
  post_id: string
  title: string
  meeting_type: string
  meeting_date: string
  minutes_text: string
  attachment_storage_path: string | null
  submitted_by: string | null
  created_at: string
}

export interface ToolkitGeneratedDocument {
  id: string
  toolkit_item_id: string
  post_id: string | null
  title: string
  content: string
  generated_by: string | null
  created_at: string
}

export interface ChecklistItem {
  id: string
  post_id: string
  category: 'Administration' | 'Membership' | 'Operations' | 'Facility' | string
  label: string
  is_complete: boolean
  completed_at: string | null
  auto_tracked: boolean
  created_at: string
}

export interface FoundingTeamMember {
  id: string
  post_id: string
  name: string
  email: string | null
  phone: string | null
  position: 'commander' | 'vice_commander' | 'adjutant' | 'quartermaster' | 'sergeant_at_arms' | 'member'
  combat_status: string | null
  verification_status: 'pending' | 'verified' | 'rejected'
  dd214_reviewed: boolean
  combat_service_verified: boolean
  membership_approved: boolean
  proposed_site_location: string | null
  funding_commitment: string | null
  dd214_storage_path: string | null
  created_at: string
}

export type ResolutionStatus =
  | 'draft'
  | 'under_review'
  | 'committee_review'
  | 'discussion'
  | 'voting'
  | 'passed'
  | 'rejected'
  | 'implemented'
  | 'archived'

export const RESOLUTION_STATUS_ORDER: ResolutionStatus[] = [
  'draft',
  'under_review',
  'committee_review',
  'discussion',
  'voting',
  'passed',
  'implemented',
]

export const RESOLUTION_STATUS_LABELS: Record<ResolutionStatus, string> = {
  draft: 'Draft',
  under_review: 'Under Review',
  committee_review: 'Committee',
  discussion: 'Discussion',
  voting: 'Voting',
  passed: 'Passed',
  rejected: 'Rejected',
  implemented: 'Implemented',
  archived: 'Archived',
}

export type ResolutionCategory =
  | 'membership'
  | 'governance'
  | 'budget'
  | 'legislative_affairs'
  | 'national_policy'
  | 'bylaws'
  | 'constitution'
  | 'expansion'
  | 'programs'
  | 'veterans_benefits'
  | 'other'

export const RESOLUTION_CATEGORIES: ResolutionCategory[] = [
  'membership',
  'governance',
  'budget',
  'legislative_affairs',
  'national_policy',
  'bylaws',
  'constitution',
  'expansion',
  'programs',
  'veterans_benefits',
  'other',
]

export type CongressVoteType = 'informal_poll' | 'delegate_vote' | 'constitutional_amendment' | 'national_referendum'

export const VOTE_TYPE_LABELS: Record<CongressVoteType, string> = {
  informal_poll: 'Informal Poll (non-binding)',
  delegate_vote: 'Delegate Vote (binding)',
  constitutional_amendment: 'Constitutional Amendment (supermajority)',
  national_referendum: 'National Referendum',
}

export type DebateResponseType = 'support' | 'oppose' | 'question' | 'amendment' | 'clarification'

export type CommitteeRecommendation = 'approve' | 'reject' | 'request_revisions'

export type LegislativeBillStatus = 'monitoring' | 'active' | 'passed' | 'failed' | 'stalled'

export type CalendarEventType = 'hearing' | 'vote' | 'deadline' | 'committee_meeting' | 'national_meeting' | 'session'

export interface Resolution {
  id: string
  resolution_number: string | null
  submitted_by: string | null
  post_id: string | null
  title: string
  category: ResolutionCategory
  executive_summary: string | null
  body: string
  purpose: string | null
  financial_impact_cost: number | null
  financial_impact_funding_source: string | null
  financial_impact_revenue_note: string | null
  organizational_impact: string | null
  status: ResolutionStatus
  vote_type: CongressVoteType | null
  supermajority_threshold: number | null
  voting_opens_at: string | null
  voting_closes_at: string | null
  created_at: string
  updated_at: string
}

export interface ResolutionCoSponsor {
  id: string
  resolution_id: string
  profile_id: string | null
  created_at: string
}

export interface ResolutionAmendment {
  id: string
  resolution_id: string
  amended_by: string | null
  amendment_summary: string
  previous_body: string
  new_body: string
  created_at: string
}

export interface ResolutionDocument {
  id: string
  resolution_id: string
  title: string
  storage_path: string
  uploaded_by: string | null
  created_at: string
}

export interface ResolutionComment {
  id: string
  resolution_id: string
  parent_comment_id: string | null
  author_id: string | null
  response_type: DebateResponseType
  body: string
  created_at: string
}

export interface ResolutionVote {
  id: string
  resolution_id: string
  vote_type: CongressVoteType
  voter_id: string | null
  voter_post_id: string | null
  vote: boolean
  created_at: string
}

export interface Committee {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface CommitteeMember {
  id: string
  committee_id: string
  profile_id: string | null
  is_chair: boolean
  created_at: string
}

export interface CommitteeReview {
  id: string
  resolution_id: string
  committee_id: string
  recommendation: CommitteeRecommendation
  notes: string | null
  reviewed_by: string | null
  created_at: string
}

export interface LegislativeBill {
  id: string
  bill_number: string | null
  title: string
  level: string
  jurisdiction: string | null
  summary: string | null
  status: LegislativeBillStatus
  cvoa_position: string | null
  impact_analysis: string | null
  created_at: string
  updated_at: string
}

export interface CongressAnnouncement {
  id: string
  title: string
  body: string
  category: string
  published_by: string | null
  created_at: string
}

export interface CongressCalendarEvent {
  id: string
  title: string
  event_type: CalendarEventType
  event_date: string
  description: string | null
  resolution_id: string | null
  created_at: string
}

export interface CongressDelegate {
  id: string
  post_id: string
  profile_id: string | null
  is_alternate: boolean
  term_start: string | null
  term_end: string | null
  created_at: string
}

export interface ActivityFeedItem {
  id: string
  event_type: string
  post_id: string | null
  actor_id: string | null
  summary: string
  created_at: string
}
