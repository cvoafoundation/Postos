import { useEffect, useState, type ChangeEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import {
  RESOLUTION_STATUS_LABELS,
  RESOLUTION_STATUS_ORDER,
  VOTE_TYPE_LABELS,
  type CongressVoteType,
  type Resolution,
  type ResolutionAmendment,
  type ResolutionComment,
  type ResolutionDocument,
  type ResolutionStatus,
  type DebateResponseType,
} from '@/lib/types'
import { format, formatDistanceToNow } from 'date-fns'
import { Upload, FileText, ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react'

function statusTone(status: string) {
  if (status === 'passed' || status === 'implemented') return 'active' as const
  if (status === 'rejected' || status === 'archived') return 'neutral' as const
  return 'developing' as const
}

const RESPONSE_LABELS: Record<DebateResponseType, string> = {
  support: 'Support',
  oppose: 'Oppose',
  question: 'Question',
  amendment: 'Amendment',
  clarification: 'Clarification',
}

export default function ResolutionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, isNational, isDelegate } = useAuth()

  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [amendments, setAmendments] = useState<ResolutionAmendment[]>([])
  const [documents, setDocuments] = useState<ResolutionDocument[]>([])
  const [comments, setComments] = useState<ResolutionComment[]>([])
  const [votes, setVotes] = useState<{ vote: boolean; voter_post_id: string | null; voter_id: string | null }[]>([])
  const [posts, setPosts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [showAmend, setShowAmend] = useState(false)
  const [showVoteSetup, setShowVoteSetup] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [responseType, setResponseType] = useState<DebateResponseType>('clarification')
  const [postingComment, setPostingComment] = useState(false)
  const [myVote, setMyVote] = useState<boolean | null>(null)
  const [myPreference, setMyPreference] = useState<boolean | null>(null)
  const [preferenceTally, setPreferenceTally] = useState<{ support: number; oppose: number } | null>(null)
  const [savingPreference, setSavingPreference] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    const [resRes, amendRes, docRes, commentRes, voteRes, postsRes] = await Promise.all([
      supabase.from('resolutions').select('*').eq('id', id).single(),
      supabase.from('resolution_amendments').select('*').eq('resolution_id', id).order('created_at', { ascending: false }),
      supabase.from('resolution_documents').select('*').eq('resolution_id', id).order('created_at', { ascending: false }),
      supabase.from('resolution_comments').select('*').eq('resolution_id', id).order('created_at', { ascending: true }),
      supabase.from('resolution_votes').select('vote, voter_post_id, voter_id').eq('resolution_id', id),
      supabase.from('posts').select('id, name'),
    ])
    setResolution((resRes.data as Resolution) ?? null)
    setAmendments((amendRes.data ?? []) as ResolutionAmendment[])
    setDocuments((docRes.data ?? []) as ResolutionDocument[])
    setComments((commentRes.data ?? []) as ResolutionComment[])
    setVotes((voteRes.data ?? []) as any[])
    const postMap: Record<string, string> = {}
    for (const p of (postsRes.data ?? []) as any[]) postMap[p.id] = p.name
    setPosts(postMap)

    if (profile && resRes.data) {
      const { data: mine } = await supabase
        .from('resolution_votes')
        .select('vote')
        .eq('resolution_id', id)
        .eq('vote_type', (resRes.data as Resolution).vote_type)
        .eq('voter_id', profile.id)
        .single()
      setMyVote(mine ? (mine as any).vote : null)

      const voteType = (resRes.data as Resolution).vote_type
      const isFormalVoteType = voteType === 'delegate_vote' || voteType === 'constitutional_amendment'

      // A regular member's own prior preference, so the buttons reflect
      // what they already told their delegate if they revisit this page.
      if (isFormalVoteType && !isNational && !isDelegate && profile.post_id) {
        const { data: pref } = await supabase
          .from('resolution_member_preferences')
          .select('preference')
          .eq('resolution_id', id)
          .eq('member_profile_id', profile.id)
          .single()
        setMyPreference(pref ? (pref as any).preference : null)
      }

      // The delegate (or National) sees their post's anonymous tally — this
      // never reveals who said what, only the totals, via the RPC's own
      // server-side permission check.
      if (isFormalVoteType && (isDelegate || isNational) && profile.post_id) {
        const { data: tally } = await supabase.rpc('get_preference_tally', {
          p_resolution_id: id,
          p_post_id: profile.post_id,
        })
        if (tally && tally.length > 0) {
          setPreferenceTally({ support: Number(tally[0].support_count), oppose: Number(tally[0].oppose_count) })
        }
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function advanceStatus(status: ResolutionStatus) {
    if (!resolution) return
    if (status === 'voting') {
      setShowVoteSetup(true)
      return
    }
    await supabase.from('resolutions').update({ status }).eq('id', resolution.id)
    load()
  }

  async function deleteResolution() {
    if (!resolution) return
    const confirmed = window.confirm(
      `Permanently delete "${resolution.title}"? This removes the resolution and everything tied to it — amendments, debate, votes, documents. This cannot be undone.`
    )
    if (!confirmed) return
    const { error } = await supabase.from('resolutions').delete().eq('id', resolution.id)
    if (error) {
      window.alert(`Couldn't delete: ${error.message}`)
      return
    }
    navigate('/congress')
  }

  async function castVote(vote: boolean) {
    if (!resolution?.vote_type || !profile) return
    const { data: existing } = await supabase
      .from('resolution_votes')
      .select('id')
      .eq('resolution_id', resolution.id)
      .eq('vote_type', resolution.vote_type)
      .eq('voter_id', profile.id)
      .single()

    if (existing) {
      await supabase.from('resolution_votes').update({ vote }).eq('id', (existing as any).id)
    } else {
      await supabase.from('resolution_votes').insert({
        resolution_id: resolution.id,
        vote_type: resolution.vote_type,
        voter_id: profile.id,
        voter_post_id: profile.post_id,
        vote,
      })
    }
    setMyVote(vote)
    load()
  }

  // The "electoral college" mechanic — never counts toward the resolution
  // passing, purely informs the one formal vote the delegate casts.
  async function castPreference(preference: boolean) {
    if (!resolution || !profile?.post_id) return
    setSavingPreference(true)
    await supabase.from('resolution_member_preferences').upsert(
      {
        resolution_id: resolution.id,
        post_id: profile.post_id,
        member_profile_id: profile.id,
        preference,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'resolution_id,member_profile_id' }
    )
    setSavingPreference(false)
    setMyPreference(preference)
  }

  async function postComment() {
    if (!newComment.trim() || !resolution) return
    setPostingComment(true)
    await supabase.from('resolution_comments').insert({
      resolution_id: resolution.id,
      author_id: profile?.id ?? null,
      response_type: responseType,
      body: newComment.trim(),
    })
    setPostingComment(false)
    setNewComment('')
    load()
  }

  async function handleDocUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !resolution) return
    setUploading(true)
    const path = `${resolution.id}/${crypto.randomUUID()}-${file.name}`
    const { data, error } = await supabase.storage.from('congress-documents').upload(path, file)
    if (!error && data) {
      await supabase.from('resolution_documents').insert({
        resolution_id: resolution.id,
        title: file.name,
        storage_path: data.path,
        uploaded_by: profile?.id ?? null,
      })
      load()
    }
    setUploading(false)
  }

  function docUrl(path: string) {
    const url = import.meta.env.VITE_SUPABASE_URL
    return url ? `${url}/storage/v1/object/public/congress-documents/${path}` : '#'
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>
  if (!resolution) return <EmptyState title="Resolution not found" />

  const yesVotes = votes.filter((v) => v.vote).length
  const noVotes = votes.filter((v) => !v.vote).length
  const totalVotes = votes.length
  const yesPct = totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 0

  const postBreakdown: Record<string, { yes: number; no: number }> = {}
  for (const v of votes) {
    if (!v.voter_post_id) continue
    const key = posts[v.voter_post_id] ?? 'Unknown Post'
    if (!postBreakdown[key]) postBreakdown[key] = { yes: 0, no: 0 }
    v.vote ? postBreakdown[key].yes++ : postBreakdown[key].no++
  }

  const topLevelComments = comments.filter((c) => !c.parent_comment_id)
  const repliesFor = (parentId: string) => comments.filter((c) => c.parent_comment_id === parentId)

  const currentIndex = RESOLUTION_STATUS_ORDER.indexOf(resolution.status)
  const nextStatus = RESOLUTION_STATUS_ORDER[currentIndex + 1]

  return (
    <div>
      <button onClick={() => navigate('/congress')} className="text-xs font-mono text-muted hover:text-gold mb-4">
        ← Back to Veterans Congress
      </button>

      <PageHeader
        eyebrow={resolution.resolution_number ?? 'Resolution'}
        title={resolution.title}
        action={
          <div className="flex items-center gap-3">
            {isNational && nextStatus && (
              <button onClick={() => advanceStatus(nextStatus)} className="btn-gold">
                Advance to {RESOLUTION_STATUS_LABELS[nextStatus]} →
              </button>
            )}
            {isNational && (
              <button onClick={deleteResolution} className="text-xs text-muted hover:text-status-attention flex items-center gap-1.5">
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <StatusBadge label={RESOLUTION_STATUS_LABELS[resolution.status]} tone={statusTone(resolution.status)} />
        <StatusBadge label={resolution.category.replaceAll('_', ' ')} tone="neutral" />
        {resolution.vote_type && <StatusBadge label={VOTE_TYPE_LABELS[resolution.vote_type]} tone="developing" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {resolution.executive_summary && (
            <div className="panel p-5">
              <div className="eyebrow mb-2">Executive Summary</div>
              <p className="text-sm text-ink">{resolution.executive_summary}</p>
            </div>
          )}

          <div className="panel p-5">
            <div className="eyebrow mb-2">Full Resolution Text</div>
            <p className="text-sm text-ink whitespace-pre-wrap">{resolution.body}</p>
          </div>

          {resolution.purpose && (
            <div className="panel p-5">
              <div className="eyebrow mb-2">Purpose</div>
              <p className="text-sm text-ink">{resolution.purpose}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="panel p-5">
              <div className="eyebrow mb-2">Financial Impact</div>
              <div className="text-sm">
                <div>Cost: {resolution.financial_impact_cost != null ? `$${resolution.financial_impact_cost.toLocaleString()}` : '—'}</div>
                <div className="text-muted mt-1">Funding: {resolution.financial_impact_funding_source ?? '—'}</div>
              </div>
            </div>
            <div className="panel p-5">
              <div className="eyebrow mb-2">Organizational Impact</div>
              <p className="text-sm text-muted">{resolution.organizational_impact ?? '—'}</p>
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="eyebrow">Supporting Documents</div>
              {isNational && (
                <label className="text-xs text-gold hover:text-gold-bright cursor-pointer flex items-center gap-1">
                  <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload'}
                  <input type="file" className="hidden" onChange={handleDocUpload} disabled={uploading} />
                </label>
              )}
            </div>
            {documents.length === 0 ? (
              <p className="text-xs text-muted">No documents attached.</p>
            ) : (
              <ul className="space-y-1.5">
                {documents.map((d) => (
                  <li key={d.id}>
                    <a href={docUrl(d.storage_path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-gold hover:text-gold-bright">
                      <FileText size={14} /> {d.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="eyebrow">Amendment History</div>
              {isNational && (
                <button onClick={() => setShowAmend(true)} className="text-xs text-gold hover:text-gold-bright">
                  + Add Amendment
                </button>
              )}
            </div>
            {amendments.length === 0 ? (
              <p className="text-xs text-muted">No amendments — original text stands.</p>
            ) : (
              <div className="space-y-3">
                {amendments.map((a) => (
                  <div key={a.id} className="border-l-2 border-gold/40 pl-3">
                    <p className="text-sm text-ink">{a.amendment_summary}</p>
                    <p className="text-[11px] text-muted font-mono mt-0.5">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel p-5">
            <div className="eyebrow mb-3">Debate Floor</div>
            <div className="flex gap-2 mb-4">
              <select
                className="input-field w-40 shrink-0"
                value={responseType}
                onChange={(e) => setResponseType(e.target.value as DebateResponseType)}
              >
                {(Object.keys(RESPONSE_LABELS) as DebateResponseType[]).map((r) => (
                  <option key={r} value={r}>
                    {RESPONSE_LABELS[r]}
                  </option>
                ))}
              </select>
              <input
                placeholder="Add to the record…"
                className="input-field"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button onClick={postComment} disabled={postingComment} className="btn-gold px-4 shrink-0">
                Post
              </button>
            </div>

            {topLevelComments.length === 0 ? (
              <p className="text-xs text-muted">No debate yet — be the first to respond.</p>
            ) : (
              <div className="space-y-4">
                {topLevelComments.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge label={RESPONSE_LABELS[c.response_type]} tone="neutral" />
                      <span className="text-[11px] text-muted font-mono">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-ink">{c.body}</p>
                    {repliesFor(c.id).length > 0 && (
                      <div className="ml-4 mt-2 space-y-2 border-l-2 border-hairline pl-3">
                        {repliesFor(c.id).map((r) => (
                          <div key={r.id}>
                            <StatusBadge label={RESPONSE_LABELS[r.response_type]} tone="neutral" />
                            <p className="text-sm text-ink mt-1">{r.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {resolution.status === 'voting' && resolution.vote_type && (
            <div className="panel p-5">
              <div className="eyebrow mb-3">Cast Your Vote</div>
              {(resolution.vote_type === 'delegate_vote' || resolution.vote_type === 'constitutional_amendment') && !isNational && !isDelegate ? (
                <div>
                  <p className="text-xs text-muted mb-3">
                    This is a formal {resolution.vote_type === 'constitutional_amendment' ? 'constitutional amendment' : 'delegate'} vote —
                    only your post's designated delegate casts the vote that actually counts. But you can still show
                    them how you'd vote — it's anonymous, non-binding, and only your own delegate sees the tally.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => castPreference(true)}
                      disabled={savingPreference}
                      className={`flex items-center justify-center gap-2 rounded-sm py-2 text-sm border disabled:opacity-50 ${
                        myPreference === true ? 'bg-status-active text-base border-status-active' : 'border-hairline hover:border-status-active text-ink'
                      }`}
                    >
                      <ThumbsUp size={14} /> Support
                    </button>
                    <button
                      onClick={() => castPreference(false)}
                      disabled={savingPreference}
                      className={`flex items-center justify-center gap-2 rounded-sm py-2 text-sm border disabled:opacity-50 ${
                        myPreference === false ? 'bg-status-attention text-base border-status-attention' : 'border-hairline hover:border-status-attention text-ink'
                      }`}
                    >
                      <ThumbsDown size={14} /> Oppose
                    </button>
                  </div>
                  {myPreference !== null && (
                    <p className="text-[11px] text-muted mt-2">Your delegate can see this reflected in their post's tally, anonymously.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => castVote(true)}
                    className={`flex items-center justify-center gap-2 rounded-sm py-2 text-sm border ${
                      myVote === true ? 'bg-status-active text-base border-status-active' : 'border-hairline hover:border-status-active text-ink'
                    }`}
                  >
                    <ThumbsUp size={14} /> Support
                  </button>
                  <button
                    onClick={() => castVote(false)}
                    className={`flex items-center justify-center gap-2 rounded-sm py-2 text-sm border ${
                      myVote === false ? 'bg-status-attention text-base border-status-attention' : 'border-hairline hover:border-status-attention text-ink'
                    }`}
                  >
                    <ThumbsDown size={14} /> Oppose
                  </button>
                </div>
              )}

              {(resolution.vote_type === 'delegate_vote' || resolution.vote_type === 'constitutional_amendment') &&
                (isDelegate || isNational) &&
                preferenceTally &&
                preferenceTally.support + preferenceTally.oppose > 0 && (
                  <div className="border-t border-hairline mt-4 pt-3">
                    <div className="eyebrow mb-2">Your Post's Member Sentiment (anonymous)</div>
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>{preferenceTally.support} support</span>
                      <span>{preferenceTally.oppose} oppose</span>
                    </div>
                    <div className="h-2 bg-surface rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-status-active"
                        style={{ width: `${(preferenceTally.support / (preferenceTally.support + preferenceTally.oppose)) * 100}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gold">
                      {preferenceTally.support > preferenceTally.oppose
                        ? 'Your members lean toward supporting this — how you vote is still your call.'
                        : preferenceTally.oppose > preferenceTally.support
                        ? 'Your members lean toward opposing this — how you vote is still your call.'
                        : "Your members are evenly split — how you vote is still your call."}
                    </p>
                  </div>
                )}

              <div className="border-t border-hairline pt-3 mt-4">
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>{yesVotes} support</span>
                  <span>{noVotes} oppose</span>
                </div>
                <div className="h-2 bg-surface rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-status-active" style={{ width: `${yesPct}%` }} />
                </div>
                <div className="text-[11px] text-muted font-mono">{totalVotes} votes cast</div>
                {resolution.supermajority_threshold && (
                  <div className="text-[11px] text-gold font-mono mt-1">
                    Requires {Math.round(resolution.supermajority_threshold * 100)}% to pass
                  </div>
                )}
              </div>

              {Object.keys(postBreakdown).length > 0 && (
                <div className="border-t border-hairline mt-3 pt-3">
                  <div className="eyebrow mb-2">By Post</div>
                  <div className="space-y-1">
                    {Object.entries(postBreakdown).map(([name, counts]) => (
                      <div key={name} className="flex justify-between text-xs">
                        <span className="text-muted">{name}</span>
                        <span className="font-mono">
                          <span className="text-status-active">{counts.yes}</span>
                          {' / '}
                          <span className="text-status-attention">{counts.no}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="panel p-5">
            <div className="eyebrow mb-2">Submitted</div>
            <p className="text-sm text-muted">{format(new Date(resolution.created_at), 'MMM d, yyyy')}</p>
          </div>
        </div>
      </div>

      {showAmend && resolution && (
        <AmendmentModal
          resolution={resolution}
          onClose={() => setShowAmend(false)}
          onSaved={() => {
            setShowAmend(false)
            load()
          }}
        />
      )}

      {showVoteSetup && resolution && (
        <VoteSetupModal
          resolution={resolution}
          onClose={() => setShowVoteSetup(false)}
          onSaved={() => {
            setShowVoteSetup(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function AmendmentModal({
  resolution,
  onClose,
  onSaved,
}: {
  resolution: Resolution
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const [summary, setSummary] = useState('')
  const [newBody, setNewBody] = useState(resolution.body)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('resolution_amendments').insert({
      resolution_id: resolution.id,
      amended_by: profile?.id ?? null,
      amendment_summary: summary,
      previous_body: resolution.body,
      new_body: newBody,
    })
    await supabase.from('resolutions').update({ body: newBody }).eq('id', resolution.id)
    setSaving(false)
    onSaved()
  }

  return (
    <Modal title="Add Amendment" onClose={onClose}>
      <div className="space-y-3">
        <input
          placeholder="Summary of what changed"
          className="input-field"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <textarea
          className="input-field"
          rows={8}
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
        />
        <p className="text-[11px] text-muted">
          The previous text is preserved permanently in the amendment history — nothing is deleted.
        </p>
        <button onClick={handleSave} disabled={saving || !summary} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Amendment'}
        </button>
      </div>
    </Modal>
  )
}

function VoteSetupModal({
  resolution,
  onClose,
  onSaved,
}: {
  resolution: Resolution
  onClose: () => void
  onSaved: () => void
}) {
  const [voteType, setVoteType] = useState<CongressVoteType>('informal_poll')
  const [threshold, setThreshold] = useState('0.5')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('resolutions')
      .update({
        status: 'voting',
        vote_type: voteType,
        supermajority_threshold: voteType === 'constitutional_amendment' ? Number(threshold) : null,
        voting_opens_at: new Date().toISOString(),
      })
      .eq('id', resolution.id)
    setSaving(false)
    onSaved()
  }

  return (
    <Modal title="Open for Voting" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="eyebrow block mb-1.5">Vote Type</label>
          <select className="input-field" value={voteType} onChange={(e) => setVoteType(e.target.value as CongressVoteType)}>
            {(Object.keys(VOTE_TYPE_LABELS) as CongressVoteType[]).map((v) => (
              <option key={v} value={v}>
                {VOTE_TYPE_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
        {voteType === 'constitutional_amendment' && (
          <div>
            <label className="eyebrow block mb-1.5">Supermajority Threshold</label>
            <select className="input-field" value={threshold} onChange={(e) => setThreshold(e.target.value)}>
              <option value="0.6">60%</option>
              <option value="0.667">Two-thirds (66.7%)</option>
              <option value="0.75">75%</option>
            </select>
          </div>
        )}
        <button onClick={handleSave} disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Opening…' : 'Open Voting'}
        </button>
      </div>
    </Modal>
  )
}
