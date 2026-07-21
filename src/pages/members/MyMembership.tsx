import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { MembershipCardVisual } from '@/components/membership/MembershipCardVisual'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Member } from '@/lib/types'

export default function MyMembership() {
  const { profile } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('members')
      .select('*')
      .eq('profile_id', profile.id)
      .order('membership_status', { ascending: true })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as Member[]
        setMember(rows.find((r) => r.membership_status === 'active') ?? rows[0] ?? null)
        setLoading(false)
      })
  }, [profile])

  // This page is the card, full stop — no header, no extra copy around it.
  if (loading) return null
  if (!member) {
    return (
      <div className="pt-16">
        <EmptyState
          title="No membership on file"
          hint="This account isn't linked to a CVOA membership yet — the card generates automatically the moment one activates."
        />
      </div>
    )
  }

  return (
    <div className="pt-10">
      <MembershipCardVisual member={member} role={profile?.role} />
    </div>
  )
}
