import { Route, Routes, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
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
import RecruitingPipeline from '@/pages/recruiting/RecruitingPipeline'
import SponsorsCRM from '@/pages/sponsors/SponsorsCRM'
import VeteransCongress from '@/pages/congress/VeteransCongress'
import ResolutionDetail from '@/pages/congress/ResolutionDetail'
import Committees from '@/pages/congress/Committees'
import Delegates from '@/pages/congress/Delegates'
import LegislativeTracker from '@/pages/congress/LegislativeTracker'
import CongressCalendar from '@/pages/congress/CongressCalendar'
import TransparencyPortal from '@/pages/congress/TransparencyPortal'
import PostHealth from '@/pages/health/PostHealth'
import BuildAPost from '@/pages/build-a-post/BuildAPost'

export default function App() {
  return (
    <Routes>
      {/* Public — no login required, shared via link */}
      <Route path="/join-founding-team/:postId" element={<JoinFoundingTeam />} />
      <Route path="/post-checklist/:postId" element={<PublicChecklist />} />
      <Route path="/join-post/:postId" element={<PublicRecruitSignup />} />
      <Route path="/become-a-sponsor/:postId" element={<BecomeASponsor />} />
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
        <Route path="/applications" element={<ApplicationsPipeline />} />
        <Route path="/vetting" element={<VettingBoard />} />
        <Route path="/founding-team" element={<FoundingTeamBuilder />} />
        <Route path="/checklist" element={<LaunchChecklist />} />
        <Route path="/toolkit" element={<Toolkit />} />
        <Route path="/recruiting" element={<RecruitingPipeline />} />
        <Route path="/sponsors" element={<SponsorsCRM />} />
        <Route path="/congress" element={<VeteransCongress />} />
        <Route path="/congress/resolutions/:id" element={<ResolutionDetail />} />
        <Route path="/congress/committees" element={<Committees />} />
        <Route path="/congress/delegates" element={<Delegates />} />
        <Route path="/congress/legislative" element={<LegislativeTracker />} />
        <Route path="/congress/calendar" element={<CongressCalendar />} />
        <Route path="/health" element={<PostHealth />} />
        <Route path="/build-a-post" element={<BuildAPost />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
