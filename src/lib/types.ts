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
  created_at: string
  updated_at: string
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
  created_at: string
}

export interface Resolution {
  id: string
  submitted_by: string | null
  post_id: string | null
  title: string
  category: string | null
  body: string
  status: 'draft' | 'submitted' | 'in_discussion' | 'voting' | 'adopted' | 'archived'
  created_at: string
  updated_at: string
}

export interface ActivityFeedItem {
  id: string
  event_type: string
  post_id: string | null
  actor_id: string | null
  summary: string
  created_at: string
}
