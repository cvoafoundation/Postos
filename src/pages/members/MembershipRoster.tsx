import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import Papa from 'papaparse'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Member, MembershipType, Post } from '@/lib/types'
import { Plus, Upload, Copy, Check, Search } from 'lucide-react'
import { format } from 'date-fns'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

function statusTone(status: Member['membership_status']) {
  if (status === 'active') return 'active' as const
  if (status === 'lapsed') return 'attention' as const
  return 'developing' as const
}

export default function MembershipRoster() {
  const { profile, isNational } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [copied, setCopied] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isNational) {
      supabase.from('posts').select('*').then(({ data }: any) => {
        const list = (data ?? []) as Post[]
        setPosts(list)
        if (list.length > 0 && !selectedPostId) setSelectedPostId(list[0].id)
      })
    } else if (profile?.post_id) {
      setSelectedPostId(profile.post_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  async function loadMembers() {
    if (!selectedPostId) return
    const { data } = await supabase.from('members').select('*').eq('post_id', selectedPostId).order('membership_number')
    setMembers((data ?? []) as Member[])
  }

  useEffect(() => {
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPostId])

  function copyJoinLink() {
    if (!selectedPostId) return
    const link = `${window.location.origin}/join-membership/${selectedPostId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCsvImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedPostId) return
    setImporting(true)
    setImportSummary(null)

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: async (results) => {
        // Matches the sheet layout: [active flag], Name, Email, Phone,
        // Membership #, Address, Branch — the leading flag column is
        // ignored; everything else maps directly.
        const rows = results.data as string[][]
        let imported = 0
        for (const row of rows) {
          const [, name, email, phone, membershipNumber, address, branch] = row
          if (!name || !name.trim()) continue
          await supabase.from('members').insert({
            post_id: selectedPostId,
            full_name: name.trim(),
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            membership_number: membershipNumber?.trim() || null, // preserved as-is if present
            address: address?.trim() || null,
            military_branch: branch?.trim() || null,
            membership_type: 'annual',
            membership_status: 'active',
          })
          imported++
        }
        setImporting(false)
        setImportSummary(`Imported ${imported} member${imported !== 1 ? 's' : ''}.`)
        loadMembers()
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
    })
  }

  const filtered = members.filter((m) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.membership_number?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q)
    )
  })

  const selectedPost = posts.find((p) => p.id === selectedPostId)

  if (!selectedPostId) {
    return (
      <div>
        <PageHeader eyebrow="Membership" title="Membership Roster" />
        <EmptyState title="No post to show a roster for" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Membership"
        title="Membership Roster"
        action={
          isNational && posts.length > 1 ? (
            <select className="input-field w-64" value={selectedPostId} onChange={(e) => setSelectedPostId(e.target.value)}>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <div className="panel p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Join / Renew Link</div>
          <p className="text-sm text-muted">
            Share this with prospective and renewing members — Annual ($49.99) or Lifetime ($499.99), paid
            directly by card. Their membership activates automatically the moment payment clears.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <label className="btn-ghost flex items-center gap-2 cursor-pointer">
            <Upload size={16} /> {importing ? 'Importing…' : 'Import CSV'}
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} disabled={importing} />
          </label>
          <button onClick={() => setShowAdd(true)} className="btn-ghost flex items-center gap-2">
            <Plus size={16} /> Add Member
          </button>
          <button onClick={copyJoinLink} className="btn-gold flex items-center gap-2">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>

      {importSummary && (
        <div className="panel p-3 mb-4 text-sm text-status-active">{importSummary}</div>
      )}

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          placeholder="Search by name, email, or membership number…"
          className="input-field pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Member #</th>
              <th className="table-head">Name</th>
              <th className="table-head">Contact</th>
              <th className="table-head">Address</th>
              <th className="table-head">Branch</th>
              <th className="table-head">Type</th>
              <th className="table-head">Status</th>
              <th className="table-head">Expires</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} onClick={() => setEditing(m)} className="cursor-pointer hover:bg-surface/60">
                <td className="table-cell font-mono text-xs text-gold">{m.membership_number ?? '—'}</td>
                <td className="table-cell">{m.full_name}</td>
                <td className="table-cell text-xs text-muted">
                  <div>{m.email}</div>
                  <div>{m.phone}</div>
                </td>
                <td className="table-cell text-xs text-muted">{m.address}</td>
                <td className="table-cell text-muted">{m.military_branch}</td>
                <td className="table-cell capitalize">{m.membership_type}</td>
                <td className="table-cell">
                  <StatusBadge label={m.membership_status.replaceAll('_', ' ')} tone={statusTone(m.membership_status)} />
                </td>
                <td className="table-cell text-muted text-xs">
                  {m.membership_type === 'lifetime' ? 'Never' : m.expires_at ? format(new Date(m.expires_at), 'MMM d, yyyy') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <EmptyState
            title="No members yet"
            hint="Import your existing roster via CSV, add members manually, or share the join link above."
          />
        )}
      </div>

      {showAdd && (
        <AddMemberModal
          postId={selectedPostId}
          postName={selectedPost?.name}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            loadMembers()
          }}
        />
      )}

      {editing && (
        <EditMemberModal
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadMembers()
          }}
        />
      )}
    </div>
  )
}

function AddMemberModal({
  postId,
  postName,
  onClose,
  onAdded,
}: {
  postId: string
  postName?: string
  onClose: () => void
  onAdded: () => void
}) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    state: '',
    military_branch: '',
    membership_type: 'annual' as MembershipType,
    mark_paid: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('members').insert({
      post_id: postId,
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      state: form.state || null,
      military_branch: form.military_branch || null,
      membership_type: form.membership_type,
      membership_status: form.mark_paid ? 'active' : 'pending_payment',
      joined_at: form.mark_paid ? new Date().toISOString().slice(0, 10) : null,
      expires_at: form.mark_paid && form.membership_type === 'annual'
        ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
        : null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onAdded()
  }

  return (
    <Modal title={`Add Member${postName ? ` — ${postName}` : ''}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input required placeholder="Full name" className="input-field" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
          <input placeholder="Phone" className="input-field" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>
        <input placeholder="Address" className="input-field" value={form.address} onChange={(e) => update('address', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <select className="input-field" value={form.state} onChange={(e) => update('state', e.target.value)}>
            <option value="">State (for membership #)</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input placeholder="Branch" className="input-field" value={form.military_branch} onChange={(e) => update('military_branch', e.target.value)} />
        </div>
        <select className="input-field" value={form.membership_type} onChange={(e) => update('membership_type', e.target.value as MembershipType)}>
          <option value="annual">Annual ($49.99)</option>
          <option value="lifetime">Lifetime ($499.99)</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={form.mark_paid} onChange={(e) => update('mark_paid', e.target.checked)} />
          Mark as paid now (e.g. cash or check received in person)
        </label>

        {error && <p className="text-status-attention text-sm">{error}</p>}

        <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Member'}
        </button>
      </form>
    </Modal>
  )
}

function EditMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: Member
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    full_name: member.full_name,
    email: member.email ?? '',
    phone: member.phone ?? '',
    address: member.address ?? '',
    state: member.state ?? '',
    military_branch: member.military_branch ?? '',
    membership_type: member.membership_type,
    membership_status: member.membership_status,
    expires_at: member.expires_at ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('members')
      .update({
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        state: form.state || null,
        military_branch: form.military_branch || null,
        membership_type: form.membership_type,
        membership_status: form.membership_status,
        expires_at: form.membership_type === 'lifetime' ? null : form.expires_at || null,
      })
      .eq('id', member.id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
  }

  function renewOneYear() {
    const base = form.expires_at && new Date(form.expires_at) > new Date() ? new Date(form.expires_at) : new Date()
    base.setFullYear(base.getFullYear() + 1)
    update('expires_at', base.toISOString().slice(0, 10))
    update('membership_status', 'active')
  }

  return (
    <Modal title={`Edit ${member.full_name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="font-mono text-xs text-gold">{member.membership_number ?? 'No number assigned'}</div>
        <input placeholder="Full name" className="input-field" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
          <input placeholder="Phone" className="input-field" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>
        <input placeholder="Address" className="input-field" value={form.address} onChange={(e) => update('address', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <select className="input-field" value={form.state} onChange={(e) => update('state', e.target.value)}>
            <option value="">State</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input placeholder="Branch" className="input-field" value={form.military_branch} onChange={(e) => update('military_branch', e.target.value)} />
        </div>

        <div className="border-t border-hairline pt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="eyebrow block mb-1.5">Membership Type</label>
            <select className="input-field" value={form.membership_type} onChange={(e) => update('membership_type', e.target.value as MembershipType)}>
              <option value="annual">Annual</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </div>
          <div>
            <label className="eyebrow block mb-1.5">Status</label>
            <select className="input-field" value={form.membership_status} onChange={(e) => update('membership_status', e.target.value as Member['membership_status'])}>
              <option value="active">Active</option>
              <option value="lapsed">Lapsed</option>
              <option value="pending_payment">Pending Payment</option>
            </select>
          </div>
        </div>

        {form.membership_type === 'annual' && (
          <div>
            <label className="eyebrow block mb-1.5">Expires</label>
            <div className="flex gap-2">
              <input type="date" className="input-field" value={form.expires_at} onChange={(e) => update('expires_at', e.target.value)} />
              <button type="button" onClick={renewOneYear} className="btn-ghost text-xs px-3 shrink-0 whitespace-nowrap">
                Renew +1 Year
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-status-attention text-sm">{error}</p>}

        <button onClick={handleSave} disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  )
}
