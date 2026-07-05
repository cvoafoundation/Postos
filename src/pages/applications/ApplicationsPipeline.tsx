import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { KanbanBoard, type KanbanColumn } from '@/components/ui/Kanban'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { POST_STATUS_LABELS, POST_STATUS_ORDER, type PostApplication, type PostStatus } from '@/lib/types'
import { Plus, FileWarning, FileSearch, Eye } from 'lucide-react'
import { NewApplicationModal } from './NewApplication'
import { Dd214ReviewModal } from './Dd214Review'
import { ApplicationDetailModal } from './ApplicationDetail'

export default function ApplicationsPipeline() {
  const [applications, setApplications] = useState<PostApplication[]>([])
  const [showNew, setShowNew] = useState(false)
  const [reviewing, setReviewing] = useState<PostApplication | null>(null)
  const [viewing, setViewing] = useState<PostApplication | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('post_applications').select('*').order('created_at', { ascending: false })
    setApplications((data ?? []) as PostApplication[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function moveStatus(id: string, status: PostStatus) {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
    await supabase.from('post_applications').update({ status }).eq('id', id)
  }

  const columns: KanbanColumn<PostApplication>[] = POST_STATUS_ORDER.map((status) => ({
    key: status,
    label: POST_STATUS_LABELS[status],
    items: applications.filter((a) => a.status === status),
  }))

  return (
    <div>
      <PageHeader
        eyebrow="Module 1"
        title="Post Application Pipeline"
        action={
          <button onClick={() => setShowNew(true)} className="btn-gold flex items-center gap-2">
            <Plus size={16} /> New Application
          </button>
        }
      />

      {!loading && (
        <KanbanBoard
          columns={columns}
          keyExtractor={(a) => a.id}
          renderCard={(a) => (
            <ApplicationCard
              application={a}
              onMove={moveStatus}
              onReview={() => setReviewing(a)}
              onView={() => setViewing(a)}
            />
          )}
        />
      )}

      {showNew && (
        <NewApplicationModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            load()
          }}
        />
      )}

      {reviewing && (
        <Dd214ReviewModal
          application={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={() => {
            setReviewing(null)
            load()
          }}
        />
      )}

      {viewing && <ApplicationDetailModal application={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function ApplicationCard({
  application,
  onMove,
  onReview,
  onView,
}: {
  application: PostApplication
  onMove: (id: string, status: PostStatus) => void
  onReview: () => void
  onView: () => void
}) {
  const currentIndex = POST_STATUS_ORDER.indexOf(application.status)
  const next = POST_STATUS_ORDER[currentIndex + 1]
  const prev = POST_STATUS_ORDER[currentIndex - 1]
  const hasDD214 = !!application.dd214_storage_path

  return (
    <div className="panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{application.name}</div>
          <div className="font-mono text-[11px] text-muted mb-2">
            {application.city ? `${application.city}, ` : ''}
            {application.state}
          </div>
        </div>
        <button
          onClick={onView}
          title="View application details"
          className="shrink-0 flex items-center gap-1 text-[11px] font-mono text-muted hover:text-gold border border-hairline hover:border-gold rounded-sm px-2 py-1"
        >
          <Eye size={12} /> View
        </button>
      </div>

      {application.military_branch && (
        <div className="text-xs text-muted mb-2">{application.military_branch}</div>
      )}

      <div className="mb-2">
        {hasDD214 ? (
          <button onClick={onReview} className="hover:opacity-80">
            <StatusBadge
              label={`DD214: ${application.dd214_review_status} · review`}
              tone={
                application.dd214_review_status === 'verified'
                  ? 'active'
                  : application.dd214_review_status === 'rejected'
                  ? 'attention'
                  : 'developing'
              }
            />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-status-attention">
            <FileWarning size={12} /> No DD214 on file
          </div>
        )}
      </div>

      <div className="flex justify-between mt-2 pt-2 border-t border-hairline/60">
        <button
          disabled={!prev}
          onClick={() => prev && onMove(application.id, prev)}
          className="text-[11px] font-mono text-muted hover:text-gold disabled:opacity-30"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {hasDD214 && (
            <button
              onClick={onReview}
              title="Review DD214"
              className="text-muted hover:text-gold"
            >
              <FileSearch size={14} />
            </button>
          )}
          <button
            disabled={!next || !hasDD214}
            onClick={() => next && onMove(application.id, next)}
            title={!hasDD214 ? 'Cannot advance without a DD214 on file' : undefined}
            className="text-[11px] font-mono text-gold hover:text-gold-bright disabled:opacity-30"
          >
            Advance →
          </button>
        </div>
      </div>
    </div>
  )
}
