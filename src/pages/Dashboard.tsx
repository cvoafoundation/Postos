import ActionQueue from '@/components/workspaces/ActionQueue'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { UsStatusMap } from '@/components/map/UsStatusMap'
import { EmptyState } from '@/components/ui/EmptyState'
import { useWorkspace } from '@/lib/workspaces'
import { WorkspaceStatus } from '@/components/workspaces/WorkspaceStatus'
import type { ActivityFeedItem, Post } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'

interface Metrics {
  // Pipeline
  openApplications: number
  inVetting: number
  developingPosts: number
  charterReady: number
  activePosts: number
  // Growth & Money
  totalMembers: number
  committedSponsorships: number
  collectedSponsorships: number
  sponsorPipeline: number
  recruitingPipeline: number
  thisMonthReceipts: number
  lastMonthReceipts: number
  // Operations
  overdueOnMinutes: number
  openResolutions: number
  activeFacilityProjects: number
}

interface DashboardSummary {
  generated_at: string
  metrics: Metrics
  posts: Post[]
  activity: Pick<ActivityFeedItem, 'id' | 'summary' | 'created_at'>[]
}
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function Dashboard() {
  const { data, error, loading, refresh } = useWorkspace<DashboardSummary>('cvoa_national_dashboard')
  const [queueVersion, setQueueVersion] = useState(0)
  const metrics = data?.metrics
  const posts = data?.posts ?? []
  const activity = data?.activity ?? []
  function refreshDashboard() {
    refresh()
    setQueueVersion((v) => v + 1)
  }

  return (
    <div>
      <PageHeader
        eyebrow="National Command"
        title="National Dashboard"
        action={
          <button className="btn-ghost" onClick={refreshDashboard} disabled={loading}>
            Refresh dashboard
          </button>
        }
      />
      <WorkspaceStatus loading={loading} error={error} retry={refreshDashboard} />
      {data && (
        <p className="text-xs text-muted mb-4">
          Updated {formatDistanceToNow(new Date(data.generated_at), { addSuffix: true })}
        </p>
      )}
      <ActionQueue key={queueVersion} />

      <div className="mb-6">
        <div className="eyebrow mb-2">Pipeline</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Link to="/applications" className="block h-full">
            <StatCard label="New Applications" value={metrics?.openApplications ?? '—'} accent="gold" />
          </Link>
          <Link to="/vetting" className="block h-full">
            <StatCard label="In Vetting" value={metrics?.inVetting ?? '—'} accent="gold" />
          </Link>
          <Link to="/health?tab=forming" className="block h-full">
            <StatCard label="In Development" value={metrics?.developingPosts ?? '—'} accent="gold" />
          </Link>
          <Link to="/health?tab=forming&status=charter_ready" className="block h-full">
            <StatCard label="Charter Ready" value={metrics?.charterReady ?? '—'} accent="gold" />
          </Link>
          <Link to="/health" className="block h-full">
            <StatCard label="Active Posts" value={metrics?.activePosts ?? '—'} accent="gold" />
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <div className="eyebrow mb-2">Growth &amp; Money</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Link to="/members" className="block h-full">
            <StatCard label="Total Members" value={metrics?.totalMembers ?? '—'} accent="active" />
          </Link>
          <Link to="/sponsors" className="block h-full">
            <StatCard
              label="Committed Sponsorships"
              value={metrics ? money.format(metrics.committedSponsorships) : '—'}
              accent="gold"
            />
          </Link>
          <Link to="/sponsors" className="block h-full">
            <StatCard
              label="Collected Sponsorships"
              value={metrics ? money.format(metrics.collectedSponsorships) : '—'}
              accent="active"
            />
          </Link>
          <div className="h-full">
            <StatCard
              label="Recorded Receipts This Month"
              value={metrics ? money.format(metrics.thisMonthReceipts) : '—'}
              accent="active"
            />
          </div>
          <Link to="/sponsors" className="block h-full">
            <StatCard label="Sponsor Pipeline" value={metrics?.sponsorPipeline ?? '—'} accent="gold" />
          </Link>
          <Link to="/recruiting" className="block h-full">
            <StatCard
              label="Recruiting Pipeline"
              value={metrics?.recruitingPipeline ?? '—'}
              accent="developing"
            />
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted mb-6">
        Committed sponsorships are won agreements. Collections are recorded sponsor payments. Monthly receipts
        include paid membership dues, sponsor payments and donations recorded here; they are not a complete
        ledger or net income.
        {metrics && <> Previous month: {money.format(metrics.lastMonthReceipts)}. Months use Eastern Time.</>}
      </p>

      <div className="mb-6">
        <div className="eyebrow mb-2">Operations</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Link to="/meetings" className="block h-full">
            <StatCard
              label="Posts Needing Minutes"
              value={metrics?.overdueOnMinutes ?? '—'}
              accent={metrics && metrics.overdueOnMinutes > 0 ? 'attention' : 'active'}
            />
          </Link>
          <Link to="/congress" className="block h-full">
            <StatCard label="Open Resolutions" value={metrics?.openResolutions ?? '—'} accent="developing" />
          </Link>
          <Link to="/build-a-post" className="block h-full">
            <StatCard
              label="Facility Projects Active"
              value={metrics?.activeFacilityProjects ?? '—'}
              accent="developing"
            />
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted mb-6">
        Minutes attention means a past meeting is unfinished, no published minutes exist, or the latest
        published meeting is over 60 days old. The count is posts; the queue lists individual tasks.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">{data && <UsStatusMap posts={posts} />}</div>

        <div className="panel p-5">
          <div className="eyebrow mb-4">Recent Activity</div>
          {!data ? (
            <p className="text-sm text-muted">
              {loading ? 'Loading recent activity…' : 'Recent activity unavailable.'}
            </p>
          ) : activity.length === 0 ? (
            <EmptyState
              title="No activity yet"
              hint="Applications, charters, and sponsor wins will show up here."
            />
          ) : (
            <ul className="space-y-4">
              {activity.map((item) => (
                <li key={item.id} className="text-sm">
                  <div className="text-ink">{item.summary}</div>
                  <div className="font-mono text-[11px] text-muted mt-0.5">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
