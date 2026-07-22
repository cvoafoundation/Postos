import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import type { Member, Post, Profile, UserRole } from '@/lib/types'
import { Search, UserPlus, Loader2, Trash2 } from 'lucide-react'

// supabase-js doesn't surface an Edge Function's own error message by
// default — when a function returns any non-2xx status, `data` comes back
// null and `error.message` is just a generic "non-2xx status code" string.
// The actual { error: "..." } body we wrote is sitting one level deeper, on
// error.context (the raw Response) — this reads it.
async function extractFunctionError(error: any, data: any, fallback: string): Promise<string> {
  if (data?.error) return data.error
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json()
      if (body?.error) return body.error
    } catch {
      // context wasn't JSON — fall through to the generic message below
    }
  }
  return error?.message ?? fallback
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'national_commander', label: 'National Commander' },
  { value: 'national_staff', label: 'National Staff (NCC)' },
  { value: 'state_commander', label: 'State Commander' },
  { value: 'post_commander', label: 'Post Commander' },
  { value: 'post_officer', label: 'Post Officer' },
  { value: 'member', label: 'Member' },
  { value: 'delegate', label: 'Delegate' },
  { value: 'ethics_tribunal', label: 'Ethics Tribunal' },
  { value: 'guest_applicant', label: 'Guest / Unverified' },
]

export default function UserManagement() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [posts, setPosts] = useState<Record<string, string>>({})
  const [allPosts, setAllPosts] = useState<Post[]>([])
  const [membershipByProfile, setMembershipByProfile] = useState<Record<string, Member>>({})
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)

  async function load() {
    setLoading(true)
    const [profilesRes, postsRes, membersRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('posts').select('id, name'),
      // Cross-referencing membership status right on this page means you
      // never have to guess whether someone's info lives in "accounts"
      // world or "membership" world — this pulls both together.
      supabase.from('members').select('*').not('profile_id', 'is', null),
    ])
    setProfiles((profilesRes.data ?? []) as Profile[])
    const map: Record<string, string> = {}
    for (const p of (postsRes.data ?? []) as any[]) map[p.id] = p.name
    setPosts(map)
    setAllPosts((postsRes.data ?? []) as Post[])
    const memberMap: Record<string, Member> = {}
    for (const m of (membersRes.data ?? []) as Member[]) {
      if (m.profile_id) memberMap[m.profile_id] = m
    }
    setMembershipByProfile(memberMap)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function updateRole(profile: Profile, role: UserRole) {
    setSavingId(profile.id)
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, role } : p)))
    await supabase.from('profiles').update({ role }).eq('id', profile.id)
    setSavingId(null)
  }

  async function updatePost(profile: Profile, postId: string) {
    setSavingId(profile.id)
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, post_id: postId || null } : p)))
    await supabase.from('profiles').update({ post_id: postId || null }).eq('id', profile.id)
    setSavingId(null)
  }

  async function updateTitle(profile: Profile, title: string) {
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, title: title || null } : p)))
    await supabase.from('profiles').update({ title: title || null }).eq('id', profile.id)
  }

  async function deleteAccount(profile: Profile) {
    const confirmed = window.confirm(
      `Permanently delete ${profile.full_name}'s account (${profile.email})? This removes their login entirely — they'd need a brand new invite to come back. Any separate membership/dues record is untouched. This cannot be undone.`
    )
    if (!confirmed) return
    setDeletingId(profile.id)
    const { data, error } = await supabase.functions.invoke('delete-user', { body: { user_id: profile.id } })
    setDeletingId(null)
    if (error || data?.error) {
      window.alert(await extractFunctionError(error, data, 'Could not delete this account.'))
      return
    }
    load()
  }

  const filtered = profiles.filter((p) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
  })

  return (
    <div>
      <PageHeader
        eyebrow="National Only"
        title="User Management"
        action={
          <button onClick={() => setShowInvite(true)} className="btn-gold flex items-center gap-2">
            <UserPlus size={16} /> Invite User
          </button>
        }
      />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every login account and what it can access — separate from Membership Roster, which tracks dues/payment
        status. Someone can have one without the other (National staff don't pay dues; some members never
        create an account). This is how you grant National Staff (NCC) access, fix a post assignment, correct a
        role, or fully remove an account.
      </p>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          placeholder="Search by name or email…"
          className="input-field pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="No accounts found" />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Name</th>
                <th className="table-head">Email</th>
                <th className="table-head">Role</th>
                <th className="table-head">Title</th>
                <th className="table-head">Post</th>
                <th className="table-head">Membership</th>
                <th className="table-head"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const membership = membershipByProfile[p.id]
                return (
                  <tr key={p.id}>
                    <td className="table-cell">{p.full_name}</td>
                    <td className="table-cell text-xs text-muted font-mono">{p.email}</td>
                    <td className="table-cell">
                      <select
                        className="input-field text-xs py-1"
                        value={p.role}
                        disabled={savingId === p.id}
                        onChange={(e) => updateRole(p, e.target.value as UserRole)}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="table-cell">
                      <input
                        list="national-titles"
                        className="input-field text-xs py-1 w-40"
                        defaultValue={p.title ?? ''}
                        placeholder="—"
                        onBlur={(e) => e.target.value !== (p.title ?? '') && updateTitle(p, e.target.value)}
                      />
                    </td>
                    <td className="table-cell">
                      <select
                        className="input-field text-xs py-1"
                        value={p.post_id ?? ''}
                        disabled={savingId === p.id}
                        onChange={(e) => updatePost(p, e.target.value)}
                      >
                        <option value="">No post (National-level)</option>
                        {Object.entries(posts).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="table-cell">
                      {membership ? (
                        <button
                          onClick={() => navigate(`/members?highlight=${membership.id}`)}
                          className="text-xs hover:text-gold"
                          title="Open in Membership Roster"
                        >
                          <span className={membership.membership_status === 'active' ? 'text-status-active' : 'text-status-developing'}>
                            {membership.membership_status.replaceAll('_', ' ')}
                          </span>
                          <span className="text-muted"> · {membership.post_id ? posts[membership.post_id] ?? 'a post' : 'Unassigned'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-muted">No membership record</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => deleteAccount(p)}
                        disabled={deletingId === p.id}
                        className="text-muted hover:text-status-attention disabled:opacity-50"
                        title="Delete this account entirely"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <datalist id="national-titles">
        <option value="National Commander" />
        <option value="Vice National Commander" />
        <option value="National Quartermaster" />
        <option value="Adjutant General" />
        <option value="National Sergeant at Arms" />
        <option value="Director of Legislative Affairs" />
      </datalist>

      {showInvite && (
        <InviteUserModal
          posts={allPosts}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function InviteUserModal({ posts, onClose, onInvited }: { posts: Post[]; onClose: () => void; onInvited: () => void }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'national_staff' as UserRole, post_id: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { data, error: invokeError } = await supabase.functions.invoke('invite-user', {
      body: { email: form.email, full_name: form.full_name, role: form.role, post_id: form.post_id || null },
    })
    setSending(false)
    if (invokeError || data?.error) {
      setError(await extractFunctionError(invokeError, data, 'Could not send invite.'))
      return
    }
    onInvited()
  }

  return (
    <Modal title="Invite New User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-muted">
          Sends them a real invite email with a link to set their own password. Their role is active the moment
          they accept — no separate signup step, no gap.
        </p>
        <input required placeholder="Full name" className="input-field" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} />
        <input required type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
        <select className="input-field" value={form.role} onChange={(e) => update('role', e.target.value as UserRole)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="input-field" value={form.post_id} onChange={(e) => update('post_id', e.target.value)}>
          <option value="">No post (National-level)</option>
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button type="submit" disabled={sending} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50">
          {sending ? (
            <>
              <Loader2 className="animate-spin" size={16} /> Sending invite…
            </>
          ) : (
            'Send Invite'
          )}
        </button>
      </form>
    </Modal>
  )
}
