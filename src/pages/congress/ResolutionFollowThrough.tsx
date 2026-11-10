import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'

const statuses = { open: 'Open', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' }
type Fields = { owner_id: string; due_date: string; outcome: string; status: keyof typeof statuses; progress: string }
type Saved = Fields & { updated_at: string }
const blank: Fields = { owner_id: '', due_date: '', outcome: '', status: 'open', progress: '' }

export function ResolutionFollowThrough({ resolutionId }: { resolutionId: string }) {
  const [fields, setFields] = useState<Fields>(blank)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const columns = 'owner_id,due_date,outcome,status,progress,updated_at'
  useEffect(() => {
    let current = true
    setReady(false)
    setError('')
    void Promise.all([
      supabase.from('resolution_follow_through').select(columns).eq('resolution_id', resolutionId).maybeSingle(),
      supabase.from('profiles').select('id,full_name').in('role', ['national_commander','national_staff'])
        .is('deleted_at', null).eq('access_suspended', false).eq('is_test_account', false).order('full_name'),
    ]).then(([record, owners]) => {
      if (!current) return
      if (record.error || owners.error) throw Error('Could not load follow-through.')
      setSaved(record.data)
      setFields(record.data ?? blank)
      setPeople(owners.data ?? [])
      setReady(true)
    }).catch(() => { if (current) setError('Could not load follow-through. Try refreshing.') })
    return () => { current = false }
  }, [resolutionId, refresh])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !ready) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { owner_id, due_date, outcome, status, progress } = fields
      const patch = { owner_id, due_date, outcome: outcome.trim(), status, progress: progress.trim() }
      if (!patch.outcome) throw Error('Enter the outcome this assignment should produce.')
      const table = supabase.from('resolution_follow_through')
      const query = saved
        ? table.update(patch).eq('resolution_id', resolutionId).eq('updated_at', saved.updated_at)
        : table.insert({ ...patch, resolution_id: resolutionId })
      const { data, error } = await query.select(columns).maybeSingle()
      if (error || !data) throw Error('The assignment could not be saved. Refresh if another reviewer changed it, and confirm the owner still has National access.')
      setSaved(data)
      setFields(data)
      setNotice('Follow-through saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assignment could not be saved.')
    } finally { setBusy(false) }
  }

  return <section className="panel p-5 mb-6" aria-label="Resolution follow-through">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <h2 className="font-display text-xl">Implementation follow-through</h2>
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setNotice(''); setRefresh(n => n + 1) }}>Refresh</button>
    </div>
    <p className="text-sm text-muted mb-4">Assign a National owner, set a deadline, and record what was done. The vote and resolution status are preserved.</p>
    {error && <p role="alert" className="text-sm text-status-attention mb-3">{error}</p>}
    {notice && <p role="status" className="text-sm text-status-active mb-3">{notice}</p>}
    {!ready && !error && <p role="status" className="text-sm text-muted">Loading follow-through…</p>}
    {ready && <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Outcome
        <input className="input-field mt-1" required maxLength={500} value={fields.outcome}
          onChange={e => setFields(v => ({ ...v, outcome: e.target.value }))} />
      </label>
      <label className="text-sm">Owner
        <select className="input-field mt-1" required value={fields.owner_id} onChange={e => setFields(v => ({ ...v, owner_id: e.target.value }))}>
          <option value="">Select National staff</option>
          {fields.owner_id && !people.some(p => p.id === fields.owner_id) && <option value={fields.owner_id} disabled>Previous owner · reassignment needed</option>}
          {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </label>
      <label className="text-sm">Due date
        <input type="date" className="input-field mt-1" required value={fields.due_date}
          onChange={e => setFields(v => ({ ...v, due_date: e.target.value }))} />
      </label>
      <label className="text-sm">Status
        <select className="input-field mt-1" value={fields.status} onChange={e => setFields(v => ({ ...v, status: e.target.value as Fields['status'] }))}>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-sm sm:col-span-2">Progress or completion record
        <textarea className="input-field mt-1" maxLength={2000} rows={3} value={fields.progress}
          onChange={e => setFields(v => ({ ...v, progress: e.target.value }))} />
      </label>
      <div><button type="submit" disabled={busy} className="btn-gold">{busy ? 'Saving…' : 'Save follow-through'}</button></div>
    </form>}
  </section>
}
