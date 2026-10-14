import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
type Access = { enabled: boolean; eligible: boolean; version: number }
export default function MembershipAccess({ profileId, onChanged, onAccessChange }: { profileId: string; onChanged: () => void; onAccessChange?: (enabled: boolean) => void }) {
  const [access, setAccess] = useState<Access | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function load() {
    const { data, error } = await supabase.rpc('cvoa_membership_access', { p_profile: profileId })
    setAccess(data); if (data) onAccessChange?.(data.enabled); setError(error?.message ?? null)
  }
  useEffect(() => { let active = true; void supabase.rpc('cvoa_membership_access', { p_profile: profileId }).then(({ data, error }) => { if (active) { setAccess(data); if (data) onAccessChange?.(data.enabled); setError(error?.message ?? null) } }).catch(() => { if (active) setError('Could not load account access. Reload to try again.') }); return () => { active = false } }, [profileId, onAccessChange])
  async function save() {
    if (!access || busy) return
    setBusy(true); setError(null)
    try {
      const { data, error } = await supabase.rpc('cvoa_set_membership_access', { p_profile: profileId, p_version: access.version, p_enabled: !access.enabled, p_reason: reason.trim() })
      if (error) { await load(); setError(error.message); return }
      setAccess(data); if (data) onAccessChange?.(data.enabled); setReason(''); onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save access.') }
    finally { setBusy(false) }
  }
  return <section className="panel p-4 space-y-3">
    <h3 className="font-display text-xl">Membership workspace</h3>
    <p className="text-sm text-muted">Membership-only access provides the membership card, existing Veterans Congress rights, and the ability to file and follow personal ethics complaints. Staff tools, the directory, scheduling, files, and other modules are unavailable. Membership status remains unchanged.</p>
    {access && <><p className="text-sm">Current access: <strong>{access.enabled ? 'Membership-only' : 'Standard'}</strong></p>
      {!access.eligible && !access.enabled ? <p className="text-sm text-muted">This setting requires a linked member account with no staff or Tribunal appointments. Review Appointments & effective scope first.</p> : <>
        <label className="block text-sm">Reason for access history (National only)<textarea className="input-field mt-2" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} rows={2} disabled={busy} /></label>
        <button className="btn-gold" disabled={busy || reason.trim().length < 5} onClick={save}>{busy ? 'Saving…' : access.enabled ? 'Restore standard access' : 'Use membership-only access'}</button>
      </>}
    </>}
    {!access && !error && <p role="status" className="text-sm text-muted">Loading access…</p>}
    {error && <p role="alert" className="text-sm text-status-attention">{error}</p>}
  </section>
}
