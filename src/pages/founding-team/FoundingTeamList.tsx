import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { POST_STATUS_LABELS, type FoundingTeamMember, type Post } from '@/lib/types'

const REQUIRED_POSITIONS = ['commander', 'vice_commander', 'adjutant', 'quartermaster', 'sergeant_at_arms']

export default function FoundingTeamList() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState<Post[]>([])
  const [membersByPost, setMembersByPost] = useState<Record<string, FoundingTeamMember[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: postsData } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
      const list = (postsData ?? []) as Post[]
      setPosts(list)

      const { data: membersData } = await supabase
        .from('founding_team_members')
        .select('*')
        .in('post_id', list.map((p) => p.id))
      const grouped: Record<string, FoundingTeamMember[]> = {}
      for (const m of (membersData ?? []) as FoundingTeamMember[]) {
        if (!grouped[m.post_id]) grouped[m.post_id] = []
        grouped[m.post_id].push(m)
      }
      setMembersByPost(grouped)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Module 3" title="Founding Teams" />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every post's founding team — including ones already active, since the roster and
        verification history don't disappear once a post graduates. Click one to see its roster.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : posts.length === 0 ? (
        <EmptyState
          title="No posts yet"
          hint="A post shows up here once an application is advanced to Founding Team Building from the Application Pipeline."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {posts.map((post) => {
            const members = membersByPost[post.id] ?? []
            const filled = new Set(members.map((m) => m.position))
            const filledCount = REQUIRED_POSITIONS.filter((p) => filled.has(p as any)).length
            const verifiedCount = members.filter((m) => m.verification_status === 'verified').length
            return (
              <button
                key={post.id}
                onClick={() => navigate(`/founding-team/${post.id}`)}
                className="panel p-4 text-left hover:border-gold transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">{post.name}</div>
                  <StatusBadge label={POST_STATUS_LABELS[post.status]} tone={post.status === 'active_post' ? 'active' : 'developing'} />
                </div>
                <div className="text-xs text-muted font-mono">
                  {filledCount}/5 positions filled · {verifiedCount}/{members.length || 0} verified
                  {members.length === 0 && ' · no roster on file'}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
