export interface AuthEmailPayload {
  user: { id: string; email: string; new_email?: string; user_metadata?: { full_name?: string } }
  email_data: { email_action_type: string; token_hash?: string; token_hash_new?: string; token?: string; token_new?: string; redirect_to?: string; old_email?: string; old_phone?: string; provider?: string; factor_type?: string }
}
export interface AuthMessage { to: string; subject: string; text: string; action?: string; link?: string; welcome?: 'signup' | 'invitation' }
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function authMessages(payload: AuthEmailPayload, supabaseUrl: string, siteUrl: string): AuthMessage[] {
  const { user, email_data: email } = payload
  const validEmail = (value: unknown): value is string => typeof value === 'string' && /^[^\s<>\r\n]+@[^\s<>\r\n]+\.[^\s<>\r\n]+$/.test(value)
  if (!validEmail(user.email)) throw new Error('Invalid recipient')
  const action = email.email_action_type
  const verificationLink = (hash: string | undefined, type = action) => {
    if (!hash || !/^[a-zA-Z0-9_-]+$/.test(hash)) throw new Error('Missing verification token')
    const link = new URL('/auth/v1/verify', supabaseUrl)
    link.searchParams.set('token', hash)
    link.searchParams.set('type', type)
    // Auth supplies the allowlisted redirect. Reject external redirects even
    // if a signed hook contains an accidentally permissive Auth setting.
    const site = new URL(siteUrl)
    let redirect = new URL(action === 'invite' || action === 'recovery' ? '/set-password' : '/', site)
    if (email.redirect_to) {
      const requested = new URL(email.redirect_to)
      if (requested.origin === site.origin && requested.protocol === 'https:') redirect = requested
    }
    link.searchParams.set('redirect_to', redirect.href)
    return link.href
  }
  if (action === 'email_change') {
    if (!validEmail(user.new_email)) throw new Error('Missing new email')
    const result: AuthMessage[] = []
    // Supabase's hash naming is reversed: _new goes to the current address.
    if (email.token_hash_new) result.push({ to: user.email, subject: 'Confirm your CVOA.ONE email change', text: 'Confirm the change of your account email address. If you did not request this, contact CVOA staff.', action: 'Confirm email change', link: verificationLink(email.token_hash_new) })
    result.push({ to: user.new_email, subject: 'Confirm your new CVOA.ONE email address', text: 'Confirm this address for your CVOA.ONE account. If you did not request this, ignore this email.', action: 'Confirm new email', link: verificationLink(email.token_hash) })
    return result
  }
  const templates: Record<string, { subject: string; text: string; action: string; welcome?: 'signup' | 'invitation' }> = {
    signup: { subject: 'Welcome to CVOA | Confirm your account', text: 'Confirm your email address, then sign in using the password you chose. Your personalized welcome letter and getting started guide are attached. Membership payment and verification are tracked separately in My Membership.', action: 'Confirm my email', welcome: 'signup' },
    invite: { subject: 'Welcome to CVOA | Set up your account', text: 'Set your password to access CVOA.ONE. Your personalized welcome letter and getting started guide are attached.', action: 'Set my password', welcome: 'invitation' },
    recovery: { subject: 'Reset your CVOA.ONE password', text: 'Use the link below to reset your password. If you did not request this, ignore this email.', action: 'Reset my password' },
    magiclink: { subject: 'Sign in to CVOA.ONE', text: 'Use the link below to sign in. Keep this link private. If you did not request it, ignore this email.', action: 'Sign in' },
  }
  const template = templates[action]
  if (template) return [{ to: user.email, ...template, link: verificationLink(email.token_hash) }]
  if (action === 'reauthentication') {
    if (!email.token || !/^\d{6,10}$/.test(email.token)) throw new Error('Missing verification code')
    return [{ to: user.email, subject: 'Your CVOA.ONE verification code', text: `Your verification code is ${email.token}. Keep it private. If you did not request it, ignore this email.` }]
  }
  const notifications: Record<string, string> = {
    password_changed: 'Your account password was changed.',
    email_changed: 'Your account email address was changed.',
    phone_changed: 'Your account phone number was changed.',
    mfa_factor_enrolled: 'A multi-factor authentication method was added to your account.',
    mfa_factor_unenrolled: 'A multi-factor authentication method was removed from your account.',
    identity_linked: 'A sign-in identity was linked to your account.',
    identity_unlinked: 'A sign-in identity was removed from your account.',
  }
  if (!notifications[action]) throw new Error('Unsupported authentication email')
  return [{ to: user.email, subject: 'CVOA.ONE account security notice', text: `${notifications[action]} If you did not make this change, contact CVOA staff immediately.` }]
}
