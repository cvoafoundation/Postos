import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { KanbanBoard, type KanbanColumn } from '@/components/ui/Kanban'
import { StatCard } from '@/components/ui/StatCard'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Post, Recruit, RecruitStage } from '@/lib/types'
import { Copy, Check, Plus, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const STAGES: { key: RecruitStage; label: string }[] = [
  { key: 'prospect', label: 'Prospect' },
  { key: 'interested', label: 'Interested' },
  { key: 'attended_meeting', label: 'Attended Meeting' },
  { key: 'applied', label: 'Applied' },
  { key: 'member', label: 'Member' },
  { key: 'leader', label: 'Leader' },
  { key: 'officer', label: 'Officer' },
  { key: 'commander', label: 'Commander' },
]

const SOURCES = ['Community Event', 'Referral from a Member', 'Social Media', 'Flyer', 'Walk-in', 'VA Clinic / Resource Fair', 'Other']

const STALE_DAYS = 14
const CONVERTED_STAGE_INDEX = 3 // "Applied" and beyond counts as converted

function isStale(recruit: Recruit): boolean {
  const stageIndex = STAGES.findIndex((s) => s.key === recruit.stage)
  if (stageIndex >= CONVERTED_STAGE_INDEX) return false // members+ aren't "stale leads"
  const daysSinceUpdate = (Date.now() - new Date(recruit.updated_at).getTime()) / 86400000
  return daysSinceUpdate > STALE_DAYS
}

export default function RecruitingPipeline() {
  const { profile, isNational } = useAuth()
  const [searchParams] = useSearchParams()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [recruits, setRecruits] = useState<Recruit[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isNational) {
      supabase
        .from('posts')
        .select('*')
        .then(({ data }: any) => {
          const list = (data ?? []) as Post[]
          setPosts(list)
          if (list.length > 0 && !selectedPostId) {
            const postParam = searchParams.get('post')
            setSelectedPostId(postParam ?? list[0].id)
          }
        })
    } else if (profile?.post_id) {
      setSelectedPostId(profile.post_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  async function loadRecruits(postId: string) {
    const { data } = await supabase.from('recruits').select('*').eq('post_id', postId)
    setRecruits((data ?? []) as Recruit[])
  }

  useEffect(() => {
    if (selectedPostId) loadRecruits(selectedPostId)
  }, [selectedPostId])

  async function moveStage(id: string, stage: RecruitStage) {
    setRecruits((prev) => prev.map((r) => (r.id === id ? { ...r, stage, updated_at: new Date().toISOString() } : r)))
    await supabase.from('recruits').update({ stage, updated_at: new Date().toISOString() }).eq('id', id)
  }

  function copyRecruitLink() {
    if (!selectedPostId) return
    const link = `${window.location.origin}/join-post/${selectedPostId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedPost = posts.find((p) => p.id === selectedPostId)
  const total = recruits.length
  const converted = recruits.filter((r) => STAGES.findIndex((s) => s.key === r.stage) >= CONVERTED_STAGE_INDEX).length
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0
  const staleCount = recruits.filter(isStale).length

  const sourceBreakdown = SOURCES.map((source) => {
    const leads = recruits.filter((r) => (r.source ?? 'Other') === source)
    return {
      source: source.length > 14 ? source.slice(0, 13) + '…' : source,
      total: leads.length,
      converted: leads.filter((r) => STAGES.findIndex((s) => s.key === r.stage) >= CONVERTED_STAGE_INDEX).length,
    }
  }).filter((row) => row.total > 0)

  const columns: KanbanColumn<Recruit>[] = STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    items: recruits.filter((r) => r.stage === s.key),
  }))

  if (!selectedPostId) {
    return (
      <div>
        <PageHeader eyebrow="Module 6" title="Recruiting Engine" />
        <p className="text-sm text-muted">No posts yet to recruit for.</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Module 6"
        title="Recruiting Engine"
        action={
          isNational && posts.length > 1 ? (
            <select
              className="input-field w-64"
              value={selectedPostId}
              onChange={(e) => setSelectedPostId(e.target.value)}
            >
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Leads" value={total} />
        <StatCard label="Conversion Rate" value={`${conversionRate}%`} accent="active" />
        <StatCard label="Stale Leads (14+ days)" value={staleCount} accent={staleCount > 0 ? 'attention' : 'gold'} />
      </div>

      <div className="panel p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Recruiting Link</div>
          <p className="text-sm text-muted">
            Share this at events, on flyers, or on social media for {selectedPost?.name ?? 'this post'} — anyone
            who fills it out is added as a Prospect automatically.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowAdd(true)} className="btn-ghost flex items-center gap-2">
            <Plus size={16} /> Add Manually
          </button>
          <button onClick={copyRecruitLink} className="btn-gold flex items-center gap-2">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>

      {sourceBreakdown.length > 0 && (
        <div className="panel p-4 mb-6">
          <div className="eyebrow mb-3">Leads by Source</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sourceBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2E2F33" />
              <XAxis dataKey="source" stroke="#9A9A93" fontSize={11} />
              <YAxis stroke="#9A9A93" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1F2023', border: '1px solid #2E2F33', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total" name="Total Leads" fill="#8A6F1D" />
              <Bar dataKey="converted" name="Converted (Applied+)" fill="#C9A227" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <KanbanBoard
        columns={columns}
        keyExtractor={(r) => r.id}
        renderCard={(r) => <RecruitCard recruit={r} onMove={moveStage} />}
      />

      {showAdd && (
        <AddRecruitModal
          postId={selectedPostId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            loadRecruits(selectedPostId)
          }}
        />
      )}
    </div>
  )
}

function RecruitCard({ recruit, onMove }: { recruit: Recruit; onMove: (id: string, stage: RecruitStage) => void }) {
  const currentIndex = STAGES.findIndex((s) => s.key === recruit.stage)
  const next = STAGES[currentIndex + 1]
  const prev = STAGES[currentIndex - 1]
  const stale = isStale(recruit)

  return (
    <div className={`panel p-3 ${stale ? 'border-status-attention/50' : ''}`}>
      <div className="text-sm font-medium">{recruit.name}</div>
      <div className="font-mono text-[11px] text-muted mb-2">{recruit.source ?? 'Unknown source'}</div>
      {stale && (
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-status-attention mb-2">
          <AlertTriangle size={12} /> No follow-up in 14+ days
        </div>
      )}
      <div className="flex justify-between mt-2 pt-2 border-t border-hairline/60">
        <button
          disabled={!prev}
          onClick={() => prev && onMove(recruit.id, prev.key)}
          className="text-[11px] font-mono text-muted hover:text-gold disabled:opacity-30"
        >
          ← Back
        </button>
        <button
          disabled={!next}
          onClick={() => next && onMove(recruit.id, next.key)}
          className="text-[11px] font-mono text-gold hover:text-gold-bright disabled:opacity-30"
        >
          Advance →
        </button>
      </div>
    </div>
  )
}

function AddRecruitModal({
  postId,
  onClose,
  onAdded,
}: {
  postId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: SOURCES[0] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('recruits').insert({
      post_id: postId,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      source: form.source,
      stage: 'prospect',
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onAdded()
  }

  return (
    <Modal title="Add Recruit" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          required
          placeholder="Full name"
          className="input-field"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
        />
        <input
          type="email"
          placeholder="Email"
          className="input-field"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
        />
        <input
          placeholder="Phone"
          className="input-field"
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
        />
        <select className="input-field" value={form.source} onChange={(e) => update('source', e.target.value)}>
          {SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Recruit'}
        </button>
      </form>
    </Modal>
  )
}
