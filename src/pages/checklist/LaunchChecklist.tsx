import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import { PostChecklistView } from '@/components/checklist/PostChecklistView'
import { Copy, Check } from 'lucide-react'

export default function LaunchChecklist() {
  const { profile, isNational } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isNational) {
      supabase
        .from('posts')
        .select('*')
        .neq('status', 'active_post')
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

  function copyShareLink() {
    if (!selectedPostId) return
    const link = `${window.location.origin}/post-checklist/${selectedPostId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
