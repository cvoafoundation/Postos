import type {
  AnnualReview,
  CommunityServiceEvent,
  FinancialTransaction,
  FoundingTeamMember,
  GovernanceSignature,
  Member,
  Post,
  Recruit,
  Sponsor,
} from "./types";

export type DimensionStatus = "green" | "yellow" | "red" | "neutral";

export interface HealthDimension {
  key: string;
  label: string;
  status: DimensionStatus;
  detail: string;
}

export interface PostHealthResult {
  overall: "green" | "yellow" | "red";
  score: number;
  dimensions: HealthDimension[];
  coverage: number;
  critical: string[];
}

export interface HealthPolicy {
  required_positions: string[];
  meeting_green_days: number;
  meeting_yellow_days: number;
  membership_green: number;
  membership_yellow: number;
  new_post_days: number;
  signature_days: number;
  service_green_days: number;
  service_yellow_days: number;
  financial_fresh_days: number;
  critical_keys: string[];
  confirmed: boolean;
}
export const DEFAULT_HEALTH_POLICY: HealthPolicy = {
  required_positions: [
    "commander",
    "vice_commander",
    "adjutant",
    "quartermaster",
    "sergeant_at_arms",
  ],
  meeting_green_days: 30,
  meeting_yellow_days: 60,
  membership_green: 25,
  membership_yellow: 10,
  new_post_days: 180,
  signature_days: 365,
  service_green_days: 90,
  service_yellow_days: 180,
  financial_fresh_days: 60,
  critical_keys: ["officers", "governance", "financial"],
  confirmed: false,
};

function daysAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

export interface PostHealthInputs {
  post: Post;
  foundingTeam: FoundingTeamMember[];
  sponsors: Sponsor[];
  meetingDates: string[];
  recruits: Recruit[];
  members: Member[];
  hasDelegate: boolean;
  delegateVotesCast: number;
  governanceSignatures: GovernanceSignature[];
  annualReview: AnnualReview | null;
  communityServiceEvents: CommunityServiceEvent[];
  financialTransactions: FinancialTransaction[];
  evidence?: {
    current_officers: FoundingTeamMember[];
    sponsor_receipts: { sponsor_id: string | null; amount: number }[];
    eligible_votes: number;
    votes_cast: number;
    has_delegate: boolean;
    policy?: HealthPolicy;
  };
}

export function computePostHealth(inputs: PostHealthInputs): PostHealthResult {
  const {
    post,
    foundingTeam,
    meetingDates,
    members,
    hasDelegate,
    delegateVotesCast,
    governanceSignatures,
    annualReview,
    communityServiceEvents,
    financialTransactions,
  } = inputs;

  const policy = { ...DEFAULT_HEALTH_POLICY, ...inputs.evidence?.policy };
  const REQUIRED_POSITIONS = policy.required_positions;
  const postAgeDays = post.charter_date
    ? daysAgo(post.charter_date)
    : daysAgo(post.created_at);
  const isNewPost = postAgeDays < policy.new_post_days;

  const dimensions: HealthDimension[] = [];

  // 1. Officer completeness
  const currentTeam = inputs.evidence?.current_officers ?? foundingTeam;
  const filledPositions = new Set(currentTeam.map((m) => m.position));
  const filledCount = REQUIRED_POSITIONS.filter((p) =>
    filledPositions.has(p as any),
  ).length;
  dimensions.push({
    key: "officers",
    label: "Officer Positions",
    status:
      filledCount === REQUIRED_POSITIONS.length
        ? "green"
        : filledCount / REQUIRED_POSITIONS.length >= 0.6
          ? "yellow"
          : "red",
    detail: `${filledCount}/${REQUIRED_POSITIONS.length} positions${inputs.evidence ? " verified and linked to current staff access" : " on roster"}`,
  });

  // 2. Sponsor concentration
  const receipts = inputs.evidence?.sponsor_receipts ?? [];
  const amounts = new Map<string, number>();
  for (const receipt of receipts)
    if (Number(receipt.amount) > 0) {
      const key = receipt.sponsor_id ?? "unattributed";
      amounts.set(key, (amounts.get(key) ?? 0) + Number(receipt.amount));
    }
  const totalRevenue = [...amounts.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  if (!totalRevenue) {
    dimensions.push({
      key: "sponsors",
      label: "Sponsor Diversification",
      status: "neutral",
      detail:
        "No net sponsor receipts recorded; pledges are tracked separately",
    });
  } else {
    const concentration = Math.max(...amounts.values()) / totalRevenue;
    dimensions.push({
      key: "sponsors",
      label: "Sponsor Diversification",
      status:
        concentration <= 0.5
          ? "green"
          : concentration <= 0.8
            ? "yellow"
            : "red",
      detail: `Largest source is ${Math.round(concentration * 100)}% of $${totalRevenue.toLocaleString()} received after refunds${amounts.has("unattributed") ? "; some receipts need a sponsor link" : ""}`,
    });
  }

  // 3. Meeting compliance
  const lastMeeting =
    meetingDates
      .filter(
        (date) =>
          Number.isFinite(new Date(date).getTime()) && daysAgo(date) >= 0,
      )
      .sort()
      .slice(-1)[0] ?? null;
  const meetingStatus: DimensionStatus = !lastMeeting
    ? "red"
    : daysAgo(lastMeeting) <= policy.meeting_green_days
      ? "green"
      : daysAgo(lastMeeting) <= policy.meeting_yellow_days
        ? "yellow"
        : "red";
  dimensions.push({
    key: "meetings",
    label: "Published Meeting Records",
    status: meetingStatus,
    detail: lastMeeting
      ? `Last documented meeting ${Math.round(daysAgo(lastMeeting))} days ago`
      : "No completed meeting record available",
  });

  // 4. Membership — now sourced from the real Membership Roster instead of
  // a Recruiting Engine proxy. Softened for young posts, since a 6-month
  // post shouldn't be judged on the same curve as a 5-year post.
  const activeMembers = members.filter((m) => m.membership_status === "active");
  const newMembers90d = activeMembers.filter(
    (m) =>
      m.joined_at && daysAgo(m.joined_at) >= 0 && daysAgo(m.joined_at) <= 90,
  ).length;
  let membershipStatus: DimensionStatus =
    activeMembers.length >= policy.membership_green
      ? "green"
      : activeMembers.length >= policy.membership_yellow
        ? "yellow"
        : "red";
  if (isNewPost && membershipStatus === "red") membershipStatus = "yellow";
  dimensions.push({
    key: "membership",
    label: "Membership",
    status: membershipStatus,
    detail: `${activeMembers.length} active members${newMembers90d > 0 ? ` (+${newMembers90d} in last 90 days)` : ""}`,
  });

  const delegatePresent = inputs.evidence?.has_delegate ?? hasDelegate;
  const eligible = inputs.evidence?.eligible_votes;
  const cast = inputs.evidence?.votes_cast ?? delegateVotesCast;
  dimensions.push({
    key: "congress",
    label: "Congress Participation",
    status: !delegatePresent
      ? "red"
      : eligible === 0
        ? "neutral"
        : eligible === undefined
          ? "neutral"
          : cast >= eligible
            ? "green"
            : "yellow",
    detail: !delegatePresent
      ? "No current designated delegate with active account access"
      : eligible === 0
        ? "No eligible formal votes in the last 365 days"
        : eligible === undefined
          ? "Current voting evidence unavailable"
          : `${cast}/${eligible} eligible formal votes recorded in the last 365 days`,
  });

  // 6. Governance sign-offs — do current officers have both forms on file,
  // signed within the last year
  const currentOfficers = currentTeam.filter((m) =>
    REQUIRED_POSITIONS.includes(m.position),
  );
  if (currentOfficers.length === 0) {
    dimensions.push({
      key: "governance",
      label: "Governance Sign-offs",
      status: "neutral",
      detail: "No officers on file yet",
    });
  } else {
    const validSigs = governanceSignatures.filter(
      (s) =>
        daysAgo(s.signed_at) >= 0 &&
        daysAgo(s.signed_at) <= policy.signature_days,
    );
    const neededPairs = currentOfficers.length * 2;
    let foundPairs = 0;
    for (const officer of currentOfficers) {
      for (const formType of [
        "conflict_of_interest",
        "officer_acknowledgment",
      ] as const) {
        if (
          validSigs.some(
            (s) =>
              !!officer.profile_id &&
              s.profile_id === officer.profile_id &&
              s.form_type === formType,
          )
        )
          foundPairs++;
      }
    }
    const pct = neededPairs > 0 ? foundPairs / neededPairs : 0;
    dimensions.push({
      key: "governance",
      label: "Governance Sign-offs",
      status: pct >= 0.9 ? "green" : pct >= 0.5 ? "yellow" : "red",
      detail: `${foundPairs}/${neededPairs} required signatures current`,
    });
  }

  // 7. Annual Review
  const currentYear = new Date().getFullYear();
  if (
    isNewPost &&
    (!annualReview || annualReview.review_year !== currentYear)
  ) {
    dimensions.push({
      key: "annual_review",
      label: "Annual Review",
      status: "neutral",
      detail: "Within the configured new-post review grace period",
    });
  } else if (!annualReview || annualReview.review_year !== currentYear) {
    dimensions.push({
      key: "annual_review",
      label: "Annual Review",
      status: "red",
      detail: `${currentYear} annual review not started`,
    });
  } else if (
    annualReview.completed_at &&
    daysAgo(annualReview.completed_at) >= 0 &&
    annualReview.bylaws_reviewed &&
    annualReview.financial_audit_complete &&
    annualReview.officer_roster_current &&
    annualReview.required_filings_current &&
    annualReview.reviewed_by &&
    (annualReview.notes?.trim().length ?? 0) >= 5
  ) {
    dimensions.push({
      key: "annual_review",
      label: "Annual Review",
      status: "green",
      detail: `${currentYear} annual review completed`,
    });
  } else {
    const itemsDone = [
      annualReview.bylaws_reviewed,
      annualReview.financial_audit_complete,
      annualReview.officer_roster_current,
      annualReview.required_filings_current,
    ].filter(Boolean).length;
    dimensions.push({
      key: "annual_review",
      label: "Annual Review",
      status: "yellow",
      detail: `${itemsDone}/4 items complete`,
    });
  }

  // 8. Community service
  const completedEvents = communityServiceEvents.filter(
    (e) =>
      Number.isFinite(new Date(e.event_date).getTime()) &&
      daysAgo(e.event_date) >= 0,
  );
  if (completedEvents.length === 0 && isNewPost) {
    dimensions.push({
      key: "community_service",
      label: "Community Service",
      status: "neutral",
      detail: "No events logged yet",
    });
  } else {
    const lastEvent = [...completedEvents].sort((a, b) =>
      b.event_date.localeCompare(a.event_date),
    )[0];
    const status: DimensionStatus = !lastEvent
      ? "red"
      : daysAgo(lastEvent.event_date) <= policy.service_green_days
        ? "green"
        : daysAgo(lastEvent.event_date) <= policy.service_yellow_days
          ? "yellow"
          : "red";
    dimensions.push({
      key: "community_service",
      label: "Community Service",
      status,
      detail: lastEvent
        ? `Last event ${Math.round(daysAgo(lastEvent.event_date))} days ago`
        : "No events ever logged",
    });
  }

  const recorded = financialTransactions.filter(
    (t) =>
      Number.isFinite(new Date(t.transaction_date).getTime()) &&
      daysAgo(t.transaction_date) >= 0,
  );
  if (recorded.length === 0) {
    dimensions.push({
      key: "financial",
      label: "Financial Records",
      status: "yellow",
      detail:
        "No dated ledger entries available; financial position needs confirmation",
    });
  } else {
    const income = recorded
      .filter((t) => t.transaction_type === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    const expense = recorded
      .filter((t) => t.transaction_type === "expense")
      .reduce((s, t) => s + Number(t.amount), 0);
    const balance = income - expense;
    const latest = recorded
      .map((t) => t.transaction_date)
      .sort()
      .at(-1)!;
    dimensions.push({
      key: "financial",
      label: "Financial Records",
      status:
        balance < 0
          ? "red"
          : daysAgo(latest) > policy.financial_fresh_days
            ? "yellow"
            : "green",
      detail: `Recorded balance: $${balance.toLocaleString()}; last entry ${Math.round(daysAgo(latest))} days ago. Bank reconciliation is required to confirm cash.`,
    });
  }

  const scored = dimensions.filter((d) => d.status !== "neutral");
  const points = { green: 100, yellow: 50, red: 0 } as const;
  const score =
    scored.length > 0
      ? Math.round(
          scored.reduce(
            (sum, d) => sum + points[d.status as "green" | "yellow" | "red"],
            0,
          ) / scored.length,
        )
      : 50;

  const critical = dimensions
    .filter((d) => policy.critical_keys.includes(d.key) && d.status === "red")
    .map((d) => d.label);
  const coverage = Math.round(
    (dimensions.filter(
      (d) =>
        d.status !== "neutral" &&
        !(d.key === "financial" && recorded.length === 0),
    ).length /
      dimensions.length) *
      100,
  );
  const overall: "green" | "yellow" | "red" = critical.length
    ? "red"
    : score >= 75
      ? "green"
      : score >= 40
        ? "yellow"
        : "red";

  return { overall, score, dimensions, coverage, critical };
}
