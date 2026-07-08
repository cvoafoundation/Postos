import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
    "in your .env file (local) and in your Vercel project settings (production)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // keeps the login saved in the browser across visits
    autoRefreshToken: true, // silently renews the session so it doesn't expire while the tab is open
    detectSessionInUrl: true, // needed for email-confirmation links and Google sign-in redirects
  },
});
export { supabaseUrl };
