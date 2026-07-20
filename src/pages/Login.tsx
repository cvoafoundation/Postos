import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PostApplicationForm } from '@/components/forms/PostApplicationForm'
import { ChevronDown, CheckCircle2, Flag, UserPlus, KeyRound } from 'lucide-react'

type Section = 'start_post' | 'join_post' | 'staff' | null

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [open, setOpen] = useState<Section>(searchParams.get('login') === 'true' ? 'staff' : null)
  const [submitted, setSubmitted] = useState(false)

  function toggle(section: Section) {
    setOpen((current) => (current === section ? null : section))
  }

  return (
    <div className="min-h-screen bg-base px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <div className="font-display text-4xl tracking-wide text-gold">CVOA</div>
          <div className="eyebrow mt-1">Post Operating System</div>
        </div>

        <div className="space-y-3">
          {/* 1. Start Your Own CVOA Post */}
          <div className="panel overflow-hidden">
            <button
              onClick={() => toggle('start_post')}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-surface/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Flag className="text-gold" size={20} />
                <div>
                  <div className="font-display text-xl tracking-wide">Start Your Own CVOA Post</div>
                  <div className="text-xs text-muted mt-0.5">No post near you yet? Begin the application here.</div>
                </div>
              </div>
              <ChevronDown size={18} className={`text-muted transition-transform ${open === 'start_post' ? 'rotate-180' : ''}`} />
            </button>
            {open === 'start_post' && (
              <div className="p-5 pt-0">
                {submitted ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="mx-auto mb-4 text-status-active" size={40} />
                    <div className="font-display text-2xl tracking-wide mb-2">Application Received</div>
                    <p className="text-sm text-muted max-w-sm mx-auto">
                      Thank you for stepping up. National Staff reviews every inquiry — expect to hear from us soon
                      about next steps.
                    </p>
                  </div>
                ) : (
                  <PostApplicationForm onSubmitted={() => setSubmitted(true)} submitLabel="Submit Application" />
                )}
              </div>
            )}
          </div>

          {/* 2. Join an Existing Post */}
          <div className="panel overflow-hidden">
            <button
              onClick={() => navigate('/join')}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-surface/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <UserPlus className="text-gold" size={20} />
                <div>
                  <div className="font-display text-xl tracking-wide">Join an Existing Post</div>
                  <div className="text-xs text-muted mt-0.5">Already have a CVOA post nearby? Become a member.</div>
                </div>
              </div>
              <ChevronDown size={18} className="text-muted -rotate-90" />
            </button>
          </div>

          {/* 3. Staff Sign In */}
          <div className="panel overflow-hidden">
            <button
              onClick={() => toggle('staff')}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-surface/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <KeyRound className="text-gold" size={20} />
                <div>
                  <div className="font-display text-xl tracking-wide">Staff Sign In</div>
                  <div className="text-xs text-muted mt-0.5">Already have an account with CVOA Post OS?</div>
                </div>
              </div>
              <ChevronDown size={18} className={`text-muted transition-transform ${open === 'staff' ? 'rotate-180' : ''}`} />
            </button>
            {open === 'staff' && (
              <div className="p-5 pt-0">
                <StaffLoginForm />
              </div>
            )}
          </div>
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
    <form onSubmit={handleSubmit} className="space-y-3">
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
      <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-50">
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}
