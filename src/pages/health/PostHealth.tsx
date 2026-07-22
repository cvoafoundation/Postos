import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { computePostHealth, type PostHealthResult } from '@/lib/postHealth'
import { POST_STATUS_LABELS, type Post } from '@/lib/types'

interface ScoredPost {
  post: Post
  result: PostHealthResult
}

export default function PostHealth() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'health' | 'forming'>('health')
  const [scored, setScored] = useState<ScoredPost[]>([])
  const [formingPosts, setFormingPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: postsData } = await supabase.from('posts').select('*')
      const allPosts = (postsData ?? []) as Post[]
      const posts = allPosts.filter((p) => p.status === 'active_post')
      setFormingPosts(allPosts.filter((p) => p.status !== 'active_post'))

      const results = await Promise.all(
        posts.map(async (post) => {
          const currentYear = new Date().getFullYear()
          const [foundingRes, sponsorsRes, meetingsRes, recruitsRes, membersRes, delegateRes, votesRes, sigsRes, reviewRes, serviceRes, txRes] =
            await Promise.all([
              supabase.from('founding_team_members').select('*').eq('post_id', post.id),
              supabase.from('sponsors').select('*').eq('post_id', post.id),
              supabase.from('meeting_records').select('meeting_date').eq('post_id', post.id),
              supabase.from('recruits').select('*').eq('post_id', post.id),
              supabase.from('members').select('*').eq('post_id', post.id),
              supabase.from('congress_delegates').select('*').eq('post_id', post.id),
              supabase.from('resolution_votes').select('id, voter_post_id').eq('voter_post_id', post.id),
              supabase.from('governance_signatures').select('*').eq('post_id', post.id),
              supabase.from('annual_reviews').select('*').eq('post_id', post.id).eq('review_year', currentYear).single(),
              supabase.from('community_service_events').select('*').eq('post_id', post.id),
              supabase.from('financial_transactions').select('*').eq('post_id', post.id),
            ])

          const result = computePostHealth({
            post,
            foundingTeam: (foundingRes.data ?? []) as any[],
            sponsors: (sponsorsRes.data ?? []) as any[],
            meetingDates: ((meetingsRes.data ?? []) as any[]).map((m) => m.meeting_date),
            recruits: (recruitsRes.data ?? []) as any[],
            members: (membersRes.data ?? []) as any[],
            hasDelegate: ((delegateRes.data ?? []) as any[]).length > 0,
            delegateVotesCast: ((votesRes.data ?? []) as any[]).length,
            governanceSignatures: (sigsRes.data ?? []) as any[],
            annualReview: (reviewRes.data as any) ?? null,
            communityServiceEvents: (serviceRes.data ?? []) as any[],
            financialTransactions: (txRes.data ?? []) as any[],
          })

          return { post, result }
        })
      )

      results.sort((a, b) => a.result.score - b.result.score)
      setScored(results)
      setLoading(false)
    }
    load()
  }, [])

  const struggling = scored.filter((s) => s.result.overall === 'red')

  return (
    <div>
      <PageHeader eyebrow="Module 9" title="Posts" />

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
        loading ? (
          <p className="text-sm text-muted">Computing health scores…</p>
        ) : scored.length === 0 ? (
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
                    <button key={post.id} onClick={() => navigate(`/health/${post.id}`)}>
                      <StatusBadge label={`${post.name} — ${result.score}`} tone="attention" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="panel overflow-hidden">
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
                    <tr key={post.id} onClick={() => navigate(`/health/${post.id}`)} className="cursor-pointer hover:bg-surface/60">
                      <td className="table-cell">{post.name}</td>
                      <td className="table-cell font-mono">{post.state}</td>
                      <td className="table-cell font-mono text-gold">{result.score}</td>
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
      ) : formingPosts.length === 0 ? (
        <EmptyState title="Nothing forming right now" hint="Posts show up here once an application advances to Founding Team Building." />
      ) : (
        <div className="panel overflow-hidden">
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
                <tr key={post.id} onClick={() => navigate(`/health/${post.id}`)} className="cursor-pointer hover:bg-surface/60">
                  <td className="table-cell">{post.name}</td>
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
