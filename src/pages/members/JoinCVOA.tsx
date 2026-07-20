import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { MEMBERSHIP_PRICES, type MembershipType, type Post } from '@/lib/types'
import { Loader2, KeyRound, Upload, FileCheck, CheckCircle2, Flag, UserPlus, IdCard, LogIn } from 'lucide-react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

type Path = 'choose' | 'join_existing' | 'new_post' | 'member_only'

export default function JoinCVOA() {
  const navigate = useNavigate()
  const [path, setPath] = useState<Path>('choose')
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    supabase
      .from('posts')
      .select('*')
      .eq('status', 'active_post')
      .order('name')
      .then(({ data }: any) => setPosts((data ?? []) as Post[]))
  }, [])

  return (
    <div className="min-h-screen bg-base px-4 py-16">
      <div className={`mx-auto ${path === 'choose' ? 'max-w-4xl' : 'max-w-md'}`}>
        <div className="text-center mb-10">
          <div className="font-display text-5xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-2">Combat Veterans of America</div>
        </div>

        {path === 'choose' && (
          <div>
            <p className="text-center text-sm text-muted mb-6">What are you looking to do?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ChooserCard
                icon={UserPlus}
                title="Join an Existing Post"
                subtitle="There's already a CVOA post near me"
                onClick={() => setPath('join_existing')}
              />
              <ChooserCard
                icon={Flag}
                title="Start a New Post"
                subtitle="There isn't one in my area yet"
                onClick={() => setPath('new_post')}
              />
              <ChooserCard
                icon={IdCard}
                title="Just Become a Member"
                subtitle="Not sure yet, or no local post"
                onClick={() => setPath('member_only')}
              />
              <ChooserCard
                icon={LogIn}
                title="Log In"
                subtitle="Already have an account"
                onClick={() => navigate('/?login=true')}
              />
            </div>
          </div>
        )}

        {path !== 'choose' && (
          <div className="panel p-6">
            {path === 'new_post' && <StartPostForm onBack={() => setPath('choose')} />}
            {(path === 'join_existing' || path === 'member_only') && (
              <MembershipForm mode={path} posts={posts} onBack={() => setPath('choose')} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ChooserCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Flag
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="panel p-6 text-left hover:border-gold transition-colors flex flex-col items-start gap-3 group"
    >
      <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
        <Icon className="text-gold" size={22} />
      </div>
      <div>
        <div className="font-display text-lg tracking-wide text-ink">{title}</div>
        <div className="text-xs text-muted mt-1">{subtitle}</div>
      </div>
    </button>
  )
}

function StartPostForm({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', state: '', motivation: '' })
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('post_applications').insert({
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      city: form.city || null,
      state: form.state,
      motivation: form.motivation || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="mx-auto mb-3 text-status-active" size={36} />
        <div className="font-display text-xl mb-2">Application Submitted</div>
        <p className="text-sm text-muted">National will follow up with next steps for starting your post.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs text-muted hover:text-gold mb-2">
        ← Back
      </button>
      <p className="text-sm text-muted mb-2">Tell us about yourself and where you want to start a post.</p>
      <input required placeholder="Full name" className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} />
      <input required type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
      <input placeholder="Phone" className="input-field" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="City" className="input-field" value={form.city} onChange={(e) => update('city', e.target.value)} />
        <select required className="input-field" value={form.state} onChange={(e) => update('state', e.target.value)}>
          <option value="">State</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <textarea
        placeholder="Why do you want to start a post here?"
        className="input-field"
        rows={3}
        value={form.motivation}
        onChange={(e) => update('motivation', e.target.value)}
      />
      {error && <p className="text-status-attention text-sm">{error}</p>}
      <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
        {saving ? 'Submitting…' : 'Submit Application'}
      </button>
    </form>
  )
}

function MembershipForm({ mode, posts, onBack }: { mode: 'join_existing' | 'member_only'; posts: Post[]; onBack: () => void }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    state: '',
    military_branch: '',
    post_id: '',
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
    setSubmitting(true)
    setError(null)

    // Generated here rather than read back after insert — reading a row
    // back is governed by the SELECT policy (National or your own post),
    // which an anonymous visitor signing up doesn't satisfy. Providing the
    // id ourselves means we never need to ask for it back.
    const memberId = crypto.randomUUID()

    const { error: memberError } = await supabase.from('members').insert({
      id: memberId,
      post_id: mode === 'join_existing' ? form.post_id || null : null,
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
        post_id: mode === 'join_existing' ? form.post_id || null : null,
        role: 'member',
      })
      const { error: signUpError } = await supabase.auth.signUp({ email: form.email, password: form.password })
      if (signUpError) console.error('Account creation failed:', signUpError.message)
    }

    const { data, error: checkoutError } = await supabase.functions.invoke('create-membership-checkout', {
      body: {
        member_id: memberId,
        post_id: mode === 'join_existing' ? form.post_id || null : null,
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
    <div>
      <button type="button" onClick={onBack} className="text-xs text-muted hover:text-gold mb-3">
        ← Back
      </button>

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

          {mode === 'join_existing' && (
            <select required className="input-field" value={form.post_id} onChange={(e) => update('post_id', e.target.value)}>
              <option value="">Select your post…</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.city ? `${p.city}, ` : ''}
                  {p.state}
                </option>
              ))}
            </select>
          )}

          <div className="border-t border-hairline pt-3">
            <label className="eyebrow block mb-2">Membership Type</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`border rounded-sm p-3 cursor-pointer ${form.membership_type === 'annual' ? 'border-gold bg-gold/10' : 'border-hairline'}`}>
                <input type="radio" className="hidden" checked={form.membership_type === 'annual'} onChange={() => update('membership_type', 'annual')} />
                <div className="text-sm font-medium">Annual</div>
                <div className="font-mono text-gold text-lg">${MEMBERSHIP_PRICES.annual}</div>
              </label>
              <label className={`border rounded-sm p-3 cursor-pointer ${form.membership_type === 'lifetime' ? 'border-gold bg-gold/10' : 'border-hairline'}`}>
                <input type="radio" className="hidden" checked={form.membership_type === 'lifetime'} onChange={() => update('membership_type', 'lifetime')} />
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
    </div>
  )
}
