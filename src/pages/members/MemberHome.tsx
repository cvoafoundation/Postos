import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Member, Post } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { MembershipCardVisual } from '@/components/membership/MembershipCardVisual'
import { Flag, Landmark, UserPlus, ScrollText, CheckCircle2, Copy, Check, ArrowRight } from 'lucide-react'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

// Icon badge shared by every action tile below — a consistent ring treatment
// is what makes four different actions read as one designed system instead
// of four separate cards someone bolted on over time.
function TileIcon({ icon: Icon }: { icon: typeof Flag }) {
  return (
    <div className="w-11 h-11 rounded-full border border-gold/40 flex items-center justify-center mb-4 group-hover:border-gold group-hover:bg-gold/5 transition-colors">
      <Icon className="text-gold" size={20} />
    </div>
  )
}

export default function MemberHome() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [showStartPost, setShowStartPost] = useState(false)
  const [showRecruit, setShowRecruit] = useState(false)

  // Join-a-post is a dropdown now instead of one card per post — same
  // action either way (drops a prospect into that post's recruiting
  // pipeline), just a much shorter list on screen.
  const [selectedPostId, setSelectedPostId] = useState('')
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const [joinRequested, setJoinRequested] = useState(false)

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

  async function requestToJoin(e: FormEvent) {
    e.preventDefault()
    if (!selectedPostId) return
    setJoinSubmitting(true)
    await supabase.from('recruits').insert({
      post_id: selectedPostId,
      name: profile?.full_name ?? member?.full_name ?? '',
      email: profile?.email ?? member?.email ?? null,
      phone: member?.phone ?? null,
      stage: 'prospect',
      source: 'Member Portal',
    })
    setJoinSubmitting(false)
    setJoinRequested(true)
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  const homePost = posts.find((p) => p.id === member?.post_id)
  const joinedYear = member?.joined_at ? new Date(member.joined_at).getFullYear() : null

  return (
    <div>
      {/* Branded hero band — the seal watermark and foil divider here echo
          the membership card itself, so the page feels like one designed
          system rather than a card sitting inside a generic app shell. */}
      <div className="relative overflow-hidden rounded-sm border border-hairline bg-gradient-to-br from-surface to-base mb-8">
        <img
          src="/images/cvoa-logo.png"
          alt=""
          aria-hidden
          className="absolute -right-10 -top-10 w-56 h-56 opacity-[0.06] pointer-events-none select-none"
        />
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-ink to-transparent" />
        <div className="relative p-6">
          <div className="eyebrow mb-1">Welcome</div>
          <h1 className="font-display text-3xl tracking-wide mb-3">{profile?.full_name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {homePost && (
              <span className="eyebrow border border-hairline rounded-full px-3 py-1 normal-case tracking-normal text-ink">
                {homePost.name}
              </span>
            )}
            {joinedYear && (
              <span className="eyebrow border border-hairline rounded-full px-3 py-1 normal-case tracking-normal text-ink">
                Serving Since {joinedYear}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The card is the main event on this page — full-size, front and
          center, not a link tucked into a banner. */}
      {member && (
        <div className="mb-4">
          <MembershipCardVisual member={member} role={profile?.role} />
        </div>
      )}
      {member && (
        <p className="text-xs text-muted text-center mb-10">
          This card updates automatically as your membership status changes — nothing to regenerate.
        </p>
      )}

      <div className="eyebrow mb-3">Get Involved</div>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Membership is a starting point, not a finish line. Here's how to actually get involved.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="group panel p-5 hover:border-gold/60 hover:-translate-y-0.5 transition-all">
          <TileIcon icon={Flag} />
          <div className="font-display text-lg mb-1">Start a Post</div>
          <p className="text-xs text-muted mb-4">
            No CVOA post near you? Start one — this goes straight to National's Application Pipeline for review.
          </p>
          <button onClick={() => setShowStartPost(true)} className="btn-gold w-full text-sm flex items-center justify-center gap-1.5">
            Start a Post <ArrowRight size={14} />
          </button>
        </div>

        <div className="group panel p-5 hover:border-gold/60 hover:-translate-y-0.5 transition-all">
          <TileIcon icon={Landmark} />
          <div className="font-display text-lg mb-1">Veterans Congress</div>
          <p className="text-xs text-muted mb-4">
            Members can follow and vote on open resolutions — delegates are chosen by posts to carry a formal
            vote.
          </p>
          <button onClick={() => navigate('/congress')} className="btn-ghost w-full text-sm flex items-center justify-center gap-1.5">
            Open Votes <ArrowRight size={14} />
          </button>
        </div>

        <div className="group panel p-5 hover:border-gold/60 hover:-translate-y-0.5 transition-all">
          <TileIcon icon={ScrollText} />
          <div className="font-display text-lg mb-1">Transparency Portal</div>
          <p className="text-xs text-muted mb-4">
            Passed resolutions, official positions, and legislative tracking — open to every member, always.
          </p>
          <button onClick={() => navigate('/transparency')} className="btn-ghost w-full text-sm flex items-center justify-center gap-1.5">
            View Portal <ArrowRight size={14} />
          </button>
        </div>

        <div className="group panel p-5 hover:border-gold/60 hover:-translate-y-0.5 transition-all">
          <TileIcon icon={UserPlus} />
          <div className="font-display text-lg mb-1">Recruit a Member</div>
          <p className="text-xs text-muted mb-4">
            Know a veteran who should be part of this? Share your post's sign-up link directly.
          </p>
          <button onClick={() => setShowRecruit(true)} className="btn-ghost w-full text-sm flex items-center justify-center gap-1.5">
            Get Recruiting Link <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div id="join-a-post" className="panel p-5 max-w-lg">
        <div className="eyebrow mb-1">Join a Post</div>
        <p className="text-xs text-muted mb-4">
          Pick an active post near you to request joining — a real person there will follow up.
        </p>
        {posts.length === 0 ? (
          <p className="text-sm text-muted">No active posts yet — be the first to start one.</p>
        ) : joinRequested ? (
          <div className="text-sm text-status-active flex items-center gap-1.5">
            <CheckCircle2 size={16} /> Request sent — someone from that post will reach out.
          </div>
        ) : (
          <form onSubmit={requestToJoin} className="flex flex-col sm:flex-row gap-3">
            <select
              required
              className="input-field flex-1"
              value={selectedPostId}
              onChange={(e) => setSelectedPostId(e.target.value)}
            >
              <option value="">Select a post…</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.city ? ` — ${p.city}, ${p.state}` : p.state ? ` — ${p.state}` : ''}
                </option>
              ))}
            </select>
            <button type="submit" disabled={joinSubmitting || !selectedPostId} className="btn-gold text-sm disabled:opacity-50 whitespace-nowrap">
              {joinSubmitting ? 'Sending…' : 'Request to Join'}
            </button>
          </form>
        )}
      </div>

      {showStartPost && (
        <StartPostModal
          defaultName={profile?.full_name ?? ''}
          defaultEmail={profile?.email ?? ''}
          onClose={() => setShowStartPost(false)}
        />
      )}

      {showRecruit && (
        <RecruitLinkModal
          post={posts.find((p) => p.id === member?.post_id) ?? null}
          onClose={() => setShowRecruit(false)}
        />
      )}
    </div>
  )
}

function RecruitLinkModal({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  // National at-large members (no post_id) don't have a single post's
  // sign-up link to share — point them at the general join page instead.
  const link = post ? `${window.location.origin}/join-post/${post.id}` : `${window.location.origin}/join`

  async function copyLink() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal title="Recruiting Link" onClose={onClose}>
      <p className="text-sm text-muted mb-4">
        {post
          ? `Share this link with a veteran you think should join ${post.name}. It drops them straight into that post's recruiting pipeline.`
          : `You're not currently tied to a specific post, so this is the general CVOA sign-up link.`}
      </p>
      <div className="flex items-center gap-2">
        <input readOnly value={link} className="input-field flex-1 text-xs font-mono" onFocus={(e) => e.target.select()} />
        <button onClick={copyLink} className="btn-gold px-3 py-2 shrink-0" aria-label="Copy link">
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </Modal>
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

