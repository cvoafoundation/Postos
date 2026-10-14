import ServiceVerification from '@/components/membership/ServiceVerification'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { MembershipCardVisual } from '@/components/membership/MembershipCardVisual'
import { PageHeader } from '@/components/layout/AppShell'
import type { Member } from '@/lib/types'
export default function MembershipCardPage() {
  const { profile } = useAuth()
  const [cards, setCards] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setCards([]); setLoading(true); setError(null)
    void supabase.rpc('cvoa_my_membership_cards').then(({ data, error }) => { if (active) { setCards(data ?? []); setError(error?.message ?? null); setLoading(false) } }).catch(() => { if (active) { setError('Could not load your card. Please reload to try again.'); setLoading(false) } })
    return () => { active = false }
  }, [profile?.id])
  return <div>
    <PageHeader eyebrow="Combat Veterans of America" title="Membership Card" />
    {loading && <p role="status" className="text-sm text-muted">Loading your membership card…</p>}
    {error && <p role="alert" className="text-status-attention">{error}</p>}
    {!loading && !error && !cards.length && <p className="text-sm text-muted">Your membership card is being prepared. Contact National if you need assistance.</p>}
    <div className="space-y-6">{cards.map(member => <MembershipCardVisual key={member.id} member={member} role={profile?.role} />)}</div>
    <ServiceVerification />
    {cards.length > 0 && <div className="text-center mt-6 print:hidden"><button className="btn-gold" onClick={() => window.print()}>Print membership card</button></div>}
  </div>
}
