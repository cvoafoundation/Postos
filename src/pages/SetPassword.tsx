import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function SetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.hash.slice(1))
    const linkError = params.get('error_description') ?? new URLSearchParams(window.location.search).get('error_description')
    if (linkError) {
      setError('This password setup link has expired or is invalid. Ask CVOA to send a new invitation from your roster entry.')
      setLoading(false)
      return
    }
    // getSession waits for Supabase to consume the invite/recovery URL.
    supabase.auth.getSession().then(({ data, error }: any) => {
      if (!active) return
      setReady(Boolean(data?.session))
      if (error || !data?.session) setError('Open the password setup link in your CVOA email. If it has expired, ask CVOA to resend it.')
      setLoading(false)
    }).catch(() => {
      if (!active) return
      setError('Could not verify your invitation. Please reopen your email link and try again.')
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password !== confirmation) { setError('The passwords do not match.'); return }
    if (password.length < 8) { setError('Choose a password with at least 8 characters.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) { setError(error.message); return }
      // The existing home route sends members to their membership dashboard.
      navigate('/', { replace: true })
    } catch { setError('Could not save your password. Please try again.') }
    finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-base px-4 py-16">
      <div className="mx-auto max-w-md">
        <img src="/images/cvoa-logo.png" alt="CVOA" className="w-28 h-28 object-contain mx-auto mb-6" />
        <div className="panel p-6">
          <h1 className="font-display text-2xl tracking-wide mb-3">Create Your Password</h1>
          {loading ? <p className="text-muted">Verifying your invitation…</p> : ready ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted">Choose your password to access your CVOA membership.</p>
              <label className="block text-sm">New Password
                <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input-field mt-1" />
              </label>
              <label className="block text-sm">Confirm Password
                <input type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="input-field mt-1" />
              </label>
              {error && <p role="alert" className="text-status-attention text-sm">{error}</p>}
              <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">{saving ? 'Saving…' : 'Save Password & Open Membership'}</button>
            </form>
          ) : <><p role="alert" className="text-status-attention text-sm mb-4">{error}</p><Link to="/login?login=true" className="text-gold text-sm">Return to Login</Link></>}
        </div>
      </div>
    </div>
  )
}
