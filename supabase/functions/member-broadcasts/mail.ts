export const MAX_TOTAL = 10 * 1024 * 1024;
export const MEDIA: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
};
export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function validDraft(subject: unknown, body: unknown) {
  return (
    typeof subject === "string" &&
    subject.length <= 180 &&
    !/[\r\n]/.test(subject) &&
    typeof body === "string" &&
    body.length <= 30000
  );
}
export function signatureMatches(bytes: Uint8Array, type: string) {
  const h = (...n: number[]) => n.every((v, i) => bytes[i] === v),
    text = (start: number, end: number) =>
      String.fromCharCode(...bytes.slice(start, end));
  if (type === "image/png") return h(137, 80, 78, 71, 13, 10, 26, 10);
  if (type === "image/jpeg") return h(255, 216, 255);
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(text(0, 6));
  if (type === "image/webp")
    return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
  if (type === "application/pdf") return text(0, 5) === "%PDF-";
  if (type === "video/mp4") return text(4, 8) === "ftyp";
  if (type === "audio/mpeg")
    return (
      text(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    );
  if (
    type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return h(80, 75, 3, 4);
  return false;
}
export function prepareBroadcast(
  b: any,
  recipient: { email: string; member_name: string },
  sender: string,
  files: any[],
  test = false,
) {
  const name = recipient.member_name || "Member";
  const message = String(b.body)
    .replace(/\{\{first_name\}\}/g, name.split(/\s+/)[0])
    .replace(/\{\{name\}\}/g, name);
  const linked = message
    .split(/(https?:\/\/[^\s<>"']+)/g)
    .map((p) =>
      /^https?:\/\//.test(p)
        ? `<a href="${escapeHtml(p)}">${escapeHtml(p)}</a>`
        : escapeHtml(p),
    )
    .join("");
  const paragraphs = linked
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="margin:0 0 18px;line-height:1.65">${p.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const images = files
    .filter((f) => f.contentType.startsWith("image/"))
    .map(
      (f) =>
        `<p><img src="cid:${f.cid}" alt="${escapeHtml(f.filename)}" style="max-width:100%;height:auto"></p>`,
    )
    .join("");
  return {
    from: { name: "Combat Veterans of America", address: sender },
    to: { name, address: recipient.email },
    subject: (test ? "[TEST] " : "") + b.subject,
    text: `Combat Veterans of America\n\nDear ${name},\n\n${message}\n\nNational Command\nhttps://cvoa.one`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f2ee;color:#202020;font-family:Arial,sans-serif"><div style="max-width:640px;margin:auto;background:white;padding:32px"><img src="https://cvoa.one/images/cvoa-logo.png" width="76" alt="CVOA"><h2 style="border-bottom:2px solid #b79a5b;padding-bottom:18px">Combat Veterans of America</h2><p>Dear ${escapeHtml(name)},</p>${paragraphs}${images}<p style="border-top:1px solid #ddd;padding-top:20px">National Command<br><a href="https://cvoa.one">CVOA.ONE</a></p></div></body></html>`,
    attachments: files,
    disableFileAccess: true,
    disableUrlAccess: true,
    messageId: `<broadcast-${b.id}-${recipient.email.replace(/[^a-z0-9]/gi, "_")}${test ? "-test-" + crypto.randomUUID() : ""}@cvoa.one>`,
  };
}
