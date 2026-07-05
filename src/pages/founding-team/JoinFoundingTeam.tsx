import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { CheckCircle2 } from 'lucide-react'

const POSITIONS = [
  { value: 'commander', label: 'Commander' },
  { value: 'vice_commander', label: 'Vice Commander' },
  { value: 'adjutant', label: 'Adjutant' },
  { value: 'quartermaster', label: 'Quartermaster' },
  { value: 'sergeant_at_arms', label: 'Sergeant-at-Arms' },
  { value: 'member', label: 'Additional Member' },
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

                <button type="submit" disabled={submitting} className="btn-gold w-full disabled:opacity-50">
                  {submitting ? 'Joining…' : 'Join Founding Team'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
