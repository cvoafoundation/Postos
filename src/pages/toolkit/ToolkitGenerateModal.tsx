import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { ToolkitGeneratedDocument, ToolkitItem } from '@/lib/types'
import { Sparkles, Copy, Check, Loader2 } from 'lucide-react'

const KNOWN_KEYS = ['post_name', 'post_city_state']

export function ToolkitGenerateModal({ item, onClose }: { item: ToolkitItem; onClose: () => void }) {
  const { profile } = useAuth()
  const [history, setHistory] = useState<ToolkitGeneratedDocument[]>([])
  const [extraContext, setExtraContext] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const extraKeys = useMemo(() => {
    const matches = [...(item.generate_prompt_template ?? '').matchAll(/\{\{(\w+)\}\}/g)]
    const keys = new Set(matches.map((m) => m[1]))
    KNOWN_KEYS.forEach((k) => keys.delete(k))
    return Array.from(keys)
  }, [item.generate_prompt_template])

  useEffect(() => {
    supabase
      .from('toolkit_generated_documents')
      .select('*')
      .eq('toolkit_item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }: any) => setHistory((data ?? []) as ToolkitGeneratedDocument[]))
  }, [item.id])

  async function generate() {
    setGenerating(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('generate-toolkit-document', {
      body: {
        toolkit_item_id: item.id,
        post_id: profile?.post_id ?? null,
        generated_by: profile?.id ?? null,
        extra_context: extraContext,
      },
    })
    setGenerating(false)
    if (error || data?.error) {
      setError(data?.error ?? error?.message ?? 'Generation failed.')
      return
    }
    setResult(data.document.content)
  }

  function copyResult() {
    if (!result) return
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal title={`Generate — ${item.title}`} onClose={onClose}>
      <div className="space-y-4">
        {!result && (
          <>
            <p className="text-sm text-muted">
              Claude will write a ready-to-use version of this for your post automatically.
            </p>
            {extraKeys.map((key) => (
              <input
                key={key}
                placeholder={key.replaceAll('_', ' ')}
                className="input-field"
                value={extraContext[key] ?? ''}
                onChange={(e) => setExtraContext((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            ))}
            {error && <p className="text-status-attention text-sm">{error}</p>}
            <button onClick={generate} disabled={generating} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {generating ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> Generating…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Generate
                </>
              )}
            </button>
          </>
        )}

        {result && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="eyebrow">Generated Document</div>
              <button onClick={copyResult} className="flex items-center gap-1 text-xs text-gold hover:text-gold-bright">
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="border border-hairline rounded-sm p-4 max-h-96 overflow-y-auto">
              <p className="text-sm text-ink whitespace-pre-wrap">{result}</p>
            </div>
            <button onClick={() => setResult(null)} className="btn-ghost w-full mt-3 text-sm">
              Generate Another
            </button>
          </div>
        )}

        {history.length > 0 && !result && (
          <div className="border-t border-hairline pt-4">
            <div className="eyebrow mb-2">Previously Generated</div>
            <div className="space-y-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setResult(h.content)}
                  className="w-full text-left text-xs text-muted hover:text-gold border border-hairline rounded-sm p-2"
                >
                  {h.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
