// In-memory seed data for demo mode. Shapes match supabase/schema.sql exactly,
// so switching to a real Supabase project later is a drop-in swap.

const now = () => new Date().toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

export const DEMO_USER_ID = 'demo-national-commander'

export const seedData: Record<string, any[]> = {
  profiles: [
    {
      id: DEMO_USER_ID,
      full_name: 'National Commander (Demo)',
      email: 'commander@cvoa.org',
      phone: null,
      role: 'national_commander',
      post_id: null,
      state: null,
      created_at: daysAgo(120),
    },
  ],

  posts: [
    { id: 'post-1', name: 'Bozeman Post 1', city: 'Bozeman', state: 'MT', status: 'active_post', health_status: 'green', lat: 45.68, lng: -111.04, charter_date: daysAgo(200), created_at: daysAgo(220), updated_at: daysAgo(5) },
    { id: 'post-2', name: 'Tulsa Post 4', city: 'Tulsa', state: 'OK', status: 'active_post', health_status: 'yellow', lat: 36.15, lng: -95.99, charter_date: daysAgo(150), created_at: daysAgo(180), updated_at: daysAgo(3) },
    { id: 'post-3', name: 'Spokane Post 7', city: 'Spokane', state: 'WA', status: 'active_post', health_status: 'red', lat: 47.66, lng: -117.43, charter_date: daysAgo(90), created_at: daysAgo(110), updated_at: daysAgo(1) },
    { id: 'post-4', name: 'Greenville Post 2', city: 'Greenville', state: 'SC', status: 'founding_team_building', health_status: 'yellow', lat: null, lng: null, charter_date: null, created_at: daysAgo(40), updated_at: daysAgo(2) },
    { id: 'post-5', name: 'Reno Post 3', city: 'Reno', state: 'NV', status: 'charter_ready', health_status: 'yellow', lat: null, lng: null, charter_date: null, created_at: daysAgo(60), updated_at: daysAgo(4) },
  ],

  post_applications: [
    { id: 'app-1', post_id: null, name: 'James Whitfield', email: 'jwhitfield@example.com', phone: '406-555-0102', city: 'Missoula', state: 'MT', military_branch: 'Army', years_served: 8, combat_service: true, leadership_experience: 'Platoon Sergeant, 2 deployments', existing_veteran_network: 'Local VFW chapter of ~40', estimated_membership_potential: 60, motivation: 'Rural Montana has no active veteran community space within 90 minutes.', status: 'new_inquiry', dd214_storage_path: null, dd214_uploaded_at: null, dd214_review_status: 'pending', dd214_reviewed_by: null, dd214_reviewed_at: null, created_at: daysAgo(2), updated_at: daysAgo(2) },
    { id: 'app-2', post_id: null, name: 'Maria Gonzalez', email: 'mgonzalez@example.com', phone: '918-555-0199', city: 'Broken Arrow', state: 'OK', military_branch: 'Marine Corps', years_served: 6, combat_service: true, leadership_experience: 'Squad Leader', existing_veteran_network: 'Informal group of 15', estimated_membership_potential: 35, motivation: 'Want a permanent home for our weekly meetups.', status: 'application_submitted', dd214_storage_path: 'demo/gonzalez-dd214.pdf', dd214_uploaded_at: daysAgo(6), dd214_review_status: 'pending', dd214_reviewed_by: null, dd214_reviewed_at: null, created_at: daysAgo(6), updated_at: daysAgo(1) },
    { id: 'app-3', post_id: null, name: 'David Okonkwo', email: 'dokonkwo@example.com', phone: null, city: 'Boise', state: 'ID', military_branch: 'Air Force', years_served: 4, combat_service: false, leadership_experience: 'NCO in charge of logistics squadron', existing_veteran_network: null, estimated_membership_potential: 20, motivation: 'Saw the impact of CVOA at a regional summit.', status: 'interview_scheduled', dd214_storage_path: 'demo/okonkwo-dd214.pdf', dd214_uploaded_at: daysAgo(9), dd214_review_status: 'verified', dd214_reviewed_by: null, dd214_reviewed_at: daysAgo(7), created_at: daysAgo(10), updated_at: daysAgo(3) },
    { id: 'app-4', post_id: null, name: 'Rachel Kim', email: 'rkim@example.com', phone: '505-555-0148', city: 'Santa Fe', state: 'NM', military_branch: 'Navy', years_served: 10, combat_service: false, leadership_experience: 'Chief Petty Officer', existing_veteran_network: 'Coordinates with 2 other orgs', estimated_membership_potential: 45, motivation: 'Leading a growing informal group that wants structure.', status: 'vetting', dd214_storage_path: 'demo/kim-dd214.pdf', dd214_uploaded_at: daysAgo(14), dd214_review_status: 'verified', dd214_reviewed_by: null, dd214_reviewed_at: daysAgo(12), created_at: daysAgo(14), updated_at: daysAgo(2) },
    { id: 'app-5', post_id: null, name: 'Tom Alvarez', email: 'talvarez@example.com', phone: '803-555-0177', city: 'Columbia', state: 'SC', military_branch: 'Army', years_served: 12, combat_service: true, leadership_experience: 'First Sergeant', existing_veteran_network: 'Strong regional network', estimated_membership_potential: 80, motivation: 'Ready to formally charter after 6 months of prep.', status: 'approved', dd214_storage_path: 'demo/alvarez-dd214.pdf', dd214_uploaded_at: daysAgo(30), dd214_review_status: 'verified', dd214_reviewed_by: null, dd214_reviewed_at: daysAgo(28), created_at: daysAgo(30), updated_at: daysAgo(4) },
  ],

  vetting_scorecards: [],
  vetting_interviews: [],
  vetting_decisions: [],

  founding_team_members: [
    { id: 'ft-1', post_id: 'post-4', name: 'Tom Alvarez', email: 'talvarez@example.com', phone: '803-555-0177', position: 'commander', combat_status: 'Combat veteran', verification_status: 'verified', dd214_reviewed: true, combat_service_verified: true, membership_approved: true, created_at: daysAgo(35) },
    { id: 'ft-2', post_id: 'post-4', name: 'Angela Brooks', email: 'abrooks@example.com', phone: null, position: 'vice_commander', combat_status: 'Non-combat veteran', verification_status: 'verified', dd214_reviewed: true, combat_service_verified: false, membership_approved: true, created_at: daysAgo(35) },
    { id: 'ft-3', post_id: 'post-4', name: 'Sam Rivera', email: 'srivera@example.com', phone: null, position: 'adjutant', combat_status: 'Combat veteran', verification_status: 'pending', dd214_reviewed: true, combat_service_verified: false, membership_approved: false, created_at: daysAgo(20) },
  ],

  checklist_items: [
    { id: 'cl-1', post_id: 'post-4', category: 'Administration', label: 'Charter Packet Completed', is_complete: true, completed_at: daysAgo(20), auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-2', post_id: 'post-4', category: 'Administration', label: 'Bylaws Signed', is_complete: true, completed_at: daysAgo(18), auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-3', post_id: 'post-4', category: 'Administration', label: 'Officers Appointed', is_complete: true, completed_at: daysAgo(15), auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-4', post_id: 'post-4', category: 'Administration', label: 'EIN Issued', is_complete: false, completed_at: null, auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-5', post_id: 'post-4', category: 'Administration', label: 'Bank Account Opened', is_complete: false, completed_at: null, auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-6', post_id: 'post-4', category: 'Administration', label: 'State Filing Complete', is_complete: false, completed_at: null, auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-7', post_id: 'post-4', category: 'Membership', label: '10 Members', is_complete: true, completed_at: daysAgo(25), auto_tracked: true, created_at: daysAgo(35) },
    { id: 'cl-8', post_id: 'post-4', category: 'Membership', label: '25 Members', is_complete: false, completed_at: null, auto_tracked: true, created_at: daysAgo(35) },
    { id: 'cl-9', post_id: 'post-4', category: 'Membership', label: '50 Members', is_complete: false, completed_at: null, auto_tracked: true, created_at: daysAgo(35) },
    { id: 'cl-10', post_id: 'post-4', category: 'Membership', label: '100 Members', is_complete: false, completed_at: null, auto_tracked: true, created_at: daysAgo(35) },
    { id: 'cl-11', post_id: 'post-4', category: 'Operations', label: 'First Meeting Held', is_complete: true, completed_at: daysAgo(28), auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-12', post_id: 'post-4', category: 'Operations', label: 'Minutes Submitted', is_complete: false, completed_at: null, auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-13', post_id: 'post-4', category: 'Operations', label: 'Community Event Completed', is_complete: false, completed_at: null, auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-14', post_id: 'post-4', category: 'Operations', label: 'Recruiting Event Completed', is_complete: false, completed_at: null, auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-15', post_id: 'post-4', category: 'Facility', label: 'Meeting Location Secured', is_complete: true, completed_at: daysAgo(30), auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-16', post_id: 'post-4', category: 'Facility', label: 'Permanent Facility Identified', is_complete: false, completed_at: null, auto_tracked: false, created_at: daysAgo(35) },
    { id: 'cl-17', post_id: 'post-4', category: 'Facility', label: 'Lease Under Review', is_complete: false, completed_at: null, auto_tracked: false, created_at: daysAgo(35) },
  ],

  toolkit_templates: [
    { id: 'tk-1', title: 'Meeting Agenda', category: 'Operations', description: 'Standard template for weekly/monthly post meetings.', file_url: null, created_at: daysAgo(100) },
    { id: 'tk-2', title: 'Meeting Minutes', category: 'Operations', description: 'Standard minutes template.', file_url: null, created_at: daysAgo(100) },
    { id: 'tk-3', title: 'Recruiting Flyer', category: 'Recruiting', description: 'Print-ready recruiting flyer.', file_url: null, created_at: daysAgo(100) },
    { id: 'tk-4', title: 'Sponsorship Packet', category: 'Fundraising', description: 'Pitch deck for local business sponsors.', file_url: null, created_at: daysAgo(100) },
    { id: 'tk-5', title: 'Commander Handbook', category: 'Administration', description: 'Full guide for new Post Commanders.', file_url: null, created_at: daysAgo(100) },
  ],

  recruits: [
    { id: 'rc-1', post_id: 'post-1', name: 'Kevin Marsh', email: null, phone: null, stage: 'prospect', source: 'Facebook ad', created_at: daysAgo(5), updated_at: daysAgo(5) },
    { id: 'rc-2', post_id: 'post-1', name: 'Lena Foster', email: null, phone: null, stage: 'interested', source: 'Referral', created_at: daysAgo(9), updated_at: daysAgo(4) },
    { id: 'rc-3', post_id: 'post-1', name: 'Omar Haddad', email: null, phone: null, stage: 'attended_meeting', source: 'VA clinic flyer', created_at: daysAgo(15), updated_at: daysAgo(2) },
    { id: 'rc-4', post_id: 'post-1', name: 'Grace Liu', email: null, phone: null, stage: 'applied', source: 'Referral', created_at: daysAgo(20), updated_at: daysAgo(1) },
    { id: 'rc-5', post_id: 'post-1', name: 'Derek Payne', email: null, phone: null, stage: 'member', source: 'Golf Scramble', created_at: daysAgo(60), updated_at: daysAgo(10) },
    { id: 'rc-6', post_id: 'post-1', name: 'Sophie Turner', email: null, phone: null, stage: 'leader', source: 'Member referral', created_at: daysAgo(90), updated_at: daysAgo(15) },
  ],

  sponsor_tiers: [
    { id: 'tier-bronze', name: 'Bronze', min_value: 0, benefits: ['Listed on post website', 'Thank-you shoutout at monthly meeting'], sort_order: 1, created_at: daysAgo(200) },
    { id: 'tier-silver', name: 'Silver', min_value: 1000, benefits: ['Logo on post website', 'Mentioned at 2 events/year', 'Social media shoutout'], sort_order: 2, created_at: daysAgo(200) },
    { id: 'tier-gold', name: 'Gold', min_value: 2500, benefits: ['Logo on website + printed materials', 'Named sponsor at all events', 'Booth space at annual event', 'Social media feature'], sort_order: 3, created_at: daysAgo(200) },
    { id: 'tier-platinum', name: 'Platinum', min_value: 5000, benefits: ['Top billing on all materials', 'Named sponsor of a signature event', 'Booth + speaking opportunity', 'Dedicated social media campaign', 'Annual recognition plaque'], sort_order: 4, created_at: daysAgo(200) },
  ],

  sponsor_notes: [
    { id: 'note-1', sponsor_id: 'sp-1', author_id: null, note: 'Renewed for another year at the same rate.', created_at: daysAgo(60) },
    { id: 'note-2', sponsor_id: 'sp-2', author_id: null, note: 'Sponsored the golf scramble banner + 2 hole sponsorships.', created_at: daysAgo(28) },
  ],

  sponsors: [
    { id: 'sp-1', post_id: 'post-1', company: 'Big Sky Hardware', contact_name: 'Frank Miller', email: 'frank@bigskyhardware.com', phone: null, sponsorship_value: 2500, stage: 'won', notes: 'Annual sponsor, renews every January.', tier_id: 'tier-gold', agreement_start_date: daysAgo(60).slice(0, 10), agreement_end_date: null, agreement_storage_path: null, created_at: daysAgo(200), updated_at: daysAgo(60) },
    { id: 'sp-2', post_id: 'post-2', company: 'Tulsa Diesel Co.', contact_name: 'Renee Adams', email: 'renee@tulsadiesel.com', phone: null, sponsorship_value: 5000, stage: 'won', notes: 'Sponsored the golf scramble.', tier_id: 'tier-platinum', agreement_start_date: daysAgo(150).slice(0, 10), agreement_end_date: null, agreement_storage_path: null, created_at: daysAgo(150), updated_at: daysAgo(30) },
    { id: 'sp-3', post_id: 'post-1', company: 'Rocky Mountain Bank', contact_name: 'Chris Dole', email: null, phone: null, sponsorship_value: 1000, stage: 'proposal_sent', notes: null, tier_id: 'tier-silver', agreement_start_date: null, agreement_end_date: null, agreement_storage_path: null, created_at: daysAgo(20), updated_at: daysAgo(5) },
    { id: 'sp-4', post_id: 'post-2', company: 'Green Country Roofing', contact_name: 'Pat Nguyen', email: null, phone: null, sponsorship_value: 750, stage: 'meeting_scheduled', notes: null, tier_id: 'tier-bronze', agreement_start_date: null, agreement_end_date: null, agreement_storage_path: null, created_at: daysAgo(15), updated_at: daysAgo(3) },
    { id: 'sp-5', post_id: null, company: 'Summit Outdoor Gear', contact_name: null, email: null, phone: null, sponsorship_value: 0, stage: 'identified', notes: 'Cold lead from trade show.', tier_id: 'tier-bronze', agreement_start_date: null, agreement_end_date: null, agreement_storage_path: null, created_at: daysAgo(8), updated_at: daysAgo(8) },
  ],

  congress_delegates: [
    { id: 'del-1', post_id: 'post-1', profile_id: null, is_alternate: false, term_start: daysAgo(100).slice(0, 10), term_end: null, created_at: daysAgo(100) },
  ],

  resolutions: [
    { id: 'res-1', resolution_number: 'VC-2026-001', submitted_by: null, post_id: 'post-1', title: 'Standardize VA Claims Navigation Support Across All Posts', category: 'veterans_benefits', executive_summary: 'Every post should have at least one trained VA claims navigator available to members.', body: 'Proposes every active post maintain at least one trained VA claims navigator.', purpose: 'Reduce inconsistency in benefits support across posts.', financial_impact_cost: 5000, financial_impact_funding_source: 'National training budget', financial_impact_revenue_note: null, organizational_impact: 'Requires each post to designate and train one member annually.', status: 'voting', vote_type: 'delegate_vote', supermajority_threshold: null, voting_opens_at: daysAgo(10), voting_closes_at: null, created_at: daysAgo(20), updated_at: daysAgo(2) },
    { id: 'res-2', resolution_number: 'VC-2026-002', submitted_by: null, post_id: 'post-2', title: 'National Fundraising Minimum for Charter Renewal', category: 'governance', executive_summary: 'Sets a minimum annual fundraising benchmark tied to charter renewal.', body: 'Sets a minimum annual fundraising benchmark tied to charter renewal.', purpose: 'Ensure posts remain financially sustainable.', financial_impact_cost: null, financial_impact_funding_source: null, financial_impact_revenue_note: null, organizational_impact: 'Posts failing to meet the minimum enter a review period.', status: 'discussion', vote_type: null, supermajority_threshold: null, voting_opens_at: null, voting_closes_at: null, created_at: daysAgo(15), updated_at: daysAgo(1) },
    { id: 'res-3', resolution_number: 'VC-2026-003', submitted_by: null, post_id: 'post-3', title: 'Rural Access Grant Program', category: 'expansion', executive_summary: 'Calls for a dedicated grant pool for posts serving rural, low-density regions.', body: 'Calls for a dedicated grant pool for posts serving rural, low-density regions.', purpose: 'Support posts in areas with fewer local sponsorship opportunities.', financial_impact_cost: 50000, financial_impact_funding_source: 'National reserve fund', financial_impact_revenue_note: null, organizational_impact: 'Creates an application and review process for grant disbursement.', status: 'under_review', vote_type: null, supermajority_threshold: null, voting_opens_at: null, voting_closes_at: null, created_at: daysAgo(8), updated_at: daysAgo(8) },
  ],

  resolution_co_sponsors: [],
  resolution_amendments: [],
  resolution_documents: [],

  committees: [
    { id: 'comm-1', name: 'Membership Committee', description: 'Reviews membership policy and standards resolutions.', created_at: daysAgo(200) },
    { id: 'comm-2', name: 'Legislative Committee', description: 'Reviews legislative affairs and external policy resolutions.', created_at: daysAgo(200) },
    { id: 'comm-3', name: 'Finance Committee', description: 'Reviews resolutions with budgetary or financial impact.', created_at: daysAgo(200) },
    { id: 'comm-4', name: 'Programs Committee', description: 'Reviews resolutions affecting national programs and services.', created_at: daysAgo(200) },
    { id: 'comm-5', name: 'Governance Committee', description: 'Reviews bylaws, constitutional, and governance resolutions.', created_at: daysAgo(200) },
    { id: 'comm-6', name: 'Expansion Committee', description: 'Reviews resolutions related to new post development and expansion.', created_at: daysAgo(200) },
  ],
  committee_members: [],
  committee_reviews: [
    { id: 'rev-1', resolution_id: 'res-3', committee_id: 'comm-6', recommendation: 'approve', notes: 'Strongly supports our rural expansion goals.', reviewed_by: null, created_at: daysAgo(5) },
  ],

  legislative_bills: [
    { id: 'bill-1', bill_number: 'H.R. 1234', title: 'Veterans Disability Benefits Modernization Act', level: 'federal', jurisdiction: null, summary: 'Proposes updates to the VA disability rating schedule.', status: 'active', cvoa_position: 'Support with amendments', impact_analysis: 'Would streamline claims for several common conditions.', created_at: daysAgo(30), updated_at: daysAgo(5) },
    { id: 'bill-2', bill_number: 'SB 456', title: 'State Veteran Property Tax Exemption Expansion', level: 'state', jurisdiction: 'Montana', summary: 'Expands property tax exemptions for disabled veterans.', status: 'monitoring', cvoa_position: 'Support', impact_analysis: null, created_at: daysAgo(12), updated_at: daysAgo(12) },
  ],

  congress_announcements: [
    { id: 'ann-1', title: 'CVOA Supports VA Claims Modernization Act', body: 'National leadership has issued a formal position supporting H.R. 1234 with recommended amendments.', category: 'Official Position', published_by: null, created_at: daysAgo(5) },
    { id: 'ann-2', title: 'Q2 Congressional Summary Published', body: 'Summary of all resolutions and votes from the second quarter session is now available.', category: 'Congressional Summary', published_by: null, created_at: daysAgo(15) },
  ],

  congress_calendar_events: [
    { id: 'cal-1', title: 'VC-2026-001 Delegate Vote Closes', event_type: 'vote', event_date: daysAgo(-5), description: 'Final day to cast delegate votes on VA Claims Navigation resolution.', resolution_id: 'res-1', created_at: daysAgo(10) },
    { id: 'cal-2', title: 'Q3 National Congressional Session', event_type: 'session', event_date: daysAgo(-20), description: 'Quarterly full session for all delegates.', resolution_id: null, created_at: daysAgo(30) },
  ],

  resolution_comments: [
    { id: 'c-1', resolution_id: 'res-1', parent_comment_id: null, author_id: null, response_type: 'support', body: 'This is long overdue — our post has struggled with claims navigation for years.', created_at: daysAgo(9) },
    { id: 'c-2', resolution_id: 'res-1', parent_comment_id: null, author_id: null, response_type: 'question', body: 'Who covers the cost of the navigator training?', created_at: daysAgo(8) },
    { id: 'c-3', resolution_id: 'res-2', parent_comment_id: null, author_id: null, response_type: 'oppose', body: 'A hard fundraising minimum could hurt newer, smaller posts unfairly.', created_at: daysAgo(6) },
  ],
  resolution_votes: [
    { id: 'v-1', resolution_id: 'res-1', vote_type: 'delegate_vote', voter_id: null, voter_post_id: 'post-1', vote: true, created_at: daysAgo(10) },
    { id: 'v-2', resolution_id: 'res-1', vote_type: 'delegate_vote', voter_id: null, voter_post_id: 'post-2', vote: true, created_at: daysAgo(9) },
    { id: 'v-3', resolution_id: 'res-1', vote_type: 'delegate_vote', voter_id: null, voter_post_id: 'post-3', vote: true, created_at: daysAgo(8) },
    { id: 'v-4', resolution_id: 'res-2', vote_type: 'informal_poll', voter_id: null, voter_post_id: 'post-2', vote: true, created_at: daysAgo(7) },
  ],

  post_health_metrics: [],

  build_a_post_modules: [
    { id: 'bp-1', name: 'Bar Layout', description: 'Social/gathering space with a serving bar.', startup_cost_low: 8000, startup_cost_high: 25000, equipment_list: ['Bar top and back bar', 'Draft system', 'Glassware', 'POS system', 'Refrigeration'], sponsor_opportunities: 'Local breweries and distributors often sponsor equipment in exchange for tap placement.', grant_opportunities: 'Not typically grant-eligible (alcohol-related).', revenue_potential: 'Moderate — steady revenue from member events, not a primary driver.', created_at: daysAgo(50) },
    { id: 'bp-2', name: 'Kitchen Layout', description: 'Full or partial kitchen for events and meal programs.', startup_cost_low: 15000, startup_cost_high: 60000, equipment_list: ['Commercial range', 'Refrigeration', 'Prep tables', 'Ventilation hood', 'Dishwashing station'], sponsor_opportunities: 'Restaurant equipment suppliers, regional grocery chains.', grant_opportunities: 'USDA rural development grants, community food security grants.', revenue_potential: 'High — meal programs and rentals for community events.', created_at: daysAgo(50) },
    { id: 'bp-3', name: 'Classroom Layout', description: 'Flexible space for training, education programs, and meetings.', startup_cost_low: 3000, startup_cost_high: 12000, equipment_list: ['Tables and chairs', 'AV/projector', 'Whiteboard', 'Wifi infrastructure'], sponsor_opportunities: 'Local colleges, trade schools, tech companies for equipment.', grant_opportunities: 'Department of Education adult education grants.', revenue_potential: 'Low direct revenue, high mission value.', created_at: daysAgo(50) },
    { id: 'bp-4', name: 'Employment Office', description: 'Dedicated space for job placement and career services staff.', startup_cost_low: 2000, startup_cost_high: 8000, equipment_list: ['Desks', 'Computers', 'Phone line', 'File storage'], sponsor_opportunities: 'Regional employers seeking veteran hires, staffing agencies.', grant_opportunities: 'DOL Veterans Employment and Training Service (VETS) grants.', revenue_potential: 'Indirect — improves member retention and community standing.', created_at: daysAgo(50) },
    { id: 'bp-5', name: 'VA Clinic Space', description: 'Space leased or donated to VA for satellite clinic visits.', startup_cost_low: 5000, startup_cost_high: 20000, equipment_list: ['Exam room build-out', 'Waiting area', 'ADA-compliant access'], sponsor_opportunities: 'Regional health systems.', grant_opportunities: 'VA community partnership grants.', revenue_potential: 'Lease income if VA compensates for space use.', created_at: daysAgo(50) },
    { id: 'bp-6', name: 'Fitness Center', description: 'Wellness and physical fitness space for members.', startup_cost_low: 10000, startup_cost_high: 40000, equipment_list: ['Cardio machines', 'Free weights', 'Flooring', 'Locker area'], sponsor_opportunities: 'Fitness equipment brands, local gyms co-branding.', grant_opportunities: 'Veteran wellness grants (check state-level VA offices).', revenue_potential: 'Membership add-on fee potential.', created_at: daysAgo(50) },
  ],

  activity_feed: [
    { id: 'act-1', event_type: 'new_application', post_id: null, actor_id: null, summary: 'New application from James Whitfield (Missoula, MT)', created_at: daysAgo(2) },
    { id: 'act-2', event_type: 'charter_approved', post_id: 'post-5', actor_id: null, summary: 'Reno Post 3 marked Charter Ready', created_at: daysAgo(4) },
    { id: 'act-3', event_type: 'new_sponsor', post_id: 'post-2', actor_id: null, summary: 'Tulsa Diesel Co. closed as a $5,000 sponsor', created_at: daysAgo(30) },
    { id: 'act-4', event_type: 'congress_submission', post_id: 'post-3', actor_id: null, summary: 'Spokane Post 7 submitted "Rural Access Grant Program"', created_at: daysAgo(8) },
    { id: 'act-5', event_type: 'new_member', post_id: 'post-1', actor_id: null, summary: 'Grace Liu applied for membership at Bozeman Post 1', created_at: daysAgo(20) },
  ],
}
