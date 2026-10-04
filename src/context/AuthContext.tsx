import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/lib/types'
import type { AccessScope } from '@/lib/access'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isNational: boolean
  isDelegate: boolean
  scopes: AccessScope[]
  selectedScope: string
  accessSuspended: boolean
  accessError: string | null
  selectWorkspace: (scope: string) => Promise<void>
  hasRole: (...roles: UserRole[]) => boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [baseProfile, setProfile] = useState<Profile | null>(null)
  const [scopes, setScopes] = useState<AccessScope[]>([])
  const [selectedScope, setSelectedScope] = useState('primary')
  const [accessSuspended, setAccessSuspended] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [accessLoading, setAccessLoading] = useState(false)
  const selected = scopes.find(s => s.scope_id === selectedScope)
  const profile = baseProfile && selected ? { ...baseProfile, role: selected.role, post_id: selected.post_id, state: selected.state, title: selected.title } : baseProfile
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
    let active = true
    const applyProfile = (value: Profile | null) => { if (active) setProfile(value) }
    const finishLoading = () => { if (active) setLoading(false) }
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
            applyProfile((refreshed as Profile) ?? existingProfile)
            finishLoading()
            return
          }
          applyProfile(existingProfile)
          finishLoading()
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
            const { data: refreshed } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
            applyProfile((refreshed as Profile) ?? (newProfile as Profile) ?? null)
            finishLoading()
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
          applyProfile((refreshed as Profile) ?? (newProfile as Profile) ?? null)
          finishLoading()
          return
        }

        applyProfile(null)
        finishLoading()
      })
      .catch((err: unknown) => {
        // Same principle as the session-restoration catch above — a
        // rejection anywhere in this chain (any of the several awaited
        // Supabase calls) must never leave loading stuck at true forever.
        console.error('[CVOA init] profile resolution failed — proceeding without a profile:', err)
        applyProfile(null)
        finishLoading()
      })
    return () => { active = false }
    // Token refreshes retain the same identity and do not require reloading the profile.
  }, [session?.user.id])

  const isNational = !accessSuspended && (baseProfile?.role === 'national_commander' || baseProfile?.role === 'national_staff')

  useEffect(() => {
    let active = true
    setScopes([])
    setIsDelegate(false)
    setAccessError(null)
    if (!baseProfile?.id) { setAccessSuspended(false); return }
    setAccessLoading(true)
    void supabase.rpc('cvoa_my_access').then(({ data, error }) => {
      if (!active) return
      if (error) { setAccessError(error.message); return }
      const access = data as { scopes: AccessScope[]; selected: string | null; suspended: boolean }
      setScopes(access.scopes)
      setSelectedScope(access.selected ?? 'primary')
      setAccessSuspended(access.suspended)
    }).catch((error: unknown) => { if (active) setAccessError(error instanceof Error ? error.message : 'Could not verify access.') })
      .finally(() => { if (active) setAccessLoading(false) })
    return () => { active = false }
  }, [baseProfile?.id, baseProfile?.role, baseProfile?.post_id, baseProfile?.state])

  useEffect(() => {
    setIsDelegate(!accessSuspended && scopes.some(s => s.source === 'Congress designation' && s.post_id === profile?.post_id && s.title !== 'Alternate delegate'))
  }, [scopes, profile?.post_id, accessSuspended])

  async function selectWorkspace(scope: string) {
    const { error } = await supabase.rpc('cvoa_select_workspace', { p_scope: scope })
    if (error) throw new Error(error.message)
    setSelectedScope(scope)
  }

  function hasRole(...roles: UserRole[]) {
    return !accessSuspended && !!profile && roles.includes(profile.role)
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
    <AuthContext.Provider value={{ session, profile, loading: loading || accessLoading, isNational, isDelegate, scopes, selectedScope, accessSuspended, accessError, selectWorkspace, hasRole, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
