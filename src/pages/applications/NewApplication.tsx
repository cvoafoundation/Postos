import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'

const US_BRANCHES = ['Army', 'Navy', 'Air Force', 'Marine Corps', 'Coast Guard', 'Space Force']

export function NewApplicationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    military_branch: US_BRANCHES[0],
    years_served: '',
    combat_service: false,
    leadership_experience: '',
    existing_veteran_network: '',
    estimated_membership_potential: '',
    motivation: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('post_applications').insert({
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      city: form.city || null,
      state: form.state,
      military_branch: form.military_branch,
      years_served: form.years_served ? Number(form.years_served) : null,
      combat_service: form.combat_service,
      leadership_experience: form.leadership_experience || null,
      existing_veteran_network: form.existing_veteran_network || null,
      estimated_membership_potential: form.estimated_membership_potential
        ? Number(form.estimated_membership_potential)
        : null,
      motivation: form.motivation || null,
      status: 'new_inquiry',
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    onCreated()
  }

  return (
    <Modal title="New Post Application" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          required
          placeholder="Full name"
          className="input-field"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            type="email"
            placeholder="Email"
            className="input-field"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
          <input
            placeholder="Phone"
            className="input-field"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="City"
            className="input-field"
            value={form.city}
            onChange={(e) => update('city', e.target.value)}
          />
          <input
            required
            placeholder="State (e.g. MT)"
            className="input-field"
            maxLength={2}
            value={form.state}
            onChange={(e) => update('state', e.target.value.toUpperCase())}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select
            className="input-field"
            value={form.military_branch}
            onChange={(e) => update('military_branch', e.target.value)}
          >
            {US_BRANCHES.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder="Years served"
            className="input-field"
            value={form.years_served}
            onChange={(e) => update('years_served', e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={form.combat_service}
            onChange={(e) => update('combat_service', e.target.checked)}
          />
          Combat service
        </label>
        <textarea
          placeholder="Leadership experience"
          className="input-field"
          rows={2}
          value={form.leadership_experience}
          onChange={(e) => update('leadership_experience', e.target.value)}
        />
        <textarea
          placeholder="Existing veteran network in your area"
          className="input-field"
          rows={2}
          value={form.existing_veteran_network}
          onChange={(e) => update('existing_veteran_network', e.target.value)}
        />
        <input
          type="number"
          min={0}
          placeholder="Estimated membership potential"
          className="input-field"
          value={form.estimated_membership_potential}
          onChange={(e) => update('estimated_membership_potential', e.target.value)}
        />
        <textarea
          required
          placeholder="Why do you want to start a post?"
          className="input-field"
          rows={3}
          value={form.motivation}
          onChange={(e) => update('motivation', e.target.value)}
        />

        {error && <p className="text-status-attention text-sm">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-gold w-full disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit Application'}
        </button>
      </form>
    </Modal>
  )
}
