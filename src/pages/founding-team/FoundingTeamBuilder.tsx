import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { FoundingTeamMember } from '@/lib/types'

const REQUIRED_POSITIONS = ['commander', 'vice_commander', 'adjutant', 'quartermaster', 'sergeant_at_arms']

export default function FoundingTeamBuilder() {
  const { profile } = useAuth()
  const [members, setMembers] = useState<FoundingTeamMember[]>([])

  useEffect(() => {
    if (!profile?.post_id) return
    supabase
      .from('founding_team_members')
      .select('*')
      .eq('post_id', profile.post_id)
      .then(({ data }) => setMembers((data ?? []) as FoundingTeamMember[]))
  }, [profile?.post_id])

  async function toggleVerification(member: FoundingTeamMember, field: keyof FoundingTeamMember) {
    const updated = { ...member, [field]: !member[field] }
    setMembers((prev) => prev.map((m) => (m.id === member.id ? (updated as FoundingTeamMember) : m)))
    await supabase.from('founding_team_members').update({ [field]: updated[field] }).eq('id', member.id)
  }

  if (!profile?.post_id) {
    return (
      <div>
        <PageHeader eyebrow="Module 3" title="Founding Team Builder" />
        <EmptyState title="No post assigned" hint="This module tracks the founding team for a specific post." />
      </div>
    )
  }

  const filledPositions = new Set(members.map((m) => m.position))
  const missing = REQUIRED_POSITIONS.filter((p) => !filledPositions.has(p as any))

  return (
    <div>
      <PageHeader eyebrow="Module 3" title="Founding Team Builder" />

      {missing.length > 0 && (
        <div className="panel p-4 mb-6 border-status-developing/50">
          <div className="eyebrow mb-1">Open Required Positions</div>
          <div className="flex gap-2 flex-wrap">
            {missing.map((p) => (
              <StatusBadge key={p} label={p.replaceAll('_', ' ')} tone="developing" />
            ))}
          </div>
        </div>
      )}

      <div className="panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Name</th>
              <th className="table-head">Position</th>
              <th className="table-head">DD214</th>
              <th className="table-head">Combat Verified</th>
              <th className="table-head">Membership</th>
              <th className="table-head">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="table-cell">{m.name}</td>
                <td className="table-cell capitalize">{m.position.replaceAll('_', ' ')}</td>
                <td className="table-cell">
                  <input
                    type="checkbox"
                    checked={m.dd214_reviewed}
                    onChange={() => toggleVerification(m, 'dd214_reviewed')}
                  />
                </td>
                <td className="table-cell">
                  <input
                    type="checkbox"
                    checked={m.combat_service_verified}
                    onChange={() => toggleVerification(m, 'combat_service_verified')}
                  />
                </td>
                <td className="table-cell">
                  <input
                    type="checkbox"
                    checked={m.membership_approved}
                    onChange={() => toggleVerification(m, 'membership_approved')}
                  />
                </td>
                <td className="table-cell">
                  <StatusBadge
                    label={m.verification_status}
                    tone={
                      m.verification_status === 'verified'
                        ? 'active'
                        : m.verification_status === 'rejected'
                        ? 'attention'
                        : 'developing'
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <EmptyState title="No founding team members yet" />}
      </div>
    </div>
  )
}
