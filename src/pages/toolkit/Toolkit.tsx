import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { ToolkitCategory, ToolkitItem } from '@/lib/types'
import { ChevronDown, BookOpen, Download, Sparkles, Search } from 'lucide-react'
import { ToolkitReadModal } from './ToolkitReadModal'
import { ToolkitDownloadModal } from './ToolkitDownloadModal'
import { ToolkitGenerateModal } from './ToolkitGenerateModal'

export default function Toolkit() {
  const [categories, setCategories] = useState<ToolkitCategory[]>([])
  const [items, setItems] = useState<ToolkitItem[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [reading, setReading] = useState<ToolkitItem | null>(null)
  const [downloading, setDownloading] = useState<ToolkitItem | null>(null)
  const [generating, setGenerating] = useState<ToolkitItem | null>(null)

  async function load() {
    setError(null)
    const [catRes, itemRes] = await Promise.all([
      supabase.from('toolkit_categories').select('*').order('sort_order'),
      supabase.from('toolkit_items').select('*').order('sort_order'),
    ])
    if (catRes.error) {
      setError(catRes.error.message)
      setLoading(false)
      return
    }
    const cats = (catRes.data ?? []) as ToolkitCategory[]
    setCategories(cats)
    setItems((itemRes.data ?? []) as ToolkitItem[])
    if (cats.length > 0) setExpanded(new Set([cats[0].id]))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function toggle(categoryId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(categoryId) ? next.delete(categoryId) : next.add(categoryId)
      return next
    })
  }

  return (
    <div>
      <PageHeader eyebrow="Module 5 — The Playbook" title="Post Toolkit" />

      <Link
        to="/meetings"
        className="panel p-4 mb-6 flex items-center justify-between hover:border-gold transition-colors"
      >
        <div>
          <div className="eyebrow mb-1">Meetings Module</div>
          <p className="text-sm text-muted">
            Submit and search actual meeting minutes across every post — not just the blank templates below.
          </p>
        </div>
        <Search size={18} className="text-gold shrink-0" />
      </Link>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <div className="panel p-6">
          <div className="eyebrow mb-2 text-status-attention">Couldn't load the toolkit</div>
          <p className="text-sm text-muted mb-1">{error}</p>
          <p className="text-xs text-muted">
            This usually means the Post Toolkit database migration hasn't been run on this
            Supabase project yet — run <code className="text-gold">post-toolkit-upgrade.sql</code> in
            the SQL Editor, then refresh this page.
          </p>
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          title="Toolkit not set up yet"
          hint="Run post-toolkit-upgrade.sql in the Supabase SQL Editor to load all categories and items, then refresh."
        />
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category_id === cat.id)
            const isOpen = expanded.has(cat.id)
            return (
              <div key={cat.id} className="panel overflow-hidden">
                <button
                  onClick={() => toggle(cat.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-surface/40"
                >
                  <div>
                    <div className="font-display text-xl tracking-wide text-ink">{cat.name}</div>
                    {cat.description && <div className="text-xs text-muted mt-0.5">{cat.description}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[11px] text-muted">{catItems.length} items</span>
                    <ChevronDown size={16} className={`text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-hairline divide-y divide-hairline/60">
                    {catItems.map((item) => (
                      <div key={item.id} className="p-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-ink">{item.title}</div>
                          {item.description && <div className="text-xs text-muted mt-0.5">{item.description}</div>}
                          {item.sub_items && item.sub_items.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.sub_items.map((s) => (
                                <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 bg-surface border border-hairline rounded-sm text-muted">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setReading(item)}
                            className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:text-gold border border-hairline hover:border-gold rounded-sm px-2.5 py-1.5"
                          >
                            <BookOpen size={12} /> Read
                          </button>
                          <button
                            onClick={() => setDownloading(item)}
                            className={`flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide rounded-sm px-2.5 py-1.5 border ${
                              item.file_storage_path
                                ? 'text-gold border-gold/50 hover:border-gold'
                                : 'text-muted border-hairline hover:border-gold hover:text-gold'
                            }`}
                          >
                            <Download size={12} /> Download
                          </button>
                          {item.generate_prompt_template && (
                            <button
                              onClick={() => setGenerating(item)}
                              className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide bg-gold text-base rounded-sm px-2.5 py-1.5 hover:bg-gold-bright"
                            >
                              <Sparkles size={12} /> Generate
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {reading && (
        <ToolkitReadModal
          item={reading}
          onClose={() => setReading(null)}
          onSaved={() => {
            load()
          }}
        />
      )}
      {downloading && (
        <ToolkitDownloadModal
          item={downloading}
          onClose={() => setDownloading(null)}
          onSaved={() => {
            load()
          }}
        />
      )}
      {generating && <ToolkitGenerateModal item={generating} onClose={() => setGenerating(null)} />}
    </div>
  )
}
