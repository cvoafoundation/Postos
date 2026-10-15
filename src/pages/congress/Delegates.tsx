import { useEffect, useState } from 'react'
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
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const labels = supabase.rpc('cvoa_congress_labels')
    const [delegatesRes, profilesRes, postsRes, votesRes, resolutionsRes] = await Promise.all([
      supabase.from('congress_delegates').select('*'),
      labels.then(result => ({ ...result, data: result.data?.profiles ?? [] })),
      labels.then(result => ({ ...result, data: result.data?.posts ?? [] })),
      supabase.from('resolution_votes').select('voter_id'),
      supabase.from('resolutions').select('submitted_by'),
    ])

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

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Module 8" title="Veterans Congress" />
      <CongressSubNav />

      <p className="text-sm text-muted mb-6">Congress appointments are managed by NCC members from the person's profile card under Access → Veterans Congress. {canManage && <Link className="text-gold" to="/users">Open Accounts & Access →</Link>}</p>

      <div className="panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Delegate</th>
              <th className="table-head">Company</th>
              <th className="table-head">Alternate</th>
              <th className="table-head">Term</th>
              <th className="table-head">Votes Cast</th>
              <th className="table-head">Resolutions Sponsored</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="table-cell">{d.profile_name}</td>
                <td className="table-cell text-muted">{d.post_name}</td>
                <td className="table-cell">{d.is_alternate ? 'Yes' : 'No'}</td>
                <td className="table-cell text-muted font-mono text-xs">
                  {d.term_start ?? '—'} → {d.term_end ?? '—'}
                </td>
                <td className="table-cell font-mono">{d.votes_cast}</td>
                <td className="table-cell font-mono">{d.resolutions_sponsored}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <div className="p-4">
            <EmptyState title="No delegates yet" />
          </div>
        )}
      </div>
    </div>
  )
}
