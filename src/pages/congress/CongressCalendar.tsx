import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { CongressSubNav } from './CongressSubNav'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { CalendarEventType, CongressCalendarEvent } from '@/lib/types'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'

const EVENT_LABELS: Record<CalendarEventType, string> = {
  hearing: 'Hearing',
  vote: 'Vote',
  deadline: 'Deadline',
  committee_meeting: 'Committee Meeting',
  national_meeting: 'National Meeting',
  session: 'Session',
}

export default function CongressCalendar() {
  const { isNational } = useAuth()
  const [events, setEvents] = useState<CongressCalendarEvent[]>([])
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    const { data } = await supabase.from('congress_calendar_events').select('*').order('event_date', { ascending: true })
    setEvents((data ?? []) as CongressCalendarEvent[])
  }

  useEffect(() => {
    load()
  }, [])

  const upcoming = events.filter((e) => new Date(e.event_date).getTime() >= Date.now())
  const past = events.filter((e) => new Date(e.event_date).getTime() < Date.now())

  return (
    <div>
      <PageHeader
        eyebrow="Module 8"
        title="Veterans Congress"
        action={
          isNational ? (
            <button onClick={() => setShowAdd(true)} className="btn-gold flex items-center gap-2">
              <Plus size={16} /> Add Event
            </button>
          ) : undefined
        }
      />
      <CongressSubNav />

      <div className="panel p-4 mb-6">
        <div className="eyebrow mb-3">Upcoming</div>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing scheduled" />
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <div key={e.id} className="flex items-center justify-between border border-hairline rounded-sm p-3">
                <div>
                  <div className="text-sm font-medium">{e.title}</div>
                  {e.description && <div className="text-xs text-muted mt-0.5">{e.description}</div>}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <StatusBadge label={EVENT_LABELS[e.event_type]} tone="developing" />
                  <div className="font-mono text-[11px] text-muted mt-1">{format(new Date(e.event_date), 'MMM d, yyyy p')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="panel p-4">
          <div className="eyebrow mb-3">Past</div>
          <div className="space-y-2">
            {past.map((e) => (
              <div key={e.id} className="flex items-center justify-between border border-hairline/50 rounded-sm p-3 opacity-60">
                <div className="text-sm">{e.title}</div>
                <div className="font-mono text-[11px] text-muted">{format(new Date(e.event_date), 'MMM d, yyyy')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <AddEventModal
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function AddEventModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ title: '', event_type: 'session' as CalendarEventType, event_date: '', description: '' })
  const [saving, setSaving] = useState(false)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('congress_calendar_events').insert({
      title: form.title,
      event_type: form.event_type,
      event_date: new Date(form.event_date).toISOString(),
      description: form.description || null,
    })
    setSaving(false)
    onAdded()
  }

  return (
    <Modal title="Add Calendar Event" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input required placeholder="Title" className="input-field" value={form.title} onChange={(e) => update('title', e.target.value)} />
        <select className="input-field" value={form.event_type} onChange={(e) => update('event_type', e.target.value as CalendarEventType)}>
          {(Object.keys(EVENT_LABELS) as CalendarEventType[]).map((t) => (
            <option key={t} value={t}>
              {EVENT_LABELS[t]}
            </option>
          ))}
        </select>
        <input required type="datetime-local" className="input-field" value={form.event_date} onChange={(e) => update('event_date', e.target.value)} />
        <textarea placeholder="Description" className="input-field" rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} />
        <button type="submit" disabled={saving} className="btn-gold w-full disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Event'}
        </button>
      </form>
    </Modal>
  )
}
