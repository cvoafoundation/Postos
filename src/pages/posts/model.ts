import type { Post, PostStatus } from "@/lib/types";
import type { HealthPolicy, PostHealthResult } from "@/lib/postHealth";
export type DashboardTab =
  | "overview"
  | "people"
  | "meetings"
  | "development"
  | "sponsors"
  | "finances"
  | "documents"
  | "governance";
export interface PostDashboard {
  policy: {
    version: number;
    settings: HealthPolicy;
    updated_at: string;
    updated_by: string | null;
  };
  post: Post & { archived_at: string | null; archived_reason: string | null };
  can_manage: boolean;
  national: boolean;
  updated_at: string;
  plan: {
    stage: string;
    owner_name: string;
    target_date: string | null;
    help_needed: string;
  } | null;
  funding: {
    budget_cents: number;
    received_cents: number;
    spent_cents: number;
    available_cents: number;
    remaining_cents: number;
  };
  members: { active: number; lapsed: number; expiring: number };
  staff: {
    id: string;
    name: string;
    position: string;
    profile_id: string | null;
    member_id: string | null;
    verification_status: string;
    appointed: boolean;
    appointments: { role: string; title: string }[];
  }[];
  account_staff: {
    id: string;
    full_name: string;
    access_suspended: boolean;
    is_test_account: boolean;
    roster_linked: boolean;
    email_confirmed: boolean;
    has_signed_in: boolean;
    appointments: { role: string; title: string }[];
  }[];
  meetings: {
    id: string;
    title: string;
    meeting_at: string;
    status: string;
    minutes_state: string;
    published_at: string | null;
    path: string;
    actual_at: string | null;
  }[];
  tasks: {
    id: string;
    title: string;
    owner: string;
    due_date: string | null;
    kind: string;
    path: string;
  }[];
  sponsorship: { pipeline: number; pledged: number; received: number };
  finance: {
    income: number;
    expenses: number;
    last_entry: string | null;
    monthly_expense: number;
    future_expenses: number;
  };
  escalations: {
    id: string;
    subject: string;
    status: string;
    response: string;
    created_at: string;
  }[];
  archive_history: {
    id: string;
    action: string;
    reason: string;
    created_at: string;
    actor_name: string;
  }[];
}
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value),
  );
export function postDisplayName(post: { name: string; status: PostStatus }) {
  return post.name.replace(/\s*\((forming|active)\)\s*$/i, "").trim();
}
export function dashboardActions(
  data: PostDashboard,
  health?: PostHealthResult,
  today = new Date().toISOString().slice(0, 10),
) {
  const base = `/health/${data.post.id}`,
    dev = `/post-development?post=${data.post.id}`;
  const actions: { id: string; title: string; detail: string; path: string }[] =
    [];
  if (data.post.archived_at) return actions;
  if (
    data.plan?.stage === "location_review" ||
    data.plan?.stage === "opening_review"
  )
    actions.push({
      id: "approval",
      title: "National review pending",
      detail: `${data.plan.stage.replaceAll("_", " ")} · National records the decision and next steps.`,
      path: dev,
    });
  for (const task of data.tasks
    .filter((t) => t.due_date && t.due_date < today)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!)))
    actions.push({
      id: task.id,
      title: task.title,
      detail: `Overdue since ${task.due_date} · Owner: ${task.owner || "Unassigned"}`,
      path: task.path,
    });
  if (health)
    for (const issue of health.dimensions.filter((d) => d.status === "red"))
      actions.push({
        id: issue.key,
        title: `Address ${issue.label.toLowerCase()}`,
        detail: issue.detail,
        path: `${base}?tab=${issue.key === "officers" ? "people" : issue.key === "membership" ? "people" : issue.key === "meetings" ? "meetings" : issue.key === "financial" ? "finances" : issue.key === "sponsors" ? "sponsors" : "governance"}`,
      });
  const activation =
    data.account_staff?.filter((s) => !s.email_confirmed || !s.has_signed_in) ??
    [];
  if (activation.length)
    actions.push({
      id: "activation",
      title: `Review ${activation.length} staff account activations`,
      detail:
        "Confirm invitation delivery and first sign-in before assigning operational work.",
      path: `${base}?tab=people`,
    });
  if (data.members.expiring)
    actions.push({
      id: "renewals",
      title: `${data.members.expiring} memberships expire within 30 days`,
      detail: "Review renewals and contact affected members.",
      path: `/members?post=${data.post.id}`,
    });
  const unfinished = data.meetings.find(
    (m) => m.status === "completed" && !m.published_at,
  );
  if (unfinished)
    actions.push({
      id: "minutes",
      title: `Publish minutes: ${unfinished.title}`,
      detail:
        "The meeting is complete; its minutes are still awaiting publication.",
      path: unfinished.path,
    });
  if (data.post.status !== "active_post" && !data.plan)
    actions.push({
      id: "plan",
      title: "Start the post development plan",
      detail:
        "After National application approval, assign an owner and target date, then plan the location and funding.",
      path: dev,
    });
  for (const task of data.tasks.filter((t) => !t.owner))
    if (!actions.some((a) => a.id === task.id))
      actions.push({
        id: task.id,
        title: `Assign an owner: ${task.title}`,
        detail:
          "An accountable person and deadline help move this work forward.",
        path: task.path,
      });
  if (data.plan?.help_needed)
    actions.push({
      id: "support",
      title: "Follow up on the assistance request",
      detail: data.plan.help_needed,
      path: dev,
    });
  if (!data.finance.last_entry)
    actions.push({
      id: "finance",
      title: "Confirm the financial records",
      detail:
        "No dated ledger entries available. Record the starting position and reconcile it to the bank.",
      path: `${base}?tab=finances`,
    });
  return actions;
}
