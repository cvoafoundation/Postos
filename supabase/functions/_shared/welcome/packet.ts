import { PDFDocument, PDFFont, PDFPage, rgb } from 'npm:pdf-lib@1.17.1'
import { Buffer } from 'node:buffer'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import guide from './guide.ts'
import logo from './logo.ts'
import serif from './serif.ts'
import serifBold from './serifBold.ts'

export interface WelcomeRecipient {
  full_name: string
  address?: string | null
  membership_type?: string | null
}
export type WelcomeMode = 'invitation' | 'signup' | 'membership'
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()

function lines(text: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    // Split unusually long names/addresses too, rather than drawing off-page.
    let part = ''
    for (const char of word) {
      if (font.widthOfTextAtSize(part + char, size) > width && part) {
        if (line) { result.push(line); line = '' }
        result.push(part); part = ''
      }
      part += char
    }
    const next = line ? `${line} ${part}` : part
    if (font.widthOfTextAtSize(next, size) > width && line) {
      result.push(line); line = part
    } else line = next
  }
  if (line) result.push(line)
  return result
}

export async function createWelcomeLetter(recipient: WelcomeRecipient, mode: WelcomeMode, now = new Date()) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const [regular, bold, seal] = await Promise.all([
    pdf.embedFont(decode(serif), { subset: true }),
    pdf.embedFont(decode(serifBold), { subset: true }),
    pdf.embedPng(decode(logo)),
  ])
  const name = clean(recipient.full_name).slice(0, 200) || 'CVOA Member'
  pdf.setTitle(`CVOA Welcome Letter | ${name}`)
  pdf.setAuthor('Combat Veterans of America')
  pdf.setCreationDate(now)
  let page: PDFPage = pdf.addPage([612, 792])
  const draw = (text: string, x: number, y: number, font = regular, size = 10.5) =>
    page.drawText(text, { x, y, font, size, color: rgb(0, 0, 0) })
  const rule = (y: number) => page.drawLine({ start: { x: 36, y }, end: { x: 576, y }, thickness: 1.5 })
  draw(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Indiana/Indianapolis', year: 'numeric', month: 'long', day: 'numeric' }).format(now), 48, 760)
  page.drawImage(seal, { x: 263, y: 665, width: 86, height: 86 })
  rule(653)
  draw('To:', 48, 632, bold)
  let y = 632
  for (const line of lines(name, bold, 10.5, 216)) { draw(line, 80, y, bold); y -= 15 }
  if (recipient.address) {
    for (const paragraph of recipient.address.slice(0, 500).split(/\r?\n/)) {
      for (const line of lines(clean(paragraph), bold, 10.5, 216)) { draw(line, 80, y, bold); y -= 15 }
    }
  }
  const subject = recipient.membership_type === 'lifetime' ? 'LIFETIME MEMBERSHIP' : recipient.membership_type === 'annual' ? 'ANNUAL MEMBERSHIP' : 'WELCOME TO CVOA.ONE'
  draw(`RE: ${subject}`, 308, 632, bold, 9.5)
  y = Math.min(560, y - 20)
  const nextPage = () => {
    page = pdf.addPage([612, 792])
    page.drawImage(seal, { x: 282, y: 726, width: 48, height: 48 })
    y = 694
  }
  const paragraph = (text: string, font = regular) => {
    const wrapped = lines(text, font, 10.5, 516)
    if (y - wrapped.length * 14.5 < 210) nextPage()
    for (const line of wrapped) { draw(line, 48, y - 10.5, font); y -= 14.5 }
    y -= 13
  }
  paragraph(`Dear ${name.split(' ')[0]}:`, bold)
  paragraph('Welcome to Combat Veterans of America. We are glad you are here.')
  paragraph('CVOA is built around leadership, purpose, and community. Our vision is to bring veterans together through local posts that create opportunities to serve, learn, connect, and help one another move forward.')
  paragraph('Your experience matters here. Whether you want to volunteer, develop your leadership, help build a local post, or simply connect with fellow veterans, there is a place for you in this organization.')
  paragraph(mode === 'invitation'
    ? 'To get started, use the activation button in your welcome email to set your password. Then sign in to CVOA.ONE to review your membership information and explore your next steps. If you already have an account, sign in with your existing credentials.'
    : mode === 'signup'
    ? 'To get started, use the confirmation button in your welcome email to confirm your email address. Then sign in to CVOA.ONE with the password you chose to review your membership information and explore your next steps. If you already have an account, sign in with your existing credentials.'
    : 'To get started, sign in to CVOA.ONE with your existing credentials to review your membership information and explore your next steps. If you have not created an account, contact CVOA staff for an activation link. Keep this letter and the getting started guide for your records.')
  paragraph('If you have a local post, introduce yourself to its leadership and ask about the next meeting. If there is no post near you, CVOA.ONE can help you explore affiliation options or begin the process of starting one.')
  paragraph('Thank you for choosing to be part of CVOA. I look forward to what we can build together.')
  if (y < 235) nextPage()
  draw('Respectfully:', 48, y - 9)
  draw('Brandon Michael Barron', 48, y - 38, bold)
  for (const [i, line] of ['National Commander', 'Combat Veterans of America', 'combatvetsofamerica.org'].entries()) draw(line, 48, y - 65 - i * 14)
  rule(105)
  for (const [offset, text] of ['COMBAT VETERANS OF AMERICA', 'combatvetsofamerica.org | cvoa.one'].entries()) {
    draw(text, (612 - bold.widthOfTextAtSize(text, 7.5)) / 2, 83 - offset * 14, bold, 7.5)
  }
  return pdf.save()
}

export async function welcomeAttachments(recipient: WelcomeRecipient, mode: WelcomeMode) {
  return [
    { filename: 'CVOA_Welcome_Letter.pdf', content: Buffer.from(await createWelcomeLetter(recipient, mode)), contentType: 'application/pdf' },
    { filename: 'CVOA_ONE_Getting_Started_Guide.pdf', content: Buffer.from(decode(guide)), contentType: 'application/pdf' },
  ]
}
