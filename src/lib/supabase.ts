import { createClient } from '@supabase/supabase-js'
import { mockSupabase } from './mockClient'
import { createSafeStorage } from './safeStorage'

console.log('[CVOA init] application initialization starting')

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Demo mode kicks in automatically whenever real Supabase credentials aren't
// set — no separate flag to remember to flip. Set both env vars (see
// .env.example) to connect a real project; removing them switches back to
// demo mode instantly.
export const isDemoMode = !url || !anonKey

if (isDemoMode) {
  // eslint-disable-next-line no-console
  console.info(
    '[CVOA.ONE SYSTEM] Running in demo mode with local sample data — no Supabase project connected. ' +
      'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local to connect a real backend.'
  )
}

// createClient() reads storage synchronously during its own construction.
// If that throws (Safari, cross-origin sandboxed iframe, storage blocked)
// and this isn't guarded, the whole module fails to evaluate — which,
// since main.tsx imports this before React ever renders, means a
// completely blank page with no error visible anywhere. Everything below
// exists so that can never happen: real client if possible, safe fallback
// storage if not, and if construction still somehow fails, demo mode
// rather than a dead app.
function createSupabaseClient(): any {
  if (isDemoMode) return mockSupabase

  try {
    const { storage, diagnostics } = createSafeStorage()
    console.log('[CVOA init] storage diagnostics:', diagnostics)

    const client = createClient(url, anonKey, {
      auth: {
        storage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    console.log('[CVOA init] Supabase client created successfully')
    return client
  } catch (err) {
    console.error('[CVOA init] Supabase client creation failed — falling back to demo mode so the app can still render:', err)
    return mockSupabase
  }
}

export const supabase: any = createSupabaseClient()

