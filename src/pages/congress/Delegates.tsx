import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { CongressSubNav } from './CongressSubNav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

interface DelegateRow {
  id: string
  profile_id: string
  profile_name: string
  post_name: string
  is_alternate: boolean
  term_start: string
  term_end: string
  certification_reference: string | null
  seated: boolean
}
interface Candidate {
  id: string
  name: string
  post_id: string | null
}
export default function Delegates() {
  const { isNational } = useAuth()
  const [rows, setRows] = useState<DelegateRow[]>([]),
    [candidates, setCandidates] = useState<Candidate[]>([])
  const [error, setError] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    profile: '',
    start: '',
    end: '',
    reference: '',
    combatCount: '',
    presiding: false,
    attested: false,
  })
  async function load() {
    setLoading(true)
    const results = await Promise.all([
      supabase.rpc('cvoa_delegate_registry'),
      isNational ? supabase.rpc('cvoa_governance_candidates') : Promise.resolve({ data: [], error: null }),
    ])
    setRows(results[0].data ?? [])
    setCandidates(results[1].data ?? [])
    setError(results.find((r) => r.error)?.error?.message ?? null)
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [isNational])
  async function certify(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await supabase.rpc('cvoa_certify_delegate', {
      p_profile: form.profile,
      p_start: form.start,
      p_end: form.end,
      p_reference: form.reference,
      p_combat_members: Number(form.combatCount),
      p_presiding: form.presiding,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setForm({ ...form, profile: '', attested: false })
    void load()
  }
  return (
    <div>
      <PageHeader eyebrow="Legislative branch · Article IX" title="Congress Delegates" />
      <CongressSubNav />
      <div className="panel p-5 mb-6">
        <p className="text-sm">
          Each chartered post elects one delegate per ten Combat Members in good standing, rounded up.
          Delegates serve staggered two-year terms. Chapter elections and the certified Combat Member roster
          determine seat entitlement.
        </p>
        <p className="text-xs text-muted mt-2">
          Formal ballots require a current, certified primary seat. Legacy or expired entries remain visible
          for correction and cannot vote. Alternates require a recorded substitution procedure before formal
          voting.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-status-attention mb-4">
          {error}
        </p>
      )}
      {isNational && (
        <form onSubmit={certify} className="panel p-5 mb-6 space-y-3">
          <div className="eyebrow">Record election certification · Adjutant General</div>
          <p className="text-xs text-muted">
            Record completed elections under §9.1 and Appendix B1. Verify candidate eligibility, election
            notice, the 25% participation quorum and results before certification. This form records the
            election; it does not elect or appoint a delegate.
          </p>
          <select
            required
            aria-label="Elected delegate"
            className="input-field"
            value={form.profile}
            onChange={(e) => setForm({ ...form, profile: e.target.value })}
          >
            <option value="">Select elected delegate</option>
            {candidates
              .filter((c) => c.post_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <label className="block text-sm">
            Certified Combat Members in the post
            <input
              required
              min="1"
              type="number"
              className="input-field mt-1"
              value={form.combatCount}
              onChange={(e) => setForm({ ...form, combatCount: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Term starts
              <input
                required
                type="date"
                className="input-field mt-1"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Term ends
              <input
                required
                type="date"
                className="input-field mt-1"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </label>
          </div>
          <input
            required
            aria-label="Election and roster certification reference"
            placeholder="Election minutes and certified roster reference"
            className="input-field"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.presiding}
              onChange={(e) => setForm({ ...form, presiding: e.target.checked })}
            />
            The election record also establishes this delegate as Congress Presiding Officer.
          </label>
          <label className="flex gap-2 text-sm">
            <input
              required
              type="checkbox"
              checked={form.attested}
              onChange={(e) => setForm({ ...form, attested: e.target.checked })}
            />
            I verified Combat Member eligibility, the certified roster and the election record.
          </label>
          <button disabled={saving || !form.attested} className="btn-gold">
            {saving ? 'Recording…' : 'Record certified election'}
          </button>
        </form>
      )}
      <div className="panel overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Delegate', 'Post', 'Credential', 'Term', 'Election record'].map((h) => (
                <th key={h} className="table-head">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="table-cell">{d.profile_name ?? 'Unassigned'}</td>
                <td className="table-cell">{d.post_name}</td>
                <td className="table-cell">
                  {d.is_alternate ? 'Alternate' : d.seated ? 'Seated' : 'Certification required / expired'}
                </td>
                <td className="table-cell text-xs">
                  {d.term_start ?? '—'} → {d.term_end ?? '—'}
                </td>
                <td className="table-cell text-xs">
                  {d.certification_reference ?? 'Legacy record — review required'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <p className="p-4">Loading credentials…</p>
        ) : (
          !rows.length && <p className="p-4 text-muted">No delegate elections recorded.</p>
        )}
      </div>
    </div>
  )
}
