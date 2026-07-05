import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ChecklistItem } from '@/lib/types'
import { Lock } from 'lucide-react'

const REQUIRED_POSITIONS = ['commander', 'vice_commander', 'adjutant', 'quartermaster', 'sergeant_at_arms']

function membershipTarget(label: string): number | null {
  const match = label.match(/^(\d+)\s+Members$/)
  return match ? Number(match[1]) : null
}

export function PostChecklistView({ postId }: { postId: string }) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [itemsRes, recruitsRes, teamRes] = await Promise.all([
      supabase.from('checklist_items').select('*').eq('post_id', postId),
      supabase.from('recruits').select('stage').eq('post_id', postId),
      supabase.from('founding_team_members').select('position, verification_status').eq('post_id', postId),
    ])

    let currentItems = (itemsRes.data ?? []) as ChecklistItem[]

    // Real auto-tracking: membership milestones come from actual recruiting
    // data, and "Founding Team Verified" comes from Module 3 — neither is a
    // manual checkbox anyone has to remember to click.
    const memberCount = ((recruitsRes.data ?? []) as any[]).filter((r) =>
      ['member', 'leader', 'officer', 'commander'].includes(r.stage)
    ).length

    const team = (teamRes.data ?? []) as any[]
    const filledPositions = new Set(team.map((m) => m.position))
    const foundingTeamVerified =
      REQUIRED_POSITIONS.every((p) => filledPositions.has(p)) &&
      team
        .filter((m) => REQUIRED_POSITIONS.includes(m.position))
        .every((m) => m.verification_status === 'verified')

    const updates: Promise<any>[] = []
    currentItems = currentItems.map((item) => {
      if (!item.auto_tracked) return item

      let computed = item.is_complete
      const target = membershipTarget(item.label)
      if (target !== null) {
        computed = memberCount >= target
      } else if (item.label === 'Founding Team Verified') {
        computed = foundingTeamVerified
      }

      if (computed !== item.is_complete) {
        updates.push(
          supabase
            .from('checklist_items')
            .update({ is_complete: computed, completed_at: computed ? new Date().toISOString() : null })
            .eq('id', item.id)
        )
      }
      return { ...item, is_complete: computed }
    })

    if (updates.length > 0) await Promise.all(updates)
    setItems(currentItems)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  async function toggle(item: ChecklistItem) {
    if (item.auto_tracked) return
    const is_complete = !item.is_complete
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_complete } : i)))
    await supabase
      .from('checklist_items')
      .update({ is_complete, completed_at: is_complete ? new Date().toISOString() : null })
      .eq('id', item.id)
  }

  if (loading) return <p className="text-sm text-muted">Loading checklist…</p>

  const total = items.length
  const done = items.filter((i) => i.is_complete).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const categories = Array.from(new Set(items.map((i) => i.category)))

  if (total === 0) {
    return <EmptyState title="No checklist yet" hint="This post doesn't have a launch checklist seeded." />
  }

  return (
    <div>
      <div className="panel p-5 mb-6">
        <div className="flex justify-between items-baseline mb-2">
          <span className="eyebrow">Overall Progress</span>
          <span className="font-display text-3xl text-gold">{pct}%</span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat) => (
          <div key={cat} className="panel p-4">
            <div className="eyebrow mb-3">{cat}</div>
            <div className="space-y-2">
              {items
                .filter((i) => i.category === cat)
                .map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 text-sm ${item.auto_tracked ? '' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.is_complete}
                      disabled={item.auto_tracked}
                      onChange={() => toggle(item)}
                    />
                    <span className={item.is_complete ? 'text-muted line-through' : 'text-ink'}>{item.label}</span>
                    {item.auto_tracked && (
                      <span className="flex items-center gap-1 font-mono text-[10px] text-muted ml-auto">
                        <Lock size={10} /> auto
                      </span>
                    )}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
