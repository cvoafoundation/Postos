import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, FileCheck, Loader2 } from 'lucide-react'

const US_BRANCHES = ['Army', 'Navy', 'Air Force', 'Marine Corps', 'Coast Guard', 'Space Force']

export function PostApplicationForm({
  onSubmitted,
  submitLabel = 'Submit Application',
}: {
  onSubmitted: () => void
  submitLabel?: string
}) {
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

  const [dd214File, setDd214File] = useState<File | null>(null)
  const [dd214Path, setDd214Path] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large — please keep it under 10MB.')
      return
    }

    setDd214File(file)
    setUploading(true)
    const path = `${crypto.randomUUID()}-${file.name}`
    const { data, error } = await supabase.storage.from('dd214-uploads').upload(path, file)
    setUploading(false)

    if (error) {
      setUploadError(error.message)
      setDd214File(null)
      return
    }
    setDd214Path(data?.path ?? path)
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
      dd214_storage_path: dd214Path,
      dd214_uploaded_at: dd214Path ? new Date().toISOString() : null,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    onSubmitted()
  }

  const canFillOutRest = !!dd214Path

  return (
    <div className="space-y-5">
      <div>
        <label className="eyebrow block mb-2">Step 1 — Upload your DD214</label>
        <p className="text-xs text-muted mb-3">
          We can't begin reviewing an application without this. Your file is stored privately
          and is only visible to National Staff.
        </p>

        {!dd214Path ? (
          <label
            className={`flex flex-col items-center justify-center gap-2 border border-dashed rounded-sm p-6 cursor-pointer transition-colors ${
              uploadError ? 'border-status-attention' : 'border-hairline hover:border-gold'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="animate-spin text-gold" size={22} />
                <span className="text-sm text-muted">Uploading {dd214File?.name}…</span>
              </>
            ) : (
              <>
                <Upload className="text-muted" size={22} />
                <span className="text-sm text-muted">Click to upload PDF, JPG, or PNG (max 10MB)</span>
              </>
            )}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        ) : (
          <div className="flex items-center gap-3 border border-status-active/40 bg-status-active/10 rounded-sm p-3">
            <FileCheck className="text-status-active shrink-0" size={20} />
            <div className="text-sm text-ink truncate">{dd214File?.name}</div>
            <button
              type="button"
              onClick={() => {
                setDd214Path(null)
                setDd214File(null)
              }}
              className="ml-auto text-xs text-muted hover:text-gold shrink-0"
            >
              Replace
            </button>
          </div>
        )}
        {uploadError && <p className="text-status-attention text-sm mt-2">{uploadError}</p>}
      </div>

      <fieldset disabled={!canFillOutRest} className={!canFillOutRest ? 'opacity-40 pointer-events-none' : ''}>
        <div className="mb-2 eyebrow">Step 2 — Your information</div>
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

          <button type="submit" disabled={submitting || !canFillOutRest} className="btn-gold w-full disabled:opacity-50">
            {submitting ? 'Submitting…' : submitLabel}
          </button>
        </form>
      </fieldset>
    </div>
  )
}
