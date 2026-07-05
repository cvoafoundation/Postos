import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { PostApplicationForm } from '@/components/forms/PostApplicationForm'
import { ChevronDown, CheckCircle2 } from 'lucide-react'

export default function Login() {
  const [submitted, setSubmitted] = useState(false)
  const [staffOpen, setStaffOpen] = useState(false)

  return (
    <div className="min-h-screen bg-base px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <div className="font-display text-4xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-1 mb-6">Post Operating System</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-ink leading-tight">
            Start Your CVOA Post
          </h1>
          <p className="text-muted text-sm mt-3 max-w-md mx-auto">
            Tell us about yourself and your area. No call to National Headquarters required —
            this is the first step in the pipeline, and our team will follow up directly.
          </p>
        </div>

        <div className="panel p-6">
          {submitted ? (
            <div className="text-center py-8">
              <CheckCircle2 className="mx-auto mb-4 text-status-active" size={40} />
              <div className="font-display text-2xl tracking-wide mb-2">Application Received</div>
              <p className="text-sm text-muted max-w-sm mx-auto">
                Thank you for stepping up. National Staff reviews every inquiry — expect to hear
                from us soon about next steps.
              </p>
            </div>
          ) : (
            <PostApplicationForm onSubmitted={() => setSubmitted(true)} submitLabel="Submit Application" />
          )}
        </div>

        <div className="mt-10 pt-6 border-t border-hairline">
          <button
            onClick={() => setStaffOpen((v) => !v)}
            className="flex items-center justify-center gap-2 w-full text-xs font-mono uppercase tracking-wide text-muted hover:text-gold transition-colors"
          >
            Post Operating System — Staff Sign In
            <ChevronDown size={14} className={staffOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>

          {staffOpen && (
            <div className="mt-4 max-w-sm mx-auto">
              <StaffLoginForm />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StaffLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  return (
    <form onSubmit={handleSubmit} className="panel p-5 space-y-3">
      <div>
        <label className="eyebrow block mb-1.5">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field"
          placeholder="commander@cvoa.org"
        />
      </div>
      <div>
        <label className="eyebrow block mb-1.5">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-status-attention text-sm">{error}</p>}
      <button type="submit" disabled={loading} className="btn-ghost w-full disabled:opacity-50">
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}
