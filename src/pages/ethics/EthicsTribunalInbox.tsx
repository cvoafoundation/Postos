import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import type { EthicsComplaint, EthicsComplaintStatus } from '@/lib/types'
import { format } from 'date-fns'

const CATEGORY_LABELS: Record<string, string> = {
  ethical_misconduct: 'Ethical misconduct or dishonorable behavior',
  abuse_of_authority: 'Abuse of authority or dereliction of duty',
  bylaws_violation: 'Violation of bylaws, oath of office, or code of conduct',
  gross_negligence: 'Gross negligence in official duties',
  financial_impropriety: 'Financial mismanagement, fraud, or impropriety',
  discrimination_harassment: 'Discriminatory or harassing conduct',
  retaliation: 'Retaliation against a whistleblower or complainant',
  other: 'Other',
}

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
  if (status === 'new') return 'attention' as const
  return 'developing' as const
}

export default function EthicsTribunalInbox() {
  const [complaints, setComplaints] = useState<EthicsComplaint[]>([])
  const [filerNames, setFilerNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<EthicsComplaint | null>(null)

  function load() {
    setLoading(true)
    supabase
      .from('ethics_complaints')
      .select('*')
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const rows = (data ?? []) as EthicsComplaint[]
        setComplaints(rows)
        const ids = [...new Set(rows.filter((c) => c.complainant_id).map((c) => c.complainant_id!))]
        if (ids.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
          const map: Record<string, string> = {}
          for (const p of (profiles ?? []) as any[]) map[p.id] = p.full_name
          setFilerNames(map)
        }
        setLoading(false)
      })
  }

  useEffect(load, [])

  const open = complaints.filter((c) => !['resolved', 'dismissed'].includes(c.status))
  const closed = complaints.filter((c) => ['resolved', 'dismissed'].includes(c.status))

  return (
    <div>
      <PageHeader eyebrow="Article X — Confidential" title="Ethics Tribunal" />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every complaint filed goes only here — not to National Command, not to any post. This inbox is visible
        exclusively to Tribunal members.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : complaints.length === 0 ? (
        <EmptyState title="No complaints filed" />
      ) : (
        <>
          <div className="eyebrow mb-3">Open ({open.length})</div>
          <div className="space-y-2 mb-8">
            {open.map((c) => (
              <ComplaintRow key={c.id} complaint={c} filerName={c.complainant_id ? filerNames[c.complainant_id] : undefined} onClick={() => setViewing(c)} />
            ))}
            {open.length === 0 && <p className="text-sm text-muted">Nothing open right now.</p>}
          </div>

          {closed.length > 0 && (
            <>
              <div className="eyebrow mb-3">Closed ({closed.length})</div>
              <div className="space-y-2">
                {closed.map((c) => (
                  <ComplaintRow key={c.id} complaint={c} filerName={c.complainant_id ? filerNames[c.complainant_id] : undefined} onClick={() => setViewing(c)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {viewing && (
        <ComplaintDetailModal
          complaint={viewing}
          filerName={viewing.complainant_id ? filerNames[viewing.complainant_id] : undefined}
          onClose={() => setViewing(null)}
          onUpdated={() => {
            setViewing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function ComplaintRow({ complaint, filerName, onClick }: { complaint: EthicsComplaint; filerName?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left panel p-4 hover:border-gold transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-ink">Re: {complaint.respondent_name}</span>
        <StatusBadge label={STATUS_LABELS[complaint.status]} tone={statusTone(complaint.status)} />
      </div>
      <div className="text-xs text-muted mb-1">{CATEGORY_LABELS[complaint.category]}</div>
      <div className="text-[11px] text-muted font-mono">
        {format(new Date(complaint.created_at), 'MMM d, yyyy')} · {complaint.filed_anonymously ? 'Filed anonymously' : filerName ?? 'Unknown filer'}
      </div>
    </button>
  )
}

function ComplaintDetailModal({
  complaint,
  filerName,
  onClose,
  onUpdated,
}: {
  complaint: EthicsComplaint
  filerName?: string
  onClose: () => void
  onUpdated: () => void
}) {
  const [status, setStatus] = useState(complaint.status)
  const [notes, setNotes] = useState(complaint.tribunal_notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('ethics_complaints')
      .update({
        status,
        tribunal_notes: notes || null,
        resolved_at: ['resolved', 'dismissed'].includes(status) ? new Date().toISOString() : null,
      })
      .eq('id', complaint.id)
    setSaving(false)
    onUpdated()
  }

  return (
    <Modal title={`Complaint Re: ${complaint.respondent_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="eyebrow mb-1">Filed</div>
            <div>{format(new Date(complaint.created_at), 'MMM d, yyyy')}</div>
          </div>
          <div>
            <div className="eyebrow mb-1">Filed By</div>
            <div>{complaint.filed_anonymously ? 'Anonymous' : filerName ?? 'Unknown'}</div>
          </div>
        </div>

        {complaint.respondent_context && (
          <div>
            <div className="eyebrow mb-1">Respondent Context</div>
            <p className="text-sm text-muted">{complaint.respondent_context}</p>
          </div>
        )}

        <div>
          <div className="eyebrow mb-1">Category</div>
          <p className="text-sm text-muted">{CATEGORY_LABELS[complaint.category]}</p>
        </div>

        <div>
          <div className="eyebrow mb-1">Description</div>
          <p className="text-sm text-ink whitespace-pre-wrap">{complaint.description}</p>
        </div>

        <div className="border-t border-hairline pt-4">
          <div className="eyebrow mb-2">Status</div>
          <select className="input-field mb-3" value={status} onChange={(e) => setStatus(e.target.value as EthicsComplaintStatus)}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="eyebrow mb-2">Tribunal Notes (internal, confidential)</div>
          <textarea
            className="input-field"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Findings, hearing notes, sanction decisions…"
          />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
