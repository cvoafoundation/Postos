import type { Member } from "@/lib/types";
export type Verification = {
  id: string;
  status: string;
  has_document: boolean;
};
export type ApplicationSummary = {
  id: string;
  city: string;
  state: string;
  status: string;
  updates: { kind: string; message: string; created_at: string }[];
};
export type HomeTask = {
  id: string;
  title: string;
  detail: string;
  to: string;
};
export type HomeSession = {
  id: string;
  body_id: string;
  title: string;
  scheduled_at: string;
  ended_at: string | null;
  published_at: string | null;
  readable: boolean;
};
export function nextSteps(
  member: Member | null,
  verification: Verification | undefined,
  applications: ApplicationSummary[],
  today: string,
): HomeTask[] {
  const tasks: HomeTask[] = [];
  if (!member)
    tasks.push({
      id: "membership",
      title: "Connect your membership",
      detail: "Open My Membership for your account’s status and next steps.",
      to: "/my-membership",
    });
  else {
    if (member.membership_status === "pending_payment")
      tasks.push({
        id: "payment",
        title: "Complete your membership payment",
        detail: "Continue securely from My Membership.",
        to: "/my-membership",
      });
    else if (
      member.membership_type === "annual" &&
      (member.membership_status === "lapsed" ||
        (!!member.expires_at &&
          member.expires_at <=
            new Date(new Date(today + "T12:00:00Z").getTime() + 30 * 86400000)
              .toISOString()
              .slice(0, 10)))
    )
      tasks.push({
        id: "renew",
        title:
          (member.expires_at && member.expires_at < today) ||
          member.membership_status === "lapsed"
            ? "Renew your membership"
            : "Your renewal is coming up",
        detail: member.expires_at
          ? `Membership expiration: ${member.expires_at}.`
          : "Review your renewal options.",
        to: "/my-membership",
      });
    if (
      verification &&
      verification.status !== "verified" &&
      (!verification.has_document || verification.status === "rejected")
    )
      tasks.push({
        id: "verification",
        title:
          verification.status === "rejected"
            ? "Review your service verification"
            : "Complete service verification",
        detail:
          verification.status === "rejected"
            ? "Review the upload guidance and submit an updated document."
            : "Upload your DD-214 privately for staff review.",
        to: "/membership-verification",
      });
  }
  for (const a of applications) {
    const latest = [...(a.updates ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];
    if (latest && ["document_request", "feedback"].includes(latest.kind))
      tasks.push({
        id: a.id,
        title:
          latest.kind === "document_request"
            ? "Review requested application documents"
            : "Read your application feedback",
        detail: `${a.city || "Company application"}${a.state ? ", " + a.state : ""}. Open the application for the full message and to respond.`,
        to: "/my-applications",
      });
  }
  return tasks;
}
export function companySessions(
  sessions: HomeSession[],
  bodies: { id: string; post_id: string | null }[],
  postId: string | null | undefined,
) {
  const ids = new Set(
    postId ? bodies.filter((b) => b.post_id === postId).map((b) => b.id) : [],
  );
  const own = sessions.filter((s) => ids.has(s.body_id));
  return {
    upcoming: own
      .filter((s) => !s.ended_at)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      .slice(0, 3),
    published: own
      .filter((s) => !!s.published_at && s.readable !== false)
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
      .slice(0, 2),
  };
}
