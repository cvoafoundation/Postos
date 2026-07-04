import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { ChecklistItem } from '@/lib/types'

export default function LaunchChecklist() {
  const { profile } = useAuth()
  const [items, setItems] = useState<ChecklistItem[]>([])

  useEffect(() => {
    if (!profile?.post_id) return
    supabase
      .from('checklist_items')
      .select('*')
      .eq('post_id', profile.post_id)
      .then(({ data }) => setItems((data ?? []) as ChecklistItem[]))
  }, [profile?.post_id])

  async function toggle(item: ChecklistItem) {
    const is_complete = !item.is_complete
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_complete } : i)))
    await supabase
      .from('checklist_items')
      .update({ is_complete, completed_at: is_complete ? new Date().toISOString() : null })
      .eq('id', item.id)
  }

  if (!profile?.post_id) {
    return (
      <div>
        <PageHeader eyebrow="Module 4" title="Post Launch Checklist" />
        <EmptyState title="No post assigned" />
      </div>
    )
  }

  const total = items.length
  const done = items.filter((i) => i.is_complete).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const categories = Array.from(new Set(items.map((i) => i.category)))

  return (
    <div>
      <PageHeader eyebrow="Module 4" title="Post Launch Checklist" />

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
                  <label key={item.id} className="flex items-center gap-3 text-sm cursor-pointer">
                    <input type="checkbox" checked={item.is_complete} onChange={() => toggle(item)} />
                    <span className={item.is_complete ? 'text-muted line-through' : 'text-ink'}>{item.label}</span>
                    {item.auto_tracked && <span className="font-mono text-[10px] text-muted ml-auto">auto</span>}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
