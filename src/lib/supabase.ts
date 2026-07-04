import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[CVOA Post OS] Missing Supabase env vars. Copy .env.example to .env.local and fill in your project values.'
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')
