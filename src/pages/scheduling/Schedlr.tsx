import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

const SCHEDLR_ORIGIN = 'https://schdlr.vercel.app'
type Context = { name: string; selected_key: string; workspaces: { key: string; label: string; role: string }[] }

export default function Schedlr() {
  const { session, selectedScope } = useAuth()
  const frame = useRef<HTMLIFrameElement>(null)
  const connection = useRef(false)
  const [context, setContext] = useState<Context | null>(null)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setContext(null); setError(''); setConnected(false); connection.current = false
    supabase.rpc('cvoa_schedlr_context').then(({ data, error: failure }) => {
      if (!active) return
      if (failure) setError('Could not verify your scheduling access. Please retry.')
      else if (!data?.workspaces?.length) setError('Scheduling requires a current National, state, post staff, or designated delegate appointment. Contact National if your access needs review.')
      else setContext(data as Context)
    })
    return () => { active = false }
  }, [selectedScope, attempt])

  useEffect(() => {
    if (!context || !session) return
    const sendSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session?.access_token) { setError('Your session expired. Sign in again.'); return }
      frame.current?.contentWindow?.postMessage({ type: 'cvoa:schedlr-connect', accessToken: data.session.access_token }, SCHEDLR_ORIGIN)
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== SCHEDLR_ORIGIN || event.source !== frame.current?.contentWindow) return
      if (event.data?.type === 'schedlr:ready') void sendSession()
      if (event.data?.type === 'schedlr:connected') { connection.current = true; setConnected(true); setError('') }
      if (event.data?.type === 'schedlr:error') { connection.current = false; setConnected(false); setError('Schedlr could not connect. Retry, or contact National if your appointment has changed.') }
    }
    window.addEventListener('message', receive)
    const renew = window.setInterval(() => { void sendSession() }, 120_000)
    const timeout = window.setTimeout(() => { if (!connection.current) setError('Schedlr is taking longer than expected. Please retry the connection.') }, 25_000)
    return () => { window.removeEventListener('message', receive); window.clearInterval(renew); window.clearTimeout(timeout) }
  }, [context, session])

  return <div className="p-4 md:p-8 space-y-5">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div><h1 className="font-display text-3xl">Schedlr</h1><p className="text-sm text-muted mt-2">Appointments, team availability, and booking links for your assigned workspaces.</p></div>
      <a href={SCHEDLR_ORIGIN} target="_blank" rel="noopener noreferrer" className="btn-ghost">Open standalone Schedlr</a>
    </div>
    {error && <div role="alert" className="panel p-4"><p>{error}</p><button onClick={() => setAttempt(value => value + 1)} className="btn-gold mt-3">Retry connection</button></div>}
    {!error && !context && <p role="status" className="text-muted">Checking your scheduling access…</p>}
    {context && <>
      {!connected && !error && <p role="status" className="text-sm text-muted">Connecting your CVOA account to Schedlr…</p>}
      <iframe key={`${selectedScope}:${attempt}`} ref={frame} title="Schedlr scheduling workspace" src={`${SCHEDLR_ORIGIN}/integrations/cvoa`} className="w-full rounded border border-border bg-white" style={{ height: 'calc(100vh - 220px)', minHeight: 620 }} referrerPolicy="no-referrer" />
    </>}
  </div>
}
