import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { KanbanBoard, type KanbanColumn } from '@/components/ui/Kanban'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { POST_STATUS_LABELS, POST_STATUS_ORDER, type PostApplication, type PostStatus } from '@/lib/types'
import { Plus, FileWarning, FileSearch, Eye, Star } from 'lucide-react'
import { NewApplicationModal } from './NewApplication'
import { Dd214ReviewModal } from './Dd214Review'
import { ApplicationDetailModal } from './ApplicationDetail'

export default function ApplicationsPipeline() {
  const [applications, setApplications] = useState<PostApplication[]>([])
  const [scoreByApplication, setScoreByApplication] = useState<Record<string, number>>({})
  const [readyForApproval, setReadyForApproval] = useState<Set<string>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [reviewing, setReviewing] = useState<PostApplication | null>(null)
  const [viewing, setViewing] = useState<PostApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [appsRes, scoresRes, nationalRes, signoffsRes] = await Promise.all([
      supabase.from('post_applications').select('*').order('created_at', { ascending: false }),
      supabase
        .from('vetting_scorecards')
        .select('application_id, leadership_score, communication_score, professionalism_score, reliability_score, mission_alignment_score'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['national_commander', 'national_staff']),
      supabase.from('application_signoffs').select('application_id'),
    ])
    setApplications((appsRes.data ?? []) as PostApplication[])

    // Every NCC (National) account must sign off before an application in
    // Vetting can move to Approved — this is what actually gates issuing a
    // charter, not just one person clicking Advance.
    const nationalCount = nationalRes.count ?? 0
    const signoffCounts: Record<string, number> = {}
    for (const row of (signoffsRes.data ?? []) as any[]) {
      signoffCounts[row.application_id] = (signoffCounts[row.application_id] ?? 0) + 1
    }
    const ready = new Set<string>()
    for (const [appId, count] of Object.entries(signoffCounts)) {
      if (nationalCount > 0 && count >= nationalCount) ready.add(appId)
    }
    setReadyForApproval(ready)

    // Average every category across every scorecard for each application, for
    // a quick at-a-glance score on the kanban card itself.
    const grouped: Record<string, number[]> = {}
    for (const row of (scoresRes.data ?? []) as any[]) {
      const scores = [
        row.leadership_score,
        row.communication_score,
        row.professionalism_score,
        row.reliability_score,
        row.mission_alignment_score,
      ].filter((v) => typeof v === 'number')
      if (!grouped[row.application_id]) grouped[row.application_id] = []
      grouped[row.application_id].push(...scores)
    }
    const averages: Record<string, number> = {}
    for (const [appId, scores] of Object.entries(grouped)) {
      if (scores.length > 0) {
        averages[appId] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      }
    }
    setScoreByApplication(averages)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function moveStatus(id: string, status: PostStatus) {
    const application = applications.find((a) => a.id === id)
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
    await supabase.from('post_applications').update({ status }).eq('id', id)

    // The hand-off moment: moving an application past "Approved" into
    // "Founding Team Building" is where it stops being just an application
    // and needs to become a real post record — Module 3 (Founding Team
    // Builder) and Module 4 (Launch Checklist) both key off posts.id, not
    // post_applications.id. Without this, advancing here would silently
    // lead nowhere.
    if (status === 'founding_team_building' && application && !application.post_id) {
      const postName = `${application.city ? application.city + ' ' : ''}${application.state} Post (Forming)`
      const { data: newPost, error: postError } = await supabase
        .from('posts')
        .insert({
          name: postName,
          city: application.city,
          state: application.state,
          status: 'founding_team_building',
          health_status: 'yellow',
        })
        .select()
        .single()

      if (!postError && newPost) {
        await supabase.from('post_applications').update({ post_id: newPost.id }).eq('id', id)
        await supabase.from('founding_team_members').insert({
          post_id: newPost.id,
          name: application.name,
          email: application.email,
          phone: application.phone,
          position: 'commander',
          combat_status: application.combat_service ? 'Combat veteran' : 'Non-combat veteran',
          verification_status: application.dd214_review_status === 'verified' ? 'verified' : 'pending',
          dd214_reviewed: application.dd214_review_status !== 'pending',
          combat_service_verified: application.dd214_review_status === 'verified',
          membership_approved: true,
        })
        setNotice(
          `${postName} created — ${application.name} was added as Commander. Head to the Founding Team module to invite the rest of the team.`
        )
      }
      load()
    }
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

      {notice && (
        <div className="panel p-4 mb-6 border-status-active/40 flex items-start justify-between gap-4">
          <p className="text-sm text-ink">{notice}</p>
          <button onClick={() => setNotice(null)} className="text-muted hover:text-gold text-xs shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {!loading && (
        <KanbanBoard
          columns={columns}
          keyExtractor={(a) => a.id}
          renderCard={(a) => (
            <ApplicationCard
              application={a}
              score={scoreByApplication[a.id]}
              readyForApproval={readyForApproval.has(a.id)}
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

      {viewing && (
        <ApplicationDetailModal
          application={viewing}
          onClose={() => setViewing(null)}
          onDeleted={load}
        />
      )}
    </div>
  )
}

function ApplicationCard({
  application,
  score,
  readyForApproval,
  onMove,
  onReview,
  onView,
}: {
  application: PostApplication
  score?: number
  readyForApproval: boolean
  onMove: (id: string, status: PostStatus) => void
  onReview: () => void
  onView: () => void
}) {
  const currentIndex = POST_STATUS_ORDER.indexOf(application.status)
  const next = POST_STATUS_ORDER[currentIndex + 1]
  const prev = POST_STATUS_ORDER[currentIndex - 1]
  const hasDD214 = !!application.dd214_storage_path
  const blockedBySignoff = application.status === 'vetting' && !readyForApproval

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

      <div className="flex items-center gap-2 mb-2">
        {application.military_branch && <div className="text-xs text-muted">{application.military_branch}</div>}
        {typeof score === 'number' && (
          <div className="flex items-center gap-1 text-[11px] font-mono text-gold ml-auto">
            <Star size={11} className="fill-gold" /> {score}/10
          </div>
        )}
      </div>

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
            disabled={!next || !hasDD214 || blockedBySignoff}
            onClick={() => next && onMove(application.id, next)}
            title={
              !hasDD214
                ? 'Cannot advance without a DD214 on file'
                : blockedBySignoff
                ? 'Every National account must sign off before this candidate can be approved'
                : undefined
            }
            className="text-[11px] font-mono text-gold hover:text-gold-bright disabled:opacity-30"
          >
            Advance →
          </button>
        </div>
      </div>
    </div>
  )
}
