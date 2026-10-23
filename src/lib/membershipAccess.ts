/** Minimal membership workspace; role-based Congress permissions still apply. */
export function isMembershipPath(path: string): boolean {
  return /^\/broadcast-rsvp\/[a-f0-9-]{36}\/?$/.test(path) || ['/settings', '/membership-verification', '/my-membership', '/file-complaint', '/congress', '/congress/delegates'].includes(path.replace(/\/$/, '')) || /^\/congress\/resolutions\/[^/]+\/?$/.test(path)
}
