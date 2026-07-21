import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { MEMBERSHIP_PRICES, type MembershipType } from '@/lib/types'
import { Loader2, KeyRound, Upload, FileCheck } from 'lucide-react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

export default function JoinMembership() {
  const { postId } = useParams<{ postId: string }>()
  const [postName, setPostName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    state: '',
    military_branch: '',
    membership_type: 'annual' as MembershipType,
    auto_renew: true,
    password: '',
  })
  const [wantsAccount, setWantsAccount] = useState(true)
  const [submitting, setSubmitting] = useState(false)
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
        setLoading(false)
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
    const path = `member-signups/${crypto.randomUUID()}-${file.name}`
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

    const memberId = crypto.randomUUID()

    const { error: memberError } = await supabase.from('members').insert({
      id: memberId,
      post_id: postId,
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      state: form.state || null,
      military_branch: form.military_branch || null,
      membership_type: form.membership_type,
      membership_status: 'pending_payment',
      dd214_storage_path: docPath,
    })

    if (memberError) {
      setSubmitting(false)
      setError(memberError.message)
      return
    }

    if (wantsAccount && form.password) {
      await supabase.from('pending_profile_signups').insert({
        email: form.email,
        full_name: form.full_name,
        post_id: postId,
        role: 'member',
      })
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      })
      if (signUpError) {
        console.error('Account creation failed:', signUpError.message)
      }
    }

    const { data, error: checkoutError } = await supabase.functions.invoke('create-membership-checkout', {
      body: {
        member_id: memberId,
        post_id: postId,
        membership_type: form.membership_type,
        auto_renew: form.membership_type === 'annual' ? form.auto_renew : false,
      },
    })

    setSubmitting(false)
    if (checkoutError || data?.error) {
      setError(data?.error ?? checkoutError?.message ?? 'Could not start checkout.')
      return
    }

    window.location.href = data.url
  }

  const canFillOutRest = !!docPath

  return (
    <div className="min-h-screen bg-base px-4 py-16 flex items-start justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="font-display text-3xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-1">Join / Renew Membership</div>
        </div>

        <div className="panel p-6">
          {loading ? (
            <p className="text-sm text-muted text-center py-8">Loading…</p>
          ) : notFound ? (
            <p className="text-sm text-status-attention text-center py-8">
              This link isn't valid. Double-check it with whoever sent it to you.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted mb-4">
                Join or renew your membership with <strong className="text-ink">{postName}</strong>. Payment is
                processed securely — you'll be redirected to complete checkout.
              </p>

              <div className="mb-4">
                <label className="eyebrow block mb-2">Step 1 — Upload Your DD214</label>
                <p className="text-xs text-muted mb-3">Required to verify eligibility. Stored privately — only visible to National Staff.</p>

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
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} disabled={uploading} />
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
                <div className="mb-2 eyebrow">Step 2 — Your Information</div>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input required placeholder="Full name" className="input-field" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <input required type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
                    <input placeholder="Phone" className="input-field" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
                  </div>
                  <input placeholder="Address" className="input-field" value={form.address} onChange={(e) => update('address', e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <select required className="input-field" value={form.state} onChange={(e) => update('state', e.target.value)}>
                      <option value="">State</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <input placeholder="Military branch" className="input-field" value={form.military_branch} onChange={(e) => update('military_branch', e.target.value)} />
                  </div>

                  <div className="border-t border-hairline pt-3">
                    <label className="eyebrow block mb-2">Membership Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      <label
                        className={`border rounded-sm p-3 cursor-pointer ${
                          form.membership_type === 'annual' ? 'border-gold bg-gold/10' : 'border-hairline'
                        }`}
                      >
                        <input
                          type="radio"
                          className="hidden"
                          checked={form.membership_type === 'annual'}
                          onChange={() => update('membership_type', 'annual')}
                        />
                        <div className="text-sm font-medium">Annual</div>
                        <div className="font-mono text-gold text-lg">${MEMBERSHIP_PRICES.annual}</div>
                      </label>
                      <label
                        className={`border rounded-sm p-3 cursor-pointer ${
                          form.membership_type === 'lifetime' ? 'border-gold bg-gold/10' : 'border-hairline'
                        }`}
                      >
                        <input
                          type="radio"
                          className="hidden"
                          checked={form.membership_type === 'lifetime'}
                          onChange={() => update('membership_type', 'lifetime')}
                        />
                        <div className="text-sm font-medium">Lifetime</div>
                        <div className="font-mono text-gold text-lg">${MEMBERSHIP_PRICES.lifetime}</div>
                      </label>
                    </div>
                    {form.membership_type === 'annual' && (
                      <label className="flex items-center gap-2 text-xs text-muted cursor-pointer mt-2">
                        <input type="checkbox" checked={form.auto_renew} onChange={(e) => update('auto_renew', e.target.checked)} />
                        Auto-renew annually (charges automatically each year — cancel anytime)
                      </label>
                    )}
                  </div>

                  <div className="border-t border-hairline pt-3">
                    <label className="flex items-center gap-2 text-sm text-muted cursor-pointer mb-2">
                      <input type="checkbox" checked={wantsAccount} onChange={(e) => setWantsAccount(e.target.checked)} />
                      <KeyRound size={13} /> Create an account (access activates once payment clears)
                    </label>
                    {wantsAccount && (
                      <input
                        required={wantsAccount}
                        type="password"
                        placeholder="Set a password"
                        className="input-field"
                        minLength={6}
                        value={form.password}
                        onChange={(e) => update('password', e.target.value)}
                      />
                    )}
                  </div>

                  {error && <p className="text-status-attention text-sm">{error}</p>}

                  <button type="submit" disabled={submitting || !canFillOutRest} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50">
                    {submitting ? (
                      <>
                        <Loader2 className="animate-spin" size={16} /> Preparing checkout…
                      </>
                    ) : (
                      `Continue to Payment — $${MEMBERSHIP_PRICES[form.membership_type]}`
                    )}
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
