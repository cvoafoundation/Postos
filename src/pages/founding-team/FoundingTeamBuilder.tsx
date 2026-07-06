import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { FoundingTeamMember, Post } from '@/lib/types'
import { Copy, Check, Trash2, FileText } from 'lucide-react'

const REQUIRED_POSITIONS = ['commander', 'vice_commander', 'adjutant', 'quartermaster', 'sergeant_at_arms']

const ALL_POSITIONS: { value: string; label: string }[] = [
  { value: 'commander', label: 'Commander' },
  { value: 'vice_commander', label: 'Vice Commander' },
  { value: 'adjutant', label: 'Adjutant' },
  { value: 'quartermaster', label: 'Quartermaster' },
  { value: 'sergeant_at_arms', label: 'Sergeant-at-Arms' },
  { value: 'member', label: 'Additional Member' },
]

async function openDocument(path: string) {
  const { data, error } = await supabase.storage.from('dd214-uploads').createSignedUrl(path, 600)
  if (!error && data?.signedUrl) {
    window.open(data.signedUrl, '_blank')
  }
}

export default function FoundingTeamBuilder() {
  const { profile, isNational } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [members, setMembers] = useState<FoundingTeamMember[]>([])
  const [copied, setCopied] = useState(false)

  // National roles can manage any post still in formation; post-scoped roles
  // (Post Commander, etc.) are locked to their own post.
  useEffect(() => {
    if (isNational) {
      supabase
        .from('posts')
        .select('*')
        .in('status', ['approved', 'founding_team_building'])
        .then(({ data }: any) => {
          const list = (data ?? []) as Post[]
          setPosts(list)
          if (list.length > 0 && !selectedPostId) setSelectedPostId(list[0].id)
        })
    } else if (profile?.post_id) {
      setSelectedPostId(profile.post_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  async function loadMembers(postId: string) {
    const { data } = await supabase.from('founding_team_members').select('*').eq('post_id', postId)
    setMembers((data ?? []) as FoundingTeamMember[])
  }

  useEffect(() => {
    if (selectedPostId) loadMembers(selectedPostId)
  }, [selectedPostId])

  async function toggleVerification(member: FoundingTeamMember, field: keyof FoundingTeamMember) {
    await supabase
      .from('founding_team_members')
      .update({ [field]: !member[field] })
      .eq('id', member.id)
    // Re-fetch rather than update local state optimistically — verification_status
    // is computed server-side by a trigger based on all three checkboxes, so the
    // only way to reflect it correctly is to read back what the database decided.
    if (selectedPostId) loadMembers(selectedPostId)
  }

  async function changePosition(member: FoundingTeamMember, position: string) {
    await supabase.from('founding_team_members').update({ position }).eq('id', member.id)
    // If they're already verified and their account is active, the database
    // trigger re-syncs their actual role automatically — no extra step here.
    if (selectedPostId) loadMembers(selectedPostId)
  }

  async function removeMember(member: FoundingTeamMember) {
    setMembers((prev) => prev.filter((m) => m.id !== member.id))
    await supabase.from('founding_team_members').delete().eq('id', member.id)
  }

  function copyInviteLink() {
    if (!selectedPostId) return
    const link = `${window.location.origin}/join-founding-team/${selectedPostId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!selectedPostId) {
    return (
      <div>
        <PageHeader eyebrow="Module 3" title="Founding Team Builder" />
        <EmptyState
          title="No post in formation yet"
          hint="A post shows up here once an application is advanced to Founding Team Building from the Application Pipeline."
        />
      </div>
    )
  }

  const selectedPost = posts.find((p) => p.id === selectedPostId)
  const filledPositions = new Set(members.map((m) => m.position))
  const missing = REQUIRED_POSITIONS.filter((p) => !filledPositions.has(p as any))

  return (
    <div>
      <PageHeader
        eyebrow="Module 3"
        title="Founding Team Builder"
        action={
          isNational && posts.length > 1 ? (
            <select
              className="input-field w-64"
              value={selectedPostId}
              onChange={(e) => setSelectedPostId(e.target.value)}
            >
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
          <div className="eyebrow mb-1">Invite Link</div>
          <p className="text-sm text-muted">
            Share this with {selectedPost?.name ?? 'the founding commander'} — anyone who fills it out is added
            here automatically. No staff data entry required.
          </p>
        </div>
        <button onClick={copyInviteLink} className="btn-gold flex items-center gap-2 shrink-0">
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy Invite Link'}
        </button>
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

      <div className="panel overflow-hidden">
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
                  <select
                    className="input-field text-xs py-1"
                    value={m.position}
                    onChange={(e) => changePosition(m, e.target.value)}
                  >
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
                    <button
                      onClick={() => openDocument(m.dd214_storage_path!)}
                      className="flex items-center gap-1 text-gold hover:text-gold-bright text-xs"
                    >
                      <FileText size={13} /> View
                    </button>
                  ) : (
                    <span className="text-[11px] text-status-attention">None uploaded</span>
                  )}
                </td>
                <td className="table-cell">
                  <input
                    type="checkbox"
                    checked={m.dd214_reviewed}
                    onChange={() => toggleVerification(m, 'dd214_reviewed')}
                  />
                </td>
                <td className="table-cell">
                  <input
                    type="checkbox"
                    checked={m.combat_service_verified}
                    onChange={() => toggleVerification(m, 'combat_service_verified')}
                  />
                </td>
                <td className="table-cell">
                  <input
                    type="checkbox"
                    checked={m.membership_approved}
                    onChange={() => toggleVerification(m, 'membership_approved')}
                  />
                </td>
                <td className="table-cell">
                  <StatusBadge
                    label={m.verification_status}
                    tone={
                      m.verification_status === 'verified'
                        ? 'active'
                        : m.verification_status === 'rejected'
                        ? 'attention'
                        : 'developing'
                    }
                  />
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
          <EmptyState
            title="No founding team members yet"
            hint="Share the invite link above to start populating this list."
          />
        )}
      </div>
    </div>
  )
}
