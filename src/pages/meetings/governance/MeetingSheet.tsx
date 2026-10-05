import { timestamp, type RecordData } from "./model";

export const meetingFonts =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
export const meetingSheetCss = `@page{size:letter;margin:0.65in}body{margin:0;color:#202023;background:white;font:11pt 'IBM Plex Sans',Arial,sans-serif;line-height:1.5}.sheet-header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #b69b53;padding-bottom:18px;margin-bottom:24px}.sheet-header img{width:82px;height:82px;object-fit:contain}.sheet-header h1{font-family:'Bebas Neue',Arial,sans-serif;font-size:30pt;font-weight:400;line-height:1;margin:0}.sheet-kicker{font-family:'IBM Plex Mono',monospace;font-size:9pt;letter-spacing:1px;text-transform:uppercase;color:#77602b}.sheet-title{font-family:'Bebas Neue',Arial,sans-serif;font-size:24pt;line-height:1.1;margin:0 0 14px}.sheet-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:22px;font-size:10pt}.sheet-section{border-top:1px solid #ddd;padding-top:12px;margin-top:20px}.sheet-section h3{font-family:'Bebas Neue',Arial,sans-serif;font-size:19pt;font-weight:400;margin:0 0 10px}.sheet-text{white-space:pre-wrap;overflow-wrap:anywhere;font-family:'IBM Plex Sans',Arial,sans-serif;font-size:10pt;line-height:1.6;margin:0}.sheet-footer{border-top:1px solid #b69b53;margin-top:28px;padding-top:10px;font-family:'IBM Plex Mono',monospace;font-size:8pt;overflow-wrap:anywhere;color:#666}table{width:100%;border-collapse:collapse;font-size:10pt}th,td{padding:8px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}th{font-family:'IBM Plex Mono',monospace;font-size:9pt}thead{display:table-header-group}tr,.sheet-header,.sheet-meta{break-inside:avoid}h3{break-after:avoid}a{color:inherit}`;

export function meetingRecordText(data: RecordData) {
  const s = data.session;
  const actions = data.actions
    .map(
      (a: RecordData) =>
        `${a.title} | Owner: ${data.participants.find((p: RecordData) => p.profile_id === a.owner_id)?.name || "Unassigned"} | Due: ${a.due_date || "Not set"} | ${a.status}${a.progress ? ` | ${a.progress}` : ""}`,
    )
    .join("\n");
  return `${s.minutes || "Minutes have not yet been generated."}\n\nCURRENT ACTION FOLLOW-UP\n${actions || "No assignments."}\n\nSource: https://www.cvoa.one/meetings/session/${s.id}\nRecord status: ${s.minutes_state}; ${s.published_at ? "published" : "not published"}`;
}

export function printMeetingSheet(sheet: HTMLElement, title: string) {
  const popup = window.open("", "_blank");
  if (!popup)
    throw new Error("Allow popups to open the printable meeting sheet.");
  popup.document.title = title;
  const style = popup.document.createElement("style");
  style.textContent = meetingSheetCss;
  const link = popup.document.createElement("link");
  link.rel = "stylesheet";
  link.href = meetingFonts;
  popup.document.head.append(link, style);
  popup.document.body.append(sheet.cloneNode(true));
  const print = async () => {
    await Promise.all(
      Array.from(popup.document.images).map((img) =>
        img.decode().catch(() => {}),
      ),
    );
    await popup.document.fonts.ready;
    popup.focus();
    popup.print();
  };
  link.onload = () => void print();
  link.onerror = () => void print();
}

export default function MeetingSheet({
  data,
  sheetRef,
}: {
  data: RecordData;
  sheetRef: React.RefObject<HTMLDivElement>;
}) {
  const s = data.session;
  return (
    <div
      ref={sheetRef}
      className="bg-white text-zinc-900 rounded p-6 sm:p-10 space-y-5"
    >
      <header className="sheet-header flex items-center gap-5 border-b-2 border-gold pb-5">
        <img
          src="/images/cvoa-logo.png"
          alt="CVOA"
          className="w-20 h-20 object-contain"
        />
        <div>
          <p className="sheet-kicker font-mono text-xs uppercase tracking-widest text-zinc-600">
            Official meeting record
          </p>
          <h1 className="font-display text-3xl">Combat Veterans of America</h1>
          <p>{data.body.name}</p>
        </div>
      </header>
      <h2 className="sheet-title font-display text-3xl">{s.title}</h2>
      <div className="sheet-meta grid sm:grid-cols-2 gap-2 text-sm">
        <p>
          <strong>Date:</strong> {timestamp(s.scheduled_at)}
        </p>
        <p>
          <strong>Location:</strong> {s.location || "Not recorded"}
        </p>
        <p>
          <strong>Record:</strong> {s.minutes_state}{" "}
          {s.published_at ? "• Published" : "• Not published"}
        </p>
        <p>
          <strong>Rules:</strong> Unified Rules of Order
        </p>
      </div>
      <section className="sheet-section">
        <h3 className="font-display text-xl">Proceedings and decisions</h3>
        <pre className="sheet-text whitespace-pre-wrap break-words font-sans text-sm">
          {s.minutes ||
            "A factual draft is generated when the meeting is adjourned."}
        </pre>
      </section>
      <section className="sheet-section">
        <h3 className="font-display text-xl">Action follow-up</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2">Assignment</th>
                <th className="text-left">Owner</th>
                <th className="text-left">Due</th>
                <th className="text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.actions.map((a: RecordData) => (
                <tr key={a.id}>
                  <td className="py-2 pr-3">
                    {a.title}
                    {a.progress && <p className="text-xs">{a.progress}</p>}
                  </td>
                  <td>
                    {data.participants.find(
                      (p: RecordData) => p.profile_id === a.owner_id,
                    )?.name || "Unassigned"}
                  </td>
                  <td>{a.due_date || "Not set"}</td>
                  <td>{a.status.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.actions.length && <p>No assignments recorded.</p>}
      </section>
      <footer className="sheet-footer text-xs text-zinc-600 border-t pt-3">
        CVOA.ONE • {data.body.name}
        <br />
        https://www.cvoa.one/meetings/session/{s.id}
      </footer>
    </div>
  );
}
