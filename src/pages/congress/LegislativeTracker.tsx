import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { CongressSubNav } from './CongressSubNav'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { LegislativeBill, LegislativeBillStatus } from '@/lib/types'
import { Plus } from 'lucide-react'

function statusTone(status: LegislativeBillStatus) {
  if (status === 'passed') return 'active' as const
  if (status === 'failed' || status === 'stalled') return 'attention' as const
  return 'developing' as const
}

export default function LegislativeTracker() {
  const { isNational } = useAuth()
  const [bills, setBills] = useState<LegislativeBill[]>([])
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    const { data } = await supabase.from('legislative_bills').select('*').order('created_at', { ascending: false })
    setBills((data ?? []) as LegislativeBill[])
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Module 8"
        title="Veterans Congress"
        action={
          isNational ? (
            <button onClick={() => setShowAdd(true)} className="btn-gold flex items-center gap-2">
              <Plus size={16} /> Track New Bill
            </button>
          ) : undefined
        }
      />
      <CongressSubNav />

      <div className="grid grid-cols-1 gap-4">
        {bills.map((b) => (
          <div key={b.id} className="panel p-4">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <div className="font-mono text-[11px] text-muted">{b.bill_number ?? 'No bill number'} · {b.level}{b.jurisdiction ? ` — ${b.jurisdiction}` : ''}</div>
                <div className="text-sm font-medium">{b.title}</div>
              </div>
              <StatusBadge label={b.status} tone={statusTone(b.status)} />
            </div>
            {b.summary && <p className="text-sm text-muted mb-2">{b.summary}</p>}
            {b.cvoa_position && (
              <div className="text-xs">
                <span className="text-gold font-mono uppercase">CVOA Position: </span>
                <span className="text-ink">{b.cvoa_position}</span>
              </div>
            )}
          </div>
        ))}
        {bills.length === 0 && <EmptyState title="No legislation being tracked" />}
      </div>

      {showAdd && (
        <AddBillModal
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function AddBillModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    bill_number: '',
    title: '',
    level: 'federal',
    jurisdiction: '',
    summary: '',
    cvoa_position: '',
  })
  const [saving, setSaving] = useState(false)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('legislative_bills').insert({
      bill_number: form.bill_number || null,
      title: form.title,
      level: form.level,
      jurisdiction: form.jurisdiction || null,
      summary: form.summary || null,
      cvoa_position: form.cvoa_position || null,
      status: 'monitoring',
    })
    setSaving(false)
    onAdded()
  }

  return (
    <Modal title="Track New Bill" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input placeholder="Bill number (optional)" className="input-field" value={form.bill_number} onChange={(e) => update('bill_number', e.target.value)} />
        <input required placeholder="Title" className="input-field" value={form.title} onChange={(e) => update('title', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <select className="input-field" value={form.level} onChange={(e) => update('level', e.target.value)}>
            <option value="federal">Federal</option>
            <option value="state">State</option>
          </select>
          <input placeholder="State (if applicable)" className="input-field" value={form.jurisdiction} onChange={(e) => update('jurisdiction', e.target.value)} />
        </div>
        <textarea placeholder="Summary" className="input-field" rows={2} value={form.summary} onChange={(e) => update('summary', e.target.value)} />
        <textarea placeholder="CVOA position" className="input-field" rows={2} value={form.cvoa_position} onChange={(e) => update('cvoa_position', e.target.value)} />
        <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Bill'}
        </button>
      </form>
    </Modal>
  )
}
