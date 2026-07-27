import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/lib/types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isNational: boolean
  isDelegate: boolean
  hasRole: (...roles: UserRole[]) => boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDelegate, setIsDelegate] = useState(false)

  useEffect(() => {
    console.log('[CVOA init] restoring session…')
    supabase
      .auth.getSession()
      .then(({ data }: any) => {
        console.log('[CVOA init] session restoration complete:', data.session ? 'session found' : 'no session')
        setSession(data.session)
        if (!data.session) setLoading(false)
      })
      .catch((err: unknown) => {
        // Without this, a rejected promise here (storage failure, network
        // hiccup, anything) leaves `loading` stuck at true forever — and
        // since the whole app, including the public login screen, is
        // gated behind that flag below, the result is an infinite loading
        // state instead of a blank crash. Same failure mode, different
        // shape — this closes it off entirely.
        console.error('[CVOA init] session restoration failed — proceeding as signed out:', err)
        setSession(null)
        setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, newSession: Session | null) => {
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
          const existingProfile = data as Profile
          // An existing account stuck at guest_applicant never got a
          // second chance before this — it was only ever checked once, at
          // the exact moment the account was first created. If that
          // check happened before payment cleared (the normal order of
          // events), it silently failed forever after. This retries it on
          // every login until it succeeds, so nothing stays stuck.
          if (existingProfile.role === 'guest_applicant') {
            await supabase.rpc('link_founding_team_profile')
            await supabase.rpc('link_member_profile')
            const { data: refreshed } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
            setProfile((refreshed as Profile) ?? existingProfile)
            setLoading(false)
            return
          }
          setProfile(existingProfile)
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

          // No pending signup record — most commonly because it was
          // already used up by an earlier attempt with this same email
          // (retesting, or a previous partial signup). Rather than leaving
          // the account permanently profile-less with no way to ever
          // recover, create a basic profile directly from what the
          // account itself already knows, then run the same linking.
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
              id: session.user.id,
              full_name: (session.user.user_metadata?.full_name as string | undefined) ?? email.split('@')[0],
              email,
              role: 'guest_applicant',
              post_id: null,
            })
            .select()
            .single()

          await supabase.rpc('link_founding_team_profile')
          await supabase.rpc('link_member_profile')
          const { data: refreshed } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
          setProfile((refreshed as Profile) ?? (newProfile as Profile) ?? null)
          setLoading(false)
          return
        }

        setProfile(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        // Same principle as the session-restoration catch above — a
        // rejection anywhere in this chain (any of the several awaited
        // Supabase calls) must never leave loading stuck at true forever.
        console.error('[CVOA init] profile resolution failed — proceeding without a profile:', err)
        setProfile(null)
        setLoading(false)
      })
  }, [session])

  const isNational = profile?.role === 'national_commander' || profile?.role === 'national_staff'

  useEffect(() => {
    if (!profile?.id) {
      setIsDelegate(false)
      return
    }
    // Exactly one delegate (and optionally an alternate) is designated per
    // post — this is what actually gates casting a formal Congress vote,
    // not just being any officer at that post.
    supabase
      .from('congress_delegates')
      .select('id')
      .eq('profile_id', profile.id)
      .then(({ data }) => setIsDelegate(!!data && data.length > 0))
  }, [profile?.id])

  function hasRole(...roles: UserRole[]) {
    return !!profile && roles.includes(profile.role)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  // Settings lets someone edit their own name/phone directly in the
  // `profiles` table — without this, the sidebar and everywhere else that
  // reads `profile` would keep showing the old value until their next
  // login, since nothing else re-triggers the initial profile fetch.
  async function refreshProfile() {
    if (!profile?.id) return
    const { data } = await supabase.from('profiles').select('*').eq('id', profile.id).single()
    if (data) setProfile(data as Profile)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, isNational, isDelegate, hasRole, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
