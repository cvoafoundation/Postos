import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { computePostHealth, type PostHealthResult, type DimensionStatus } from '@/lib/postHealth'
import type {
  AnnualReview,
  CommunityServiceEvent,
  FinancialTransaction,
  GovernanceFormType,
  GovernanceSignature,
  Post,
} from '@/lib/types'
import { format } from 'date-fns'
import { Plus, Scale, Landmark, HeartHandshake, FileCheck, Trash2 } from 'lucide-react'

function toneFor(status: DimensionStatus) {
  if (status === 'green') return 'active' as const
  if (status === 'yellow') return 'developing' as const
  if (status === 'red') return 'attention' as const
  return 'neutral' as const
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

  async function deletePost() {
    if (!postId || !post) return
    const confirmed = window.confirm(
      `Permanently delete "${post.name}"? This is an ACTIVE post — this removes it and everything tied to it: members, sponsors, meetings, finances, everything. This cannot be undone.`
    )
    if (!confirmed) return
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) {
      window.alert(`Couldn't delete: ${error.message}`)
      return
    }
    navigate('/health')
  }

  if (loading || !post || !result) return <p className="text-sm text-muted">Loading…</p>

  const income = transactions.filter((t) => t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const expense = transactions.filter((t) => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div>
      <button onClick={() => navigate('/health')} className="text-xs font-mono text-muted hover:text-gold mb-4">
        ← Back to Post Health
      </button>

      <div className="flex items-center justify-between">
        <PageHeader eyebrow={`${post.city ?? ''} ${post.state}`} title={post.name} />
        {isNational && (
          <button onClick={deletePost} className="text-xs text-muted hover:text-status-attention flex items-center gap-1.5 mb-6">
            <Trash2 size={13} /> Delete Post
          </button>
        )}
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {result.dimensions.map((d) => (
          <div key={d.key} className="panel p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-ink">{d.label}</div>
              <div className="text-xs text-muted mt-0.5">{d.detail}</div>
            </div>
            <StatusBadge label={d.status} tone={toneFor(d.status)} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Governance */}
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="eyebrow flex items-center gap-2">
              <FileCheck size={14} /> Governance Sign-offs
            </div>
            <button onClick={() => setShowSignature(true)} className="text-xs text-gold hover:text-gold-bright flex items-center gap-1">
              <Plus size={12} /> Log Signature
            </button>
          </div>
          {signatures.length === 0 ? (
            <p className="text-xs text-muted">No signatures on file.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {signatures.map((s) => (
                <div key={s.id} className="flex justify-between text-xs">
                  <span>{s.signer_name} — {s.form_type.replaceAll('_', ' ')}</span>
                  <span className="text-muted font-mono">{format(new Date(s.signed_at), 'MMM d, yyyy')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Annual Review */}
        <div className="panel p-5">
          <div className="eyebrow mb-3 flex items-center gap-2">
            <Scale size={14} /> {new Date().getFullYear()} Annual Review
          </div>
          <div className="space-y-2">
            {([
              ['bylaws_reviewed', 'Bylaws reviewed'],
              ['financial_audit_complete', 'Financial audit complete'],
              ['officer_roster_current', 'Officer roster current'],
              ['required_filings_current', 'Required filings current'],
            ] as [keyof AnnualReview, string][]).map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!annualReview?.[field]}
                  onChange={() => toggleReviewItem(field)}
                />
                {label}
              </label>
            ))}
          </div>
          {annualReview && !annualReview.completed_at && (
            <button onClick={markReviewComplete} className="btn-gold text-xs mt-3 px-3 py-1.5">
              Mark Review Complete
            </button>
          )}
          {annualReview?.completed_at && (
            <p className="text-xs text-status-active mt-3">Completed {format(new Date(annualReview.completed_at), 'MMM d, yyyy')}</p>
          )}
        </div>

        {/* Community Service */}
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="eyebrow flex items-center gap-2">
              <HeartHandshake size={14} /> Community Service Log
            </div>
            <button onClick={() => setShowService(true)} className="text-xs text-gold hover:text-gold-bright flex items-center gap-1">
              <Plus size={12} /> Log Event
            </button>
          </div>
          {serviceEvents.length === 0 ? (
            <p className="text-xs text-muted">No events logged.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {[...serviceEvents].sort((a, b) => b.event_date.localeCompare(a.event_date)).map((e) => (
                <div key={e.id} className="flex justify-between text-xs">
                  <span>{e.title} ({e.category})</span>
                  <span className="text-muted font-mono">{format(new Date(e.event_date), 'MMM d, yyyy')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Financial Ledger */}
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="eyebrow flex items-center gap-2">
              <Landmark size={14} /> Financial Ledger
            </div>
            <button onClick={() => setShowTransaction(true)} className="text-xs text-gold hover:text-gold-bright flex items-center gap-1">
              <Plus size={12} /> Log Transaction
            </button>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-status-active">In: ${income.toLocaleString()}</span>
            <span className="text-status-attention">Out: ${expense.toLocaleString()}</span>
            <span className="font-medium">Balance: ${(income - expense).toLocaleString()}</span>
          </div>
          {transactions.length === 0 ? (
            <p className="text-xs text-muted">No transactions logged.</p>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {[...transactions].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).map((t) => (
                <div key={t.id} className="flex justify-between text-xs">
                  <span className={t.transaction_type === 'income' ? 'text-status-active' : 'text-status-attention'}>
                    {t.category}
                  </span>
                  <span className="font-mono">
                    {t.transaction_type === 'income' ? '+' : '-'}${Number(t.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
