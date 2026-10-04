import ActionQueue from '@/components/workspaces/ActionQueue'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { usePostHealth, healthColor } from '@/lib/usePostHealth'
import type { Post } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CalendarCheck, Users, HandCoins, HeartPulse, IdCard } from 'lucide-react'

export default function PostHome() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [post, setPost] = useState<Post | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [sponsorPipelineValue, setSponsorPipelineValue] = useState(0)
  const [checklistPct, setChecklistPct] = useState<number | null>(null)
  const healthData = usePostHealth(post?.status === 'active_post' ? [post.id] : [])
  const health = post ? healthData.scores[post.id] : undefined
  const [lastMeeting, setLastMeeting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.post_id) {
      setLoading(false)
      return
    }
    const postId = profile.post_id

    async function load() {
      const { data: postData } = await supabase.from('posts').select('*').eq('id', postId).single()
      setPost(postData as Post)

      const [membersRes, sponsorsRes, checklistRes, meetingsRes] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('post_id', postId).eq('membership_status', 'active'),
        supabase.from('sponsors').select('sponsorship_value').eq('post_id', postId).not('stage', 'in', '(won,lost)'),
        supabase.from('checklist_items').select('is_complete').eq('post_id', postId),
        supabase.from('meeting_records').select('meeting_date').eq('post_id', postId).order('meeting_date', { ascending: false }).limit(1),
      ])

      setMemberCount(membersRes.count ?? 0)
      setSponsorPipelineValue(((sponsorsRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.sponsorship_value ?? 0), 0))
      const items = (checklistRes.data ?? []) as any[]
      setChecklistPct(items.length > 0 ? Math.round((items.filter((i) => i.is_complete).length / items.length) * 100) : null)
      setLastMeeting((meetingsRes.data ?? [])[0]?.meeting_date ?? null)

      setLoading(false)
    }
    load()
  }, [profile?.post_id])

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  if (!post) {
    return (
      <div>
        <div className="eyebrow mb-1">Welcome</div>
        <h1 className="font-display text-3xl tracking-wide mb-4">{profile?.full_name}</h1>
        <p className="text-sm text-muted">Your account isn't tied to a post yet — contact National.</p>
      </div>
    )
  }

  return (
    <div>
      <ActionQueue />
      {healthData.error && <p role="alert" className="text-status-attention mb-4">Health score unavailable: {healthData.error}</p>}
      <div className="mb-8">
        <div className="eyebrow mb-1">{post.city ? `${post.city}, ` : ''}{post.state}</div>
        <h1 className="font-display text-3xl tracking-wide">{post.name}</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <button onClick={() => navigate('/members')} className="panel p-4 text-left hover:border-gold transition-colors">
          <IdCard className="text-gold mb-2" size={18} />
          <div className="font-display text-2xl">{memberCount}</div>
          <div className="eyebrow mt-1">Active Members</div>
        </button>
        <button onClick={() => navigate('/sponsors')} className="panel p-4 text-left hover:border-gold transition-colors">
          <HandCoins className="text-gold mb-2" size={18} />
          <div className="font-display text-2xl">${sponsorPipelineValue.toLocaleString()}</div>
          <div className="eyebrow mt-1">Sponsor Pipeline</div>
        </button>
        <button onClick={() => navigate('/meetings')} className="panel p-4 text-left hover:border-gold transition-colors">
          <CalendarCheck className="text-gold mb-2" size={18} />
          <div className="font-display text-sm mt-1">{lastMeeting ?? 'None yet'}</div>
          <div className="eyebrow mt-1">Last Meeting</div>
        </button>
        {post.status === 'active_post' ? (
          <button onClick={() => navigate(`/health/${post.id}`)} className={`panel border-l-4 p-4 text-left hover:border-gold transition-colors ${healthColor(health?.overall)}`}>
            <HeartPulse className="text-gold mb-2" size={18} />
            <div className="font-display text-2xl">{health ? `${health.score}/100` : healthData.loading ? "Loading…" : "Unavailable"}</div>
            <div className="eyebrow mt-1">Post Health{health ? ` · ${health.overall}` : ""}</div>
          </button>
        ) : (
          <button onClick={() => navigate(`/health/${post.id}`)} className="panel p-4 text-left hover:border-gold transition-colors">
            <Users className="text-gold mb-2" size={18} />
            <div className="font-display text-2xl">{checklistPct ?? '—'}%</div>
            <div className="eyebrow mt-1">Launch Checklist</div>
          </button>
        )}
      </div>

      {post.status === 'active_post' && health && (
        <div className="panel p-5">
          <div className="eyebrow mb-3">Health Breakdown</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {health.dimensions
              .filter((d) => d.status !== 'neutral')
              .map((d) => (
                <div key={d.key} className="flex items-center justify-between border border-hairline rounded-sm p-2.5">
                  <div>
                    <div className="text-sm">{d.label}</div>
                    <div className="text-[11px] text-muted">{d.detail}</div>
                  </div>
                  <StatusBadge label={d.status} tone={d.status === 'green' ? 'active' : d.status === 'yellow' ? 'developing' : 'attention'} />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
