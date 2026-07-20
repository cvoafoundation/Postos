import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Member, Post } from '@/lib/types'
import { CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'

interface RoleApplication {
  id: string
  member_id: string
  post_id: string
  requested_role: 'post_officer' | 'post_commander'
  status: 'pending' | 'verified' | 'rejected'
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  post_officer: 'Post Officer',
  post_commander: 'Post Commander',
}

export default function RoleApplications() {
  const { profile, isNational } = useAuth()
  const [apps, setApps] = useState<RoleApplication[]>([])
  const [membersById, setMembersById] = useState<Record<string, Member>>({})
  const [postsById, setPostsById] = useState<Record<string, Post>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    let query = supabase.from('post_role_applications').select('*').eq('status', 'pending').order('created_at')
    if (!isNational) {
      // A post commander only ever sees Officer requests for their own
      // post — Commander requests are National's call, never theirs.
      query = query.eq('post_id', profile?.post_id ?? '').eq('requested_role', 'post_officer')
    }
    const { data } = await query
    const list = (data ?? []) as RoleApplication[]
    setApps(list)

    const memberIds = [...new Set(list.map((a) => a.member_id))]
    const postIds = [...new Set(list.map((a) => a.post_id))]
    const [membersRes, postsRes] = await Promise.all([
      memberIds.length ? supabase.from('members').select('*').in('id', memberIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('posts').select('*').in('id', postIds) : Promise.resolve({ data: [] }),
    ])
    const mMap: Record<string, Member> = {}
    for (const m of (membersRes.data ?? []) as Member[]) mMap[m.id] = m
    setMembersById(mMap)
    const pMap: Record<string, Post> = {}
    for (const p of (postsRes.data ?? []) as Post[]) pMap[p.id] = p
    setPostsById(pMap)

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  async function approve(app: RoleApplication) {
    setBusyId(app.id)
    const { error } = await supabase.rpc('approve_post_role_application', { p_application_id: app.id })
    setBusyId(null)
    if (error) {
      window.alert(`Couldn't approve: ${error.message}`)
      return
    }
    load()
  }

  async function reject(app: RoleApplication) {
    setBusyId(app.id)
    await supabase.from('post_role_applications').update({ status: 'rejected' }).eq('id', app.id)
    setBusyId(null)
    load()
  }

  return (
    <div>
      <PageHeader eyebrow={isNational ? 'National Only' : 'Your Post'} title="Role Applications" />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        {isNational
          ? 'Every pending Post Commander request across the organization, plus any Officer request nobody at that post has acted on yet.'
          : "Officer applications for your post — approving here grants that person real Post Officer access immediately."}
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : apps.length === 0 ? (
        <EmptyState title="Nothing pending" />
      ) : (
        <div className="space-y-3">
          {apps.map((app) => {
            const member = membersById[app.member_id]
            const post = postsById[app.post_id]
            return (
              <div key={app.id} className="panel p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{member?.full_name ?? 'Unknown applicant'}</div>
                  <div className="text-xs text-muted mt-0.5">
                    Applying as <span className="text-gold">{ROLE_LABELS[app.requested_role]}</span> at {post?.name ?? 'this post'}
                  </div>
                  <div className="text-[11px] text-muted font-mono mt-1">{format(new Date(app.created_at), 'MMM d, yyyy')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => approve(app)} disabled={busyId === app.id} className="text-status-active hover:opacity-80 disabled:opacity-40" title="Approve">
                    <CheckCircle2 size={20} />
                  </button>
                  <button onClick={() => reject(app)} disabled={busyId === app.id} className="text-status-attention hover:opacity-80 disabled:opacity-40" title="Reject">
                    <XCircle size={20} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
