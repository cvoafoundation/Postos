import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { POST_STATUS_LABELS, POST_STATUS_ORDER, type Post, type PostStatus } from '@/lib/types'
import { PostChecklistView } from '@/components/checklist/PostChecklistView'
import { Copy, Check, ArrowRight } from 'lucide-react'

export default function LaunchChecklist() {
  const { profile, isNational } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [checklistPct, setChecklistPct] = useState<number | null>(null)
  const [advancing, setAdvancing] = useState(false)

  async function loadPosts() {
    if (isNational) {
      const { data } = await supabase.from('posts').select('*').neq('status', 'active_post')
      const list = (data ?? []) as Post[]
      setPosts(list)
      if (list.length > 0 && !selectedPostId) setSelectedPostId(list[0].id)
    } else if (profile?.post_id) {
      setSelectedPostId(profile.post_id)
    }
  }

  useEffect(() => {
    loadPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  useEffect(() => {
    if (!selectedPostId) return
    supabase
      .from('checklist_items')
      .select('is_complete')
      .eq('post_id', selectedPostId)
      .then(({ data }: any) => {
        const items = data ?? []
        setChecklistPct(items.length > 0 ? Math.round((items.filter((i: any) => i.is_complete).length / items.length) * 100) : null)
      })
  }, [selectedPostId])

  function copyShareLink() {
    if (!selectedPostId) return
    const link = `${window.location.origin}/post-checklist/${selectedPostId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function advanceStatus(next: PostStatus) {
    if (!selectedPostId) return
    setAdvancing(true)
    await supabase.from('posts').update({ status: next }).eq('id', selectedPostId)
    setAdvancing(false)
    if (next === 'active_post') {
      // this post moves off this page's list once active — reset selection
      setSelectedPostId(null)
    }
    loadPosts()
  }

  const selectedPost = posts.find((p) => p.id === selectedPostId)

  if (!selectedPostId) {
    return (
      <div>
        <PageHeader eyebrow="Module 4" title="Post Launch Checklist" />
        <EmptyState
          title="No post in formation yet"
          hint="A post shows up here once an application is advanced to Founding Team Building from the Application Pipeline."
        />
      </div>
    )
  }

  const currentIndex = selectedPost ? POST_STATUS_ORDER.indexOf(selectedPost.status) : -1
  const nextStatus = currentIndex >= 0 ? POST_STATUS_ORDER[currentIndex + 1] : undefined

  return (
    <div>
      <PageHeader
        eyebrow="Module 4"
        title="Post Launch Checklist"
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

      {isNational && selectedPost && (
        <div className="panel p-4 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="eyebrow mb-1">Post Status</div>
              <StatusBadge label={POST_STATUS_LABELS[selectedPost.status]} tone="developing" />
            </div>
            {checklistPct !== null && (
              <div className="text-xs text-muted font-mono ml-4">
                Checklist {checklistPct}% complete
                {checklistPct < 100 && ' — you can still advance the post manually if that\'s the right call'}
              </div>
            )}
          </div>
          {nextStatus && (
            <button onClick={() => advanceStatus(nextStatus)} disabled={advancing} className="btn-gold flex items-center gap-2 shrink-0 disabled:opacity-50">
              {advancing ? 'Advancing…' : `Advance to ${POST_STATUS_LABELS[nextStatus]}`} <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      <div className="panel p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Shareable Link</div>
          <p className="text-sm text-muted">
            Share this with {selectedPost?.name ?? 'the founding team'} — they can view and check off items
            themselves, no login required. You'll both always be looking at the same live checklist.
          </p>
        </div>
        <button onClick={copyShareLink} className="btn-gold flex items-center gap-2 shrink-0">
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>

      <PostChecklistView postId={selectedPostId} />
    </div>
  )
}
