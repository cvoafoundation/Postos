import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { UsStatusMap } from '@/components/map/UsStatusMap'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { ActivityFeedItem, Post } from '@/lib/types'
import { formatDistanceToNow, differenceInDays } from 'date-fns'

interface Metrics {
  // Pipeline
  openApplications: number
  inVetting: number
  developingPosts: number
  charterReady: number
  activePosts: number
  // Growth & Money
  totalMembers: number
  totalSponsorRevenue: number
  sponsorPipeline: number
  recruitingPipeline: number
  thisMonthRevenue: number
  lastMonthRevenue: number
  // Operations
  overdueOnMinutes: number
  openResolutions: number
  activeFacilityProjects: number
}

const OVERDUE_RED_DAYS = 60
const OPEN_APPLICATION_STATUSES = ['new_inquiry', 'application_submitted']
const VETTING_STATUSES = ['interview_scheduled', 'vetting']
const RECRUIT_ACTIVE_STAGES = ['prospect', 'interested', 'attended_meeting', 'applied']
const RESOLUTION_CLOSED_STATUSES = ['passed', 'rejected', 'implemented', 'archived']

// "This month" / "last month" as plain 'YYYY-MM' strings, used to bucket
// both membership dues and sponsor deals by when the money actually landed
// — a sponsor's agreement_start_date if set, otherwise created_at.
function monthKey(dateStr: string) {
  return dateStr.slice(0, 7)
}

export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([])
  const [activity, setActivity] = useState<ActivityFeedItem[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [
        postsRes,
        activityRes,
        profilesCountRes,
        sponsorsRes,
        meetingRecordsRes,
        applicationsRes,
        recruitsRes,
        resolutionsRes,
        facilityProjectsRes,
        membershipPaymentsRes,
      ] = await Promise.all([
        supabase.from('posts').select('*'),
        supabase.from('activity_feed').select('*').order('created_at', { ascending: false }).limit(8),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('sponsors').select('sponsorship_value, stage, agreement_start_date, created_at'),
        supabase.from('meeting_records').select('post_id, meeting_date'),
        supabase.from('post_applications').select('status'),
        supabase.from('recruits').select('stage'),
        supabase.from('resolutions').select('status'),
        supabase.from('post_facility_projects').select('status'),
        supabase.from('membership_payments').select('amount, status, paid_at'),
      ])

      if (cancelled) return

      const allPosts = (postsRes.data ?? []) as Post[]
      setPosts(allPosts)
      setActivity((activityRes.data ?? []) as ActivityFeedItem[])

      const activePostList = allPosts.filter((p) => p.status === 'active_post')
      const lastByPost: Record<string, string> = {}
      for (const r of (meetingRecordsRes.data ?? []) as any[]) {
        if (!lastByPost[r.post_id] || r.meeting_date > lastByPost[r.post_id]) {
          lastByPost[r.post_id] = r.meeting_date
        }
      }
      const overdueOnMinutes = activePostList.filter((p) => {
        const last = lastByPost[p.id]
        if (!last) return true
        return differenceInDays(new Date(), new Date(last)) > OVERDUE_RED_DAYS
      }).length

      const applications = (applicationsRes.data ?? []) as any[]
      const recruits = (recruitsRes.data ?? []) as any[]
      const resolutions = (resolutionsRes.data ?? []) as any[]
      const sponsors = (sponsorsRes.data ?? []) as any[]
      const facilityProjects = (facilityProjectsRes.data ?? []) as any[]
      const payments = (membershipPaymentsRes.data ?? []) as any[]

      // Revenue = membership dues actually paid + sponsor deals actually
      // won, bucketed by the month the money landed rather than the month
      // the record was created — a deal negotiated in March but starting
      // in April counts as April's revenue.
      const now = new Date()
      const thisMonthKey = monthKey(now.toISOString())
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthKey = monthKey(lastMonthDate.toISOString())

      let thisMonthRevenue = 0
      let lastMonthRevenue = 0

      for (const p of payments) {
        if (p.status !== 'paid' || !p.paid_at) continue
        const key = monthKey(p.paid_at)
        if (key === thisMonthKey) thisMonthRevenue += Number(p.amount ?? 0)
        else if (key === lastMonthKey) lastMonthRevenue += Number(p.amount ?? 0)
      }
      for (const s of sponsors) {
        if (s.stage !== 'won') continue
        const key = monthKey(s.agreement_start_date ?? s.created_at)
        if (key === thisMonthKey) thisMonthRevenue += Number(s.sponsorship_value ?? 0)
        else if (key === lastMonthKey) lastMonthRevenue += Number(s.sponsorship_value ?? 0)
      }

      setMetrics({
        openApplications: applications.filter((a) => OPEN_APPLICATION_STATUSES.includes(a.status)).length,
        inVetting: applications.filter((a) => VETTING_STATUSES.includes(a.status)).length,
        developingPosts: allPosts.filter((p) => p.status !== 'active_post').length,
        charterReady: allPosts.filter((p) => p.status === 'charter_ready').length,
        activePosts: activePostList.length,
        totalMembers: profilesCountRes.count ?? 0,
        totalSponsorRevenue: sponsors.filter((s) => s.stage === 'won').reduce((sum, s) => sum + (s.sponsorship_value ?? 0), 0),
        sponsorPipeline: sponsors.filter((s) => !['won', 'lost'].includes(s.stage)).length,
        recruitingPipeline: recruits.filter((r) => RECRUIT_ACTIVE_STAGES.includes(r.stage)).length,
        thisMonthRevenue,
        lastMonthRevenue,
        overdueOnMinutes,
        openResolutions: resolutions.filter((r) => !RESOLUTION_CLOSED_STATUSES.includes(r.status)).length,
        activeFacilityProjects: facilityProjects.filter((p) => p.status !== 'complete').length,
      })
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Green if this month's revenue is at or above last month's, red if it's
  // down — matches "profit vs loss" as a month-over-month comparison
  // rather than a flat positive/negative check.
  const revenueAccent: 'active' | 'attention' | 'gold' =
    metrics === null ? 'gold' : metrics.thisMonthRevenue >= metrics.lastMonthRevenue ? 'active' : 'attention'

  return (
    <div>
      <PageHeader eyebrow="National Command" title="Global Dashboard" />

      <div className="mb-6">
        <div className="eyebrow mb-2">Pipeline</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Link to="/applications" className="block h-full">
            <StatCard label="New Applications" value={metrics?.openApplications ?? '—'} accent="gold" />
          </Link>
          <Link to="/vetting" className="block h-full">
            <StatCard label="In Vetting" value={metrics?.inVetting ?? '—'} accent="gold" />
          </Link>
          <Link to="/checklist" className="block h-full">
            <StatCard label="In Development" value={metrics?.developingPosts ?? '—'} accent="gold" />
          </Link>
          <div className="h-full">
            <StatCard label="Charter Ready" value={metrics?.charterReady ?? '—'} accent="gold" />
          </div>
          <Link to="/health" className="block h-full">
            <StatCard label="Active Posts" value={metrics?.activePosts ?? '—'} accent="gold" />
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <div className="eyebrow mb-2">Growth &amp; Money</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div className="h-full">
            <StatCard label="Total Members" value={metrics?.totalMembers ?? '—'} accent={revenueAccent} />
          </div>
          <Link to="/sponsors" className="block h-full">
            <StatCard
              label="Sponsor Revenue"
              value={metrics ? `$${metrics.totalSponsorRevenue.toLocaleString()}` : '—'}
              accent={revenueAccent}
            />
          </Link>
          <Link to="/sponsors" className="block h-full">
            <StatCard label="Sponsor Pipeline" value={metrics?.sponsorPipeline ?? '—'} accent={revenueAccent} />
          </Link>
          <Link to="/recruiting" className="block h-full">
            <StatCard label="Recruiting Pipeline" value={metrics?.recruitingPipeline ?? '—'} accent={revenueAccent} />
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <div className="eyebrow mb-2">Operations</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Link to="/meetings" className="block h-full">
            <StatCard label="Overdue on Minutes" value={metrics?.overdueOnMinutes ?? '—'} accent="developing" />
          </Link>
          <Link to="/congress" className="block h-full">
            <StatCard label="Open Resolutions" value={metrics?.openResolutions ?? '—'} accent="developing" />
          </Link>
          <Link to="/build-a-post" className="block h-full">
            <StatCard label="Facility Projects Active" value={metrics?.activeFacilityProjects ?? '—'} accent="developing" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {!loading && <UsStatusMap posts={posts} />}
        </div>

        <div className="panel p-5">
          <div className="eyebrow mb-4">Recent Activity</div>
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" hint="Applications, charters, and sponsor wins will show up here." />
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
