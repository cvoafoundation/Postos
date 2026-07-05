import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PostChecklistView } from '@/components/checklist/PostChecklistView'

export default function PublicChecklist() {
  const { postId } = useParams<{ postId: string }>()
  const [postName, setPostName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!postId) return
    supabase
      .from('posts')
      .select('name')
      .eq('id', postId)
      .single()
      .then(({ data, error }: any) => {
        if (error || !data) {
          setNotFound(true)
        } else {
          setPostName(data.name)
        }
        setLoading(false)
      })
  }, [postId])

  return (
    <div className="min-h-screen bg-base px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="font-display text-3xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-1">Post Launch Checklist</div>
        </div>

        {loading ? (
          <p className="text-sm text-muted text-center">Loading…</p>
        ) : notFound ? (
          <p className="text-sm text-status-attention text-center">
            This link isn't valid. Double-check it with whoever sent it to you.
          </p>
        ) : (
          <>
            <h1 className="font-display text-3xl tracking-wide text-ink text-center mb-8">{postName}</h1>
            {postId && <PostChecklistView postId={postId} />}
          </>
        )}
      </div>
    </div>
  )
}
