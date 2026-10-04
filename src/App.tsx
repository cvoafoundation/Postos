import { lazy, Suspense } from 'react'
import { Route, Routes, Navigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import { RoleGuard } from '@/components/layout/RoleGuard'
const Login = lazy(() => import('@/pages/Login'))
const SetPassword = lazy(() => import('@/pages/SetPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ApplicationsPipeline = lazy(() => import('@/pages/applications/ApplicationsPipeline'))
const VettingBoard = lazy(() => import('@/pages/vetting/VettingBoard'))
const JoinFoundingTeam = lazy(() => import('@/pages/founding-team/JoinFoundingTeam'))
const PublicChecklist = lazy(() => import('@/pages/checklist/PublicChecklist'))
const PublicRecruitSignup = lazy(() => import('@/pages/recruiting/PublicRecruitSignup'))
const BecomeASponsor = lazy(() => import('@/pages/sponsors/BecomeASponsor'))
const Toolkit = lazy(() => import('@/pages/toolkit/Toolkit'))
const Meetings = lazy(() => import('@/pages/meetings/Meetings'))
const UroMeetingWizard = lazy(() => import('@/pages/meetings/uro/UroMeetingWizard'))
const UroMeetingView = lazy(() => import('@/pages/meetings/uro/UroMeetingView'))
const UroComplianceDashboard = lazy(() => import('@/pages/meetings/uro/UroComplianceDashboard'))
const UroMotionSearch = lazy(() => import('@/pages/meetings/uro/UroMotionSearch'))
const UroActionItemReport = lazy(() => import('@/pages/meetings/uro/UroActionItemReport'))
const RecruitingPipeline = lazy(() => import('@/pages/recruiting/RecruitingPipeline'))
const SponsorsCRM = lazy(() => import('@/pages/sponsors/SponsorsCRM'))
const VeteransCongress = lazy(() => import('@/pages/congress/VeteransCongress'))
const CongressMemberView = lazy(() => import('@/pages/congress/CongressMemberView'))
const ResolutionDetail = lazy(() => import('@/pages/congress/ResolutionDetail'))
const Committees = lazy(() => import('@/pages/congress/Committees'))
const Delegates = lazy(() => import('@/pages/congress/Delegates'))
const LegislativeTracker = lazy(() => import('@/pages/congress/LegislativeTracker'))
const CongressCalendar = lazy(() => import('@/pages/congress/CongressCalendar'))
const TransparencyPortal = lazy(() => import('@/pages/congress/TransparencyPortal'))
const PostHealth = lazy(() => import('@/pages/health/PostHealth'))
const PostHealthDetail = lazy(() => import('@/pages/health/PostHealthDetail'))
const BuildAPost = lazy(() => import('@/pages/build-a-post/BuildAPost'))
const BuildAPostDetail = lazy(() => import('@/pages/build-a-post/BuildAPostDetail'))
const MembershipRoster = lazy(() => import('@/pages/members/MembershipRoster'))
const MembershipReview = lazy(() => import('@/pages/members/MembershipReview'))
const PostOfficersDirectory = lazy(() => import('@/pages/founding-team/PostOfficersDirectory'))
const PostMembersDirectory = lazy(() => import('@/pages/members/PostMembersDirectory'))
const RoleApplications = lazy(() => import('@/pages/members/RoleApplications'))
const JoinMembership = lazy(() => import('@/pages/members/JoinMembership'))
const JoinCVOA = lazy(() => import('@/pages/members/JoinCVOA'))
const MemberHome = lazy(() => import('@/pages/members/MemberHome'))
const PostHome = lazy(() => import('@/pages/PostHome'))
const MyMembership = lazy(() => import('@/pages/members/MyMembership'))
const Settings = lazy(() => import('@/pages/settings/Settings'))
const FileComplaint = lazy(() => import('@/pages/ethics/FileComplaint'))
const EthicsTribunalInbox = lazy(() => import('@/pages/ethics/EthicsTribunalInbox'))
const VerifyMembership = lazy(() => import('@/pages/members/VerifyMembership'))
const MembershipPaymentResult = lazy(() => import('@/pages/members/MembershipPaymentResult'))
const DocumentDrive = lazy(() => import('@/pages/drive/DocumentDrive'))
const UserManagement = lazy(() => import('@/pages/admin/UserManagement'))
const StateHome = lazy(() => import('@/pages/StateHome'))
const MyApplications = lazy(() => import('@/pages/members/MyApplications'))
const MembershipRequests = lazy(() => import('@/pages/members/MembershipRequests'))
const ScopedPostOverview = lazy(() => import('@/pages/admin/ScopedPostOverview'))
const StateMemberships = lazy(() => import('@/pages/admin/StateMemberships'))
const Fundraising = lazy(() => import('@/pages/fundraising/Fundraising'))

// Preserve older invitation emails that redirected to /login.
const legacySetupHash = window.location.pathname === '/login' &&
  ['invite', 'recovery'].includes(new URLSearchParams(window.location.hash.slice(1)).get('type') ?? '')
  ? window.location.hash : null

export default function App() {
  return (
    <Suspense fallback={<div role="status" className="p-8 text-sm text-muted">Loading page…</div>}>
    <Routes>
      <Route path="/set-password" element={<SetPassword />} />
      {legacySetupHash && <Route path="/login" element={<Navigate to={`/set-password${legacySetupHash}`} replace />} />}
      {/* Public — no login required, shared via link */}
      <Route path="/join-founding-team/:postId" element={<JoinFoundingTeam />} />
      <Route path="/post-checklist/:postId" element={<PublicChecklist />} />
      <Route path="/join-post/:postId" element={<PublicRecruitSignup />} />
      <Route path="/become-a-sponsor/:postId" element={<BecomeASponsor />} />
      <Route path="/join-membership/:postId" element={<JoinMembership />} />
      <Route path="/join" element={<JoinCVOA />} />
      <Route path="/verify-membership/:memberId" element={<VerifyMembership />} />
      <Route path="/membership-payment-result" element={<MembershipPaymentResult />} />
      <Route path="/transparency" element={<TransparencyPortal />} />
      {/* Everything else is gated behind auth */}
      <Route path="/*" element={<AuthenticatedApp />} />
    </Routes>
    </Suspense>
  )
}

function AuthenticatedApp() {
  const { session, loading, accessSuspended, accessError, signOut } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base">
        <div className="eyebrow">Loading CVOA.ONE SYSTEM…</div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  if (accessSuspended || accessError) return <div className="panel max-w-lg mx-auto mt-20 p-8"><h1 className="font-display text-2xl">{accessSuspended ? 'Account access suspended' : 'Access verification unavailable'}</h1><p className="text-sm text-muted my-4">{accessSuspended ? 'Contact National about restoring your workspace. Your membership record remains preserved.' : accessError}</p><button className="btn-ghost" onClick={signOut}>Sign out</button><button className="btn-gold ml-3" onClick={() => window.location.reload()}>Retry</button></div>

  return (
    <AppShell>
      <Suspense fallback={<div role="status" className="p-8 text-sm text-muted">Loading page…</div>}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/post-overview/:postId" element={<RoleGuard roles={['state_commander','post_commander','post_officer','delegate']}><ScopedPostOverview /></RoleGuard>} />
        <Route path="/member-home" element={<MemberHome />} />
        <Route path="/my-applications" element={<MyApplications />} />
        <Route path="/state" element={<RoleGuard roles={['state_commander']}><StateHome /></RoleGuard>} />
        <Route path="/membership-requests" element={<Navigate to="/members?tab=requests" replace />} />
        <Route path="/fundraising" element={<RoleGuard roles={['state_commander','post_commander','post_officer']}><Fundraising /></RoleGuard>} />
        <Route
          path="/applications"
          element={
            <RoleGuard roles={[]}>
              <ApplicationsPipeline />
            </RoleGuard>
          }
        />
        <Route
          path="/vetting"
          element={
            <RoleGuard roles={[]}>
              <VettingBoard />
            </RoleGuard>
          }
        />
        <Route
          path="/toolkit"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <Toolkit />
            </RoleGuard>
          }
        />
        <Route
          path="/meetings"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <Meetings />
            </RoleGuard>
          }
        />
        <Route
          path="/meetings/uro/:meetingId"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <UroMeetingWizard />
            </RoleGuard>
          }
        />
        <Route
          path="/meetings/uro/:meetingId/view"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <UroMeetingView />
            </RoleGuard>
          }
        />
        <Route
          path="/meetings/uro-compliance"
          element={
            <RoleGuard roles={[]}>
              <UroComplianceDashboard />
            </RoleGuard>
          }
        />
        <Route
          path="/meetings/uro-motions"
          element={
            <RoleGuard roles={[]}>
              <UroMotionSearch />
            </RoleGuard>
          }
        />
        <Route
          path="/meetings/uro-actions"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <UroActionItemReport />
            </RoleGuard>
          }
        />
        <Route
          path="/recruiting"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <RecruitingPipeline />
            </RoleGuard>
          }
        />
        <Route
          path="/sponsors"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <SponsorsCRM />
            </RoleGuard>
          }
        />
        <Route path="/congress" element={<CongressRoute />} />
        <Route path="/congress/resolutions/:id" element={<ResolutionDetail />} />
        <Route
          path="/congress/committees"
          element={
            <RoleGuard roles={[]}>
              <Committees />
            </RoleGuard>
          }
        />
        <Route path="/congress/delegates" element={<Delegates />} />
        <Route
          path="/congress/legislative"
          element={
            <RoleGuard roles={[]}>
              <LegislativeTracker />
            </RoleGuard>
          }
        />
        <Route
          path="/congress/calendar"
          element={
            <RoleGuard roles={[]}>
              <CongressCalendar />
            </RoleGuard>
          }
        />
        <Route
          path="/health"
          element={
            <RoleGuard roles={['state_commander', 'post_commander', 'post_officer']}>
              <PostHealth />
            </RoleGuard>
          }
        />
        <Route
          path="/health/:postId"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <PostHealthDetail />
            </RoleGuard>
          }
        />
        <Route
          path="/build-a-post"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <BuildAPost />
            </RoleGuard>
          }
        />
        <Route
          path="/build-a-post/:moduleId"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <BuildAPostDetail />
            </RoleGuard>
          }
        />
        <Route
          path="/members"
          element={
            <RoleGuard roles={['state_commander','post_commander', 'post_officer']}>
              <RosterRoute />
            </RoleGuard>
          }
        />
        <Route path="/my-membership" element={<MyMembership />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/file-complaint" element={<FileComplaint />} />
        <Route
          path="/ethics-tribunal"
          element={
            <RoleGuard roles={['ethics_tribunal']} allowNational={false}>
              <EthicsTribunalInbox />
            </RoleGuard>
          }
        />
        <Route
          path="/membership-review"
          element={
            <RoleGuard roles={['post_commander', 'post_officer']}>
              <MembershipReview />
            </RoleGuard>
          }
        />
        <Route path="/post-officers" element={<PostOfficersDirectory />} />
        <Route path="/post-members" element={<PostMembersDirectory />} />
        <Route
          path="/role-applications"
          element={
            <RoleGuard roles={['post_commander']}>
              <RoleApplications />
            </RoleGuard>
          }
        />
        <Route
          path="/drive"
          element={
            <RoleGuard roles={['state_commander','post_commander','post_officer']}>
              <DocumentDrive />
            </RoleGuard>
          }
        />
        <Route
          path="/shared-files"
          element={
            <RoleGuard roles={['member', 'state_commander', 'post_commander', 'post_officer', 'delegate']}>
              <DocumentDrive />
            </RoleGuard>
          }
        />
        <Route
          path="/users"
          element={
            <RoleGuard roles={[]}>
              <UserManagement />
            </RoleGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AppShell>
  )
}

function CongressRoute() {
  const { isNational } = useAuth()
  return isNational ? <VeteransCongress /> : <CongressMemberView />
}

function HomeRoute() {
  const { profile, isNational } = useAuth()
  if (isNational) return <Dashboard />
  if (profile?.role === 'state_commander') return <StateHome />
  if (profile?.role === 'delegate') return <ScopedPostOverview />
  if (profile?.role === 'member') return <MemberHome />
  if (profile?.role === 'ethics_tribunal') return <EthicsTribunalInbox />
  if (profile?.role === 'post_commander' || profile?.role === 'post_officer') return <PostHome />
  // Anything else — guest_applicant (not yet verified/promoted), delegate, or
  // a role we don't recognize — must never fall through to the National
  // dashboard. This was a real gap: an account whose promotion hasn't
  // happened yet (e.g. payment pending, or verification not done) used to
  // land on the full org-wide view with no restriction at all.
  return (
    <div className="max-w-md mx-auto py-24 text-center">
      <div className="font-display text-2xl tracking-wide mb-3">Account Pending</div>
      <p className="text-sm text-muted">
        Your account isn't fully active yet — this usually means a payment or verification step hasn't completed.
        If you believe this is a mistake, contact National.
      </p>
      <div className="flex flex-wrap gap-3 justify-center mt-5">
        <a className="btn-gold" href="/my-membership">Check Membership & Payment</a>
        <a className="btn-ghost" href="/my-applications">Track Post Application</a>
      </div>
    </div>
  )
}

function RosterRoute() {
  const { profile, isNational } = useAuth()
  const [params] = useSearchParams()
  const requests = params.get('tab') === 'requests'
  return <div><nav aria-label="Membership workspace" className="flex flex-wrap gap-3 mb-6 border-b border-hairline pb-3"><Link className={requests ? 'btn-ghost' : 'btn-gold'} aria-current={!requests ? 'page' : undefined} to="/members">Membership Roster</Link><Link className={requests ? 'btn-gold' : 'btn-ghost'} aria-current={requests ? 'page' : undefined} to="/members?tab=requests">Join &amp; Transfer Requests</Link></nav>{requests ? <MembershipRequests /> : !isNational && profile?.role === 'state_commander' ? <StateMemberships /> : <MembershipRoster />}</div>
}
