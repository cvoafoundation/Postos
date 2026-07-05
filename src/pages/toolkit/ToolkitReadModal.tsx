import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { ToolkitItem } from '@/lib/types'
import { Pencil } from 'lucide-react'

export function ToolkitReadModal({
  item,
  onClose,
  onSaved,
}: {
  item: ToolkitItem
  onClose: () => void
  onSaved: () => void
}) {
  const { isNational } = useAuth()
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(item.read_content)
  const [draft, setDraft] = useState(item.read_content ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('toolkit_items').update({ read_content: draft }).eq('id', item.id)
    setSaving(false)
    setEditing(false)
    setContent(draft)
    onSaved()
  }

  return (
    <Modal title={item.title} onClose={onClose}>
      <div className="space-y-4">
        {item.sub_items && item.sub_items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.sub_items.map((s) => (
              <span key={s} className="text-[11px] font-mono px-2 py-0.5 bg-surface border border-hairline rounded-sm text-muted">
                {s}
              </span>
            ))}
          </div>
        )}

        {editing ? (
          <div className="space-y-3">
            <textarea
              className="input-field font-mono text-xs"
              rows={16}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write the actual guide content here…"
            />
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="btn-gold flex-1 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Content'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        ) : content ? (
          <>
            <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{content}</p>
            {isNational && (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs text-muted hover:text-gold">
                <Pencil size={12} /> Edit
              </button>
            )}
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted mb-3">
              Content for this guide hasn't been written yet.
            </p>
            {isNational ? (
              <button onClick={() => setEditing(true)} className="btn-gold">
                Write This Guide
              </button>
            ) : (
              <p className="text-xs text-muted">Check back once National Staff has added this content.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
