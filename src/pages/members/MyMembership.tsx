import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
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
      .single()
      .then(({ data }: any) => {
        setMember((data as Member) ?? null)
        setLoading(false)
      })
  }, [profile])

  return (
    <div>
      <PageHeader eyebrow="Your Digital Card" title="My Membership" />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !member ? (
        <EmptyState
          title="No membership on file"
          hint="This account isn't linked to a CVOA membership yet — the card generates automatically the moment one activates."
        />
      ) : (
        <>
          <MembershipCardVisual member={member} />
          <p className="text-xs text-muted text-center mt-4 max-w-sm mx-auto">
            This card updates automatically — renewals, status changes, and expiration dates always reflect your
            real membership record, nothing to regenerate.
          </p>
        </>
      )}
    </div>
  )
}
