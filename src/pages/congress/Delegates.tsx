import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { CongressSubNav } from './CongressSubNav'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { CongressDelegate } from '@/lib/types'

interface DelegateRow extends CongressDelegate {
  profile_name: string
  post_name: string
  votes_cast: number
  resolutions_sponsored: number
}

export default function Delegates() {
  const { isNational } = useAuth()
  const [canManage, setCanManage] = useState(false)
  useEffect(() => { let active = true; setCanManage(false); if (isNational) void supabase.rpc('cvoa_congress_admin_access').then(({ data, error }) => { if (active) setCanManage(!error && data === true) }); return () => { active = false } }, [isNational])
  const [rows, setRows] = useState<DelegateRow[]>([])
  const [error, setError] = useState<string|null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
    const labels = Promise.resolve(supabase.rpc('cvoa_congress_labels'))
    const [delegatesRes, profilesRes, postsRes, votesRes, resolutionsRes] = await Promise.all([
      supabase.from('congress_delegates').select('*'),
      labels.then(result => ({ ...result, data: result.data?.profiles ?? [] })),
      labels.then(result => ({ ...result, data: result.data?.posts ?? [] })),
      supabase.from('resolution_votes').select('voter_id'),
      supabase.from('resolutions').select('submitted_by'),
    ])

    const failure = [delegatesRes, profilesRes, postsRes, votesRes, resolutionsRes].find(result => result.error)
    if (failure?.error) throw failure.error
    const profileMap: Record<string, string> = {}
    for (const p of (profilesRes.data ?? []) as any[]) profileMap[p.id] = p.full_name
    const postMap: Record<string, string> = {}
    for (const p of (postsRes.data ?? []) as any[]) postMap[p.id] = p.name

    const voteCounts: Record<string, number> = {}
    for (const v of (votesRes.data ?? []) as any[]) {
      if (!v.voter_id) continue
      voteCounts[v.voter_id] = (voteCounts[v.voter_id] ?? 0) + 1
    }
    const sponsorCounts: Record<string, number> = {}
    for (const r of (resolutionsRes.data ?? []) as any[]) {
      if (!r.submitted_by) continue
      sponsorCounts[r.submitted_by] = (sponsorCounts[r.submitted_by] ?? 0) + 1
    }

    const delegates = (delegatesRes.data ?? []) as CongressDelegate[]
    setRows(
      delegates.map((d) => ({
        ...d,
        profile_name: (d.profile_id ? profileMap[d.profile_id] : undefined) ?? 'Unassigned',
        post_name: postMap[d.post_id] ?? 'Unknown Post',
        votes_cast: (d.profile_id ? voteCounts[d.profile_id] : undefined) ?? 0,
        resolutions_sponsored: (d.profile_id ? sponsorCounts[d.profile_id] : undefined) ?? 0,
      }))
    )

    } catch(e) { setError((e as {message?:string}).message ?? 'Could not load delegates.') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    window.addEventListener('focus', refresh)
    window.addEventListener('cvoa:people-changed', refresh)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('cvoa:people-changed', refresh) }
  }, [load])

  const today = new Date().toLocaleDateString('en-CA')
  const status = (d: DelegateRow) => d.term_end && d.term_end < today ? 'Ended' : d.term_start && d.term_start > today ? 'Upcoming' : 'Active'
  const visibleRows = rows.filter(d => d.profile_id && (showHistory || status(d) !== 'Ended'))
  const activeCount = rows.filter(d => d.profile_id && status(d) === 'Active' && !d.is_alternate).length

  return (
    <div>
      <PageHeader eyebrow="Module 8" title="Veterans Congress" />
      <CongressSubNav />

      <p className="text-sm text-muted mb-6">Congress appointments are managed by NCC members from the person's profile card under Access → Veterans Congress. {canManage && <Link className="text-gold" to="/users">Open Accounts & Access →</Link>}</p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted">{activeCount} active primary {activeCount === 1 ? 'delegate' : 'delegates'}. Appointments appear here automatically.</p>
        <div className="flex items-center gap-4"><label className="text-sm"><input type="checkbox" checked={showHistory} onChange={e=>setShowHistory(e.target.checked)} /> Show ended terms</label><button className="btn-ghost" disabled={loading} onClick={()=>void load()}>Refresh delegates</button></div>
      </div>
      {error&&<p role="alert" className="text-status-attention mb-4">{error} Use Refresh delegates to retry.</p>}
      {loading&&<p role="status" className="text-sm text-muted mb-3">Loading delegates…</p>}
      <div className="panel overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Delegate</th>
              <th className="table-head">Company</th>
              <th className="table-head">Seat</th>
              <th className="table-head">Status</th>
              <th className="table-head">Term</th>
              <th className="table-head">Votes Cast</th>
              <th className="table-head">Resolutions Sponsored</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((d) => (
              <tr key={d.id}>
                <td className="table-cell">{d.profile_name}</td>
                <td className="table-cell text-muted">{d.post_name}</td>
                <td className="table-cell">{d.is_alternate ? 'Alternate' : 'Primary delegate'}</td>
                <td className="table-cell"><span className={status(d)==='Active'?'text-status-active':'text-muted'}>{status(d)}</span></td>
                <td className="table-cell text-muted font-mono text-xs">
                  {d.term_start ?? '—'} → {d.term_end ?? '—'}
                </td>
                <td className="table-cell font-mono">{d.votes_cast}</td>
                <td className="table-cell font-mono">{d.resolutions_sponsored}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && visibleRows.length === 0 && (
          <div className="p-4">
            <EmptyState title="No current delegates" hint="NCC can appoint a delegate from the person’s profile card → Access → Veterans Congress." />
          </div>
        )}
      </div>
    </div>
  )
}
