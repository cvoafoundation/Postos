import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Link } from 'react-router-dom'
type Verification = { id: string; full_name: string; status: string; has_document: boolean }
const MIME: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }
export default function ServiceVerification() {
  const { profile } = useAuth()
  const [records, setRecords] = useState<Verification[]>([])
  const [selected, setSelected] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [inputVersion, setInputVersion] = useState(0)
  const [pendingUpload, setPendingUpload] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true); setRecords([]); setError(null); setMessage(null); setFile(null); setPendingUpload(null)
    void supabase.rpc('cvoa_member_verification').then(({ data, error }) => { if (active) { setRecords(data ?? []); setSelected(data?.[0]?.id ?? ''); setError(error?.message ?? null); setLoading(false) } }).catch(() => { if (active) { setError('Could not load verification. Try again.'); setLoading(false) } })
    return () => { active = false }
  }, [profile?.id, retry])
  async function upload() {
    if ((!file && !pendingUpload) || !selected || busy) return
    setError(null); setMessage(null); setBusy(true)
    try {
      let path = pendingUpload
      if (!path && file) {
        const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
        if (!MIME[extension] || (file.type && file.type !== MIME[extension]) || file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('Choose a PDF, JPG, or PNG of up to 10 MB.')
        const prepared = await supabase.rpc('cvoa_prepare_member_upload', { p_member: selected, p_extension: extension })
        if (prepared.error) throw prepared.error
        path = prepared.data
        if (!path) throw new Error('Could not prepare the upload.')
        const result = await supabase.storage.from('dd214-uploads').upload(path, file, { upsert: false, contentType: MIME[extension] })
        if (result.error) throw result.error
        setPendingUpload(path)
      }
      const submitted = await supabase.rpc('cvoa_submit_member_upload', { p_path: path })
      if (submitted.error) throw submitted.error
      setRecords(submitted.data ?? []); setInputVersion(v => v + 1); setFile(null); setPendingUpload(null); setMessage('Your DD-214 was submitted and is awaiting staff review.')
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Could not submit your document. Try again.') }
    finally { setBusy(false) }
  }
  const current = records.find(r => r.id === selected)
  return <section className="panel p-5 mt-6 space-y-4 print:hidden">
    <h2 className="font-display text-xl">Service Verification</h2>
    <p className="text-sm text-muted">Upload your DD-214 privately for staff review. You may redact your Social Security number and unrelated sensitive information. Keep the service information needed for verification visible.</p>
    {loading && <p role="status" className="text-sm text-muted">Loading verification…</p>}
    {!loading && !records.length && !error && <p className="text-sm text-muted">Contact National to link your existing membership before uploading.</p>}
    {records.length > 1 && <label className="block text-sm">Membership<select className="input-field mt-1" disabled={busy || !!pendingUpload} value={selected} onChange={e => { setSelected(e.target.value); setFile(null); setMessage(null) }}>{records.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}</select></label>}
    {current && <>
      <p className="text-sm">{current.has_document ? current.status === 'verified' ? 'Service verified' : current.status === 'rejected' ? 'Replacement document requested' : 'Document submitted · awaiting review' : 'DD-214 needed'}</p>
      {current.has_document && <p className="text-xs text-muted">A replacement submission will require a new review.</p>}
      <label className="block text-sm">{current.has_document ? 'Replacement DD-214' : 'Your DD-214'}<input key={`${profile?.id}-${selected}-${inputVersion}`} type="file" className="input-field mt-2" accept=".pdf,.jpg,.jpeg,.png" disabled={busy || !!pendingUpload} onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null); setMessage(null) }} /></label>
      <p className="text-xs text-muted">PDF, JPG, or PNG · maximum 10 MB. Submit through this page rather than email.</p>
      <button className="btn-gold" disabled={busy || (!file && !pendingUpload)} onClick={upload}>{busy ? 'Submitting…' : pendingUpload ? 'Retry submission' : 'Submit DD-214'}</button>
      {pendingUpload && !busy && <button className="btn-ghost ml-2" onClick={() => { setPendingUpload(null); setFile(null); setError(null) }}>Choose another file</button>}
    </>}
    {message && <p role="status" className="text-sm text-status-active">{message}</p>}
    {error && <p role="alert" className="text-sm text-status-attention">{error}</p>}
    {!loading && !records.length && error && <button className="btn-ghost" onClick={() => setRetry(v => v + 1)}>Retry</button>}
    <Link className="block text-sm text-gold" to="/my-membership">My membership →</Link>
  </section>
}
