import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge, healthTone } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { useMarkNotificationViewed } from '@/lib/notifications'
import { useAuth } from '@/context/AuthContext'
import type { MeetingRecord, Post } from '@/lib/types'
import { Search, Plus, FileText, Upload, AlertTriangle, CalendarCheck, ClipboardList, BarChart3, CheckSquare } from 'lucide-react'
import { format, differenceInDays, isSameMonth } from 'date-fns'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { UroMeeting } from '@/lib/types'

const OVERDUE_YELLOW_DAYS = 30
const OVERDUE_RED_DAYS = 60

function snippet(text: string, term: string, radius = 80): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return text.slice(0, radius * 2) + '…'
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + term.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

function complianceStatus(lastDate: string | null): 'green' | 'yellow' | 'red' {
  if (!lastDate) return 'red'
  const days = differenceInDays(new Date(), new Date(lastDate))
  if (days <= OVERDUE_YELLOW_DAYS) return 'green'
  if (days <= OVERDUE_RED_DAYS) return 'yellow'
  return 'red'
}

export default function Meetings() {
  useMarkNotificationViewed('meetings')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, isNational } = useAuth()
  const [posts, setPosts] = useState<Record<string, string>>({})
  const [allPosts, setAllPosts] = useState<Post[]>([])
  const [selectedPostForMeeting, setSelectedPostForMeeting] = useState<string | null>(null)
  const [activePosts, setActivePosts] = useState<Post[]>([])
  const [lastSubmission, setLastSubmission] = useState<Record<string, string>>({})
  const [myRecords, setMyRecords] = useState<MeetingRecord[]>([])
  const [myUroMeetings, setMyUroMeetings] = useState<UroMeeting[]>([])
  const [startingMeeting, setStartingMeeting] = useState(false)
  const [meetingError, setMeetingError] = useState<string | null>(null)
  const [showSubmit, setShowSubmit] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MeetingRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('posts').select('id, name').then(({ data }: any) => {
      const map: Record<string, string> = {}
      for (const p of data ?? []) map[p.id] = p.name
      setPosts(map)
    })
    if (isNational) {
      loadCompliance()
      supabase.from('posts').select('*').then(({ data }: any) => {
        const list = (data ?? []) as Post[]
        setAllPosts(list)
        if (list.length > 0 && !selectedPostForMeeting) {
          const postParam = searchParams.get('post')
          setSelectedPostForMeeting(postParam ?? list[0].id)
        }
      })
    }
    if (profile?.post_id) loadMyRecords(profile.post_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  useEffect(() => {
    if (isNational && selectedPostForMeeting) loadMyRecords(selectedPostForMeeting)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPostForMeeting, isNational])

  async function loadCompliance() {
    const [postsRes, recordsRes] = await Promise.all([
      supabase.from('posts').select('*').eq('status', 'active_post'),
      supabase.from('meeting_records').select('post_id, meeting_date'),
    ])
    setActivePosts((postsRes.data ?? []) as Post[])
    const latest: Record<string, string> = {}
    for (const r of (recordsRes.data ?? []) as any[]) {
      if (!latest[r.post_id] || r.meeting_date > latest[r.post_id]) latest[r.post_id] = r.meeting_date
    }
    setLastSubmission(latest)
  }

  async function loadMyRecords(postId: string) {
    const { data } = await supabase
      .from('meeting_records')
      .select('*')
      .eq('post_id', postId)
      .order('meeting_date', { ascending: false })
    setMyRecords((data ?? []) as MeetingRecord[])

    const { data: uroData } = await supabase
      .from('uro_meetings')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
    setMyUroMeetings((uroData ?? []) as UroMeeting[])
  }

  async function startGuidedMeeting() {
    const targetPostId = isNational ? selectedPostForMeeting : profile?.post_id
    if (!targetPostId) return
    setStartingMeeting(true)
    setMeetingError(null)
    const { data, error } = await supabase
      .from('uro_meetings')
      .insert({
        post_id: targetPostId,
        title: `${format(new Date(), 'MMMM yyyy')} Meeting`,
        meeting_type: 'regular',
        meeting_date: new Date().toISOString().slice(0, 10),
        created_by: profile?.id,
      })
      .select()
      .single()
    setStartingMeeting(false)
    if (error) {
      setMeetingError(error.message)
      return
    }
    if (data) navigate(`/meetings/uro/${data.id}`)
  }

  async function runSearch(e?: FormEvent) {
    e?.preventDefault()
    setLoading(true)
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

  const myPost = profile?.post_id ? activePosts.find((p) => p.id === profile.post_id) : null
  const myLastSubmission = myRecords[0]?.meeting_date ?? null
  const myStatus = complianceStatus(myLastSubmission)
  const submittedThisMonth = myRecords.some((r) => isSameMonth(new Date(r.meeting_date), new Date()))

  return (
    <div>
      <PageHeader
        eyebrow="Recurring Post Obligation — Unified Rules of Order"
        title="Meetings"
        action={
          <div className="flex gap-2">
            <button onClick={() => navigate('/meetings/uro-actions')} className="btn-ghost flex items-center gap-2 text-sm">
              <CheckSquare size={16} /> Action Items
            </button>
            {isNational && (
              <>
                <button onClick={() => navigate('/meetings/uro-compliance')} className="btn-ghost flex items-center gap-2 text-sm">
                  <BarChart3 size={16} /> Compliance Dashboard
                </button>
                <button onClick={() => navigate('/meetings/uro-motions')} className="btn-ghost flex items-center gap-2 text-sm">
                  <ClipboardList size={16} /> Motion Search
                </button>
                {allPosts.length > 0 && (
                  <select
                    className="input-field w-48"
                    value={selectedPostForMeeting ?? ''}
                    onChange={(e) => setSelectedPostForMeeting(e.target.value)}
                  >
                    {allPosts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            {(profile?.post_id || (isNational && selectedPostForMeeting)) && (
              <button onClick={startGuidedMeeting} disabled={startingMeeting} className="btn-gold flex items-center gap-2 disabled:opacity-50">
                <Plus size={16} /> {startingMeeting ? 'Starting…' : 'Start Guided Meeting'}
              </button>
            )}
          </div>
        }
      />

      {meetingError && (
        <div className="panel p-3 mb-6 border-status-attention/40 text-sm text-status-attention">
          Couldn't start meeting: {meetingError}
          {meetingError.toLowerCase().includes('does not exist') && (
            <span className="block text-xs text-muted mt-1">
              This usually means <code>uro-meeting-system.sql</code> hasn't been run in Supabase yet.
            </span>
          )}
        </div>
      )}

      {(profile?.post_id || (isNational && selectedPostForMeeting)) && myUroMeetings.length > 0 && (
        <div className="panel p-4 mb-6">
          <div className="eyebrow mb-3">{isNational ? `Guided Meetings — ${allPosts.find((p) => p.id === selectedPostForMeeting)?.name ?? ''}` : 'Your Guided Meetings'}</div>
          <div className="space-y-1.5">
            {myUroMeetings.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(m.status === 'published' ? `/meetings/uro/${m.id}/view` : `/meetings/uro/${m.id}`)}
                className="w-full flex items-center justify-between border border-hairline hover:border-gold rounded-sm p-2.5 text-left text-sm"
              >
                <span>{m.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-mono">{format(new Date(m.meeting_date), 'MMM d, yyyy')}</span>
                  <StatusBadge
                    label={m.status === 'published' ? m.compliance_level ?? 'published' : 'in progress'}
                    tone={m.status !== 'published' ? 'developing' : m.compliance_level === 'fully_compliant' ? 'active' : m.compliance_level === 'minor_issues' ? 'developing' : 'attention'}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {profile?.post_id && (
        <div className="panel p-5 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarCheck size={22} className={submittedThisMonth ? 'text-status-active' : 'text-status-attention'} />
            <div>
              <div className="text-sm font-medium text-ink">
                {submittedThisMonth ? "You're up to date for this month" : "This month's minutes haven't been submitted yet"}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {myLastSubmission
                  ? `Last submitted ${format(new Date(myLastSubmission), 'MMM d, yyyy')}`
                  : 'No minutes submitted yet for your post'}
              </div>
            </div>
          </div>
          <StatusBadge
            label={myStatus === 'green' ? 'Current' : myStatus === 'yellow' ? 'Due Soon' : 'Overdue'}
            tone={healthTone(myStatus)}
          />
        </div>
      )}

      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every post submits its actual meeting minutes here each month — searchable by everyone
        who needs it. National can see how the whole organization is keeping up; any post can
        search its own history in seconds instead of digging through old files.
      </p>

      {isNational && activePosts.length > 0 && (
        <div className="panel p-4 mb-6">
          <div className="eyebrow mb-3">Post Compliance — Meeting Minutes Submission</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {activePosts
              .map((p) => ({ post: p, last: lastSubmission[p.id] ?? null, status: complianceStatus(lastSubmission[p.id] ?? null) }))
              .sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[a.status] - { red: 0, yellow: 1, green: 2 }[b.status]))
              .map(({ post, last, status }) => (
                <div key={post.id} className="flex items-center justify-between border border-hairline rounded-sm p-2.5">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{post.name}</div>
                    <div className="text-[11px] text-muted font-mono">
                      {last ? `Last: ${format(new Date(last), 'MMM d, yyyy')}` : 'Never submitted'}
                    </div>
                  </div>
                  <StatusBadge
                    label={status === 'green' ? 'Current' : status === 'yellow' ? 'Due Soon' : 'Overdue'}
                    tone={healthTone(status)}
                  />
                </div>
              ))}
          </div>
          <p className="text-[11px] text-muted mt-3 flex items-center gap-1.5">
            <AlertTriangle size={11} /> Overdue = no minutes submitted in {OVERDUE_RED_DAYS}+ days. Due Soon = {OVERDUE_YELLOW_DAYS}–{OVERDUE_RED_DAYS} days.
          </p>
        </div>
      )}

      <form onSubmit={runSearch} className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            placeholder={isNational ? "Search all posts' minutes — e.g. 'PACT Act', 'fundraiser'…" : "Search your post's minutes…"}
            className="input-field pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-gold px-6">
          Search
        </button>
      </form>
      <div className="mb-4 text-right">
        <button onClick={() => setShowSubmit(true)} className="text-xs text-muted hover:text-gold underline">
          Or paste freeform minutes instead (legacy, not URO-guided)
        </button>
      </div>
      <div className="mb-4 font-mono text-[11px] text-muted">
        {loading
          ? 'Searching…'
          : `${results.length} result${results.length !== 1 ? 's' : ''}${query.trim() ? ` for "${query}"` : ''}${
              isNational ? ` across ${postsRepresented} post${postsRepresented !== 1 ? 's' : ''}` : ''
            }`}
      </div>

      {!loading && results.length === 0 ? (
        <EmptyState
          title="No meeting records found"
          hint={query.trim() ? 'Try a different search term.' : "Submit your post's meeting minutes to start building the archive."}
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
            if (isNational) loadCompliance()
            if (profile?.post_id) loadMyRecords(profile.post_id)
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
