import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { POST_STATUS_LABELS, POST_STATUS_ORDER, type Post } from '@/lib/types'
import { Trash2, ArrowRight } from 'lucide-react'

export default function PostsManagement() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
    setPosts((data ?? []) as Post[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function advance(post: Post) {
    const currentIndex = POST_STATUS_ORDER.indexOf(post.status)
    const next = POST_STATUS_ORDER[currentIndex + 1]
    if (!next) return
    setBusyId(post.id)
    await supabase.from('posts').update({ status: next }).eq('id', post.id)
    setBusyId(null)
    load()
  }

  async function deletePost(post: Post) {
    const confirmed = window.confirm(
      `Permanently delete "${post.name}"? This removes it and everything tied to it — members, sponsors, meetings, finances, everything. This cannot be undone.`
    )
    if (!confirmed) return
    setBusyId(post.id)
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    setBusyId(null)
    if (error) {
      window.alert(`Couldn't delete: ${error.message}`)
      return
    }
    load()
  }

  return (
    <div>
      <PageHeader eyebrow="National Only" title="Posts Management" />
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every post, at any stage — advance a post's status or delete one entirely from here. This is the one
        place to manage a post's lifecycle regardless of whether it's still forming or already active.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet" />
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Name</th>
                <th className="table-head">State</th>
                <th className="table-head">Status</th>
                <th className="table-head">Charter Date</th>
                <th className="table-head"></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => {
                const currentIndex = POST_STATUS_ORDER.indexOf(post.status)
                const next = POST_STATUS_ORDER[currentIndex + 1]
                return (
                  <tr key={post.id}>
                    <td className="table-cell">
                      <button
                        onClick={() => navigate(post.status === 'active_post' ? `/health/${post.id}` : '/checklist')}
                        className="hover:text-gold"
                      >
                        {post.name}
                      </button>
                    </td>
                    <td className="table-cell font-mono">{post.state}</td>
                    <td className="table-cell">
                      <StatusBadge label={POST_STATUS_LABELS[post.status]} tone={post.status === 'active_post' ? 'active' : 'developing'} />
                    </td>
                    <td className="table-cell text-muted">{post.charter_date ?? '—'}</td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-3">
                        {next && (
                          <button
                            onClick={() => advance(post)}
                            disabled={busyId === post.id}
                            className="text-xs text-gold hover:text-gold-bright flex items-center gap-1 disabled:opacity-50"
                          >
                            {POST_STATUS_LABELS[next]} <ArrowRight size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => deletePost(post)}
                          disabled={busyId === post.id}
                          className="text-muted hover:text-status-attention disabled:opacity-50"
                          title="Delete post"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
