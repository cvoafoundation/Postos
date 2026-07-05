import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, Upload, FileCheck, Loader2 } from 'lucide-react'

const POSITIONS = [
  { value: 'member', label: 'Additional Member' },
  { value: 'vice_commander', label: 'Vice Commander' },
  { value: 'adjutant', label: 'Adjutant' },
  { value: 'quartermaster', label: 'Quartermaster' },
  { value: 'sergeant_at_arms', label: 'Sergeant-at-Arms' },
  { value: 'commander', label: 'Commander' },
]

export default function JoinFoundingTeam() {
  const { postId } = useParams<{ postId: string }>()
  const [postName, setPostName] = useState<string | null>(null)
  const [postLoading, setPostLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    position: 'member',
    combat_status: 'Non-combat veteran',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [docFile, setDocFile] = useState<File | null>(null)
  const [docPath, setDocPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    if (!postId) return
    supabase
      .from('posts')
      .select('name')
      .eq('id', postId)
      .single()
      .then(({ data, error }: any) => {
        if (error || !data) {
          setNotFound(true)
        } else {
          setPostName(data.name)
        }
        setPostLoading(false)
      })
  }, [postId])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large — please keep it under 10MB.')
      return
    }

    setDocFile(file)
    setUploading(true)
    const path = `founding-team/${crypto.randomUUID()}-${file.name}`
    const { data, error } = await supabase.storage.from('dd214-uploads').upload(path, file)
    setUploading(false)

    if (error) {
      setUploadError(error.message)
      setDocFile(null)
      return
    }
    setDocPath(data?.path ?? path)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!postId) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('founding_team_members').insert({
      post_id: postId,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      position: form.position,
      combat_status: form.combat_status,
      dd214_storage_path: docPath,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  const canFillOutRest = !!docPath

  return (
    <div className="min-h-screen bg-base px-4 py-16 flex items-start justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="font-display text-3xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-1">Founding Team Sign-Up</div>
        </div>

        <div className="panel p-6">
          {postLoading ? (
            <p className="text-sm text-muted text-center py-8">Loading…</p>
          ) : notFound ? (
            <p className="text-sm text-status-attention text-center py-8">
              This invite link isn't valid. Double-check the link with whoever sent it to you.
            </p>
          ) : submitted ? (
            <div className="text-center py-8">
              <CheckCircle2 className="mx-auto mb-4 text-status-active" size={40} />
              <div className="font-display text-2xl tracking-wide mb-2">You're on the team</div>
              <p className="text-sm text-muted">
                Thanks for stepping up for {postName}. National Staff will follow up on next steps.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted mb-4">
                You're joining the founding team for <strong className="text-ink">{postName}</strong>.
              </p>

              <div className="mb-4">
                <label className="eyebrow block mb-2">Step 1 — Upload ID or DD214</label>
                <p className="text-xs text-muted mb-3">
                  Stored privately — only visible to National Staff.
                </p>

                {!docPath ? (
                  <label
                    className={`flex flex-col items-center justify-center gap-2 border border-dashed rounded-sm p-6 cursor-pointer transition-colors ${
                      uploadError ? 'border-status-attention' : 'border-hairline hover:border-gold'
                    }`}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="animate-spin text-gold" size={22} />
                        <span className="text-sm text-muted">Uploading {docFile?.name}…</span>
                      </>
                    ) : (
                      <>
                        <Upload className="text-muted" size={22} />
                        <span className="text-sm text-muted">Click to upload PDF, JPG, or PNG (max 10MB)</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={uploading}
                    />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 border border-status-active/40 bg-status-active/10 rounded-sm p-3">
                    <FileCheck className="text-status-active shrink-0" size={20} />
                    <div className="text-sm text-ink truncate">{docFile?.name}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setDocPath(null)
                        setDocFile(null)
                      }}
                      className="ml-auto text-xs text-muted hover:text-gold shrink-0"
                    >
                      Replace
                    </button>
                  </div>
                )}
                {uploadError && <p className="text-status-attention text-sm mt-2">{uploadError}</p>}
              </div>

              <fieldset disabled={!canFillOutRest} className={!canFillOutRest ? 'opacity-40 pointer-events-none' : ''}>
                <div className="mb-2 eyebrow">Step 2 — Your information</div>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    required
                    placeholder="Full name"
                    className="input-field"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    className="input-field"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                  />
                  <input
                    placeholder="Phone"
                    className="input-field"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                  />
                  <select
                    className="input-field"
                    value={form.position}
                    onChange={(e) => update('position', e.target.value)}
                  >
                    {POSITIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input-field"
                    value={form.combat_status}
                    onChange={(e) => update('combat_status', e.target.value)}
                  >
                    <option>Non-combat veteran</option>
                    <option>Combat veteran</option>
                  </select>

                  {error && <p className="text-status-attention text-sm">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting || !canFillOutRest}
                    className="btn-gold w-full disabled:opacity-50"
                  >
                    {submitting ? 'Joining…' : 'Join Founding Team'}
                  </button>
                </form>
              </fieldset>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
