import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { CheckCircle2 } from 'lucide-react'

const SOURCES = [
  'Community Event',
  'Referral from a Member',
  'Social Media',
  'Flyer',
  'Walk-in',
  'VA Clinic / Resource Fair',
  'Other',
]

export default function PublicRecruitSignup() {
  const { postId } = useParams<{ postId: string }>()
  const [postName, setPostName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [form, setForm] = useState({ name: '', email: '', phone: '', source: SOURCES[0] })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!postId) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('recruits').insert({
      post_id: postId,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      source: form.source,
      stage: 'prospect',
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-base px-4 py-16 flex items-start justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="font-display text-3xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-1">Interest Sign-Up</div>
        </div>

        <div className="panel p-6">
          {loading ? (
            <p className="text-sm text-muted text-center py-8">Loading…</p>
          ) : notFound ? (
            <p className="text-sm text-status-attention text-center py-8">
              This link isn't valid. Double-check it with whoever sent it to you.
            </p>
          ) : submitted ? (
            <div className="text-center py-8">
              <CheckCircle2 className="mx-auto mb-4 text-status-active" size={40} />
              <div className="font-display text-2xl tracking-wide mb-2">Thanks for your interest</div>
              <p className="text-sm text-muted">
                Someone from {postName} will be in touch. No further action needed on your end.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted mb-4">
                Interested in <strong className="text-ink">{postName}</strong>? Leave your info and someone will
                reach out.
              </p>
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
                  value={form.source}
                  onChange={(e) => update('source', e.target.value)}
                >
                  {SOURCES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>

                {error && <p className="text-status-attention text-sm">{error}</p>}

                <button type="submit" disabled={submitting} className="btn-gold w-full disabled:opacity-50">
                  {submitting ? 'Submitting…' : "I'm Interested"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
