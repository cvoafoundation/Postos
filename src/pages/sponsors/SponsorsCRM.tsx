import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { KanbanBoard, type KanbanColumn } from '@/components/ui/Kanban'
import { StatCard } from '@/components/ui/StatCard'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Post, Sponsor, SponsorStage, SponsorTier } from '@/lib/types'
import { Copy, Check, Plus, AlertTriangle } from 'lucide-react'
import { SponsorDetailModal } from './SponsorDetail'

const STAGES: { key: SponsorStage; label: string }[] = [
  { key: 'identified', label: 'Identified' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]

function isRenewalSoon(sponsor: Sponsor): boolean {
  if (!sponsor.agreement_end_date || sponsor.stage !== 'won') return false
  const daysUntil = (new Date(sponsor.agreement_end_date).getTime() - Date.now()) / 86400000
  return daysUntil > 0 && daysUntil <= 30
}

export default function SponsorsCRM() {
  const { profile, isNational } = useAuth()
  const [searchParams] = useSearchParams()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | 'all' | null>(searchParams.get('post') ?? 'all')
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [tiers, setTiers] = useState<SponsorTier[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [viewing, setViewing] = useState<Sponsor | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isNational) {
      supabase.from('posts').select('*').then(({ data }: any) => setPosts((data ?? []) as Post[]))
    } else if (profile?.post_id) {
      setSelectedPostId(profile.post_id)
    }
    supabase.from('sponsor_tiers').select('*').order('sort_order').then(({ data }: any) => setTiers((data ?? []) as SponsorTier[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  async function loadSponsors() {
    let query = supabase.from('sponsors').select('*')
    if (selectedPostId && selectedPostId !== 'all') query = query.eq('post_id', selectedPostId)
    const { data } = await query
    setSponsors((data ?? []) as Sponsor[])
  }

  useEffect(() => {
    loadSponsors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPostId])

  async function moveStage(id: string, stage: SponsorStage) {
    setSponsors((prev) => prev.map((s) => (s.id === id ? { ...s, stage } : s)))
    await supabase.from('sponsors').update({ stage }).eq('id', id)
  }

  function copySponsorLink() {
    if (!selectedPostId || selectedPostId === 'all') return
    const link = `${window.location.origin}/become-a-sponsor/${selectedPostId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const wonRevenue = sponsors.filter((s) => s.stage === 'won').reduce((sum, s) => sum + Number(s.sponsorship_value), 0)
  const pendingRevenue = sponsors
    .filter((s) => !['won', 'lost'].includes(s.stage))
    .reduce((sum, s) => sum + Number(s.sponsorship_value), 0)
  const renewalCount = sponsors.filter(isRenewalSoon).length
  const leaderboard = [...sponsors]
    .filter((s) => s.stage === 'won')
    .sort((a, b) => Number(b.sponsorship_value) - Number(a.sponsorship_value))
    .slice(0, 5)

  const columns: KanbanColumn<Sponsor>[] = STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    items: sponsors.filter((sp) => sp.stage === s.key),
  }))

  const tierByI = (id: string | null) => tiers.find((t) => t.id === id)

  return (
    <div>
      <PageHeader
        eyebrow="Module 7"
        title="Sponsorship CRM"
        action={
          isNational && posts.length > 0 ? (
            <select
              className="input-field w-64"
              value={selectedPostId ?? 'all'}
              onChange={(e) => setSelectedPostId(e.target.value as any)}
            >
              <option value="all">All Posts</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Sponsorship Revenue" value={`$${wonRevenue.toLocaleString()}`} accent="active" />
        <StatCard label="Pending Revenue" value={`$${pendingRevenue.toLocaleString()}`} accent="developing" />
        <StatCard label="Renewals Due (30 days)" value={renewalCount} accent={renewalCount > 0 ? 'attention' : 'gold'} />
        <div className="panel p-5">
          <div className="eyebrow mb-3">Sponsor Leaderboard</div>
          {leaderboard.length === 0 ? (
            <div className="text-sm text-muted">No closed sponsors yet</div>
          ) : (
            <ol className="space-y-1.5">
              {leaderboard.map((s, i) => (
                <li key={s.id} className="flex justify-between text-sm">
                  <span>{i + 1}. {s.company}</span>
                  <span className="font-mono text-gold">${Number(s.sponsorship_value).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="panel p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Sponsor Interest Link</div>
          <p className="text-sm text-muted">
            {selectedPostId === 'all'
              ? 'Select a specific post above to get its sponsor link.'
              : 'Share this with local businesses — anyone who fills it out lands in Identified automatically.'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowAdd(true)} className="btn-ghost flex items-center gap-2">
            <Plus size={16} /> Add Manually
          </button>
          <button
            onClick={copySponsorLink}
            disabled={selectedPostId === 'all'}
            className="btn-gold flex items-center gap-2 disabled:opacity-40"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>

      <KanbanBoard
        columns={columns}
        keyExtractor={(s) => s.id}
        renderCard={(s) => (
          <SponsorCard sponsor={s} tier={tierByI(s.tier_id)} onMove={moveStage} onView={() => setViewing(s)} />
        )}
      />

      {showAdd && selectedPostId && selectedPostId !== 'all' && (
        <AddSponsorModal
          postId={selectedPostId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            loadSponsors()
          }}
        />
      )}

      {viewing && (
        <SponsorDetailModal sponsor={viewing} onClose={() => setViewing(null)} onUpdated={loadSponsors} />
      )}
    </div>
  )
}

function SponsorCard({
  sponsor,
  tier,
  onMove,
  onView,
}: {
  sponsor: Sponsor
  tier?: SponsorTier
  onMove: (id: string, stage: SponsorStage) => void
  onView: () => void
}) {
  const currentIndex = STAGES.findIndex((s) => s.key === sponsor.stage)
  const next = STAGES[currentIndex + 1]
  const prev = STAGES[currentIndex - 1]
  const renewalSoon = isRenewalSoon(sponsor)

  return (
    <button onClick={onView} className={`panel p-3 text-left w-full block ${renewalSoon ? 'border-status-attention/50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{sponsor.company}</div>
        {tier && <span className="font-mono text-[10px] text-gold uppercase shrink-0">{tier.name}</span>}
      </div>
      <div className="font-mono text-[11px] text-muted">{sponsor.contact_name ?? '—'}</div>
      <div className="font-mono text-xs text-gold mt-1">${Number(sponsor.sponsorship_value).toLocaleString()}</div>
      {renewalSoon && (
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-status-attention mt-2">
          <AlertTriangle size={12} /> Renewal due soon
        </div>
      )}
      <div className="flex justify-between mt-2 pt-2 border-t border-hairline/60" onClick={(e) => e.stopPropagation()}>
        <button
          disabled={!prev}
          onClick={() => prev && onMove(sponsor.id, prev.key)}
          className="text-[11px] font-mono text-muted hover:text-gold disabled:opacity-30"
        >
          ← Back
        </button>
        <button
          disabled={!next}
          onClick={() => next && onMove(sponsor.id, next.key)}
          className="text-[11px] font-mono text-gold hover:text-gold-bright disabled:opacity-30"
        >
          Advance →
        </button>
      </div>
    </button>
  )
}

const SPONSOR_CATEGORIES = [
  'Restaurant/Food Service',
  'Beverage/Alcohol Distribution',
  'Grocery/Retail',
  'Education/Training',
  'Technology',
  'Staffing/Recruiting',
  'Professional Services',
  'Healthcare',
  'Medical Equipment/Supplies',
  'Construction/Hardware',
  'Real Estate',
  'Fitness/Sporting Goods',
  'Health & Wellness',
  'Other',
]

function AddSponsorModal({ postId, onClose, onAdded }: { postId: string; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ company: '', contact_name: '', email: '', phone: '', sponsorship_value: '', category: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('sponsors').insert({
      post_id: postId,
      company: form.company,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      sponsorship_value: form.sponsorship_value ? Number(form.sponsorship_value) : 0,
      category: form.category || null,
      stage: 'identified',
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onAdded()
  }

  return (
    <Modal title="Add Sponsor" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input required placeholder="Company name" className="input-field" value={form.company} onChange={(e) => update('company', e.target.value)} />
        <input placeholder="Contact name" className="input-field" value={form.contact_name} onChange={(e) => update('contact_name', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
          <input placeholder="Phone" className="input-field" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>
        <select className="input-field" value={form.category} onChange={(e) => update('category', e.target.value)}>
          <option value="">Business category (optional)</option>
          {SPONSOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          placeholder="Sponsorship value ($)"
          className="input-field"
          value={form.sponsorship_value}
          onChange={(e) => update('sponsorship_value', e.target.value)}
        />
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Sponsor'}
        </button>
      </form>
    </Modal>
  )
}
