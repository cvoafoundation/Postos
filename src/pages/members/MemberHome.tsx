import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Member, Post } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { Flag, Landmark, Users, MapPin, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

export default function MemberHome() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [showStartPost, setShowStartPost] = useState(false)
  const [requestedPostId, setRequestedPostId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('members').select('*').eq('profile_id', profile.id).single(),
      supabase.from('posts').select('*').eq('status', 'active_post').order('name'),
    ]).then(([m, p]) => {
      setMember((m.data as Member) ?? null)
      setPosts((p.data ?? []) as Post[])
      setLoading(false)
    })
  }, [profile])

  async function requestToJoin(post: Post) {
    await supabase.from('recruits').insert({
      post_id: post.id,
      name: profile?.full_name ?? member?.full_name ?? '',
      email: profile?.email ?? member?.email ?? null,
      phone: member?.phone ?? null,
      stage: 'prospect',
      source: 'Member Portal',
    })
    setRequestedPostId(post.id)
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <div className="mb-8">
        <div className="eyebrow mb-1">Welcome</div>
        <h1 className="font-display text-3xl tracking-wide">{profile?.full_name}</h1>
      </div>

      {member && (
        <div className="panel p-5 mb-8 flex items-center justify-between">
          <div>
            <div className="eyebrow mb-1">Your Membership</div>
            <div className="font-mono text-gold text-lg">{member.membership_number}</div>
            <div className="text-sm text-muted mt-1">
              {member.membership_type === 'lifetime' ? 'Lifetime Member' : 'Annual Member'}
              {member.expires_at && member.membership_type === 'annual' && ` · renews ${format(new Date(member.expires_at), 'MMM d, yyyy')}`}
            </div>
          </div>
          <StatusBadge label={member.membership_status.replaceAll('_', ' ')} tone={member.membership_status === 'active' ? 'active' : 'developing'} />
        </div>
      )}

      <div className="eyebrow mb-3">Get Involved</div>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Membership is a starting point, not a finish line. Here's how to actually get involved.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="panel p-5">
          <Flag className="text-gold mb-3" size={22} />
          <div className="font-display text-lg mb-1">Start a Post</div>
          <p className="text-xs text-muted mb-4">
            No CVOA post near you? Start one. This goes straight to National's Application Pipeline for review.
          </p>
          <button onClick={() => setShowStartPost(true)} className="btn-gold w-full text-sm">
            Start a Post
          </button>
        </div>

        <div className="panel p-5">
          <Landmark className="text-gold mb-3" size={22} />
          <div className="font-display text-lg mb-1">Veterans Congress</div>
          <p className="text-xs text-muted mb-4">
            CVOA's legislative body. Members can follow and vote on open resolutions — delegates are chosen by
            posts to carry a formal vote.
          </p>
          <button onClick={() => navigate('/congress')} className="btn-ghost w-full text-sm">
            View Open Votes
          </button>
        </div>

        <div className="panel p-5">
          <Users className="text-gold mb-3" size={22} />
          <div className="font-display text-lg mb-1">Volunteer Locally</div>
          <p className="text-xs text-muted mb-4">
            Find an active post near you and request to join — a real person there will follow up.
          </p>
          <button onClick={() => document.getElementById('post-list')?.scrollIntoView({ behavior: 'smooth' })} className="btn-ghost w-full text-sm">
            Browse Posts
          </button>
        </div>
      </div>

      <div id="post-list">
        <div className="eyebrow mb-3 flex items-center gap-1.5">
          <MapPin size={12} /> Active Posts
        </div>
        {posts.length === 0 ? (
          <p className="text-sm text-muted">No active posts yet — be the first to start one.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {posts.map((p) => (
              <div key={p.id} className="panel p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted font-mono">
                    {p.city ? `${p.city}, ` : ''}
                    {p.state}
                  </div>
                </div>
                {requestedPostId === p.id ? (
                  <span className="text-xs text-status-active flex items-center gap-1">
                    <CheckCircle2 size={14} /> Requested
                  </span>
                ) : (
                  <button onClick={() => requestToJoin(p)} className="btn-ghost text-xs px-3 py-1.5">
                    Request to Join
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showStartPost && (
        <StartPostModal
          defaultName={profile?.full_name ?? ''}
          defaultEmail={profile?.email ?? ''}
          onClose={() => setShowStartPost(false)}
        />
      )}
    </div>
  )
}

function StartPostModal({ defaultName, defaultEmail, onClose }: { defaultName: string; defaultEmail: string; onClose: () => void }) {
  const [form, setForm] = useState({
    name: defaultName,
    email: defaultEmail,
    phone: '',
    city: '',
    state: '',
    motivation: '',
  })
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

  return (
    <Modal title="Start a CVOA Post" onClose={onClose}>
      {submitted ? (
        <div className="text-center py-6">
          <CheckCircle2 className="mx-auto mb-3 text-status-active" size={36} />
          <p className="text-sm text-ink">Submitted — National will follow up with next steps.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input required placeholder="Your name" className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} />
          <input required type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
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
          <input placeholder="Phone" className="input-field" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
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
      )}
    </Modal>
  )
}
