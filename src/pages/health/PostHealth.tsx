import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { type PostHealthResult } from '@/lib/postHealth'
import { usePostHealth, healthColor } from '@/lib/usePostHealth'
import { useAuth } from '@/context/AuthContext'
import { readAllRows } from '@/lib/readAllRows'
import { POST_STATUS_LABELS, type Post } from '@/lib/types'

interface ScoredPost {
  post: Post
  result: PostHealthResult
}

export default function PostHealth() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'health' | 'forming'>('health')
  const { profile } = useAuth()
  const [allPosts, setAllPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const health = usePostHealth(allPosts.filter(p => p.status === 'active_post').map(p => p.id), version)
  const formingPosts = allPosts.filter(p => p.status !== 'active_post')
  const scored: ScoredPost[] = allPosts.flatMap(post => health.scores[post.id] ? [{ post, result: health.scores[post.id] }] : []).sort((a,b) => a.result.score - b.result.score)
  const destination = (id: string) => profile?.role === 'state_commander' ? `/post-overview/${id}` : `/health/${id}`
  useEffect(() => {
    let active = true
    setAllPosts([]); setLoading(true); setError(null)
    void readAllRows<Post>(() => supabase.from('posts').select('*').order('id'))
      .then(posts => { if (active) setAllPosts(posts) })
      .catch(e => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [profile?.id, profile?.role, profile?.state, profile?.post_id, version])

  const struggling = scored.filter((s) => s.result.overall === 'red')

  return (
    <div>
      <PageHeader eyebrow={profile?.role === "state_commander" ? `State Command · ${profile.state}` : "Post operations"} title="Posts" />
      <button className="btn-ghost mb-4" onClick={() => setVersion(v => v + 1)}>Refresh posts & scores</button>
      {(error || health.error) && <p role="alert" className="text-status-attention mb-4">{error || health.error}</p>}

      {/* One page owns every post regardless of stage — Health for posts
          already live, Forming for everything still working through the
          launch checklist. Whichever post you click, in either tab, lands
          on the same per-post page, which shows the right view for that
          post's actual stage. */}
      <div className="flex gap-1 mb-6 border-b border-hairline">
        <button
          onClick={() => setTab('health')}
          className={`px-4 py-2 text-sm font-mono uppercase tracking-wide border-b-2 -mb-px transition-colors ${
            tab === 'health' ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Health
        </button>
        <button
          onClick={() => setTab('forming')}
          className={`px-4 py-2 text-sm font-mono uppercase tracking-wide border-b-2 -mb-px transition-colors flex items-center gap-2 ${
            tab === 'forming' ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Forming
          {formingPosts.length > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-base text-[10px] font-mono font-medium flex items-center justify-center">
              {formingPosts.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'health' ? (
        loading || health.loading ? (
          <p className="text-sm text-muted">Computing health scores…</p>
        ) : error || health.error ? <p className="text-muted">Refresh to retry loading health data.</p> : scored.length === 0 ? (
          <EmptyState
            title="No active posts yet"
            hint="A real composite score — officers, sponsors, meetings, membership, Congress participation, governance, community service, and finances — rolls up here once posts go active."
          />
        ) : (
          <>
            {struggling.length > 0 && (
              <div className="panel p-4 mb-6">
                <div className="eyebrow mb-2 text-status-attention">Needs Immediate Attention</div>
                <div className="flex gap-2 flex-wrap">
                  {struggling.map(({ post, result }) => (
                    <button key={post.id} onClick={() => navigate(destination(post.id))}>
                      <StatusBadge label={`${post.name} — ${result.score}`} tone="attention" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="panel overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-head">Post</th>
                    <th className="table-head">State</th>
                    <th className="table-head">Score</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Charter Date</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map(({ post, result }) => (
                    <tr key={post.id} onClick={() => navigate(destination(post.id))} className="cursor-pointer hover:bg-surface/60">
                      <td className="table-cell"><button className="text-gold hover:underline" onClick={() => navigate(destination(post.id))}>{post.name} → Open dashboard</button></td>
                      <td className="table-cell font-mono">{post.state}</td>
                      <td className={`table-cell font-mono ${healthColor(result.overall)}`}>{result.score}/100</td>
                      <td className="table-cell">
                        <StatusBadge
                          label={result.overall}
                          tone={result.overall === 'green' ? 'active' : result.overall === 'yellow' ? 'developing' : 'attention'}
                        />
                      </td>
                      <td className="table-cell text-muted">{post.charter_date ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : loading ? <p className="text-muted">Loading forming posts…</p> : error ? <p className="text-muted">Refresh to retry loading posts.</p> : formingPosts.length === 0 ? (
        <EmptyState title="Nothing forming right now" hint="Posts show up here once an application advances to Founding Team Building." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Name</th>
                <th className="table-head">State</th>
                <th className="table-head">Status</th>
                <th className="table-head">Charter Date</th>
              </tr>
            </thead>
            <tbody>
              {formingPosts.map((post) => (
                <tr key={post.id} onClick={() => navigate(destination(post.id))} className="cursor-pointer hover:bg-surface/60">
                  <td className="table-cell"><button className="text-gold hover:underline" onClick={() => navigate(destination(post.id))}>{post.name} → Open dashboard</button></td>
                  <td className="table-cell font-mono">{post.state}</td>
                  <td className="table-cell">
                    <StatusBadge label={POST_STATUS_LABELS[post.status]} tone="developing" />
                  </td>
                  <td className="table-cell text-muted">{post.charter_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
