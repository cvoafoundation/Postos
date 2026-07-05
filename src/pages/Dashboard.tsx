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
  activePosts: number
  developingPosts: number
  charterReady: number
  totalMembers: number
  totalSponsorRevenue: number
  upcomingEvents: number
  overdueOnMinutes: number
}

const OVERDUE_RED_DAYS = 60

export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([])
  const [activity, setActivity] = useState<ActivityFeedItem[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [postsRes, activityRes, profilesCountRes, sponsorsRes, meetingRecordsRes] = await Promise.all([
        supabase.from('posts').select('*'),
        supabase.from('activity_feed').select('*').order('created_at', { ascending: false }).limit(8),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('sponsors').select('sponsorship_value').eq('stage', 'won'),
        supabase.from('meeting_records').select('post_id, meeting_date'),
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

      setMetrics({
        activePosts: activePostList.length,
        developingPosts: allPosts.filter((p) => p.status !== 'active_post').length,
        charterReady: allPosts.filter((p) => p.status === 'charter_ready').length,
        totalMembers: profilesCountRes.count ?? 0,
        totalSponsorRevenue: (sponsorsRes.data ?? []).reduce((sum, s: any) => sum + (s.sponsorship_value ?? 0), 0),
        upcomingEvents: 0, // wire to an events table once scheduling is integrated
        overdueOnMinutes,
      })
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <PageHeader eyebrow="National Command" title="Global Dashboard" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
        <StatCard label="Active Posts" value={metrics?.activePosts ?? '—'} accent="active" />
        <StatCard label="In Development" value={metrics?.developingPosts ?? '—'} accent="developing" />
        <StatCard label="Charter Ready" value={metrics?.charterReady ?? '—'} accent="gold" />
        <StatCard label="Total Members" value={metrics?.totalMembers ?? '—'} />
        <StatCard
          label="Sponsor Revenue"
          value={metrics ? `$${metrics.totalSponsorRevenue.toLocaleString()}` : '—'}
        />
        <StatCard label="Upcoming Events" value={metrics?.upcomingEvents ?? '—'} />
        <Link to="/meeting-records">
          <StatCard
            label="Overdue on Minutes"
            value={metrics?.overdueOnMinutes ?? '—'}
            accent={metrics && metrics.overdueOnMinutes > 0 ? 'attention' : 'gold'}
          />
        </Link>
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
