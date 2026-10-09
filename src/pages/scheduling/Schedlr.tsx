import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

const SCHEDLR_URL = 'https://schdlr-m54.vercel.app/'

/** Uses the independent application and its own sign-in. No CVOA tokens are sent. */
export default function Schedlr() {
  const { selectedScope, scopes } = useAuth()
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setAllowed(false); setChecking(true); setLoaded(false); setError('')
    supabase.rpc('cvoa_schedlr_context').then(({ data, error: failure }) => {
      if (!active) return
      setChecking(false)
      if (failure) setError('Could not verify access to this staff tool. Please retry.')
      else if (!data?.workspaces?.length) setError('This staff tool requires a current National, state, post staff, or designated delegate appointment.')
      else setAllowed(true)
    })
    return () => { active = false }
  }, [selectedScope, scopes, attempt])

  return <div className="p-4 md:p-8 space-y-5">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="font-display text-3xl">Schedlr</h1>
        <p className="text-sm text-muted mt-2">Appointments, team availability, and booking links.</p>
      </div>
      {allowed && <a href={SCHEDLR_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex items-center gap-2">
        <ExternalLink size={16} /> Open full screen
      </a>}
    </div>
    {checking && <p role="status" className="text-muted">Checking staff access…</p>}
    {error && <div role="alert" className="panel p-4">
      <p>{error}</p>
      <button onClick={() => setAttempt(value => value + 1)} className="btn-gold mt-3">Retry</button>
    </div>}
    {allowed && <>
      <div className="panel p-4 text-sm space-y-2">
        <p>Use <strong>Staff sign in</strong> inside Schedlr with your existing Schedlr account to manage appointments and availability.</p>
        <p className="text-muted">Schedlr manages its own account access. CVOA.ONE staff appointments are not synced to Schedlr in this release. If your browser blocks embedded sign-in, use Open full screen.</p>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <p role="status" className="text-muted">{loaded ? 'Schedlr is open below.' : 'Loading Schedlr…'}</p>
        <button onClick={() => setAttempt(value => value + 1)} className="btn-ghost inline-flex items-center gap-2"><RefreshCw size={14} /> Reload</button>
      </div>
      <iframe key={`${selectedScope}:${attempt}`} title="Schedlr appointments and staff scheduling" src={SCHEDLR_URL}
        onLoad={() => setLoaded(true)}
        onError={() => setError('Could not load Schedlr. Try Open full screen or reload.')}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        className="w-full rounded border border-border bg-white" style={{ height: 'calc(100vh - 240px)', minHeight: 720 }} referrerPolicy="no-referrer" />
    </>}
  </div>
}
