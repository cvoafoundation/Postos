export interface MembershipListRow {
  id: string;
  name: string;
  address: string | null;
  membership_class: string | null;
  votes_entitled: number | null;
  voting_entitlement: string | null;
}
export const missingListFields = (row: MembershipListRow) =>
  [
    !row.name?.trim() && "name",
    !row.address?.trim() && "address",
    !row.membership_class?.trim() && "membership class",
    row.votes_entitled == null && "vote count",
  ].filter(Boolean) as string[];
// Protect spreadsheet readers from formula execution; quote every cell, including multiline addresses.
const cell = (value: unknown) => {
  let text = value == null ? "" : String(value);
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r]/.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export function membershipListCsv(rows: MembershipListRow[]) {
  return (
    "\uFEFF" +
    [
      [
        "Name",
        "Address",
        "Membership class",
        "Number of votes entitled",
        "Voting entitlement / scope",
      ]
        .map(cell)
        .join(","),
      ...rows.map((r) =>
        [
          r.name,
          r.address,
          r.membership_class,
          r.votes_entitled,
          r.voting_entitlement,
        ]
          .map(cell)
          .join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
export function membershipListFilename(
  generatedAt: string,
  activeOnly: boolean,
  incomplete: boolean,
) {
  return `CVOA-membership-list-${generatedAt.slice(0, 10)}-${activeOnly ? "active" : "all-retained"}${incomplete ? "-REVIEW-REQUIRED" : ""}.csv`;
}
