import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/lib/workspaces";
import { WorkspaceStatus } from "./WorkspaceStatus";
import type { Member } from "@/lib/types";
interface RecordData {
  post: { name: string; state: string } | null;
  account: {
    post_name: string | null;
    role: string;
    title: string | null;
    post_id: string | null;
    state: string | null;
    email_confirmed: boolean;
    last_sign_in_at: string | null;
  } | null;
  appointments: {
    post_name: string;
    position: string;
    verification_status: string;
  }[];
  payments: {
    id: string;
    amount: number;
    status: string;
    paid_at: string | null;
    created_at: string;
  }[];
}
export default function MemberRecord({ member }: { member: Member }) {
  const { isNational } = useAuth();
  const { data, loading, error, refresh } = useWorkspace<RecordData>(
    "cvoa_member_record",
    { p_member: member.id },
  );
  return (
    <section className="panel p-4">
      <h3 className="font-display text-xl">Member Overview</h3>
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm mt-3">
            <div>
              <dt className="text-muted">Membership</dt>
              <dd className="capitalize">
                {member.membership_type} ·{" "}
                {member.membership_status.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Membership post</dt>
              <dd>{data.post?.name ?? "National at large"}</dd>
            </div>
            <div>
              <dt className="text-muted">Service verification</dt>
              <dd className="capitalize">{member.dd214_review_status}</dd>
            </div>
            <div>
              <dt className="text-muted">Account activation</dt>
              <dd>
                {!data.account
                  ? "No linked login"
                  : data.account.last_sign_in_at
                    ? "Signed in"
                    : data.account.email_confirmed
                      ? "Email confirmed; no sign-in recorded"
                      : "Email confirmation pending"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">System appointment</dt>
              <dd>
                {data.account?.role.replaceAll("_", " ") ?? "None"}
                {data.account?.title ? ` · ${data.account.title}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Appointment scope</dt>
              <dd>
                {data.account?.role === "state_commander"
                  ? (data.account.state ?? "State not assigned")
                  : (data.account?.post_name ??
                    (data.account?.role.startsWith("national_")
                      ? "National"
                      : "No staff post assigned"))}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Last sign-in</dt>
              <dd>
                {data.account?.last_sign_in_at?.slice(0, 10) ??
                  "No sign-in recorded"}
              </dd>
            </div>
          </dl>
          <ul className="mt-3 text-sm">
            {data.appointments.map((a, i) => (
              <li key={i}>
                {a.post_name} · {a.position.replaceAll("_", " ")} ·{" "}
                {a.verification_status}
              </li>
            ))}
          </ul>
          {data.payments.length > 0 && (
            <div className="mt-4">
              <h4 className="eyebrow">Recent membership payments</h4>
              <ul className="text-xs space-y-2 mt-2">
                {data.payments.map((p) => (
                  <li key={p.id}>
                    ${Number(p.amount).toFixed(2)} · {p.status} ·{" "}
                    {(p.paid_at ?? p.created_at).slice(0, 10)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isNational && data.account && (
            <Link
              className="text-gold text-sm inline-block mt-3"
              to={`/users?q=${encodeURIComponent(member.email ?? member.full_name)}`}
            >
              Manage Accounts & Access →
            </Link>
          )}
        </>
      )}
    </section>
  );
}
