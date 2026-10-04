import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { WorkspaceStatus } from '@/components/workspaces/WorkspaceStatus'
import { supabase } from '@/lib/supabase'
import { ListPagination, LIST_PAGE_SIZE } from '@/components/ui/ListPagination'
interface RequestRow {
  id: string; member_id: string; member_name: string; source_post_id: string | null;
  source_recorded: boolean; source_name: string | null; target_post_id: string | null;
  target_name: string | null; reason: string; status: string; created_at: string;
  reviewed_at: string | null; review_note: string | null; can_review: boolean;
  can_open_member: boolean; staff_access: boolean;
}
export default function MembershipRequests() {
  const { profile, isNational } = useAuth()
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [page, setPage] = useState(0)
  const [status, setStatus] = useState('pending'), [search, setSearch] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({}), [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(null); setRows([])
    void supabase.rpc('cvoa_transfer_requests').then(({ data, error }) => {
      if (!active) return
      if (error) setError(error.message)
      else { setRows((data ?? []) as RequestRow[]); setPage(0) }
      setLoading(false)
    })
    return () => { active = false }
  }, [version, profile?.id, profile?.role, profile?.state, profile?.post_id])
  async function decide(r: RequestRow, approve: boolean) {
    if (busy || !r.can_review) return
    if (!window.confirm(`${approve ? 'Approve' : 'Decline'} ${r.member_name}’s request?${approve && r.staff_access ? ' Existing staff access will remain assigned. National must review those appointments separately.' : ''}`)) return
    setBusy(true); setError(null)
    try {
      const result = await supabase.rpc('cvoa_review_post_change', { p_request: r.id, p_approve: approve, p_note: notes[r.id] ?? '' })
      if (result.error) throw result.error
      setVersion(v => v + 1)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const visible = rows.filter(r => (status === 'all' || r.status === status) && `${r.member_name} ${r.source_name ?? ''} ${r.target_name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section>
    <h1 className="font-display text-3xl mb-2">Join &amp; Transfer Requests</h1>
    <p className="text-sm text-muted mb-5">Receiving post commanders approve incoming members. State staff oversee requests involving their state. National handles exceptions and requests to become at-large. Decisions appear in My Membership.</p>
    <div className="flex flex-wrap gap-4 items-end mb-5">
      <label className="text-sm flex-1">Find a request<input className="input-field mt-1" placeholder="Member or post name" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label>
      <label className="text-sm">Status<select className="input-field mt-1" value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}>{['pending','approved','declined','withdrawn','all'].map(s => <option key={s} value={s}>{s === 'all' ? 'All history' : s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
      <button className="btn-ghost" disabled={busy} onClick={() => setVersion(v => v + 1)}>Refresh</button>
    </div>
    <WorkspaceStatus loading={loading} error={error} retry={() => setVersion(v => v + 1)} />
    {!loading && !error && visible.length === 0 && <p className="text-muted">No requests match this view.</p>}
    <div className="space-y-4">{visible.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE).map(r => <section key={r.id} className="panel p-5">
      <h2 className="font-display text-xl">{r.can_open_member ? <Link className="text-gold hover:underline" to={`/members?highlight=${r.member_id}`}>{r.member_name} → Member record</Link> : r.member_name}</h2>
      <p className="text-sm mt-2">{r.source_recorded ? r.source_name ?? (r.source_post_id ? 'Former post' : 'At-large member (no post)') : 'Earlier affiliation not recorded'} → {r.target_name ?? (r.target_post_id ? 'Unavailable post' : 'At-large member (no post)')}</p>
      <p className="text-xs text-muted mt-2">Submitted {new Date(r.created_at).toLocaleDateString()} · {r.status}{r.status === 'pending' ? ` · Waiting ${Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000))} day(s)` : r.reviewed_at ? ` · Decided ${new Date(r.reviewed_at).toLocaleDateString()}` : ''}</p>
      <p className="text-sm text-muted mt-3 whitespace-pre-wrap">{r.reason}</p>
      {r.staff_access && <div className="border-l-2 border-status-developing pl-3 mt-4 text-sm"><p className="text-status-developing">Staff access requires separate review</p><p className="text-muted">This member has staff or delegate assignments. A membership transfer preserves those assignments.</p>{isNational && <Link className="text-gold" to="/users">Review Accounts &amp; Access →</Link>}</div>}
      {r.review_note && <p className="text-sm mt-4 whitespace-pre-wrap">Decision explanation: {r.review_note}</p>}
      {r.status === 'pending' && (r.can_review ? <><label className="block text-sm mt-4">Decision explanation (visible to member)<textarea className="input-field mt-1" maxLength={3000} value={notes[r.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} /></label><div className="flex gap-3 mt-3"><button className="btn-gold" disabled={busy || !notes[r.id]?.trim()} onClick={() => decide(r, true)}>Approve request</button><button className="btn-ghost" disabled={busy || !notes[r.id]?.trim()} onClick={() => decide(r, false)}>Decline</button></div></> : <p className="text-sm text-muted mt-4">Oversight view · {r.target_post_id ? 'Receiving post commander or National decides this request.' : 'National reviews requests to become at-large.'}</p>)}
    </section>)}</div>
    <ListPagination total={visible.length} page={page} onPageChange={setPage} />
  </section>
}
