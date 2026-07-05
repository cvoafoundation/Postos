import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { MeetingRecord, Post } from '@/lib/types'
import { Search, Plus, FileText, Upload } from 'lucide-react'
import { format } from 'date-fns'

function snippet(text: string, term: string, radius = 80): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return text.slice(0, radius * 2) + '…'
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + term.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export default function MeetingRecords() {
  const { profile, isNational } = useAuth()
  const [posts, setPosts] = useState<Record<string, string>>({})
  const [showSubmit, setShowSubmit] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MeetingRecord[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('posts').select('id, name').then(({ data }: any) => {
      const map: Record<string, string> = {}
      for (const p of data ?? []) map[p.id] = p.name
      setPosts(map)
    })
  }, [])

  async function runSearch(e?: FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setSearched(true)
    let q = supabase.from('meeting_records').select('*').order('meeting_date', { ascending: false })
    if (query.trim()) {
      q = q.or(`title.ilike.%${query}%,minutes_text.ilike.%${query}%`)
    }
    const { data } = await q
    setResults((data ?? []) as MeetingRecord[])
    setLoading(false)
  }

  useEffect(() => {
    runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const postsRepresented = useMemo(() => new Set(results.map((r) => r.post_id)).size, [results])

  return (
    <div>
      <PageHeader
        eyebrow="Meeting Toolkit"
        title="National Meeting Records"
        action={
          <button onClick={() => setShowSubmit(true)} className="btn-gold flex items-center gap-2">
            <Plus size={16} /> Submit Minutes
          </button>
        }
      />

      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every post's actual meeting minutes, searchable in one place. Search a term below to see
        how many meetings across how many posts have discussed it — real institutional memory,
        not just files sitting in 100 separate cabinets.
      </p>

      <form onSubmit={runSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search all meeting minutes — e.g. 'PACT Act', 'fundraiser', 'bylaws'…"
            className="input-field pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-gold px-6">
          Search
        </button>
      </form>

      {searched && !loading && (
        <div className="mb-4 font-mono text-xs text-muted">
          {results.length} result{results.length !== 1 ? 's' : ''}
          {query.trim() && ` for "${query}"`} across {postsRepresented} post{postsRepresented !== 1 ? 's' : ''}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Searching…</p>
      ) : results.length === 0 ? (
        <EmptyState
          title="No meeting records found"
          hint={query.trim() ? 'Try a different search term.' : 'Submit your post\'s meeting minutes to start building the archive.'}
        />
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.id} className="panel p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className="text-sm font-medium text-ink">{r.title}</div>
                  <div className="font-mono text-[11px] text-muted mt-0.5">
                    {posts[r.post_id] ?? 'Unknown Post'} · {r.meeting_type} · {format(new Date(r.meeting_date), 'MMM d, yyyy')}
                  </div>
                </div>
                {r.attachment_storage_path && (
                  <button
                    onClick={async () => {
                      const { data } = await supabase.storage.from('meeting-records').createSignedUrl(r.attachment_storage_path!, 600)
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                    }}
                    className="flex items-center gap-1 text-xs text-gold hover:text-gold-bright shrink-0"
                  >
                    <FileText size={13} /> Attachment
                  </button>
                )}
              </div>
              <p className="text-xs text-muted italic">
                "{query.trim() ? snippet(r.minutes_text, query) : r.minutes_text.slice(0, 160) + '…'}"
              </p>
            </div>
          ))}
        </div>
      )}

      {showSubmit && (
        <SubmitMinutesModal
          postId={isNational ? null : profile?.post_id ?? null}
          isNational={isNational}
          onClose={() => setShowSubmit(false)}
          onSubmitted={() => {
            setShowSubmit(false)
            runSearch()
          }}
        />
      )}
    </div>
  )
}

function SubmitMinutesModal({
  postId,
  isNational,
  onClose,
  onSubmitted,
}: {
  postId: string | null
  isNational: boolean
  onClose: () => void
  onSubmitted: () => void
}) {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState(postId ?? '')
  const [form, setForm] = useState({ title: '', meeting_type: 'Monthly Meeting', meeting_date: '', minutes_text: '' })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNational) {
      supabase.from('posts').select('*').then(({ data }: any) => setPosts((data ?? []) as Post[]))
    }
  }, [isNational])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedPostId) {
      setError('Select a post.')
      return
    }
    setSaving(true)
    setError(null)

    let attachmentPath: string | null = null
    if (file) {
      const path = `${selectedPostId}/${crypto.randomUUID()}-${file.name}`
      const { data, error: uploadError } = await supabase.storage.from('meeting-records').upload(path, file)
      if (uploadError) {
        setError(uploadError.message)
        setSaving(false)
        return
      }
      attachmentPath = data?.path ?? path
    }

    const { error } = await supabase.from('meeting_records').insert({
      post_id: selectedPostId,
      title: form.title,
      meeting_type: form.meeting_type,
      meeting_date: form.meeting_date,
      minutes_text: form.minutes_text,
      attachment_storage_path: attachmentPath,
      submitted_by: profile?.id ?? null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSubmitted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="panel w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
        <div className="font-display text-xl tracking-wide mb-4">Submit Meeting Minutes</div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {isNational && (
            <select className="input-field" value={selectedPostId} onChange={(e) => setSelectedPostId(e.target.value)}>
              <option value="">Select post…</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <input required placeholder="Title (e.g. January 2026 Monthly Meeting)" className="input-field" value={form.title} onChange={(e) => update('title', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <select className="input-field" value={form.meeting_type} onChange={(e) => update('meeting_type', e.target.value)}>
              <option>Monthly Meeting</option>
              <option>Officer Meeting</option>
              <option>Special Meeting</option>
            </select>
            <input required type="date" className="input-field" value={form.meeting_date} onChange={(e) => update('meeting_date', e.target.value)} />
          </div>
          <textarea
            required
            placeholder="Paste or type the actual meeting minutes here — this is what gets searched."
            className="input-field"
            rows={8}
            value={form.minutes_text}
            onChange={(e) => update('minutes_text', e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <Upload size={14} />
            {file ? file.name : 'Attach original/signed copy (optional)'}
            <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          {error && <p className="text-status-attention text-sm">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-gold flex-1 disabled:opacity-50">
              {saving ? 'Submitting…' : 'Submit'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
