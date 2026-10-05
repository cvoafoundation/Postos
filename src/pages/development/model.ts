export const stages = [
  {
    key: "planning",
    title: "Launch Planning",
    detail: "Assign the team, initial services and opening date.",
  },
  {
    key: "funding",
    title: "Fundraising & Location Search",
    detail: "Build the budget, run campaigns and compare potential spaces.",
  },
  {
    key: "location_review",
    title: "National Location Review",
    detail: "Submit your preferred location and respond to National feedback.",
  },
  {
    key: "setup",
    title: "Secure Location & Set Up",
    detail: "Secure the approved space and complete the facility work.",
  },
  {
    key: "opening_review",
    title: "National Opening Review",
    detail: "National checks readiness and records its opening decision.",
  },
  {
    key: "open",
    title: "Open & Operating",
    detail: "Keep the history and continue improvements and fundraising.",
  },
];
export const label = (s: string) =>
  stages.find((x) => x.key === s)?.title ?? s.replaceAll("_", " ");
export const money = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
export interface LaunchPlan {
  post_id: string;
  stage: string;
  owner_name: string;
  target_date: string | null;
  services: string;
  help_needed: string;
  selected_location_id: string | null;
  version: number;
  updated_at: string;
}
export interface Funding {
  budget_cents: number;
  received_cents: number;
  spent_cents: number;
  available_cents: number;
  remaining_cents: number;
  pledged_cents: number;
}
export interface LaunchPost {
  id: string;
  name: string;
  state: string;
  status: string;
  plan: LaunchPlan | null;
  funding: Funding;
  pending_locations: number;
  overdue_tasks: number;
}
export interface Task {
  id: string;
  label: string;
  owner_name: string;
  due_date: string | null;
  required: boolean;
  complete: boolean;
  note: string;
}
export interface Location {
  id: string;
  name: string;
  address: string;
  tenure: string;
  monthly_cost_cents: number;
  upfront_cost_cents: number;
  square_feet: number | null;
  details: string;
  status: string;
  revision: number;
  secured: boolean;
}
export interface Standard {
  id: string;
  label: string;
  category: string;
  required: boolean;
  active: boolean;
}
export interface LocationCheck {
  location_id: string;
  standard_id: string;
  response: string;
  note: string;
}
export interface BudgetItem {
  id: string;
  label: string;
  amount_cents: number;
  category: string;
  approved: boolean;
}
export function nextActions(
  post: LaunchPost,
  tasks: Task[],
  locations: Location[],
) {
  const p = post.plan;
  if (!p) return ["Start the launch workspace."];
  const result: string[] = [];
  if (!p.owner_name || !p.target_date || !p.services)
    result.push(
      "Set the launch owner, initial services and target opening date.",
    );
  if (!post.funding.budget_cents)
    result.push(
      "Build the opening budget, including space costs and an operating reserve.",
    );
  if (p.stage === "planning")
    result.push(
      "Save the launch plan, then begin fundraising and location search.",
    );
  if (p.stage === "funding")
    result.push(
      locations.length
        ? "Complete the preferred location checklist and submit it to National."
        : "Add a potential location with its costs, photos and floor plan.",
    );
  if (p.stage === "location_review")
    result.push(
      post.pending_locations
        ? "National: review the submitted location."
        : "Address National feedback and resubmit the location.",
    );
  if (
    p.stage === "setup" &&
    !locations.find((x) => x.id === p.selected_location_id)?.secured
  )
    result.push("Record that the National-approved space has been secured.");
  tasks
    .filter((t) => !t.complete)
    .sort(
      (a, b) =>
        Number(b.required) - Number(a.required) ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
    )
    .slice(0, 2)
    .forEach((t) =>
      result.push(
        `${t.label}${t.owner_name ? ` (${t.owner_name})` : ": assign an owner"}`,
      ),
    );
  if (p.stage === "setup")
    result.push(
      "Finish facility checklists and submit opening readiness to National.",
    );
  if (p.stage === "opening_review")
    result.push(
      "National: review readiness and approve opening or request more work.",
    );
  if (post.funding.remaining_cents > 0)
    result.push(
      `Fundraising: ${money(post.funding.remaining_cents)} remains toward the opening budget.`,
    );
  if (p.help_needed) result.push(`Help requested: ${p.help_needed}`);
  return result.length
    ? result.slice(0, 3)
    : ["Maintain operating tasks and plan future improvements."];
}
