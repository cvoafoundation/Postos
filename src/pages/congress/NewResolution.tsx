import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { RESOLUTION_CATEGORIES, type ResolutionCategory } from '@/lib/types'

const CATEGORY_LABELS: Record<ResolutionCategory, string> = {
  membership: 'Membership',
  governance: 'Governance',
  budget: 'Budget',
  legislative_affairs: 'Legislative Affairs',
  national_policy: 'National Policy',
  bylaws: 'Bylaws',
  constitution: 'Constitution',
  expansion: 'Expansion',
  programs: 'Programs',
  veterans_benefits: 'Veterans Benefits',
  other: 'Other',
}

export function NewResolutionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    title: '',
    category: 'other' as ResolutionCategory,
    executive_summary: '',
    body: '',
    purpose: '',
    financial_impact_cost: '',
    financial_impact_funding_source: '',
    organizational_impact: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('resolutions').insert({
      submitted_by: profile?.id ?? null,
      post_id: profile?.post_id ?? null,
      title: form.title,
      category: form.category,
      executive_summary: form.executive_summary || null,
      body: form.body,
      purpose: form.purpose || null,
      financial_impact_cost: form.financial_impact_cost ? Number(form.financial_impact_cost) : null,
      financial_impact_funding_source: form.financial_impact_funding_source || null,
      organizational_impact: form.organizational_impact || null,
      status: 'draft',
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    onCreated()
  }

  return (
    <Modal title="Introduce a Resolution" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          required
          placeholder="Resolution title"
          className="input-field"
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
        />
        <select
          className="input-field"
          value={form.category}
          onChange={(e) => update('category', e.target.value as ResolutionCategory)}
        >
          {RESOLUTION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <textarea
          placeholder="Executive summary — a short, plain-language explanation"
          className="input-field"
          rows={2}
          value={form.executive_summary}
          onChange={(e) => update('executive_summary', e.target.value)}
        />
        <textarea
          required
          placeholder="Full resolution text (formal language)"
          className="input-field"
          rows={5}
          value={form.body}
          onChange={(e) => update('body', e.target.value)}
        />
        <textarea
          placeholder="Purpose — why does this need to exist?"
          className="input-field"
          rows={2}
          value={form.purpose}
          onChange={(e) => update('purpose', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            min={0}
            placeholder="Estimated cost ($)"
            className="input-field"
            value={form.financial_impact_cost}
            onChange={(e) => update('financial_impact_cost', e.target.value)}
          />
          <input
            placeholder="Funding source"
            className="input-field"
            value={form.financial_impact_funding_source}
            onChange={(e) => update('financial_impact_funding_source', e.target.value)}
          />
        </div>
        <textarea
          placeholder="Organizational impact — how does this affect posts, members, or national operations?"
          className="input-field"
          rows={2}
          value={form.organizational_impact}
          onChange={(e) => update('organizational_impact', e.target.value)}
        />

        {error && <p className="text-status-attention text-sm">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-gold w-full disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit as Draft'}
        </button>
        <p className="text-[11px] text-muted text-center">
          Resolutions start as drafts and get a formal number (VC-{new Date().getFullYear()}-XXX) once submitted.
        </p>
      </form>
    </Modal>
  )
}
