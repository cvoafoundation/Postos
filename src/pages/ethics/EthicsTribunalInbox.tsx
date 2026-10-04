import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import type { EthicsComplaint, EthicsComplaintStatus } from '@/lib/types'
import { format } from 'date-fns'
import { useAuth } from '@/context/AuthContext'

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
  const filerNames = Object.fromEntries(
    complaints.map((c) => [
      c.complainant_id ?? c.id,
      (c as EthicsComplaint & { filer_name?: string }).filer_name ?? 'Identity not available',
    ])
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<EthicsComplaint | null>(null)

  function load() {
    setLoading(true)
    supabase.rpc('cvoa_ethics_docket').then(async ({ data, error: loadError }) => {
      setError(loadError?.message ?? null)
      const rows = (data ?? []) as EthicsComplaint[]
      setComplaints(rows)
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
        Independent judicial workspace · Articles X and XIII. Review intake, record notice and defense time,
        manage recusals, and issue a written opinion. Recused members lose case access. National has no staff
        override.
      </p>

      {error && (
        <p role="alert" className="text-status-attention mb-4">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="panel p-4">
          {open.length}
          <div className="eyebrow mt-2">Open cases</div>
        </div>
        <div className="panel p-4">
          {open.filter((c) => c.response_due_at && new Date(c.response_due_at) > new Date()).length}
          <div className="eyebrow mt-2">Defense periods</div>
        </div>
        <div className="panel p-4">
          {closed.length}
          <div className="eyebrow mt-2">Written dispositions</div>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : complaints.length === 0 ? (
        <EmptyState title="No complaints filed" />
      ) : (
        <>
          <div className="eyebrow mb-3">Open ({open.length})</div>
          <div className="space-y-2 mb-8">
            {open.map((c) => (
              <ComplaintRow
                key={c.id}
                complaint={c}
                filerName={c.complainant_id ? filerNames[c.complainant_id] : undefined}
                onClick={() => setViewing(c)}
              />
            ))}
            {open.length === 0 && <p className="text-sm text-muted">Nothing open right now.</p>}
          </div>

          {closed.length > 0 && (
            <>
              <div className="eyebrow mb-3">Closed ({closed.length})</div>
              <div className="space-y-2">
                {closed.map((c) => (
                  <ComplaintRow
                    key={c.id}
                    complaint={c}
                    filerName={c.complainant_id ? filerNames[c.complainant_id] : undefined}
                    onClick={() => setViewing(c)}
                  />
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

function ComplaintRow({
  complaint,
  filerName,
  onClick,
}: {
  complaint: EthicsComplaint
  filerName?: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="w-full text-left panel p-4 hover:border-gold transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-ink">Re: {complaint.respondent_name}</span>
        <StatusBadge label={STATUS_LABELS[complaint.status]} tone={statusTone(complaint.status)} />
      </div>
      <div className="text-xs text-muted mb-1">{CATEGORY_LABELS[complaint.category]}</div>
      <div className="text-[11px] text-muted font-mono">
        {format(new Date(complaint.created_at), 'MMM d, yyyy')} ·{' '}
        {complaint.filed_anonymously ? 'Filed anonymously' : (filerName ?? 'Unknown filer')}
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
  const { profile } = useAuth()
  const [form, setForm] = useState({
    record_version: complaint.record_version,
    status: complaint.status,
    tribunal_notes: complaint.tribunal_notes ?? '',
    notice_text: complaint.notice_text ?? '',
    notice_served_at: complaint.notice_served_at?.slice(0, 16) ?? '',
    response_due_at: complaint.response_due_at?.slice(0, 16) ?? '',
    hearing_at: complaint.hearing_at?.slice(0, 16) ?? '',
    findings: complaint.findings ?? '',
    governing_provisions: complaint.governing_provisions ?? '',
    rationale: complaint.rationale ?? '',
    proposed_sanction: complaint.proposed_sanction ?? '',
    clear_and_convincing: complaint.clear_and_convincing,
  })
  const [savedForm] = useState(form)
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<
    { id: string; actor_name: string; event: string; created_at: string }[]
  >([])
  const [approvals, setApprovals] = useState<{ profile_id: string }[]>([])
  const [recusalReason, setRecusalReason] = useState('')
  const closed = ['resolved', 'dismissed'].includes(complaint.status)
  useEffect(() => {
    Promise.all([
      supabase
        .from('ethics_case_events')
        .select('id,actor_name,event,created_at')
        .eq('complaint_id', complaint.id)
        .order('created_at'),
      supabase.from('ethics_decision_votes').select('profile_id').eq('complaint_id', complaint.id),
    ]).then(([history, votes]) => {
      setEvents(history.data ?? [])
      setApprovals(votes.data ?? [])
      setError(history.error?.message ?? votes.error?.message ?? null)
    })
  }, [complaint.id])
  async function action(name: string, args: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const result = await supabase.rpc(name, { ...args, ...(['cvoa_approve_ethics_opinion','cvoa_publish_ethics_opinion'].includes(name) ? {p_version:complaint.record_version} : {}) })
      if (result.error) throw result.error
      onUpdated()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : ((e as { message?: string }).message ?? 'Could not save the case. Please retry.')
      )
    } finally {
      setSaving(false)
    }
  }
  const field = (key: keyof typeof form, label: string, rows = 3) => (
    <label className="block text-sm">
      {label}
      <textarea
        className="input-field mt-1"
        rows={rows}
        value={String(form[key] ?? '')}
        disabled={closed || saving}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  )
  const date = (key: 'notice_served_at' | 'response_due_at' | 'hearing_at', label: string) => (
    <label className="block text-sm">
      {label} (UTC)
      <input
        type="datetime-local"
        className="input-field mt-1"
        value={form[key]}
        disabled={closed || saving}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  )
  return (
    <Modal title={`Case: ${complaint.respondent_name}`} onClose={onClose}>
      <div className="space-y-5">
        {error && (
          <p role="alert" className="text-status-attention">
            {error}
          </p>
        )}
        <div className="text-sm text-muted">
          Filed {format(new Date(complaint.created_at), 'MMM d, yyyy')} ·{' '}
          {complaint.filed_anonymously
            ? 'Anonymous report'
            : (filerName ?? 'Identified filer (identity retained in sealed record)')}{' '}
          · {CATEGORY_LABELS[complaint.category]}
        </div>
        <section>
          <div className="eyebrow mb-2">Allegation</div>
          <p className="text-sm whitespace-pre-wrap">{complaint.description}</p>
          <p className="text-xs text-muted mt-2">{complaint.respondent_context}</p>
        </section>
        {!closed && (
          <label className="block text-sm">
            Case stage
            <select
              className="input-field mt-1"
              value={form.status}
              onChange={(e) =>
                setForm({
                  ...form,
                  status: e.target.value as EthicsComplaintStatus,
                })
              }
            >
              {['new', 'under_review', 'investigating'].map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s as EthicsComplaintStatus]}
                </option>
              ))}
            </select>
          </label>
        )}
        <section className="space-y-3 border-t border-hairline pt-4">
          <div className="eyebrow">Written charges and defense · §10.4</div>
          <p className="text-xs text-muted">
            Record notice actually served outside this screen, including charges, cited rules and the
            respondent’s rights. Allow at least 14 days to prepare a defense. Recording dates does not send
            notice or schedule a meeting.
          </p>
          {field('notice_text', 'Notice of charges and respondent rights', 4)}
          {date('notice_served_at', 'Notice served')}
          {date('response_due_at', 'Defense deadline')}
          {date('hearing_at', 'Hearing')}
        </section>
        <section className="space-y-3 border-t border-hairline pt-4">
          <div className="eyebrow">Written opinion · §10.3</div>
          {field('findings', 'Findings of fact')}
          {field('governing_provisions', 'Governing provisions and conclusions')}
          {field('rationale', 'Decision rationale')}
          {field('proposed_sanction', 'Proposed sanction (leave empty for no sanction)')}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.clear_and_convincing}
              disabled={closed || saving}
              onChange={(e) => setForm({ ...form, clear_and_convincing: e.target.checked })}
            />
            The finding meets the clear and convincing evidence standard.
          </label>
          <p className="text-xs text-muted">
            A sanction requires three non-recused affirmative votes on this saved opinion. Four affirmative
            votes are recommended for removal or permanent disqualification. Editing the record clears prior
            approvals. Platform access changes require a separate enforcement action.
          </p>
        </section>
        {field('tribunal_notes', 'Internal deliberations — Tribunal only', 4)}
        {!closed && (
          <div className="space-y-3">
            <button
              className="btn-gold w-full"
              disabled={saving}
              onClick={() =>
                action('cvoa_save_ethics_case', {
                  p_case: complaint.id,
                  p_data: {
                    ...form,
                    ...Object.fromEntries(
                      ['notice_served_at', 'response_due_at', 'hearing_at'].map((k) => [
                        k,
                        form[k as 'hearing_at'] ? `${form[k as 'hearing_at']}:00Z` : null,
                      ])
                    ),
                  },
                })
              }
            >
              Save case record
            </button>
            <p className="text-xs text-muted">
              {approvals.length} recorded approvals ·{' '}
              {approvals.some((v) => v.profile_id === profile?.id)
                ? 'Your approval is recorded'
                : 'Your approval is not recorded'}
              . Approvals apply to the saved record.{' '}
              {dirty && 'Save your changes before approving or issuing an opinion.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-ghost"
                disabled={saving || dirty}
                onClick={() =>
                  action('cvoa_approve_ethics_opinion', {
                    p_case: complaint.id,
                  })
                }
              >
                Approve saved opinion
              </button>
              <button
                className="btn-ghost"
                disabled={saving || dirty}
                onClick={() =>
                  action('cvoa_publish_ethics_opinion', {
                    p_case: complaint.id,
                    p_dismiss: false,
                  })
                }
              >
                Issue saved opinion
              </button>
              <button
                className="btn-ghost"
                disabled={saving || dirty}
                onClick={() =>
                  action('cvoa_publish_ethics_opinion', {
                    p_case: complaint.id,
                    p_dismiss: true,
                  })
                }
              >
                Issue dismissal
              </button>
            </div>
          </div>
        )}
        {closed && (
          <p className="panel p-3 text-sm">
            {STATUS_LABELS[complaint.status]} · Written record sealed.{' '}
            {complaint.resolved_at &&
              `Appeal filing deadline: ${format(new Date(new Date(complaint.resolved_at).getTime() + 30 * 86400000), 'MMM d, yyyy')}.`}{' '}
            Congress review follows §10.5; it requires written grounds and delegate endorsements. Filing an
            appeal does not automatically stay a ruling.
          </p>
        )}
        {!closed && (
          <section className="border-t border-hairline pt-4">
            <div className="eyebrow mb-2">Conflict and recusal · §10.2</div>
            <input
              className="input-field mb-2"
              placeholder="Reason for your recusal"
              aria-label="Reason for your recusal"
              value={recusalReason}
              onChange={(e) => setRecusalReason(e.target.value)}
            />
            <button
              className="btn-ghost"
              disabled={saving || !recusalReason.trim()}
              onClick={() =>
                action('cvoa_recuse_ethics', {
                  p_case: complaint.id,
                  p_reason: recusalReason,
                })
              }
            >
              Record my recusal and leave case
            </button>
          </section>
        )}
        <section className="border-t border-hairline pt-4">
          <div className="eyebrow mb-3">Case history</div>
          {events.map((e) => (
            <div className="text-xs mb-3" key={e.id}>
              <p>{e.event}</p>
              <p className="text-muted mt-1">
                {e.actor_name} · {format(new Date(e.created_at), 'MMM d, yyyy p')}
              </p>
            </div>
          ))}
        </section>
      </div>
    </Modal>
  )
}
