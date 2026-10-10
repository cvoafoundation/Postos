import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
const SCHEDLR_ORIGIN = 'https://schdlr-m54.vercel.app'
const SCHEDLR_URL = `${SCHEDLR_ORIGIN}/?cvoa_workspace=1`
export default function Schedlr() {
  const { session } = useAuth()
  const frame = useRef<HTMLIFrameElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setReady(false); setError('')
    async function sendSession() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      const current = data.session
      const matches = current?.user.id === session?.user.id
      frame.current?.contentWindow?.postMessage({ type: 'cvoa:scheduling-session',
        token: matches ? current?.access_token : null,
        userId: matches ? current?.user.id : null,
        email: matches ? current?.user.email : null,
      }, SCHEDLR_ORIGIN)
      if (!matches) setError('Your account changed. Reopen Schedlr from your current CVOA account.')
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== SCHEDLR_ORIGIN || event.source !== frame.current?.contentWindow || event.data?.type !== 'schedlr:session-ready') return
      setReady(true); void sendSession()
    }
    window.addEventListener('message', receive)
    const timer = window.setInterval(() => void sendSession(), 30000)
    return () => { active = false; window.removeEventListener('message', receive); window.clearInterval(timer) }
  }, [session?.user.id, attempt])
  return <div className="p-4 md:p-8 space-y-4">
    <div className="flex justify-between gap-3"><div><h1 className="font-display text-3xl">Schedlr</h1><p className="text-sm text-muted mt-2">Your meetings, connected to your CVOA account.</p></div>
      <button onClick={() => setAttempt(n => n + 1)} className="btn-ghost inline-flex items-center gap-2"><RefreshCw size={16}/>Reload</button></div>
    <p className="text-sm text-muted">Schedule personal appointments and invite attendees by email. Official National, state, and post meetings remain in the Meetings tab under their existing permissions.</p>
    {error && <p role="alert">{error}</p>}
    {!ready && <p role="status" className="text-sm text-muted">Connecting your scheduling account…</p>}
    <iframe ref={frame} key={`${session?.user.id}:${attempt}`} title="My Schedlr meetings" src={SCHEDLR_URL}
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads" referrerPolicy="no-referrer"
      className="w-full rounded border border-border bg-white" style={{height:'calc(100vh - 200px)',minHeight:850}} />
  </div>
}
