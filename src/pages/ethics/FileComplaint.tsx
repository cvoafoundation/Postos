import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { EthicsComplaint, EthicsComplaintCategory, EthicsComplaintStatus } from '@/lib/types'
import { format } from 'date-fns'
import { ShieldAlert } from 'lucide-react'

const CATEGORIES: { value: EthicsComplaintCategory; label: string }[] = [
  { value: 'ethical_misconduct', label: 'Ethical misconduct or dishonorable behavior' },
  { value: 'abuse_of_authority', label: 'Abuse of authority or dereliction of duty' },
  { value: 'bylaws_violation', label: 'Violation of bylaws, oath of office, or code of conduct' },
  { value: 'gross_negligence', label: 'Gross negligence in official duties' },
  { value: 'financial_impropriety', label: 'Financial mismanagement, fraud, or impropriety' },
  { value: 'discrimination_harassment', label: 'Discriminatory or harassing conduct' },
  { value: 'retaliation', label: 'Retaliation against a whistleblower or complainant' },
  { value: 'other', label: 'Other' },
]

const STATUS_LABELS: Record<EthicsComplaintStatus, string> = {
  new: 'Received',
  under_review: 'Under Review',
  investigating: 'Investigating',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

function statusTone(status: EthicsComplaintStatus) {
  if (status === 'resolved') return 'active' as const
  if (status === 'dismissed') return 'neutral' as const
  return 'developing' as const
}

export default function FileComplaint() {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    respondent_name: '',
    respondent_context: '',
    category: 'ethical_misconduct' as EthicsComplaintCategory,
    description: '',
    anonymous: false,
  })
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myComplaints, setMyComplaints] = useState<EthicsComplaint[]>([])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function loadMine() {
    if (!profile) return
    supabase
      .from('ethics_complaints')
      .select('*')
      .eq('complainant_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setMyComplaints((data ?? []) as EthicsComplaint[]))
  }

  useEffect(loadMine, [profile?.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('ethics_complaints').insert({
      complainant_id: form.anonymous ? null : profile?.id ?? null,
      filed_anonymously: form.anonymous,
      respondent_name: form.respondent_name,
      respondent_context: form.respondent_context || null,
      category: form.category,
      description: form.description,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
    setForm({ respondent_name: '', respondent_context: '', category: 'ethical_misconduct', description: '', anonymous: false })
    loadMine()
  }

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Article X" title="File an Ethics Complaint" />

      <div className="panel p-4 mb-6 flex items-start gap-3 border-gold/30">
        <ShieldAlert size={18} className="text-gold shrink-0 mt-0.5" />
        <p className="text-sm text-muted">
          This goes directly and only to the Ethics Tribunal — not to National Command, not to your post's
          leadership. Nobody else can see what you submit here, including who filed it if you choose to file
          anonymously.
        </p>
      </div>

      {submitted && (
        <div className="panel p-4 mb-6 border-status-active/40">
          <p className="text-sm text-status-active">Complaint submitted. The Ethics Tribunal will review it.</p>
        </div>
      )}

      <div className="panel p-6 mb-8">
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            placeholder="Who is this complaint about? (name)"
            className="input-field"
            value={form.respondent_name}
            onChange={(e) => update('respondent_name', e.target.value)}
          />
          <input
            placeholder="Their role/post, if relevant (optional)"
            className="input-field"
            value={form.respondent_context}
            onChange={(e) => update('respondent_context', e.target.value)}
          />
          <select className="input-field" value={form.category} onChange={(e) => update('category', e.target.value as EthicsComplaintCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <textarea
            required
            placeholder="Describe what happened, in as much detail as you can — dates, witnesses, and any evidence you have."
            className="input-field"
            rows={6}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={form.anonymous} onChange={(e) => update('anonymous', e.target.checked)} />
            File this anonymously — the Tribunal won't know it was you, and you won't be able to check its status afterward
          </label>
          {error && <p className="text-status-attention text-sm">{error}</p>}
          <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit Complaint'}
          </button>
        </form>
      </div>

      {myComplaints.length > 0 && (
        <div>
          <div className="eyebrow mb-3">Your Filed Complaints</div>
          <div className="space-y-2">
            {myComplaints.map((c) => (
              <div key={c.id} className="panel p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-ink">Re: {c.respondent_name}</span>
                  <StatusBadge label={STATUS_LABELS[c.status]} tone={statusTone(c.status)} />
                </div>
                <div className="text-xs text-muted">{format(new Date(c.created_at), 'MMM d, yyyy')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
