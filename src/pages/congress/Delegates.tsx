import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { CongressSubNav } from './CongressSubNav'
import { supabase } from '@/lib/supabase'
import type { CongressDelegate } from '@/lib/types'

interface DelegateRow extends CongressDelegate {
  profile_name: string
  post_name: string
  votes_cast: number
  resolutions_sponsored: number
}

export default function Delegates() {
  const [rows, setRows] = useState<DelegateRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [delegatesRes, profilesRes, postsRes, votesRes, resolutionsRes] = await Promise.all([
        supabase.from('congress_delegates').select('*'),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('posts').select('id, name'),
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
    load()
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Module 8" title="Veterans Congress" />
      <CongressSubNav />

      <div className="panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Delegate</th>
              <th className="table-head">Post</th>
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
            <EmptyState title="No delegates yet" hint="Delegates are added per-post via the congress_delegates table." />
          </div>
        )}
      </div>
    </div>
  )
}
