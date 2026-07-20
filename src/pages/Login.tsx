import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PostApplicationForm } from '@/components/forms/PostApplicationForm'
import { MembershipForm } from '@/pages/members/JoinCVOA'
import type { Post } from '@/lib/types'
import { useEffect } from 'react'
import { CheckCircle2, Flag, UserPlus, IdCard, LogIn } from 'lucide-react'

type Path = 'choose' | 'start_post' | 'join_existing' | 'member_only' | 'staff'

export default function Login() {
  const [searchParams] = useSearchParams()
  const [path, setPath] = useState<Path>(searchParams.get('login') === 'true' ? 'staff' : 'choose')
  const [submitted, setSubmitted] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    supabase
      .from('posts')
      .select('*')
      .eq('status', 'active_post')
      .order('name')
      .then(({ data }: any) => setPosts((data ?? []) as Post[]))
  }, [])

  return (
    <div className="min-h-screen bg-base px-4 py-16">
      <div className={`mx-auto ${path === 'choose' ? 'max-w-5xl' : 'max-w-md'}`}>
        <div className="text-center mb-10">
          <img src="/images/cvoa-logo.png" alt="CVOA" className="w-28 h-28 mx-auto mb-3" />
          <div className="eyebrow mt-1">Post Operating System</div>
        </div>

        {path === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <PillarCard
              icon={Flag}
              title="Start a New Post"
              subtitle="There isn't one in my area yet"
              onClick={() => setPath('start_post')}
            />
            <PillarCard
              icon={UserPlus}
              title="Join an Existing Post"
              subtitle="There's already a CVOA post near me"
              onClick={() => setPath('join_existing')}
            />
            <PillarCard
              icon={IdCard}
              title="Just Become a Member"
              subtitle="Not sure yet, or no local post"
              onClick={() => setPath('member_only')}
            />
            <PillarCard
              icon={LogIn}
              title="Log In"
              subtitle="Already have an account"
              onClick={() => setPath('staff')}
            />
          </div>
        )}

        {path !== 'choose' && (
          <div className="panel p-6">
            <button onClick={() => setPath('choose')} className="text-xs font-mono uppercase tracking-wide text-muted hover:text-gold mb-4">
              ← Back
            </button>

            {path === 'start_post' &&
              (submitted ? (
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
              ))}

            {(path === 'join_existing' || path === 'member_only') && (
              <MembershipForm mode={path} posts={posts} onBack={() => setPath('choose')} />
            )}

            {path === 'staff' && <StaffLoginForm />}
          </div>
        )}
      </div>
    </div>
  )
}

function PillarCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Flag
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="panel p-8 flex flex-col items-center text-center gap-4 hover:border-gold transition-colors group min-h-[220px]"
    >
      <div className="w-16 h-16 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
        <Icon className="text-gold" size={28} />
      </div>
      <div>
        <div className="font-display text-xl tracking-wide text-ink">{title}</div>
        <div className="text-xs text-muted mt-1.5">{subtitle}</div>
      </div>
    </button>
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
