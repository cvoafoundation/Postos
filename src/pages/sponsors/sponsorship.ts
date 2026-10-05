export const SPONSOR_STAGES = [
  {
    key: "identified",
    label: "Identified",
    help: "Find the right contact and estimate the sponsorship.",
  },
  {
    key: "contacted",
    label: "Contacted",
    help: "Record who you spoke with, how you reached them and the conversation.",
  },
  {
    key: "meeting_scheduled",
    label: "Meeting scheduled",
    help: "Choose a time and who you are meeting. Add it to your calendar.",
  },
  {
    key: "proposal_sent",
    label: "Proposal sent",
    help: "Keep the exact proposal here as text or an uploaded document.",
  },
  {
    key: "won",
    label: "Won",
    help: "Confirm the commitment and collect payment. Agreed amount and receipts stay separate.",
  },
  {
    key: "lost",
    label: "Not proceeding",
    help: "Keep the history so another member can follow up later.",
  },
] as const;
export const money = (amount: unknown) =>
  Number(amount || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
export function calendarDetails(s: any) {
  if (!s.meeting_start || !s.meeting_end)
    throw new Error("Save a meeting start and end first.");
  const stamp = (v: string) =>
    new Date(v)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return {
    title: `CVOA sponsorship: ${s.company}`,
    start: stamp(s.meeting_start),
    end: stamp(s.meeting_end),
    location: s.meeting_location || "",
    description: `Meeting with ${s.meeting_with || s.contact_name || "sponsor"}\n${[s.email, s.phone].filter(Boolean).join(" • ")}\nSponsor record: https://www.cvoa.one/sponsors?sponsor=${s.id}`,
  };
}
export function googleCalendarUrl(s: any) {
  const c = calendarDetails(s);
  return (
    "https://calendar.google.com/calendar/render?" +
    new URLSearchParams({
      action: "TEMPLATE",
      text: c.title,
      dates: `${c.start}/${c.end}`,
      details: c.description,
      location: c.location,
    }).toString()
  );
}
export function calendarIcs(s: any) {
  const c = calendarDetails(s),
    escape = (v: string) =>
      v
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
  const fold = (line: string) => {
    let result = "",
      bytes = 0;
    for (const ch of line) {
      const n = new TextEncoder().encode(ch).length;
      if (bytes + n > 75) {
        result += "\r\n ";
        bytes = 1;
      }
      result += ch;
      bytes += n;
    }
    return result;
  };
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CVOA//Sponsorship//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:sponsor-${s.id}-${c.start}@cvoa.one`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`,
      `DTSTART:${c.start}`,
      `DTEND:${c.end}`,
      `SUMMARY:${escape(c.title)}`,
      `DESCRIPTION:${escape(c.description)}`,
      `LOCATION:${escape(c.location)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
export function downloadCalendar(s: any) {
  const url = URL.createObjectURL(
      new Blob([calendarIcs(s)], { type: "text/calendar;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `cvoa-sponsor-${s.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function edgeError(error: any) {
  if (error?.context) {
    try {
      const d = await error.context.json();
      return d.error || error.message;
    } catch {}
  }
  return error?.message || "Unable to save. Please retry.";
}

export const SPONSOR_CATEGORIES = [
  "Restaurant/Food Service",
  "Beverage/Alcohol Distribution",
  "Grocery/Retail",
  "Education/Training",
  "Technology",
  "Staffing/Recruiting",
  "Professional Services",
  "Healthcare",
  "Medical Equipment/Supplies",
  "Construction/Hardware",
  "Real Estate",
  "Fitness/Sporting Goods",
  "Health & Wellness",
  "Other",
];
