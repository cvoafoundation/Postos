import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/lib/types'
import { Search } from 'lucide-react'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'national_commander', label: 'National Commander' },
  { value: 'national_staff', label: 'National Staff (NCC)' },
  { value: 'state_commander', label: 'State Commander' },
  { value: 'post_commander', label: 'Post Commander' },
  { value: 'post_officer', label: 'Post Officer' },
  { value: 'member', label: 'Member' },
  { value: 'delegate', label: 'Delegate' },
  { value: 'guest_applicant', label: 'Guest / Unverified' },
]

export default function UserManagement() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [posts, setPosts] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [profilesRes, postsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('posts').select('id, name'),
    ])
    setProfiles((profilesRes.data ?? []) as Profile[])
    const map: Record<string, string> = {}
    for (const p of (postsRes.data ?? []) as any[]) map[p.id] = p.name
    setPosts(map)
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

  const filtered = profiles.filter((p) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
  })

  return (
    <div>
      <PageHeader eyebrow="National Only" title="User Management" />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every account and what it can access. This is how you grant someone National Staff (NCC) access, fix a
        post assignment, or correct a role — the only other way any of this happens is direct database access.
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
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Name</th>
                <th className="table-head">Email</th>
                <th className="table-head">Role</th>
                <th className="table-head">Post</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
