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
import LaunchChecklist from '@/pages/checklist/LaunchChecklist'
import Toolkit from '@/pages/toolkit/Toolkit'
import RecruitingPipeline from '@/pages/recruiting/RecruitingPipeline'
import SponsorsCRM from '@/pages/sponsors/SponsorsCRM'
import VeteransCongress from '@/pages/congress/VeteransCongress'
import PostHealth from '@/pages/health/PostHealth'
import BuildAPost from '@/pages/build-a-post/BuildAPost'

export default function App() {
  return (
    <Routes>
      {/* Public — no login required, shared via link */}
      <Route path="/join-founding-team/:postId" element={<JoinFoundingTeam />} />
      <Route path="/post-checklist/:postId" element={<PublicChecklist />} />
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
        <Route path="/health" element={<PostHealth />} />
        <Route path="/build-a-post" element={<BuildAPost />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
