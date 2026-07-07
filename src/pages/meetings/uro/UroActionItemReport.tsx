import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { UroActionItem } from '@/lib/types'
import { CheckSquare, Square } from 'lucide-react'
import { isPast } from 'date-fns'

interface ActionItemRow extends UroActionItem {
  uro_meetings: { title: string } | null
  posts: { name: string } | null
}

export default function UroActionItemReport() {
  const navigate = useNavigate()
  const { isNational } = useAuth()
  const [items, setItems] = useState<ActionItemRow[]>([])
  const [showDone, setShowDone] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    let q = supabase
      .from('uro_action_items')
      .select('*, uro_meetings(title), posts(name)')
      .order('due_date', { ascending: true, nullsFirst: false })
    if (!showDone) q = q.eq('status', 'open')
    const { data } = await q
    setItems((data ?? []) as any as ActionItemRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDone])

  async function toggleDone(item: ActionItemRow) {
    const next = item.status === 'done' ? 'open' : 'done'
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)))
    await supabase.from('uro_action_items').update({ status: next }).eq('id', item.id)
  }

  const overdue = items.filter((i) => i.status === 'open' && i.due_date && isPast(new Date(i.due_date)))

  return (
    <div>
      <PageHeader
        eyebrow={isNational ? 'Across Every Post' : 'Your Post'}
        title="Action Items"
        action={
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show completed
          </label>
        }
      />

      {overdue.length > 0 && (
        <div className="panel p-3 mb-6 border-status-attention/40 text-sm text-status-attention">
          {overdue.length} item{overdue.length !== 1 ? 's' : ''} overdue
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No action items" hint="These come from the Adjournment step of a guided meeting." />
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => {
            const overdueItem = item.status === 'open' && item.due_date && isPast(new Date(item.due_date))
            return (
              <div key={item.id} className="panel p-3 flex items-center justify-between">
                <button onClick={() => toggleDone(item)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                  {item.status === 'done' ? (
                    <CheckSquare size={16} className="text-status-active shrink-0" />
                  ) : (
                    <Square size={16} className="text-muted shrink-0" />
                  )}
                  <span className={`text-sm truncate ${item.status === 'done' ? 'text-muted line-through' : ''}`}>{item.description}</span>
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted font-mono">
                    {isNational && item.posts?.name ? `${item.posts.name} · ` : ''}
                    {item.owner_name ?? 'Unassigned'}
                    {item.due_date ? ` · due ${item.due_date}` : ''}
                  </span>
                  {overdueItem && <StatusBadge label="overdue" tone="attention" />}
                  {item.uro_meetings && (
                    <button onClick={() => navigate(`/meetings/uro/${item.meeting_id}/view`)} className="text-xs text-gold hover:text-gold-bright">
                      View Meeting
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
