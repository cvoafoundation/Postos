import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { MeetingRecord } from '@/lib/types'
import { ArrowRight } from 'lucide-react'
import { format } from 'date-fns'

export function MeetingsPanel({ postId }: { postId: string }) {
  const navigate = useNavigate()
  const [records, setRecords] = useState<MeetingRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('meeting_records')
      .select('*')
      .eq('post_id', postId)
      .order('meeting_date', { ascending: false })
      .then(({ data }) => {
        setRecords((data ?? []) as MeetingRecord[])
        setLoading(false)
      })
  }, [postId])

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">
          {records.length} meeting record{records.length !== 1 ? 's' : ''} on file, most recent first.
        </p>
        <button onClick={() => navigate(`/meetings?post=${postId}`)} className="btn-ghost flex items-center gap-2 text-sm shrink-0">
          Open Full Meetings Tool <ArrowRight size={14} />
        </button>
      </div>

      {records.length === 0 ? (
        <EmptyState title="No meetings submitted yet" hint="Submit minutes from the full Meetings tool." />
      ) : (
        <div className="space-y-2">
          {records.slice(0, 8).map((r) => (
            <div key={r.id} className="panel p-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-ink truncate">{r.title}</div>
                <div className="text-xs text-muted capitalize">{r.meeting_type.replaceAll('_', ' ')}</div>
              </div>
              <span className="text-xs text-muted font-mono shrink-0">{format(new Date(r.meeting_date), 'MMM d, yyyy')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
