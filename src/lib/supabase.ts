import { createClient } from '@supabase/supabase-js'
import { mockSupabase } from './mockClient'

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
    '[CVOA Post OS] Running in demo mode with local sample data — no Supabase project connected. ' +
      'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local to connect a real backend.'
  )
}

export const supabase: any = isDemoMode ? mockSupabase : createClient(url, anonKey)

