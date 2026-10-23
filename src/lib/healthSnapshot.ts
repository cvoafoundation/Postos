import {
  computePostHealth,
  type PostHealthInputs,
  type PostHealthResult,
} from "./postHealth";
import type { Post } from "./types";
export type HealthSnapshot = NonNullable<PostHealthInputs["evidence"]> & {
  post: Post & { archived_at?: string | null };
  members: PostHealthInputs["members"];
  meeting_dates: string[];
  governance_signatures: PostHealthInputs["governanceSignatures"];
  annual_review: PostHealthInputs["annualReview"];
  community_service_events: PostHealthInputs["communityServiceEvents"];
  financial_transactions: PostHealthInputs["financialTransactions"];
};
export function scoreHealthSnapshots(
  snapshots: Record<string, HealthSnapshot>,
): Record<string, PostHealthResult> {
  const scores: Record<string, PostHealthResult> = {};
  for (const [id, e] of Object.entries(snapshots)) {
    if (e.post.status !== "active_post" || e.post.archived_at) continue;
    for (const field of [
      "members",
      "meeting_dates",
      "governance_signatures",
      "community_service_events",
      "financial_transactions",
      "current_officers",
      "sponsor_receipts",
    ] as const)
      if (!Array.isArray(e[field]))
        throw new Error(
          "Company rating evidence is incomplete. Refresh to retry.",
        );
    scores[id] = computePostHealth({
      post: e.post,
      evidence: e,
      foundingTeam: e.current_officers,
      sponsors: [],
      recruits: [],
      meetingDates: e.meeting_dates,
      members: e.members,
      hasDelegate: e.has_delegate,
      delegateVotesCast: e.votes_cast,
      governanceSignatures: e.governance_signatures,
      annualReview: e.annual_review,
      communityServiceEvents: e.community_service_events,
      financialTransactions: e.financial_transactions,
    });
  }
  return scores;
}
export function healthSourcePath(
  postId: string,
  key: string,
  canManage = false,
) {
  const root = `/health/${postId}`;
  if (key === "congress") return "/congress";
  if (
    canManage &&
    ["governance", "annual_review", "community_service"].includes(key)
  )
    return `/post-records/${postId}?view=${key}`;
  const tab =
    (
      {
        officers: "people",
        membership: "people",
        meetings: "meetings",
        sponsors: "sponsors",
        financial: "finances",
        congress: "governance",
        governance: "governance",
        annual_review: "governance",
        community_service: "governance",
      } as Record<string, string>
    )[key] || "governance";
  return `${root}?tab=${tab}`;
}
export function mapHealthStatus(
  post: { status: string; archived_at?: string | null },
  score?: PostHealthResult,
): string {
  return post.archived_at
    ? "archived"
    : post.status !== "active_post"
      ? "forming"
      : score?.overall || "unknown";
}
