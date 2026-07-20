import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { CongressSubNav } from './CongressSubNav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { CongressDelegate, FoundingTeamMember } from '@/lib/types'

interface DelegateRow extends CongressDelegate {
  profile_name: string
  post_name: string
  votes_cast: number
  resolutions_sponsored: number
}

export default function Delegates() {
  const { profile, isNational } = useAuth()
  const [rows, setRows] = useState<DelegateRow[]>([])
  const [candidates, setCandidates] = useState<FoundingTeamMember[]>([])
  const [ownDelegate, setOwnDelegate] = useState<CongressDelegate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
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

    if (!isNational && profile?.post_id) {
      setOwnDelegate(delegates.find((d) => d.post_id === profile.post_id && !d.is_alternate) ?? null)
      const { data: team } = await supabase
        .from('founding_team_members')
        .select('*')
        .eq('post_id', profile.post_id)
        .eq('verification_status', 'verified')
        .not('profile_id', 'is', null)
      setCandidates((team ?? []) as FoundingTeamMember[])
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  async function setDelegate(profileId: string) {
    if (!profile?.post_id) return
    setSaving(true)
    if (ownDelegate) {
      await supabase.from('congress_delegates').update({ profile_id: profileId }).eq('id', ownDelegate.id)
    } else {
      await supabase.from('congress_delegates').insert({ post_id: profile.post_id, profile_id: profileId, is_alternate: false })
    }
    setSaving(false)
    load()
  }

  return (
    <div>
      <PageHeader eyebrow="Module 8" title="Veterans Congress" />
      <CongressSubNav />

      {!isNational && profile?.post_id && (
        <div className="panel p-5 mb-6">
          <div className="eyebrow mb-2">Your Post's Delegate</div>
          <p className="text-xs text-muted mb-3 max-w-xl">
            One delegate per post carries your chapter's formal vote and voice in Congress — on delegate votes,
            constitutional amendments, and floor debate. Choose from your verified officers below.
          </p>
          {ownDelegate?.profile_id ? (
            <div className="flex items-center justify-between border border-hairline rounded-sm p-3 mb-3">
              <div className="text-sm">
                Currently: <span className="text-gold">{rows.find((r) => r.id === ownDelegate.id)?.profile_name}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-status-developing mb-3">No delegate designated yet — your post's formal vote can't be cast until one is.</p>
          )}
          {candidates.length === 0 ? (
            <p className="text-xs text-muted">
              No verified officers with an account yet — verify a founding team member with an account first
              (Founding Team page), then they'll show up here to choose from.
            </p>
          ) : (
            <select
              className="input-field"
              value={ownDelegate?.profile_id ?? ''}
              disabled={saving}
              onChange={(e) => e.target.value && setDelegate(e.target.value)}
            >
              <option value="">Choose your delegate…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.profile_id!}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

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
            <EmptyState title="No delegates yet" />
          </div>
        )}
      </div>
    </div>
  )
}
