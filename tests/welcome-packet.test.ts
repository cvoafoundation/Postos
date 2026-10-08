import { PDFDocument } from 'npm:pdf-lib@1.17.1'
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { createWelcomeLetter, welcomeAttachments } from '../supabase/functions/_shared/welcome/packet.ts'
import { authMessages, AuthEmailPayload } from '../supabase/functions/_shared/welcome/auth-email.ts'

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const payload = (action: string): AuthEmailPayload => ({ user: { id: 'test-user', email: 'member@example.test', new_email: 'new@example.test' }, email_data: { email_action_type: action, token_hash: 'currenthash', redirect_to: 'https://www.cvoa.one/' } })
const url = 'https://mvlhtuoukhorxmmibruc.supabase.co'
const site = 'https://www.cvoa.one'

Deno.test('personalized letter is a valid one-page PDF and the approved guide has four pages', async () => {
  const attachments = await welcomeAttachments({ full_name: 'Alex Morgan', membership_type: 'lifetime' }, 'invitation')
  assert(attachments.length === 2, 'Exactly two attachments, no membership card')
  const letter = await PDFDocument.load(attachments[0].content)
  assert(letter.getPageCount() === 1, 'Standard welcome letter should fit one page')
  assert(letter.getTitle()?.includes('Alex Morgan'), 'Letter is personalized')
  const guide = await PDFDocument.load(attachments[1].content)
  assert(guide.getPageCount() === 4, 'Preserve approved four-page guide')
})
Deno.test('Unicode names and long mailing addresses produce valid PDFs', async () => {
  for (const name of ['José O’Neill', 'Zoë Müller', '李明', 'A'.repeat(200)]) {
    const bytes = await createWelcomeLetter({ full_name: name, address: '123 Long Mailing Address\nSuite 42\nIndianapolis, Indiana 46201', membership_type: 'annual' }, 'signup', new Date('2026-10-09T01:00:00Z'))
    const pdf = await PDFDocument.load(bytes)
    assert(pdf.getPageCount() >= 1, 'Readable PDF')
    assert(pdf.getTitle()?.includes(name), 'Full name preserved')
  }
})
Deno.test('signup and invite attach packet; password recovery and magic links do not', () => {
  for (const action of ['signup', 'invite']) {
    const [mail] = authMessages(payload(action), url, site)
    assert(mail.welcome, 'Welcome packet included')
    const link = new URL(mail.link!)
    assert(link.origin === url && link.searchParams.get('type') === action, 'Correct Auth verification endpoint')
  }
  for (const action of ['recovery', 'magiclink', 'password_changed']) assert(!authMessages(payload(action), url, site)[0].welcome, 'No onboarding attachments on unrelated email')
})
Deno.test('secure email change sends the correct reversed token hashes to each address', () => {
  const input = payload('email_change')
  input.email_data.token_hash_new = 'oldaddresshash'
  const messages = authMessages(input, url, site)
  assert(messages.length === 2, 'Both addresses notified')
  assert(messages[0].to === input.user.email && new URL(messages[0].link!).searchParams.get('token') === 'oldaddresshash', 'Current address gets token_hash_new')
  assert(messages[1].to === input.user.new_email && new URL(messages[1].link!).searchParams.get('token') === 'currenthash', 'New address gets token_hash')
  assert(!messages.some(mail => mail.welcome), 'No packet on email changes')
})
Deno.test('external redirects and header-injection recipients are rejected or replaced', () => {
  const input = payload('signup')
  input.email_data.redirect_to = 'https://attacker.example/'
  const redirect = new URL(authMessages(input, url, site)[0].link!).searchParams.get('redirect_to')!
  assert(new URL(redirect).origin === site, 'Redirect remains on CVOA.ONE')
  input.user.email = 'member@example.test\r\nBcc: other@example.test'
  let rejected = false
  try { authMessages(input, url, site) } catch { rejected = true }
  assert(rejected, 'Invalid recipients cannot inject headers')
})
Deno.test('Standard Webhooks verifies signed payloads and rejects tampering', () => {
  const hook = new Webhook(btoa('a'.repeat(32)))
  const body = JSON.stringify(payload('signup'))
  const now = new Date()
  const headers = { 'webhook-id': 'test-hook', 'webhook-timestamp': Math.floor(now.getTime() / 1000).toString(), 'webhook-signature': hook.sign('test-hook', now, body) }
  hook.verify(body, headers)
  let rejected = false
  try { hook.verify(body.replace('member@', 'someone@'), headers) } catch { rejected = true }
  assert(rejected, 'Tampered hooks cannot send emails')
})
