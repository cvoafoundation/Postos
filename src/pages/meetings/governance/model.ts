export type RecordData = Record<string, any>;
export const URO_RULES = {
  version: "URO-2026.10-present-v1",
  denominator: "eligible_present",
  quorum: "majority_membership",
  speaking_seconds: 120,
  remote_authorized: false,
  recusal_counts_quorum: null,
  notice_hours: null,
  notice_authority: "",
  voting_authority: "",
  configured: false,
};
export function votesRequired(
  present: number,
  threshold: string,
): number | null {
  if (!Number.isSafeInteger(present) || present <= 0) return null;
  return threshold === "two_thirds"
    ? Math.ceil((2 * present) / 3)
    : threshold === "unanimous"
      ? present
      : Math.floor(present / 2) + 1;
}
export function majorityQuorum(membership: number): number | null {
  return Number.isSafeInteger(membership) && membership > 0
    ? Math.floor(membership / 2) + 1
    : null;
}
export function timestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}
export function datetimeInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function iso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
export function actionState(action: RecordData): string {
  return action.status !== "completed" &&
    action.due_date &&
    action.due_date < new Date().toISOString().slice(0, 10)
    ? "overdue"
    : action.status;
}
export function readiness(items: RecordData[]): number {
  if (!items.length) return 0;
  return Math.round(
    (items.filter((i) =>
      ["ready_for_review", "ready_for_decision"].includes(i.readiness),
    ).length *
      100) /
      items.length,
  );
}
export function phaseLabel(s: RecordData): string {
  if (s.phase === "archive")
    return s.minutes_state === "approved"
      ? "Review record"
      : "Review certified record";
  if (s.phase === "execute") return "Certify draft record";
  if (s.phase === "meet")
    return s.recess_started_at ? "Resume meeting" : "Open live meeting";
  return s.phase === "review" ? "Review packet" : "Continue preparation";
}
export function textDownload(name: string, content: string): void {
  const href = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
