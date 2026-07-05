import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { CheckCircle2 } from 'lucide-react'

export default function BecomeASponsor() {
  const { postId } = useParams<{ postId: string }>()
  const [postName, setPostName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [form, setForm] = useState({
    company: '',
    contact_name: '',
    email: '',
    phone: '',
    sponsorship_value: '',
    notes: '',
  })
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
    const { error } = await supabase.from('sponsors').insert({
      post_id: postId,
      company: form.company,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      sponsorship_value: form.sponsorship_value ? Number(form.sponsorship_value) : 0,
      notes: form.notes || null,
      stage: 'identified',
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
          <div className="eyebrow mt-1">Become a Sponsor</div>
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
              <div className="font-display text-2xl tracking-wide mb-2">Thank you</div>
              <p className="text-sm text-muted">
                Someone from {postName} will follow up about sponsorship with you directly.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted mb-4">
                Interested in sponsoring <strong className="text-ink">{postName}</strong>? Tell us a bit about
                your business and we'll follow up.
              </p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  required
                  placeholder="Company / business name"
                  className="input-field"
                  value={form.company}
                  onChange={(e) => update('company', e.target.value)}
                />
                <input
                  placeholder="Your name"
                  className="input-field"
                  value={form.contact_name}
                  onChange={(e) => update('contact_name', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
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
                </div>
                <input
                  type="number"
                  min={0}
                  placeholder="Approximate sponsorship amount you're considering (optional)"
                  className="input-field"
                  value={form.sponsorship_value}
                  onChange={(e) => update('sponsorship_value', e.target.value)}
                />
                <textarea
                  placeholder="Anything else you'd like us to know?"
                  className="input-field"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                />

                {error && <p className="text-status-attention text-sm">{error}</p>}

                <button type="submit" disabled={submitting} className="btn-gold w-full disabled:opacity-50">
                  {submitting ? 'Submitting…' : 'Submit Interest'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
