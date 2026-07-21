import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// The 5 sections that get a badge. Keys here must exactly match the
// `section` values produced by get_notification_counts() in Supabase.
export type NotificationSection = 'applications' | 'dd214_review' | 'role_applications' | 'meetings' | 'membership_roster'

// Call this once from the top of any page that should clear its own badge
// the moment someone opens it — matches "clears on open" rather than
// "clears only once resolved".
export function useMarkNotificationViewed(section: NotificationSection) {
  useEffect(() => {
    supabase.rpc('mark_notification_viewed', { p_section: section })
  }, [section])
}
