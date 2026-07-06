import { Route, Routes, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import { RoleGuard } from '@/components/layout/RoleGuard'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import ApplicationsPipeline from '@/pages/applications/ApplicationsPipeline'
import VettingBoard from '@/pages/vetting/VettingBoard'
import FoundingTeamBuilder from '@/pages/founding-team/FoundingTeamBuilder'
import JoinFoundingTeam from '@/pages/founding-team/JoinFoundingTeam'
import PublicChecklist from '@/pages/checklist/PublicChecklist'
import PublicRecruitSignup from '@/pages/recruiting/PublicRecruitSignup'
import BecomeASponsor from '@/pages/sponsors/BecomeASponsor'
import LaunchChecklist from '@/pages/checklist/LaunchChecklist'
import Toolkit from '@/pages/toolkit/Toolkit'
import Meetings from '@/pages/meetings/Meetings'
import UroMeetingWizard from '@/pages/meetings/uro/UroMeetingWizard'
import UroMeetingView from '@/pages/meetings/uro/UroMeetingView'
import UroComplianceDashboard from '@/pages/meetings/uro/UroComplianceDashboard'
import UroMotionSearch from '@/pages/meetings/uro/UroMotionSearch'
import RecruitingPipeline from '@/pages/recruiting/RecruitingPipeline'
import SponsorsCRM from '@/pages/sponsors/SponsorsCRM'
import VeteransCongress from '@/pages/congress/VeteransCongress'
import CongressMemberView from '@/pages/congress/CongressMemberView'
import ResolutionDetail from '@/pages/congress/ResolutionDetail'
import Committees from '@/pages/congress/Committees'
import Delegates from '@/pages/congress/Delegates'
import LegislativeTracker from '@/pages/congress/LegislativeTracker'
import CongressCalendar from '@/pages/congress/CongressCalendar'
import TransparencyPortal from '@/pages/congress/TransparencyPortal'
import PostHealth from '@/pages/health/PostHealth'
import PostHealthDetail from '@/pages/health/PostHealthDetail'
import BuildAPost from '@/pages/build-a-post/BuildAPost'
import BuildAPostDetail from '@/pages/build-a-post/BuildAPostDetail'
import MembershipRoster from '@/pages/members/MembershipRoster'
import JoinMembership from '@/pages/members/JoinMembership'
import MembershipPaymentResult from '@/pages/members/MembershipPaymentResult'

export default function App() {
  return (
    <Routes>
      {/* Public — no login required, shared via link */}
      <Route path="/join-founding-team/:postId" element={<JoinFoundingTeam />} />
      <Route path="/post-checklist/:postId" element={<PublicChecklist />} />
      <Route path="/join-post/:postId" element={<PublicRecruitSignup />} />
      <Route path="/become-a-sponsor/:postId" element={<BecomeASponsor />} />
      <Route path="/join-membership/:postId" element={<JoinMembership />} />
      <Route path="/membership-payment-result" element={<MembershipPaymentResult />} />
      <Route path="/transparency" element={<TransparencyPortal />} />
      {/* Everything else is gated behind auth */}
      <Route path="/*" element={<AuthenticatedApp />} />
    </Routes>
  )
}

function AuthenticatedApp() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base">
        <div className="eyebrow">Loading CVOA Post OS…</div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
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
        <Route path="/founding-team" element={<FoundingTeamBuilder />} />
        <Route path="/checklist" element={<LaunchChecklist />} />
        <Route path="/toolkit" element={<Toolkit />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/meetings/uro/:meetingId" element={<UroMeetingWizard />} />
        <Route path="/meetings/uro/:meetingId/view" element={<UroMeetingView />} />
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
        <Route path="/recruiting" element={<RecruitingPipeline />} />
        <Route path="/sponsors" element={<SponsorsCRM />} />
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
        <Route path="/health" element={<PostHealth />} />
        <Route path="/health/:postId" element={<PostHealthDetail />} />
        <Route path="/build-a-post" element={<BuildAPost />} />
        <Route path="/build-a-post/:moduleId" element={<BuildAPostDetail />} />
        <Route path="/members" element={<MembershipRoster />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

function CongressRoute() {
  const { isNational } = useAuth()
  return isNational ? <VeteransCongress /> : <CongressMemberView />
}
