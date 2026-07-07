import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/lib/types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isNational: boolean
  hasRole: (...roles: UserRole[]) => boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) return
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(async ({ data }) => {
        if (data) {
          setProfile(data as Profile)
          setLoading(false)
          return
        }

        // No profile yet — check whether this email has a pending signup
        // staged (from a founding-team invite, etc.) and finish creating
        // their profile now that they have a real session. This is what
        // makes self-serve account creation work regardless of whether
        // Supabase required email confirmation before this moment.
        const email = session.user.email
        if (email) {
          const { data: pending } = await supabase
            .from('pending_profile_signups')
            .select('*')
            .eq('email', email)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (pending) {
            // Real access is NOT granted here — the account is created with
            // no post and the lowest-privilege role. National verifying
            // this person's DD214 (a step they already do) is what actually
            // activates real access, via a database trigger.
            const { data: newProfile } = await supabase
              .from('profiles')
              .insert({
                id: session.user.id,
                full_name: pending.full_name,
                email,
                role: 'guest_applicant',
                post_id: null,
              })
              .select()
              .single()

            // Link this account to their founding team roster row (if any)
            // and their member roster row (if any) so the relevant
            // verification/payment-triggered promotion can find and
            // activate it later. Both are safe no-ops if there's no match.
            await supabase.rpc('link_founding_team_profile')
            await supabase.rpc('link_member_profile')

            await supabase.from('pending_profile_signups').delete().eq('id', pending.id)
            setProfile((newProfile as Profile) ?? null)
            setLoading(false)
            return
          }
        }

        setProfile(null)
        setLoading(false)
      })
  }, [session])

  const isNational = profile?.role === 'national_commander' || profile?.role === 'national_staff'

  function hasRole(...roles: UserRole[]) {
    return !!profile && roles.includes(profile.role)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, isNational, hasRole, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
