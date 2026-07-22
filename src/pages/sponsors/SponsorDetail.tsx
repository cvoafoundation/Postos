import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Sponsor, SponsorNote, SponsorPayment, SponsorTier } from '@/lib/types'
import { format, formatDistanceToNow } from 'date-fns'
import { Upload, FileText, Loader2, Trash2, Plus } from 'lucide-react'

export function SponsorDetailModal({
  sponsor,
  onClose,
  onUpdated,
}: {
  sponsor: Sponsor
  onClose: () => void
  onUpdated: () => void
}) {
  const { profile } = useAuth()
  const [tier, setTier] = useState<SponsorTier | null>(null)
  const [notes, setNotes] = useState<SponsorNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const [agreementStart, setAgreementStart] = useState(sponsor.agreement_start_date ?? '')
  const [agreementEnd, setAgreementEnd] = useState(sponsor.agreement_end_date ?? '')
  const [savingDates, setSavingDates] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [category, setCategory] = useState(sponsor.category ?? '')
  const [payments, setPayments] = useState<SponsorPayment[]>([])
  const [showRecordPayment, setShowRecordPayment] = useState(false)

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

  async function saveCategory(value: string) {
    setCategory(value)
    await supabase.from('sponsors').update({ category: value || null }).eq('id', sponsor.id)
    onUpdated()
  }

  function loadPayments() {
    supabase
      .from('sponsor_payments')
      .select('*')
      .eq('sponsor_id', sponsor.id)
      .order('payment_date', { ascending: false })
      .then(({ data }) => setPayments((data ?? []) as SponsorPayment[]))
  }

  useEffect(() => {
    if (sponsor.tier_id) {
      supabase.from('sponsor_tiers').select('*').eq('id', sponsor.tier_id).single().then(({ data }: any) => {
        setTier(data ?? null)
      })
    }
    supabase
      .from('sponsor_notes')
      .select('*')
      .eq('sponsor_id', sponsor.id)
      .order('created_at', { ascending: false })
      .then(({ data }: any) => setNotes((data ?? []) as SponsorNote[]))
    loadPayments()
  }, [sponsor.id, sponsor.tier_id])

  async function addNote() {
    if (!newNote.trim()) return
    setSavingNote(true)
    const { data, error } = await supabase
      .from('sponsor_notes')
      .insert({ sponsor_id: sponsor.id, author_id: profile?.id ?? null, note: newNote.trim() })
      .select()
      .single()
    setSavingNote(false)
    if (!error && data) {
      setNotes((prev) => [data as SponsorNote, ...prev])
      setNewNote('')
    }
  }

  async function saveAgreementDates() {
    setSavingDates(true)
    await supabase
      .from('sponsors')
      .update({
        agreement_start_date: agreementStart || null,
        agreement_end_date: agreementEnd || null,
      })
      .eq('id', sponsor.id)
    setSavingDates(false)
    onUpdated()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    const path = `${sponsor.id}/${crypto.randomUUID()}-${file.name}`
    const { data, error } = await supabase.storage.from('sponsor-agreements').upload(path, file)
    setUploading(false)
    if (error) {
      setUploadError(error.message)
      return
    }
    await supabase.from('sponsors').update({ agreement_storage_path: data?.path ?? path }).eq('id', sponsor.id)
    onUpdated()
  }

  async function viewAgreement() {
    if (!sponsor.agreement_storage_path) return
    const { data, error } = await supabase.storage
      .from('sponsor-agreements')
      .createSignedUrl(sponsor.agreement_storage_path, 600)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDelete() {
    await supabase.from('sponsors').delete().eq('id', sponsor.id)
    onUpdated()
    onClose()
  }

  const renewalSoon =
    sponsor.agreement_end_date &&
    new Date(sponsor.agreement_end_date).getTime() - Date.now() < 30 * 86400000 &&
    new Date(sponsor.agreement_end_date).getTime() > Date.now()

  return (
    <Modal title={sponsor.company} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <StatusBadge label={sponsor.stage.replaceAll('_', ' ')} tone="developing" />
          <div className="text-right">
            <span className="font-mono text-gold text-lg">${Number(sponsor.sponsorship_value).toLocaleString()}</span>
            <div className="text-[11px] text-muted font-mono">agreed</div>
          </div>
        </div>

        {tier && (
          <div className="panel p-4 border-gold/30">
            <div className="flex items-center justify-between mb-2">
              <div className="eyebrow">Tier</div>
              <div className="font-display text-xl text-gold">{tier.name}</div>
            </div>
            {tier.benefits && tier.benefits.length > 0 && (
              <ul className="text-xs text-muted list-disc list-inside space-y-0.5">
                {tier.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="eyebrow mb-1">Contact</div>
            <div>{sponsor.contact_name ?? '—'}</div>
          </div>
          <div>
            <div className="eyebrow mb-1">Email / Phone</div>
            <div>{sponsor.email ?? '—'}</div>
            <div>{sponsor.phone ?? ''}</div>
          </div>
        </div>

        <div>
          <div className="eyebrow mb-1">Business Category</div>
          <select className="input-field" value={category} onChange={(e) => saveCategory(e.target.value)}>
            <option value="">Not set — powers Build A Post sponsor matching</option>
            {SPONSOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {sponsor.notes && (
          <div>
            <div className="eyebrow mb-1">Initial Notes</div>
            <p className="text-sm text-muted">{sponsor.notes}</p>
          </div>
        )}

        <div className="border-t border-hairline pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="eyebrow">
              Payments — ${payments.reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString()} collected
            </div>
            <button
              onClick={() => setShowRecordPayment(true)}
              className="text-xs text-gold hover:text-gold-bright flex items-center gap-1"
            >
              <Plus size={12} /> Record Payment
            </button>
          </div>
          {payments.length === 0 ? (
            <p className="text-xs text-muted">No payments recorded yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span className="capitalize">{p.payment_method}{p.notes ? ` — ${p.notes}` : ''}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-muted font-mono">{format(new Date(p.payment_date), 'MMM d, yyyy')}</span>
                    <span className="font-mono text-status-active">${Number(p.amount).toLocaleString()}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-hairline pt-4">
          <div className="eyebrow mb-2">Agreement Period</div>
          {renewalSoon && (
            <p className="text-xs text-status-attention mb-2">Renewal due within 30 days.</p>
          )}
          <div className="grid grid-cols-2 gap-3 mb-2">
            <input
              type="date"
              className="input-field"
              value={agreementStart}
              onChange={(e) => setAgreementStart(e.target.value)}
            />
            <input
              type="date"
              className="input-field"
              value={agreementEnd}
              onChange={(e) => setAgreementEnd(e.target.value)}
            />
          </div>
          <button onClick={saveAgreementDates} disabled={savingDates} className="btn-ghost text-xs">
            {savingDates ? 'Saving…' : 'Save Dates'}
          </button>
        </div>

        <div className="border-t border-hairline pt-4">
          <div className="eyebrow mb-2">Signed Agreement</div>
          {sponsor.agreement_storage_path ? (
            <button onClick={viewAgreement} className="flex items-center gap-2 text-gold hover:text-gold-bright text-sm">
              <FileText size={16} /> View uploaded agreement
            </button>
          ) : (
            <label className="flex items-center justify-center gap-2 border border-dashed border-hairline hover:border-gold rounded-sm p-4 cursor-pointer text-sm text-muted">
              {uploading ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> Uploading…
                </>
              ) : (
                <>
                  <Upload size={16} /> Upload signed agreement
                </>
              )}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} disabled={uploading} />
            </label>
          )}
          {uploadError && <p className="text-status-attention text-sm mt-2">{uploadError}</p>}
        </div>

        <div className="border-t border-hairline pt-4">
          <div className="eyebrow mb-2">Activity Log</div>
          <div className="flex gap-2 mb-3">
            <input
              placeholder="Log a call, meeting, or update…"
              className="input-field"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNote()}
            />
            <button onClick={addNote} disabled={savingNote} className="btn-gold px-4 text-sm shrink-0">
              Add
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-xs text-muted">No activity logged yet.</p>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {notes.map((n) => (
                <div key={n.id} className="border-l-2 border-hairline pl-3">
                  <p className="text-sm text-ink">{n.note}</p>
                  <p className="text-[11px] text-muted font-mono mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-hairline pt-4">
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-status-attention hover:text-status-attention/80"
            >
              <Trash2 size={14} /> Delete this sponsor
            </button>
          ) : (
            <div className="border border-status-attention/40 bg-status-attention/10 rounded-sm p-3 space-y-3">
              <p className="text-sm text-ink">Permanently delete {sponsor.company}? This can't be undone.</p>
              <div className="flex gap-3">
                <button onClick={handleDelete} className="flex-1 bg-status-attention text-base rounded-sm py-2 text-sm font-medium">
                  Yes, delete
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="flex-1 btn-ghost text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showRecordPayment && (
        <RecordPaymentModal
          postId={sponsor.post_id}
          sponsorId={sponsor.id}
          onClose={() => setShowRecordPayment(false)}
          onSaved={() => {
            setShowRecordPayment(false)
            loadPayments()
          }}
        />
      )}
    </Modal>
  )
}

export function RecordPaymentModal({
  postId,
  sponsorId,
  donorNameDefault,
  onClose,
  onSaved,
}: {
  postId: string | null
  sponsorId: string | null
  donorNameDefault?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    donor_name: donorNameDefault ?? '',
    amount: '',
    payment_method: 'check' as SponsorPayment['payment_method'],
    payment_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) {
      setError('Enter an amount greater than $0.')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('sponsor_payments').insert({
      post_id: postId,
      sponsor_id: sponsorId,
      donor_name: sponsorId ? null : form.donor_name || null,
      amount: Number(form.amount),
      payment_method: form.payment_method,
      payment_date: form.payment_date,
      notes: form.notes || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal title="Record a Payment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {!sponsorId && (
          <input
            required
            placeholder="Donor name"
            className="input-field"
            value={form.donor_name}
            onChange={(e) => update('donor_name', e.target.value)}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount"
              className="input-field pl-6"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
            />
          </div>
          <input
            required
            type="date"
            className="input-field"
            value={form.payment_date}
            onChange={(e) => update('payment_date', e.target.value)}
          />
        </div>
        <select
          className="input-field"
          value={form.payment_method}
          onChange={(e) => update('payment_method', e.target.value as SponsorPayment['payment_method'])}
        >
          <option value="check">Check</option>
          <option value="cash">Cash</option>
          <option value="wire">Wire Transfer</option>
          <option value="card">Card (entered manually)</option>
          <option value="other">Other</option>
        </select>
        <input
          placeholder="Notes (optional)"
          className="input-field"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
        />
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Recording…' : 'Record Payment'}
        </button>
      </form>
    </Modal>
  )
}
