import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { Post, UroMeeting } from '@/lib/types'
import { differenceInDays, format, startOfMonth, subMonths } from 'date-fns'
import { CheckCircle2, XCircle } from 'lucide-react'

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7) // "YYYY-MM"
}

export default function UroComplianceDashboard() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState<Post[]>([])
  const [meetings, setMeetings] = useState<UroMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))

  useEffect(() => {
    Promise.all([
      supabase.from('posts').select('*').eq('status', 'active_post'),
      supabase.from('uro_meetings').select('*').eq('status', 'published').order('meeting_date', { ascending: false }),
    ]).then(([p, m]) => {
      setPosts((p.data ?? []) as Post[])
      setMeetings((m.data ?? []) as UroMeeting[])
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  const compliant = meetings.filter((m) => m.compliance_level === 'fully_compliant').length
  const minor = meetings.filter((m) => m.compliance_level === 'minor_issues').length
  const nonCompliant = meetings.filter((m) => m.compliance_level === 'non_compliant').length
  const compliancePct = meetings.length > 0 ? Math.round((compliant / meetings.length) * 100) : 0

  const lastMeetingByPost: Record<string, UroMeeting> = {}
  for (const m of meetings) {
    if (!lastMeetingByPost[m.post_id] || m.meeting_date > lastMeetingByPost[m.post_id].meeting_date) {
      lastMeetingByPost[m.post_id] = m
    }
  }
  const missing = posts.filter((p) => !lastMeetingByPost[p.id] || differenceInDays(new Date(), new Date(lastMeetingByPost[p.id].meeting_date)) > 45)

  // Last 12 months, most recent first, for the phase selector.
  const monthOptions = Array.from({ length: 12 }, (_, i) => format(startOfMonth(subMonths(new Date(), i)), 'yyyy-MM'))
  const meetingsThisMonthByPost: Record<string, UroMeeting> = {}
  for (const m of meetings) {
    if (monthKey(m.meeting_date) === selectedMonth) meetingsThisMonthByPost[m.post_id] = m
  }

  return (
    <div>
      <PageHeader eyebrow="Veterans Congress Standard" title="URO Compliance Dashboard" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="panel p-4 text-center">
          <div className="font-display text-3xl text-gold">{meetings.length}</div>
          <div className="eyebrow mt-1">Meetings Submitted</div>
        </div>
        <div className="panel p-4 text-center">
          <div className="font-display text-3xl text-status-attention">{missing.length}</div>
          <div className="eyebrow mt-1">Posts Missing Recent Minutes</div>
        </div>
        <div className="panel p-4 text-center">
          <div className="font-display text-3xl">{compliancePct}%</div>
          <div className="eyebrow mt-1">Fully Compliant</div>
        </div>
        <div className="panel p-4 text-center">
          <div className="font-display text-3xl text-status-attention">{nonCompliant}</div>
          <div className="eyebrow mt-1">Non-Compliant Meetings</div>
        </div>
      </div>

      <div className="panel p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="eyebrow">Meetings by Phase</div>
          <select className="input-field w-48" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {format(new Date(m + '-02'), 'MMMM yyyy')} URO
              </option>
            ))}
          </select>
        </div>
        {posts.length === 0 ? (
          <EmptyState title="No active posts yet" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {posts.map((post) => {
              const meeting = meetingsThisMonthByPost[post.id]
              return (
                <button
                  key={post.id}
                  onClick={() => meeting && navigate(`/meetings/uro/${meeting.id}/view`)}
                  disabled={!meeting}
                  className={`flex items-center justify-between border rounded-sm p-2.5 text-left text-sm ${
                    meeting ? 'border-hairline hover:border-gold cursor-pointer' : 'border-hairline opacity-60 cursor-default'
                  }`}
                >
                  <span>{post.name}</span>
                  {meeting ? (
                    <span className="flex items-center gap-1.5 text-xs text-status-active">
                      <CheckCircle2 size={14} /> Submitted
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-status-attention">
                      <XCircle size={14} /> Not Submitted
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-5">
          <div className="eyebrow mb-3">Compliance Breakdown</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Fully Compliant</span>
              <span className="font-mono text-status-active">{compliant}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Minor Issues</span>
              <span className="font-mono text-status-developing">{minor}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Non-Compliant</span>
              <span className="font-mono text-status-attention">{nonCompliant}</span>
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <div className="eyebrow mb-3">Posts Missing Recent Minutes (45+ days)</div>
          {missing.length === 0 ? (
            <p className="text-sm text-status-active">Every active post is current.</p>
          ) : (
            <div className="space-y-1.5">
              {missing.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="text-muted text-xs font-mono">
                    {lastMeetingByPost[p.id] ? `Last: ${format(new Date(lastMeetingByPost[p.id].meeting_date), 'MMM d')}` : 'Never submitted'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel p-5 mt-6">
        <div className="eyebrow mb-3">Recent Meetings</div>
        {meetings.length === 0 ? (
          <EmptyState title="No published meetings yet" />
        ) : (
          <div className="space-y-1.5">
            {meetings.slice(0, 15).map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/meetings/uro/${m.id}/view`)}
                className="w-full flex items-center justify-between border border-hairline hover:border-gold rounded-sm p-2.5 text-left text-sm"
              >
                <span>{m.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-mono">{format(new Date(m.meeting_date), 'MMM d, yyyy')}</span>
                  <StatusBadge
                    label={m.compliance_level ?? ''}
                    tone={m.compliance_level === 'fully_compliant' ? 'active' : m.compliance_level === 'minor_issues' ? 'developing' : 'attention'}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
