import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { getFunctionError } from '@/lib/functionErrors'
import { readAllRows } from '@/lib/readAllRows'
import { ListPagination, LIST_PAGE_SIZE } from '@/components/ui/ListPagination'
import type { Member, Post, Profile, UserRole } from '@/lib/types'
import { Search, UserPlus, Loader2, Trash2 } from 'lucide-react'

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
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [accounts, postRows, memberships] = await Promise.all([
        readAllRows<Profile>(() => supabase.from('profiles').select('*').order('id')),
        readAllRows<Post>(() => supabase.from('posts').select('id, name').order('id')),
        readAllRows<Member>(() => supabase.from('members').select('id, profile_id, post_id, membership_status').not('profile_id', 'is', null).order('id')),
      ])
      setPage(0)
      setProfiles(accounts.sort((a, b) => a.full_name.localeCompare(b.full_name)))
      setPosts(Object.fromEntries(postRows.map((p) => [p.id, p.name])))
      setAllPosts(postRows)
      setMembershipByProfile(Object.fromEntries(memberships.filter((m) => m.profile_id).map((m) => [m.profile_id!, m])))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load accounts. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function updateAccount(profile: Profile, changes: Partial<Profile>) {
    setSavingId(profile.id)
    setError(null)
    try {
      const { error, data } = await supabase.from('profiles').update(changes).eq('id', profile.id).select().single()
      if (error || !data) throw new Error(error?.message ?? 'The account could not be updated.')
      setProfiles((prev) => prev.map((p) => p.id === profile.id ? { ...p, ...changes } : p))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this account.')
    } finally {
      setSavingId(null)
    }
  }

  async function deleteAccount(profile: Profile) {
    const confirmed = window.confirm(
      `Permanently delete ${profile.full_name}'s account (${profile.email})? This removes their login entirely — they'd need a brand new invite to come back. Any separate membership/dues record is untouched. This cannot be undone.`
    )
    if (!confirmed) return
    setDeletingId(profile.id)
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', { body: { user_id: profile.id } })
      if (error || data?.error) { setError(await getFunctionError(error, data)); return }
      await load()
    } catch (error) {
      setError(await getFunctionError(error))
    } finally {
      setDeletingId(null)
    }
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
        title="Accounts & Access"
        action={
          <button onClick={() => setShowInvite(true)} className="btn-gold flex items-center gap-2">
            <UserPlus size={16} /> Invite Account
          </button>
        }
      />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Manage login accounts, roles, and post assignments here. Membership Roster tracks membership
        status, dues, and renewals. An account can exist without a membership record; a membership record
        can exist before its owner creates a login.
      </p>

      <button onClick={() => navigate('/members')} className="text-sm text-gold hover:underline mb-4">Open Membership Roster →</button>
      {error && <div role="alert" className="panel p-3 mb-4 text-sm text-status-attention">{error} <button onClick={load} className="underline">Reload</button></div>}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          placeholder="Search by name or email…"
          className="input-field pl-9"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0) }}
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
                <th className="table-head">Account Post</th>
                <th className="table-head">Membership</th>
                <th className="table-head"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE).map((p) => {
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
                        onChange={(e) => updateAccount(p, { role: e.target.value as UserRole })}
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
                        key={`${p.id}-${p.title ?? ''}-${savingId === p.id}`}
                        disabled={savingId === p.id}
                        defaultValue={p.title ?? ''}
                        placeholder="—"
                        onBlur={(e) => e.target.value !== (p.title ?? '') && updateAccount(p, { title: e.target.value || null })}
                      />
                    </td>
                    <td className="table-cell">
                      <select
                        className="input-field text-xs py-1"
                        value={p.post_id ?? ''}
                        disabled={savingId === p.id}
                        onChange={(e) => updateAccount(p, { post_id: e.target.value || null })}
                      >
                        <option value="">No assigned post</option>
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

      <ListPagination page={Math.min(page, Math.max(0, Math.ceil(filtered.length / LIST_PAGE_SIZE) - 1))} total={filtered.length} onPageChange={setPage} />

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
    if (sending) return
    setSending(true)
    setError(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('invite-user', {
        body: { email: form.email, full_name: form.full_name, role: form.role, post_id: form.post_id || null },
      })
      if (invokeError || data?.error) { setError(await getFunctionError(invokeError, data)); return }
      onInvited()
    } catch (error) {
      setError(await getFunctionError(error))
    } finally {
      setSending(false)
    }
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
          <option value="">No assigned post</option>
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
