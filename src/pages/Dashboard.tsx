import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { UsStatusMap } from '@/components/map/UsStatusMap'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { ActivityFeedItem, Post } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'

interface Metrics {
  activePosts: number
  developingPosts: number
  charterReady: number
  totalMembers: number
  totalSponsorRevenue: number
  upcomingEvents: number
}

export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([])
  const [activity, setActivity] = useState<ActivityFeedItem[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [postsRes, activityRes, profilesCountRes, sponsorsRes] = await Promise.all([
        supabase.from('posts').select('*'),
        supabase.from('activity_feed').select('*').order('created_at', { ascending: false }).limit(8),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('sponsors').select('sponsorship_value').eq('stage', 'won'),
      ])

      if (cancelled) return

      const allPosts = (postsRes.data ?? []) as Post[]
      setPosts(allPosts)
      setActivity((activityRes.data ?? []) as ActivityFeedItem[])
      setMetrics({
        activePosts: allPosts.filter((p) => p.status === 'active_post').length,
        developingPosts: allPosts.filter((p) => p.status !== 'active_post').length,
        charterReady: allPosts.filter((p) => p.status === 'charter_ready').length,
        totalMembers: profilesCountRes.count ?? 0,
        totalSponsorRevenue: (sponsorsRes.data ?? []).reduce((sum, s: any) => sum + (s.sponsorship_value ?? 0), 0),
        upcomingEvents: 0, // wire to an events table once scheduling is integrated
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Active Posts" value={metrics?.activePosts ?? '—'} accent="active" />
        <StatCard label="In Development" value={metrics?.developingPosts ?? '—'} accent="developing" />
        <StatCard label="Charter Ready" value={metrics?.charterReady ?? '—'} accent="gold" />
        <StatCard label="Total Members" value={metrics?.totalMembers ?? '—'} />
        <StatCard
          label="Sponsor Revenue"
          value={metrics ? `$${metrics.totalSponsorRevenue.toLocaleString()}` : '—'}
        />
        <StatCard label="Upcoming Events" value={metrics?.upcomingEvents ?? '—'} />
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
