/** Navigation organization only. Sidebar's role filtering remains authoritative. */
export function navigationGroup(path: string): string | null {
  if (['/', '/operations'].includes(path)) return null
  if (['/settings', '/my-membership', '/membership-verification', '/member-home', '/my-applications'].some(base => path === base || path.startsWith(`${base}/`))) return 'personal'
  if (['/applications', '/vetting', '/state', '/health', '/post-development', '/toolkit', '/post-overview', '/post-records', '/build-a-post'].some(base => path === base || path.startsWith(`${base}/`))) return 'posts'
  if (['/members', '/users', '/directory', '/membership-review', '/recruiting', '/role-applications', '/post-members', '/post-officers'].some(base => path === base || path.startsWith(`${base}/`))) return 'people'
  if (['/meetings', '/schedlr', '/congress', '/file-complaint', '/ethics-tribunal'].some(base => path === base || path.startsWith(`${base}/`))) return 'governance'
  if (['/sponsors', '/drive', '/shared-files'].some(base => path === base || path.startsWith(`${base}/`))) return 'resources'
  return null
}
