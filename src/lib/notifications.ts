import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// The 5 sections that get a badge. Keys here must exactly match the
// `section` values produced by get_notification_counts() in Supabase.
export type NotificationSection = 'applications' | 'dd214_review' | 'role_applications' | 'meetings' | 'membership_roster'

// Fired once the database write actually finishes — the sidebar listens
// for this rather than just re-checking on every navigation, since a
// navigation-triggered refetch would race the write itself and could grab
// the old count right before it updates.
const VIEWED_EVENT = 'cvoa:notification-viewed'

// Call this once from the top of any page that should clear its own badge
// the moment someone opens it — matches "clears on open" rather than
// "clears only once resolved".
export function useMarkNotificationViewed(section: NotificationSection) {
  useEffect(() => {
    supabase.rpc('mark_notification_viewed', { p_section: section }).then(() => {
      window.dispatchEvent(new Event(VIEWED_EVENT))
    })
  }, [section])
}

export function useOnNotificationViewed(callback: () => void) {
  useEffect(() => {
    window.addEventListener(VIEWED_EVENT, callback)
    return () => window.removeEventListener(VIEWED_EVENT, callback)
  }, [callback])
}
