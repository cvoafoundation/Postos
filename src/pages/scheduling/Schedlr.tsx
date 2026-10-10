import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

const SCHEDLR_URL = 'https://schdlr-m54.vercel.app/?cvoa_public=1'

/** Public booking launcher. Staff credentials are never shared with CVOA. */
export default function Schedlr() {
  const { session, selectedScope, scopes } = useAuth()
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
  }, [session?.user.id, selectedScope, scopes, attempt])

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
        <p>Book an appointment below. This view uses an anonymous booking session.</p>
        <p className="text-muted">Staff management is available in standalone Schedlr. CVOA.ONE account and workspace changes never restore a saved Schedlr staff login here.</p>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <p role="status" className="text-muted">{loaded ? 'Schedlr is open below.' : 'Loading Schedlr…'}</p>
        <button onClick={() => setAttempt(value => value + 1)} className="btn-ghost inline-flex items-center gap-2"><RefreshCw size={14} /> Reload</button>
      </div>
      <iframe key={`${session?.user.id}:${selectedScope}:${attempt}`} title="Schedlr appointments and staff scheduling" src={SCHEDLR_URL}
        onLoad={() => setLoaded(true)}
        onError={() => setError('Could not load Schedlr. Try Open full screen or reload.')}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        className="w-full rounded border border-border bg-white" style={{ height: 'calc(100vh - 240px)', minHeight: 720 }} referrerPolicy="no-referrer" />
    </>}
  </div>
}
