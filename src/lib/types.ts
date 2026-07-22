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

export type UroMeetingType = 'regular' | 'special' | 'emergency' | 'asynchronous'
export type UroMeetingStatus = 'in_progress' | 'published'
export type UroAttendanceStatus = 'present' | 'absent' | 'excused' | 'guest'
export type UroPreviousMinutesStatus = 'approved' | 'approved_with_corrections' | 'rejected'
export type UroAgendaCategory = 'old_business' | 'new_business'
export type UroMotionType =
  | 'main' | 'amendment' | 'refer' | 'postpone' | 'call_to_vote' | 'table' | 'reconsider' | 'emergency_override'
export type UroVotingMethod = 'voice' | 'show_of_hands' | 'roll_call' | 'ballot' | 'digital'
export type UroVoteResult = 'passed' | 'failed' | 'tabled' | 'withdrawn'
export type UroComplianceLevel = 'fully_compliant' | 'minor_issues' | 'non_compliant'
export type UroActionItemStatus = 'open' | 'done'
export type UroSecretaryNoteType =
  | 'personal_note' | 'draft_observation' | 'reminder' | 'follow_up'
  | 'discussion_highlight' | 'action_item' | 'question' | 'prep_note'

export interface UroMeeting {
  id: string
  post_id: string
  title: string
  meeting_type: UroMeetingType
  meeting_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  virtual_link: string | null
  called_to_order_by: string | null
  time_called_to_order: string | null
  call_to_order_notes: string | null
  total_voting_members: number | null
  quorum_required: number | null
  quorum_achieved: boolean | null
  previous_minutes_status: UroPreviousMinutesStatus | null
  previous_minutes_corrections: string | null
  previous_minutes_vote_result: UroVoteResult | null
  adjourned_by: string | null
  time_adjourned: string | null
  adjournment_vote_result: UroVoteResult | null
  status: UroMeetingStatus
  compliance_level: UroComplianceLevel | null
  compliance_flags: string[] | null
  official_minutes_text: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UroAttendance {
  id: string
  meeting_id: string
  post_id: string
  member_name: string
  status: UroAttendanceStatus
  sort_order: number
}

export interface UroOfficerReport {
  id: string
  meeting_id: string
  post_id: string
  officer_name: string | null
  position: string | null
  summary: string | null
  action_requested: string | null
  sort_order: number
}

export interface UroAgendaItem {
  id: string
  meeting_id: string
  post_id: string
  category: UroAgendaCategory
  title: string
  discussion_summary: string | null
  action_taken: string | null
  sort_order: number
}

export interface UroMotion {
  id: string
  meeting_id: string
  post_id: string
  agenda_item_id: string | null
  motion_type: UroMotionType
  motion_text: string
  moved_by: string | null
  seconded_by: string | null
  debate_summary: string | null
  amendments: string | null
  voting_method: UroVotingMethod | null
  vote_result: UroVoteResult | null
  votes_for: number | null
  votes_against: number | null
  votes_abstain: number | null
  sort_order: number
  created_at: string
}

export interface UroComment {
  id: string
  meeting_id: string
  post_id: string
  speaker: string | null
  comment_summary: string | null
  sort_order: number
}

export interface UroActionItem {
  id: string
  meeting_id: string
  post_id: string
  motion_id: string | null
  description: string
  owner_name: string | null
  due_date: string | null
  status: UroActionItemStatus
  created_at: string
}

export interface UroSecretaryNote {
  id: string
  meeting_id: string
  author_id: string
  note_type: UroSecretaryNoteType
  content: string
  created_at: string
}

export type MembershipType = 'annual' | 'lifetime'
export type MembershipStatus = 'active' | 'lapsed' | 'pending_payment'
export type MembershipPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface Member {
  id: string
  post_id: string | null
  membership_number: string | null
  full_name: string
  email: string | null
  phone: string | null
  address: string | null
  state: string | null
  military_branch: string | null
  membership_type: MembershipType
  membership_status: MembershipStatus
  joined_at: string | null
  expires_at: string | null
  dd214_storage_path: string | null
  dd214_review_status: 'pending' | 'verified' | 'rejected'
  dd214_reviewed_by: string | null
  dd214_reviewed_at: string | null
  auto_renew: boolean
  stripe_subscription_id: string | null
  profile_id: string | null
  created_at: string
  updated_at: string
}

export interface MembershipPayment {
  id: string
  member_id: string | null
  post_id: string | null
  membership_type: MembershipType
  amount: number
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  status: MembershipPaymentStatus
  paid_at: string | null
  created_at: string
}

export const MEMBERSHIP_PRICES: Record<MembershipType, number> = {
  annual: 49.99,
  lifetime: 499.99,
}

export interface PendingProfileSignup {
  id: string
  email: string
  full_name: string
  post_id: string | null
  role: UserRole
  created_at: string
}

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

export interface ApplicationSignoff {
  id: string
  application_id: string
  profile_id: string
  signed_at: string
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
  category: string | null
  created_at: string
  updated_at: string
}

export type SponsorPaymentMethod = 'cash' | 'check' | 'wire' | 'card' | 'other'

export interface SponsorPayment {
  id: string
  post_id: string | null
  sponsor_id: string | null
  donor_name: string | null
  amount: number
  payment_method: SponsorPaymentMethod
  payment_date: string
  notes: string | null
  recorded_by: string | null
  created_at: string
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

export type GovernanceFormType = 'conflict_of_interest' | 'officer_acknowledgment'
export type LedgerTransactionType = 'income' | 'expense'

export interface GovernanceSignature {
  id: string
  post_id: string
  profile_id: string | null
  signer_name: string
  form_type: GovernanceFormType
  signed_at: string
  document_storage_path: string | null
  recorded_by: string | null
  created_at: string
}

export interface AnnualReview {
  id: string
  post_id: string
  review_year: number
  bylaws_reviewed: boolean
  financial_audit_complete: boolean
  officer_roster_current: boolean
  required_filings_current: boolean
  completed_at: string | null
  reviewed_by: string | null
  notes: string | null
  created_at: string
}

export interface CommunityServiceEvent {
  id: string
  post_id: string
  title: string
  category: string
  event_date: string
  attendees_count: number | null
  hours_contributed: number | null
  description: string | null
  created_by: string | null
  created_at: string
}

export interface FinancialTransaction {
  id: string
  post_id: string
  transaction_type: LedgerTransactionType
  category: string
  amount: number
  description: string | null
  transaction_date: string
  created_by: string | null
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
  profile_id: string | null
  verified_at: string | null
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

export interface ResolutionMemberPreference {
  id: string
  resolution_id: string
  post_id: string
  member_profile_id: string
  preference: boolean
  created_at: string
  updated_at: string
}

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

export interface DriveFolder {
  id: string
  parent_folder_id: string | null
  name: string
  color: string | null
  shared_with_posts: boolean
  shared_with_post_id: string | null
  deleted_at: string | null
  created_by: string | null
  created_at: string
}

export interface DriveFile {
  id: string
  folder_id: string | null
  name: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  deleted_at: string | null
  uploaded_by: string | null
  created_at: string
}

export type FacilityProjectStatus = 'planning' | 'in_progress' | 'complete'

export interface BuildAPostModule {
  id: string
  name: string
  description: string | null
  startup_cost_low: number | null
  startup_cost_high: number | null
  equipment_list: string[] | null
  sponsor_opportunities: string | null
  relevant_sponsor_categories: string[] | null
  grant_opportunities: string | null
  revenue_potential: string | null
  build_checklist_template: string[] | null
  generate_prompt_template: string | null
  created_at: string
}

export interface PostFacilityProject {
  id: string
  post_id: string
  module_id: string
  status: FacilityProjectStatus
  target_budget: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PostFacilityChecklistItem {
  id: string
  project_id: string
  label: string
  is_complete: boolean
  completed_at: string | null
  created_at: string
}

export interface BuildAPostGeneratedPlan {
  id: string
  module_id: string
  post_id: string | null
  title: string
  content: string
  generated_by: string | null
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
