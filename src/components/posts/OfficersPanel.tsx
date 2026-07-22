import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import type { FoundingTeamMember } from '@/lib/types'
import { Copy, Check, Trash2, FileText, Plus, Upload, Loader2 } from 'lucide-react'
import { formatDistanceToNow, differenceInDays } from 'date-fns'

function isStaleVerification(verifiedAt: string): boolean {
  return differenceInDays(new Date(), new Date(verifiedAt)) > 365
}

const REQUIRED_POSITIONS = ['commander', 'vice_commander', 'adjutant', 'quartermaster', 'sergeant_at_arms']

const ALL_POSITIONS: { value: string; label: string }[] = [
  { value: 'commander', label: 'Post Commander' },
  { value: 'vice_commander', label: 'Post Vice Commander' },
  { value: 'quartermaster', label: 'Post Quartermaster' },
  { value: 'adjutant', label: 'Post Adjutant' },
  { value: 'post_delegate', label: 'Post Delegate' },
  { value: 'chaplain', label: 'Post Chaplain' },
  { value: 'sergeant_at_arms', label: 'Sergeant at Arms' },
  { value: 'associate_member', label: 'Associate Member (no voting rights)' },
  { value: 'member', label: 'Additional Member' },
]

async function openDocument(path: string) {
  const { data, error } = await supabase.storage.from('dd214-uploads').createSignedUrl(path, 600)
  if (!error && data?.signedUrl) {
    window.open(data.signedUrl, '_blank')
  }
}

// This is what used to be two separate pages — the founding team builder
// (full editing) and Post Officers (a read-only filtered view of the exact
// same table). One post's leadership roster is one thing, not two.
export function OfficersPanel({ postId, postName }: { postId: string; postName: string }) {
  const [members, setMembers] = useState<FoundingTeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  async function loadMembers() {
    setLoading(true)
    const { data } = await supabase.from('founding_team_members').select('*').eq('post_id', postId)
    setMembers((data ?? []) as FoundingTeamMember[])
    setLoading(false)
  }

  useEffect(() => {
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  async function toggleVerification(member: FoundingTeamMember, field: keyof FoundingTeamMember) {
    await supabase
      .from('founding_team_members')
      .update({ [field]: !member[field] })
      .eq('id', member.id)
    // Re-fetch rather than update local state optimistically — verification_status
    // is computed server-side by a trigger based on all three checkboxes, so the
    // only way to reflect it correctly is to read back what the database decided.
    loadMembers()
  }

  async function changePosition(member: FoundingTeamMember, position: string) {
    await supabase.from('founding_team_members').update({ position }).eq('id', member.id)
    loadMembers()
  }

  async function removeMember(member: FoundingTeamMember) {
    setMembers((prev) => prev.filter((m) => m.id !== member.id))
    await supabase.from('founding_team_members').delete().eq('id', member.id)
  }

  function copyInviteLink() {
    const link = `${window.location.origin}/join-founding-team/${postId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filledPositions = new Set(members.map((m) => m.position))
  const missing = REQUIRED_POSITIONS.filter((p) => !filledPositions.has(p as any))

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <div className="panel p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Invite Link</div>
          <p className="text-sm text-muted">
            Share this with {postName} — anyone who fills it out is added here automatically. No staff data entry
            required.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowAdd(true)} className="btn-ghost flex items-center gap-2">
            <Plus size={16} /> Add Manually
          </button>
          <button onClick={copyInviteLink} className="btn-gold flex items-center gap-2">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Invite Link'}
          </button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="panel p-4 mb-6 border-status-developing/50">
          <div className="eyebrow mb-1">Open Required Positions</div>
          <div className="flex gap-2 flex-wrap">
            {missing.map((p) => (
              <StatusBadge key={p} label={p.replaceAll('_', ' ')} tone="developing" />
            ))}
          </div>
        </div>
      )}

      {members.some((m) => m.proposed_site_location || m.funding_commitment) && (
        <div className="panel p-4 mb-6">
          <div className="eyebrow mb-3">Site &amp; Funding Notes from the Team</div>
          <div className="space-y-3">
            {members
              .filter((m) => m.proposed_site_location || m.funding_commitment)
              .map((m) => (
                <div key={m.id} className="border-l-2 border-gold/40 pl-3">
                  <div className="text-sm font-medium text-ink">{m.name}</div>
                  {m.proposed_site_location && (
                    <div className="text-xs text-muted mt-0.5">
                      <span className="text-gold">Site: </span>
                      {m.proposed_site_location}
                    </div>
                  )}
                  {m.funding_commitment && (
                    <div className="text-xs text-muted mt-0.5">
                      <span className="text-gold">Funding: </span>
                      {m.funding_commitment}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="panel overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Name</th>
              <th className="table-head">Position</th>
              <th className="table-head">Account</th>
              <th className="table-head">Document</th>
              <th className="table-head">DD214</th>
              <th className="table-head">Combat Verified</th>
              <th className="table-head">Membership</th>
              <th className="table-head">Status</th>
              <th className="table-head"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="table-cell">
                  <div>{m.name}</div>
                  {m.email && <div className="text-[11px] text-muted font-mono">{m.email}</div>}
                </td>
                <td className="table-cell">
                  <select className="input-field text-xs py-1" value={m.position} onChange={(e) => changePosition(m, e.target.value)}>
                    {ALL_POSITIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="table-cell">
                  {m.profile_id ? (
                    <span className="text-[11px] text-status-active font-mono">
                      {m.verification_status === 'verified' ? 'Active' : 'Pending your verification'}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted">No account created</span>
                  )}
                </td>
                <td className="table-cell">
                  {m.dd214_storage_path ? (
                    <button onClick={() => openDocument(m.dd214_storage_path!)} className="flex items-center gap-1 text-gold hover:text-gold-bright text-xs">
                      <FileText size={13} /> View
                    </button>
                  ) : (
                    <span className="text-[11px] text-status-attention">None uploaded</span>
                  )}
                </td>
                <td className="table-cell">
                  <input type="checkbox" checked={m.dd214_reviewed} onChange={() => toggleVerification(m, 'dd214_reviewed')} />
                </td>
                <td className="table-cell">
                  <input type="checkbox" checked={m.combat_service_verified} onChange={() => toggleVerification(m, 'combat_service_verified')} />
                </td>
                <td className="table-cell">
                  <input type="checkbox" checked={m.membership_approved} onChange={() => toggleVerification(m, 'membership_approved')} />
                </td>
                <td className="table-cell">
                  <StatusBadge
                    label={m.verification_status}
                    tone={m.verification_status === 'verified' ? 'active' : m.verification_status === 'rejected' ? 'attention' : 'developing'}
                  />
                  {m.verification_status === 'verified' && m.verified_at && isStaleVerification(m.verified_at) && (
                    <div className="text-[10px] text-status-attention font-mono mt-1">
                      Verified {formatDistanceToNow(new Date(m.verified_at))} ago — may need re-check
                    </div>
                  )}
                </td>
                <td className="table-cell">
                  <button onClick={() => removeMember(m)} className="text-muted hover:text-status-attention">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && (
          <EmptyState title="No officers yet" hint="Share the invite link above, or add someone directly if they've already been in touch." />
        )}
      </div>

      {showAdd && (
        <AddOfficerModal
          postId={postId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            loadMembers()
          }}
        />
      )}
    </div>
  )
}

function AddOfficerModal({ postId, onClose, onAdded }: { postId: string; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', position: 'member', combat_status: 'Non-combat veteran' })
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docPath, setDocPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = `founding-team/${crypto.randomUUID()}-${file.name}`
    const { data, error } = await supabase.storage.from('dd214-uploads').upload(path, file)
    setUploading(false)
    if (error) {
      setError(error.message)
      return
    }
    setDocFile(file)
    setDocPath(data?.path ?? path)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('founding_team_members').insert({
      post_id: postId,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      position: form.position,
      combat_status: form.combat_status,
      dd214_storage_path: docPath,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onAdded()
  }

  return (
    <Modal title="Add Officer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input required placeholder="Full name" className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
          <input placeholder="Phone" className="input-field" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>
        <select className="input-field" value={form.position} onChange={(e) => update('position', e.target.value)}>
          {ALL_POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="input-field" value={form.combat_status} onChange={(e) => update('combat_status', e.target.value)}>
          <option>Non-combat veteran</option>
          <option>Combat veteran</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <Upload size={14} />
          {uploading ? <Loader2 size={14} className="animate-spin" /> : docFile ? docFile.name : 'Attach DD214 (optional, can add later)'}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Officer'}
        </button>
      </form>
    </Modal>
  )
}
