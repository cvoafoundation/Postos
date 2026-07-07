import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { MEMBERSHIP_PRICES, type MembershipType, type Post } from '@/lib/types'
import { Loader2, KeyRound } from 'lucide-react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

export default function JoinCVOA() {
  const [posts, setPosts] = useState<Post[]>([])
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    state: '',
    military_branch: '',
    post_id: '',
    membership_type: 'annual' as MembershipType,
    password: '',
  })
  const [wantsAccount, setWantsAccount] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('posts')
      .select('*')
      .eq('status', 'active_post')
      .order('name')
      .then(({ data }: any) => setPosts((data ?? []) as Post[]))
  }, [])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { data: member, error: memberError } = await supabase
      .from('members')
      .insert({
        post_id: form.post_id || null,
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        state: form.state || null,
        military_branch: form.military_branch || null,
        membership_type: form.membership_type,
        membership_status: 'pending_payment',
      })
      .select()
      .single()

    if (memberError || !member) {
      setSubmitting(false)
      setError(memberError?.message ?? 'Something went wrong creating your record.')
      return
    }

    if (wantsAccount && form.password) {
      await supabase.from('pending_profile_signups').insert({
        email: form.email,
        full_name: form.full_name,
        post_id: form.post_id || null,
        role: 'member',
      })
      const { error: signUpError } = await supabase.auth.signUp({ email: form.email, password: form.password })
      if (signUpError) {
        // Membership record and payment can still proceed even if account
        // creation hits a snag — don't block on it.
        console.error('Account creation failed:', signUpError.message)
      }
    }

    const { data, error: checkoutError } = await supabase.functions.invoke('create-membership-checkout', {
      body: { member_id: member.id, post_id: form.post_id || null, membership_type: form.membership_type },
    })

    setSubmitting(false)
    if (checkoutError || data?.error) {
      setError(data?.error ?? checkoutError?.message ?? 'Could not start checkout.')
      return
    }

    window.location.href = data.url
  }

  return (
    <div className="min-h-screen bg-base px-4 py-16 flex items-start justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="font-display text-3xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-1">Join Combat Veterans of America</div>
        </div>

        <div className="panel p-6">
          <p className="text-sm text-muted mb-4">
            Become a member of CVOA. Payment is processed securely — you'll be redirected to complete checkout,
            and your membership activates automatically the moment it clears.
          </p>
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

            <select className="input-field" value={form.post_id} onChange={(e) => update('post_id', e.target.value)}>
              <option value="">No local post yet / not sure — join as a national member</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.city ? `${p.city}, ` : ''}{p.state}
                </option>
              ))}
            </select>

            <div className="border-t border-hairline pt-3">
              <label className="eyebrow block mb-2">Membership Type</label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`border rounded-sm p-3 cursor-pointer ${
                    form.membership_type === 'annual' ? 'border-gold bg-gold/10' : 'border-hairline'
                  }`}
                >
                  <input type="radio" className="hidden" checked={form.membership_type === 'annual'} onChange={() => update('membership_type', 'annual')} />
                  <div className="text-sm font-medium">Annual</div>
                  <div className="font-mono text-gold text-lg">${MEMBERSHIP_PRICES.annual}</div>
                </label>
                <label
                  className={`border rounded-sm p-3 cursor-pointer ${
                    form.membership_type === 'lifetime' ? 'border-gold bg-gold/10' : 'border-hairline'
                  }`}
                >
                  <input type="radio" className="hidden" checked={form.membership_type === 'lifetime'} onChange={() => update('membership_type', 'lifetime')} />
                  <div className="text-sm font-medium">Lifetime</div>
                  <div className="font-mono text-gold text-lg">${MEMBERSHIP_PRICES.lifetime}</div>
                </label>
              </div>
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

            <button type="submit" disabled={submitting} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> Preparing checkout…
                </>
              ) : (
                `Continue to Payment — $${MEMBERSHIP_PRICES[form.membership_type]}`
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
