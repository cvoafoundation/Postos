import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { computePostHealth, type PostHealthResult, type DimensionStatus } from '@/lib/postHealth'
import { POST_STATUS_LABELS, POST_STATUS_ORDER, type PostStatus } from '@/lib/types'
import type {
  AnnualReview,
  CommunityServiceEvent,
  FinancialTransaction,
  GovernanceFormType,
  GovernanceSignature,
  Post,
} from '@/lib/types'
import { PostChecklistView } from '@/components/checklist/PostChecklistView'
import { OfficersPanel } from '@/components/posts/OfficersPanel'
import { MembersPanel } from '@/components/posts/MembersPanel'
import { MeetingsPanel } from '@/components/posts/MeetingsPanel'
import { RecruitingPanel } from '@/components/posts/RecruitingPanel'
import { SponsorsPanel } from '@/components/posts/SponsorsPanel'
import { BuildAPostPanel } from '@/components/posts/BuildAPostPanel'
import { format } from 'date-fns'
import { Plus, Scale, FileCheck, Trash2, Copy, Check, ArrowRight } from 'lucide-react'

function toneFor(status: DimensionStatus) {
  if (status === 'green') return 'active' as const
  if (status === 'yellow') return 'developing' as const
  if (status === 'red') return 'attention' as const
  return 'neutral' as const
}

type PostTab = 'main' | 'officers' | 'members' | 'meetings' | 'recruiting' | 'sponsors' | 'build_a_post'

// Shared by both the active-post and still-forming views — Officers,
// Members, Meetings, Recruiting, Sponsors, and Build A Post all work the
// same regardless of stage; only the first tab's label and content differ
// (Health once live, Checklist while forming).
function PostTabBar({ tab, setTab, mainLabel }: { tab: PostTab; setTab: (t: PostTab) => void; mainLabel: string }) {
  const tabs: { key: PostTab; label: string }[] = [
    { key: 'main', label: mainLabel },
    { key: 'officers', label: 'Officers' },
    { key: 'members', label: 'Members' },
    { key: 'meetings', label: 'Meetings' },
    { key: 'recruiting', label: 'Recruiting' },
    { key: 'sponsors', label: 'Sponsors' },
    { key: 'build_a_post', label: 'Build A Post' },
  ]
  return (
    <div className="flex gap-1 mb-6 border-b border-hairline flex-wrap">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`px-4 py-2 text-sm font-mono uppercase tracking-wide border-b-2 -mb-px transition-colors ${
            tab === t.key ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export default function PostHealthDetail() {
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()
  const { profile, isNational } = useAuth()

  const [post, setPost] = useState<Post | null>(null)
  const [result, setResult] = useState<PostHealthResult | null>(null)
  const [signatures, setSignatures] = useState<GovernanceSignature[]>([])
  const [annualReview, setAnnualReview] = useState<AnnualReview | null>(null)
  const [serviceEvents, setServiceEvents] = useState<CommunityServiceEvent[]>([])
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([])
  const [loading, setLoading] = useState(true)

  const [showSignature, setShowSignature] = useState(false)
  const [showService, setShowService] = useState(false)
  const [showTransaction, setShowTransaction] = useState(false)
  const [tab, setTab] = useState<PostTab>('main')
  const [healthView, setHealthView] = useState<'overview' | 'governance' | 'annual_review' | 'community_service' | 'financial'>('overview')

  // Forming-post view only
  const [checklistPct, setChecklistPct] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    if (!postId) return
    setLoading(true)
    const currentYear = new Date().getFullYear()
    const [
      postRes,
      foundingRes,
      sponsorsRes,
      meetingsRes,
      recruitsRes,
      membersRes,
      delegateRes,
      votesRes,
      sigsRes,
      reviewRes,
      serviceRes,
      txRes,
    ] = await Promise.all([
      supabase.from('posts').select('*').eq('id', postId).single(),
      supabase.from('founding_team_members').select('*').eq('post_id', postId),
      supabase.from('sponsors').select('*').eq('post_id', postId),
      supabase.from('meeting_records').select('meeting_date').eq('post_id', postId),
      supabase.from('recruits').select('*').eq('post_id', postId),
      supabase.from('members').select('*').eq('post_id', postId),
      supabase.from('congress_delegates').select('*').eq('post_id', postId),
      supabase.from('resolution_votes').select('id, voter_post_id').eq('voter_post_id', postId),
      supabase.from('governance_signatures').select('*').eq('post_id', postId),
      supabase.from('annual_reviews').select('*').eq('post_id', postId).eq('review_year', currentYear).single(),
      supabase.from('community_service_events').select('*').eq('post_id', postId),
      supabase.from('financial_transactions').select('*').eq('post_id', postId),
    ])

    const postData = postRes.data as Post
    setPost(postData)
    setSignatures((sigsRes.data ?? []) as GovernanceSignature[])
    setAnnualReview((reviewRes.data as AnnualReview) ?? null)
    setServiceEvents((serviceRes.data ?? []) as CommunityServiceEvent[])
    setTransactions((txRes.data ?? []) as FinancialTransaction[])

    if (postData) {
      const computed = computePostHealth({
        post: postData,
        foundingTeam: (foundingRes.data ?? []) as any[],
        sponsors: (sponsorsRes.data ?? []) as any[],
        meetingDates: ((meetingsRes.data ?? []) as any[]).map((m) => m.meeting_date),
        recruits: (recruitsRes.data ?? []) as any[],
        members: (membersRes.data ?? []) as any[],
        hasDelegate: ((delegateRes.data ?? []) as any[]).length > 0,
        delegateVotesCast: ((votesRes.data ?? []) as any[]).length,
        governanceSignatures: (sigsRes.data ?? []) as GovernanceSignature[],
        annualReview: (reviewRes.data as AnnualReview) ?? null,
        communityServiceEvents: (serviceRes.data ?? []) as CommunityServiceEvent[],
        financialTransactions: (txRes.data ?? []) as FinancialTransaction[],
      })
      setResult(computed)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  useEffect(() => {
    if (!postId) return
    supabase
      .from('checklist_items')
      .select('is_complete')
      .eq('post_id', postId)
      .then(({ data }: any) => {
        const items = data ?? []
        setChecklistPct(items.length > 0 ? Math.round((items.filter((i: any) => i.is_complete).length / items.length) * 100) : null)
      })
  }, [postId])

  function copyShareLink() {
    if (!postId) return
    const link = `${window.location.origin}/post-checklist/${postId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // The one place a post's status actually advances. Moving to Active also
  // strips a leftover "(Forming)" from the auto-generated name — without
  // this, a post could go fully active while its name still says otherwise,
  // which is exactly what was confusing before this page existed.
  async function advanceStatus(next: PostStatus) {
    if (!postId || !post) return
    setAdvancing(true)
    const patch: { status: PostStatus; name?: string } = { status: next }
    if (next === 'active_post' && post.name.endsWith(' (Forming)')) {
      patch.name = post.name.slice(0, -' (Forming)'.length)
    }
    await supabase.from('posts').update(patch).eq('id', postId)
    setAdvancing(false)
    load()
  }

  async function deletePost() {
    if (!postId || !post) return
    const stageNote = post.status === 'active_post' ? 'This is an ACTIVE post — this' : 'This'
    const confirmed = window.confirm(
      `Permanently delete "${post.name}"? ${stageNote} removes it and everything tied to it — members, sponsors, meetings, finances, checklist, everything. This cannot be undone.`
    )
    if (!confirmed) return
    setDeleting(true)
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    setDeleting(false)
    if (error) {
      window.alert(`Couldn't delete: ${error.message}`)
      return
    }
    navigate('/health')
  }
  async function toggleReviewItem(field: keyof AnnualReview) {
    if (!postId) return
    const currentYear = new Date().getFullYear()
    const current = annualReview
    const newValue = current ? !current[field] : true
    const payload: any = { post_id: postId, review_year: currentYear, [field]: newValue }

    if (current) {
      await supabase.from('annual_reviews').update({ [field]: newValue }).eq('id', current.id)
    } else {
      await supabase.from('annual_reviews').insert(payload)
    }
    load()
  }

  async function markReviewComplete() {
    if (!postId || !annualReview) return
    await supabase.from('annual_reviews').update({ completed_at: new Date().toISOString() }).eq('id', annualReview.id)
    load()
  }

  if (loading || !post) return <p className="text-sm text-muted">Loading…</p>

  const income = transactions.filter((t) => t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const expense = transactions.filter((t) => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  // A post that hasn't gone active yet doesn't have a meaningful health
  // score — there's nothing to measure. It needs a checklist and a way to
  // advance, not a composite score built mostly from empty signals.
  if (post.status !== 'active_post') {
    const currentIndex = POST_STATUS_ORDER.indexOf(post.status)
    const nextStatus = POST_STATUS_ORDER[currentIndex + 1]

    return (
      <div>
        <button onClick={() => navigate('/health')} className="text-xs font-mono text-muted hover:text-gold mb-4">
          ← Back to Posts
        </button>

        <div className="flex items-center justify-between">
          <PageHeader eyebrow={`${post.city ?? ''} ${post.state}`} title={post.name} />
          {isNational && (
            <button onClick={deletePost} disabled={deleting} className="text-xs text-muted hover:text-status-attention flex items-center gap-1.5 mb-6 disabled:opacity-50">
              <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete Post'}
            </button>
          )}
        </div>

        <PostTabBar tab={tab} setTab={setTab} mainLabel="Checklist" />

        {tab === 'main' && (
          <>
            <div className="panel p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div>
                  <div className="eyebrow mb-1">Post Status</div>
                  <StatusBadge label={POST_STATUS_LABELS[post.status]} tone="developing" />
                </div>
                {checklistPct !== null && (
                  <div className="text-xs text-muted font-mono ml-4">
                    Checklist {checklistPct}% complete
                    {checklistPct < 100 && isNational && " — you can still advance manually if that's the right call"}
                  </div>
                )}
              </div>
              {isNational && nextStatus && (
                <button onClick={() => advanceStatus(nextStatus)} disabled={advancing} className="btn-gold flex items-center gap-2 disabled:opacity-50">
                  {advancing ? 'Advancing…' : `Advance to ${POST_STATUS_LABELS[nextStatus]}`} <ArrowRight size={14} />
                </button>
              )}
            </div>

            <div className="panel p-4 mb-6 flex items-center justify-between gap-4">
              <div>
                <div className="eyebrow mb-1">Shareable Link</div>
                <p className="text-sm text-muted">
                  Share this with {post.name} — they can view and check off items themselves, no login required.
                  You'll both always be looking at the same live checklist.
                </p>
              </div>
              <button onClick={copyShareLink} className="btn-gold flex items-center gap-2 shrink-0">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>

            <PostChecklistView postId={post.id} />
          </>
        )}
        {tab === 'officers' && <OfficersPanel postId={post.id} postName={post.name} />}
        {tab === 'members' && <MembersPanel postId={post.id} />}
        {tab === 'meetings' && <MeetingsPanel postId={post.id} />}
        {tab === 'recruiting' && <RecruitingPanel postId={post.id} />}
        {tab === 'sponsors' && <SponsorsPanel postId={post.id} />}
        {tab === 'build_a_post' && <BuildAPostPanel postId={post.id} />}
      </div>
    )
  }

  if (!result) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <button onClick={() => navigate('/health')} className="text-xs font-mono text-muted hover:text-gold mb-4">
        ← Back to Posts
      </button>

      <div className="flex items-center justify-between">
        <PageHeader eyebrow={`${post.city ?? ''} ${post.state}`} title={post.name} />
        {isNational && (
          <button onClick={deletePost} className="text-xs text-muted hover:text-status-attention flex items-center gap-1.5 mb-6">
            <Trash2 size={13} /> Delete Post
          </button>
        )}
      </div>

      <PostTabBar tab={tab} setTab={setTab} mainLabel="Health" />

      {tab === 'main' && (
        <>
          <div className="panel p-6 mb-6 flex items-center gap-6">
        <div className="text-center">
          <div className={`font-display text-6xl ${result.overall === 'green' ? 'text-status-active' : result.overall === 'yellow' ? 'text-status-developing' : 'text-status-attention'}`}>
            {result.score}
          </div>
          <div className="eyebrow mt-1">Composite Score</div>
        </div>
        <div className="flex-1">
          <StatusBadge label={result.overall.toUpperCase()} tone={toneFor(result.overall)} />
          <p className="text-sm text-muted mt-2">
            Computed from {result.dimensions.filter((d) => d.status !== 'neutral').length} of {result.dimensions.length} tracked
            signals — the rest aren't applicable yet (too new, or nothing logged).
          </p>
        </div>
      </div>

      {healthView === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {result.dimensions.map((d) => {
            const action: (() => void) | null =
              d.key === 'officers'
                ? () => setTab('officers')
                : d.key === 'membership'
                ? () => setTab('members')
                : d.key === 'governance'
                ? () => setHealthView('governance')
                : d.key === 'annual_review'
                ? () => setHealthView('annual_review')
                : d.key === 'community_service'
                ? () => setHealthView('community_service')
                : d.key === 'financial'
                ? () => setHealthView('financial')
                : d.key === 'sponsors'
                ? () => setTab('sponsors')
                : d.key === 'meetings'
                ? () => setTab('meetings')
                : null // congress participation — not wired up yet
            return (
              <button
                key={d.key}
                onClick={action ?? undefined}
                disabled={!action}
                className={`panel p-4 flex items-center justify-between gap-4 text-left ${action ? 'hover:border-gold transition-colors cursor-pointer' : 'cursor-default'}`}
              >
                <div>
                  <div className="text-sm font-medium text-ink">{d.label}</div>
                  <div className="text-xs text-muted mt-0.5">{d.detail}</div>
                </div>
                <StatusBadge label={d.status} tone={toneFor(d.status)} />
              </button>
            )
          })}
        </div>
      )}

      {healthView !== 'overview' && (
        <button onClick={() => setHealthView('overview')} className="text-xs font-mono text-muted hover:text-gold mb-4">
          ← Back to Health Overview
        </button>
      )}

      {healthView === 'governance' && (
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="eyebrow flex items-center gap-2">
              <FileCheck size={14} /> Governance Sign-offs
            </div>
            <button onClick={() => setShowSignature(true)} className="text-xs text-gold hover:text-gold-bright flex items-center gap-1">
              <Plus size={12} /> Log Signature
            </button>
          </div>
          {signatures.length === 0 ? (
            <p className="text-sm text-muted">No signatures on file.</p>
          ) : (
            <div className="space-y-2">
              {[...signatures].sort((a, b) => b.signed_at.localeCompare(a.signed_at)).map((s) => (
                <div key={s.id} className="flex justify-between items-center text-sm border-b border-hairline/60 pb-2">
                  <div>
                    <div className="text-ink">{s.signer_name}</div>
                    <div className="text-xs text-muted">{s.form_type.replaceAll('_', ' ')}</div>
                  </div>
                  <span className="text-muted font-mono text-xs">{format(new Date(s.signed_at), 'MMM d, yyyy')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {healthView === 'annual_review' && (
        <div className="panel p-6 max-w-lg">
          <div className="eyebrow mb-4 flex items-center gap-2">
            <Scale size={14} /> {new Date().getFullYear()} Annual Review
          </div>
          <p className="text-sm text-muted mb-4">
            A once-a-year check that the basics are still in order — bylaws, finances, officer roster, and
            required filings.
          </p>
          <div className="space-y-3">
            {([
              ['bylaws_reviewed', 'Bylaws reviewed'],
              ['financial_audit_complete', 'Financial audit complete'],
              ['officer_roster_current', 'Officer roster current'],
              ['required_filings_current', 'Required filings current'],
            ] as [keyof AnnualReview, string][]).map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!annualReview?.[field]} onChange={() => toggleReviewItem(field)} />
                {label}
              </label>
            ))}
          </div>
          {annualReview && !annualReview.completed_at && (
            <button onClick={markReviewComplete} className="btn-gold text-sm mt-5 px-4 py-2">
              Mark {new Date().getFullYear()} Review Complete
            </button>
          )}
          {annualReview?.completed_at && (
            <p className="text-sm text-status-active mt-5">
              {new Date().getFullYear()} review completed {format(new Date(annualReview.completed_at), 'MMM d, yyyy')}
            </p>
          )}
        </div>
      )}

      {healthView === 'community_service' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted">Every logged community service event for this post, most recent first.</p>
            <button onClick={() => setShowService(true)} className="btn-gold flex items-center gap-2 text-sm shrink-0">
              <Plus size={14} /> Log Event
            </button>
          </div>
          {serviceEvents.length === 0 ? (
            <p className="text-sm text-muted">No events logged yet.</p>
          ) : (
            <div className="space-y-3">
              {[...serviceEvents].sort((a, b) => b.event_date.localeCompare(a.event_date)).map((e) => (
                <div key={e.id} className="panel p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium text-ink">{e.title}</div>
                    <span className="text-xs text-muted font-mono">{format(new Date(e.event_date), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="text-xs text-gold mb-2">{e.category}</div>
                  <div className="flex gap-4 text-xs text-muted mb-2">
                    {e.attendees_count !== null && <span>{e.attendees_count} attendee{e.attendees_count !== 1 ? 's' : ''}</span>}
                    {e.hours_contributed !== null && <span>{e.hours_contributed} hour{e.hours_contributed !== 1 ? 's' : ''} contributed</span>}
                  </div>
                  {e.description && <p className="text-sm text-muted">{e.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {healthView === 'financial' && (
        <div>
          <div className="panel p-5 mb-4 flex items-center justify-between">
            <div className="flex gap-6 text-sm">
              <span className="text-status-active">In: ${income.toLocaleString()}</span>
              <span className="text-status-attention">Out: ${expense.toLocaleString()}</span>
              <span className="font-medium text-ink">Balance: ${(income - expense).toLocaleString()}</span>
            </div>
            <button onClick={() => setShowTransaction(true)} className="btn-gold flex items-center gap-2 text-sm shrink-0">
              <Plus size={14} /> Log Transaction
            </button>
          </div>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted">No transactions logged yet.</p>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-head">Date</th>
                    <th className="table-head">Category</th>
                    <th className="table-head">Description</th>
                    <th className="table-head">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {[...transactions].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).map((t) => (
                    <tr key={t.id}>
                      <td className="table-cell text-muted text-xs whitespace-nowrap">{format(new Date(t.transaction_date), 'MMM d, yyyy')}</td>
                      <td className="table-cell whitespace-nowrap">{t.category}</td>
                      <td className="table-cell text-muted">{t.description ?? '—'}</td>
                      <td className={`table-cell font-mono whitespace-nowrap ${t.transaction_type === 'income' ? 'text-status-active' : 'text-status-attention'}`}>
                        {t.transaction_type === 'income' ? '+' : '-'}${Number(t.amount).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
        </>
      )}
      {tab === 'officers' && <OfficersPanel postId={post.id} postName={post.name} />}
      {tab === 'members' && <MembersPanel postId={post.id} />}
      {tab === 'meetings' && <MeetingsPanel postId={post.id} />}
      {tab === 'recruiting' && <RecruitingPanel postId={post.id} />}
      {tab === 'sponsors' && <SponsorsPanel postId={post.id} />}
      {tab === 'build_a_post' && <BuildAPostPanel postId={post.id} />}

      {showSignature && (
        <LogSignatureModal postId={post.id} recordedBy={profile?.id ?? null} onClose={() => setShowSignature(false)} onSaved={() => { setShowSignature(false); load() }} />
      )}
      {showService && (
        <LogServiceModal postId={post.id} createdBy={profile?.id ?? null} onClose={() => setShowService(false)} onSaved={() => { setShowService(false); load() }} />
      )}
      {showTransaction && (
        <LogTransactionModal postId={post.id} createdBy={profile?.id ?? null} onClose={() => setShowTransaction(false)} onSaved={() => { setShowTransaction(false); load() }} />
      )}
    </div>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="panel w-full max-w-md p-5">
        <div className="font-display text-xl tracking-wide mb-4">{title}</div>
        {children}
      </div>
    </div>
  )
}

function LogSignatureModal({ postId, recordedBy, onClose, onSaved }: { postId: string; recordedBy: string | null; onClose: () => void; onSaved: () => void }) {
  const [signerName, setSignerName] = useState('')
  const [formType, setFormType] = useState<GovernanceFormType>('conflict_of_interest')
  const [signedAt, setSignedAt] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('governance_signatures').insert({
      post_id: postId,
      signer_name: signerName,
      form_type: formType,
      signed_at: signedAt,
      recorded_by: recordedBy,
    })
    setSaving(false)
    onSaved()
  }

  return (
    <ModalShell title="Log Governance Signature" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input required placeholder="Signer's name" className="input-field" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        <select className="input-field" value={formType} onChange={(e) => setFormType(e.target.value as GovernanceFormType)}>
          <option value="conflict_of_interest">Conflict of Interest</option>
          <option value="officer_acknowledgment">Officer Acknowledgment</option>
        </select>
        <input required type="date" className="input-field" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-gold flex-1 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        </div>
      </form>
    </ModalShell>
  )
}

function LogServiceModal({ postId, createdBy, onClose, onSaved }: { postId: string; createdBy: string | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', category: 'Community Project', event_date: '', attendees_count: '', hours_contributed: '', description: '' })
  const [saving, setSaving] = useState(false)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('community_service_events').insert({
      post_id: postId,
      title: form.title,
      category: form.category,
      event_date: form.event_date,
      attendees_count: form.attendees_count ? Number(form.attendees_count) : null,
      hours_contributed: form.hours_contributed ? Number(form.hours_contributed) : null,
      description: form.description || null,
      created_by: createdBy,
    })
    setSaving(false)
    onSaved()
  }

  return (
    <ModalShell title="Log Community Service Event" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input required placeholder="Event title" className="input-field" value={form.title} onChange={(e) => update('title', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <select className="input-field" value={form.category} onChange={(e) => update('category', e.target.value)}>
            <option>Food Drive</option>
            <option>Veteran Outreach</option>
            <option>School Presentation</option>
            <option>Community Project</option>
            <option>Other</option>
          </select>
          <input required type="date" className="input-field" value={form.event_date} onChange={(e) => update('event_date', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="number" min={0} placeholder="Attendees" className="input-field" value={form.attendees_count} onChange={(e) => update('attendees_count', e.target.value)} />
          <input type="number" min={0} placeholder="Hours contributed" className="input-field" value={form.hours_contributed} onChange={(e) => update('hours_contributed', e.target.value)} />
        </div>
        <textarea placeholder="Description" className="input-field" rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} />
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-gold flex-1 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        </div>
      </form>
    </ModalShell>
  )
}

function LogTransactionModal({ postId, createdBy, onClose, onSaved }: { postId: string; createdBy: string | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ transaction_type: 'income', category: 'Other', amount: '', description: '', transaction_date: '' })
  const [saving, setSaving] = useState(false)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('financial_transactions').insert({
      post_id: postId,
      transaction_type: form.transaction_type,
      category: form.category,
      amount: Number(form.amount),
      description: form.description || null,
      transaction_date: form.transaction_date,
      created_by: createdBy,
    })
    setSaving(false)
    onSaved()
  }

  return (
    <ModalShell title="Log Financial Transaction" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <select className="input-field" value={form.transaction_type} onChange={(e) => update('transaction_type', e.target.value)}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <input required type="date" className="input-field" value={form.transaction_date} onChange={(e) => update('transaction_date', e.target.value)} />
        </div>
        <input placeholder="Category (e.g. Dues, Event Costs, Sponsorship)" className="input-field" value={form.category} onChange={(e) => update('category', e.target.value)} />
        <input required type="number" min={0} step="0.01" placeholder="Amount ($)" className="input-field" value={form.amount} onChange={(e) => update('amount', e.target.value)} />
        <textarea placeholder="Description" className="input-field" rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} />
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-gold flex-1 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        </div>
      </form>
    </ModalShell>
  )
}
