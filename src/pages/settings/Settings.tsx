import { useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Check } from 'lucide-react'

export default function Settings() {
  const { profile, refreshProfile } = useAuth()

  return (
    <div className="max-w-lg">
      <PageHeader eyebrow="Account" title="Settings" />
      <ProfileSection fullName={profile?.full_name ?? ''} phone={profile?.phone ?? ''} onSaved={refreshProfile} />
      <PasswordSection />
    </div>
  )
}

function ProfileSection({ fullName, phone, onSaved }: { fullName: string; phone: string; onSaved?: () => void }) {
  const [name, setName] = useState(fullName)
  const [phoneNumber, setPhoneNumber] = useState(phone)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      setError('Not signed in.')
      return
    }
    const { error } = await supabase.from('profiles').update({ full_name: name, phone: phoneNumber || null }).eq('id', user.id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setSaved(true)
    onSaved?.()
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="panel p-6 mb-6">
      <div className="eyebrow mb-4">Profile</div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-muted block mb-1">Full Name</label>
          <input required className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Phone</label>
          <input className="input-field" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="btn-gold flex items-center gap-2 disabled:opacity-50">
          {saved ? (
            <>
              <Check size={16} /> Saved
            </>
          ) : saving ? (
            'Saving…'
          ) : (
            'Save Profile'
          )}
        </button>
      </form>
    </div>
  )
}

function PasswordSection() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setSaved(true)
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="panel p-6">
      <div className="eyebrow mb-4">Change Password</div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-muted block mb-1">New Password</label>
          <input
            required
            type="password"
            className="input-field"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Confirm New Password</label>
          <input required type="password" className="input-field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="btn-gold flex items-center gap-2 disabled:opacity-50">
          {saved ? (
            <>
              <Check size={16} /> Password Updated
            </>
          ) : saving ? (
            'Updating…'
          ) : (
            'Update Password'
          )}
        </button>
      </form>
    </div>
  )
}
