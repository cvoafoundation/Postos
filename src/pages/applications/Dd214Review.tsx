import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { PostApplication } from '@/lib/types'
import { ExternalLink, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export function Dd214ReviewModal({
  application,
  onClose,
  onReviewed,
}: {
  application: PostApplication
  onClose: () => void
  onReviewed: () => void
}) {
  const { profile } = useAuth()
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadUrl() {
      if (!application.dd214_storage_path) return
      const { data, error } = await supabase.storage
        .from('dd214-uploads')
        .createSignedUrl(application.dd214_storage_path, 600) // 10 minutes
      if (cancelled) return
      if (error) {
        setError(error.message)
      } else {
        setSignedUrl(data?.signedUrl ?? null)
      }
      setLoadingUrl(false)
    }
    loadUrl()
    return () => {
      cancelled = true
    }
  }, [application.dd214_storage_path])

  async function decide(decision: 'verified' | 'rejected') {
    setSaving(true)
    const { error } = await supabase
      .from('post_applications')
      .update({
        dd214_review_status: decision,
        dd214_reviewed_by: profile?.id ?? null,
        dd214_reviewed_at: new Date().toISOString(),
      })
      .eq('id', application.id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onReviewed()
  }

  return (
    <Modal title={`DD214 — ${application.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Current status</span>
          <StatusBadge
            label={application.dd214_review_status}
            tone={
              application.dd214_review_status === 'verified'
                ? 'active'
                : application.dd214_review_status === 'rejected'
                ? 'attention'
                : 'developing'
            }
          />
        </div>

        <div className="border border-hairline rounded-sm p-4 text-center">
          {loadingUrl ? (
            <div className="flex items-center justify-center gap-2 text-muted text-sm py-6">
              <Loader2 className="animate-spin" size={16} /> Preparing secure link…
            </div>
          ) : signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-gold hover:text-gold-bright text-sm"
            >
              <ExternalLink size={16} /> Open DD214 in new tab
            </a>
          ) : (
            <p className="text-sm text-status-attention">Couldn't generate a link to this file.</p>
          )}
          <p className="text-[11px] text-muted mt-2">
            This link is temporary and expires in 10 minutes. The file itself is never public.
          </p>
        </div>

        {error && <p className="text-status-attention text-sm">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => decide('rejected')}
            disabled={saving}
            className="flex items-center justify-center gap-2 border border-status-attention/50 text-status-attention rounded-sm py-2 text-sm hover:bg-status-attention/10 disabled:opacity-50"
          >
            <XCircle size={16} /> Reject
          </button>
          <button
            onClick={() => decide('verified')}
            disabled={saving}
            className="flex items-center justify-center gap-2 bg-status-active/90 text-base rounded-sm py-2 text-sm font-medium hover:bg-status-active disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Verify
          </button>
        </div>
      </div>
    </Modal>
  )
}
