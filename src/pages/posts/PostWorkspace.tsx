import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { usePostHealth, healthColor } from "@/lib/usePostHealth";
import { POST_STATUS_LABELS } from "@/lib/types";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import { PageHeader } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import HealthPolicyEditor from "./HealthPolicyEditor";
import StateEscalations from "@/components/workspaces/StateEscalations";
import {
  dashboardActions,
  postDisplayName,
  money,
  type PostDashboard,
  type DashboardTab,
} from "./model";
const tabs: { id: DashboardTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "meetings", label: "Meetings" },
  { id: "development", label: "Post Development" },
  { id: "sponsors", label: "Sponsors" },
  { id: "finances", label: "Finances" },
  { id: "documents", label: "Documents" },
  { id: "governance", label: "Governance" },
];
export default function PostWorkspace() {
  const { postId } = useParams(),
    { profile, isNational } = useAuth(),
    [params, setParams] = useSearchParams();
  const id = postId ?? profile?.post_id;
  const [data, setData] = useState<PostDashboard | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [showAdmin, setShowAdmin] = useState(false);
  const tab = tabs.find((t) => t.id === params.get("tab"))?.id ?? "overview";
  const health = usePostHealth(
      data?.post.status === "active_post" && id ? [id] : [],
      version,
    ),
    score = id ? health.scores[id] : undefined;
  const refresh = () => setVersion((v) => v + 1);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setLoading(true);
    setShowAdmin(false);
    setReason("");
    if (!id) {
      setError(
        "Your account needs a post assignment. Contact National to review your appointment.",
      );
      setLoading(false);
      return;
    }
    void supabase
      .rpc("cvoa_post_dashboard", { p_post: id })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setData(data as PostDashboard);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    id,
    version,
    profile?.id,
    profile?.role,
    profile?.state,
    profile?.post_id,
  ]);
  async function archive() {
    if (!data || !id) return;
    setBusy(true);
    setError(null);
    const r = await supabase.rpc("cvoa_post_archive", {
      p_post: id,
      p_archive: !data.post.archived_at,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (r.error) setError(r.error.message);
    else refresh();
  }
  if (!data)
    return (
      <div>
        <PageHeader eyebrow="Post operations" title="Post Dashboard" />
        <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      </div>
    );
  const go = (t: DashboardTab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next);
  };
  const actions = dashboardActions(data, score),
    fund = data.funding,
    active = data.post.status === "active_post",
    dev = `/post-development?post=${id}`,
    records = `/post-records/${id}`;
  const canStart =
    data.can_manage && (isNational || profile?.role === "post_commander");
  const upcoming = data.meetings
    .filter(
      (m) =>
        m.status !== "completed" &&
        new Date(m.meeting_at).getTime() >= Date.now(),
    )
    .sort((a, b) => a.meeting_at.localeCompare(b.meeting_at));
  const overdue = data.tasks.filter(
    (t) => t.due_date && t.due_date < new Date().toISOString().slice(0, 10),
  );
  return (
    <div className="space-y-6">
      <Link className="text-sm text-muted hover:text-gold" to="/health">
        ← Posts in my jurisdiction
      </Link>
      <div className="flex justify-between gap-4 flex-wrap">
        <PageHeader
          eyebrow={`${data.post.city ?? ""}, ${data.post.state} · ${data.can_manage ? "Management" : "Oversight · view"}`}
          title={postDisplayName(data.post)}
        />
        <div className="flex gap-2 items-start">
          <button className="btn-ghost" onClick={refresh}>
            Refresh dashboard
          </button>
          {canStart && (
            <Link className="btn-gold" to={`/meetings?post=${id}`}>
              Start / Schedule Meeting
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <StatusBadge
          label={
            data.post.archived_at
              ? "Archived"
              : POST_STATUS_LABELS[data.post.status]
          }
          tone={
            data.post.archived_at ? "neutral" : active ? "active" : "developing"
          }
        />
        <span>
          Launch stage:{" "}
          {data.plan?.stage.replaceAll("_", " ") ??
            (active
              ? "Open · launch records not initialized"
              : "Development plan not started")}
        </span>
        <span className="text-muted">
          Snapshot: {new Date(data.updated_at).toLocaleString()}
        </span>
      </div>
      {data.post.archived_at && (
        <p className="panel p-4 text-status-attention">
          Archived from operational lists. Records and existing access are
          retained. Reason: {data.post.archived_reason}
        </p>
      )}
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {health.error && tab !== "governance" && (
        <p role="alert" className="panel p-4 text-status-attention">
          Health evidence unavailable: {health.error}. Refresh to retry.
        </p>
      )}
      <nav
        aria-label="Post dashboard sections"
        className="flex gap-1 flex-wrap border-b border-hairline"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => go(t.id)}
            className={`px-3 py-3 text-sm border-b-2 ${tab === t.id ? "border-gold text-gold" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <>
          <section className="panel p-5">
            <div className="flex justify-between gap-3">
              <h2 className="font-display text-2xl">Next Actions</h2>
              <span className="text-xs text-muted">
                Prioritized for this post
              </span>
            </div>
            {actions.length ? (
              <ul className="divide-y divide-hairline mt-3">
                {actions.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link to={a.path} className="block py-3 hover:text-gold">
                      <strong className="text-sm">{a.title}</strong>
                      <span className="block text-xs text-muted mt-1">
                        {a.detail}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted mt-3">
                No urgent actions identified in the available records. Review
                upcoming work below.
              </p>
            )}
          </section>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric
              label="Active members"
              value={String(data.members.active)}
              detail={`${data.members.expiring} expire within 30 days · ${data.members.lapsed} lapsed`}
              onClick={() => go("people")}
            />
            <Metric
              label={active ? "Operational health" : "Launch readiness"}
              value={
                active
                  ? score
                    ? `${score.score}/100`
                    : health.error
                      ? "Unavailable"
                      : "Loading…"
                  : (data.plan?.stage.replaceAll("_", " ") ?? "Plan needed")
              }
              detail={
                active
                  ? score
                    ? `${score.overall.toUpperCase()} · ${score.coverage}% scored record coverage`
                    : "Current records required"
                  : "Opening approval stays in Post Development"
              }
              onClick={() => go(active ? "governance" : "development")}
            />
            <Metric
              label="Next meeting"
              value={
                upcoming[0]
                  ? new Date(upcoming[0].meeting_at).toLocaleDateString()
                  : "None scheduled"
              }
              detail={upcoming[0]?.title ?? "Schedule the next meeting"}
              onClick={() => go("meetings")}
            />
            <Metric
              label="Open tasks"
              value={String(data.tasks.length)}
              detail={`${overdue.length} overdue · ${data.tasks.filter((t) => !t.owner).length} unassigned${data.tasks.length === 50 ? " · first 50 shown" : ""}`}
              onClick={() => go("meetings")}
            />
          </div>
          {score?.critical.length ? (
            <p className="panel p-4 border-l-4 border-status-attention text-sm">
              Critical attention: {score.critical.join(", ")}. These issues
              determine the red status even when the average score is higher.
            </p>
          ) : null}
          <div className="grid lg:grid-cols-2 gap-4">
            <section className="panel p-5">
              <h2 className="font-display text-xl">
                Leadership & Accountability
              </h2>
              <p className="text-sm mt-3">
                Launch owner: {data.plan?.owner_name || "Unassigned"}
              </p>
              <p className="text-sm">
                Target opening: {data.plan?.target_date || "Not recorded"}
              </p>
              <p className="text-sm">
                {
                  data.account_staff.filter(
                    (s) => !s.access_suspended && !s.is_test_account,
                  ).length
                }{" "}
                active staff accounts ·{" "}
                {data.staff.filter((s) => !s.appointed || !s.profile_id).length}{" "}
                roster records need appointment reconciliation
              </p>
              <button
                className="text-gold text-sm mt-3"
                onClick={() => go("people")}
              >
                Review people & appointments →
              </button>
            </section>
            <section className="panel p-5">
              <h2 className="font-display text-xl">Opening Funding</h2>
              <p className="text-sm mt-3">
                Budget {money(fund.budget_cents / 100)} · Received{" "}
                {money(fund.received_cents / 100)}
              </p>
              <p className="text-sm">
                Spent {money(fund.spent_cents / 100)} · Available{" "}
                {money(fund.available_cents / 100)} · Funding gap{" "}
                {money(fund.remaining_cents / 100)}
              </p>
              <p className="text-xs text-muted mt-2">
                Opening campaign totals. Pledges and operating ledger totals are
                separate views.
              </p>
              <Link className="text-gold text-sm block mt-3" to={dev}>
                Open Post Development →
              </Link>
            </section>
          </div>
          <section className="panel p-5">
            <h2 className="font-display text-xl">Support & National Review</h2>
            <p className="text-sm mt-3">
              {data.plan?.help_needed ||
                "No launch assistance request recorded."}
            </p>
            {data.escalations.slice(0, 3).map((e) => (
              <p className="text-sm mt-2" key={e.id}>
                {e.subject} · {e.status}
                {e.response ? ` · National: ${e.response}` : ""}
              </p>
            ))}
            <button
              className="text-gold text-sm mt-3"
              onClick={() => go("governance")}
            >
              Review or request assistance →
            </button>
          </section>
        </>
      )}
      {tab === "people" && (
        <>
          <section className="panel p-5">
            <h2 className="font-display text-xl">Membership & Recruiting</h2>
            <p className="text-sm mt-3">
              {data.members.active} active · {data.members.lapsed} lapsed ·{" "}
              {data.members.expiring} expiring within 30 days
            </p>
            <div className="flex gap-3 flex-wrap mt-4">
              <Link className="btn-gold" to={`/members?post=${id}`}>
                Membership Roster
              </Link>
              {data.can_manage && (
                <Link className="btn-ghost" to={`/recruiting?post=${id}`}>
                  Recruiting
                </Link>
              )}
            </div>
          </section>
          <section className="panel p-5">
            <h2 className="font-display text-xl">
              Officer Roster & Account Appointments
            </h2>
            <p className="text-xs text-muted mt-2">
              A roster position and account authority are separate records.
              Verified, linked officers with current staff access count toward
              operational staffing.
            </p>
            <ul className="divide-y divide-hairline mt-3">
              {data.staff.map((s) => (
                <li key={s.id} className="py-3 text-sm">
                  <strong>{s.name}</strong> · {s.position.replaceAll("_", " ")}
                  <p className="text-xs text-muted mt-1">
                    Verification: {s.verification_status} ·{" "}
                    {s.appointed
                      ? "Current staff appointment"
                      : "Appointment needs review"}{" "}
                    · {s.profile_id ? "Account linked" : "No linked account"}
                    {s.appointments
                      .map(
                        (a) => ` · ${a.title || a.role.replaceAll("_", " ")}`,
                      )
                      .join("")}
                  </p>
                  {s.member_id && (
                    <Link
                      className="text-gold text-xs"
                      to={`/members?post=${id}&highlight=${s.member_id}`}
                    >
                      Open connected member record →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {!data.staff.length && (
              <p className="text-sm mt-3">No officer roster records.</p>
            )}
            <div className="flex gap-3 flex-wrap mt-4">
              {data.can_manage && (
                <Link className="btn-ghost" to={`${records}?tab=officers`}>
                  Manage officer roster
                </Link>
              )}
              {isNational && (
                <Link className="btn-ghost" to="/users">
                  Review Accounts & Access
                </Link>
              )}
            </div>
          </section>
          {data.account_staff.some(
            (s) => !s.email_confirmed || !s.has_signed_in,
          ) && (
            <section className="panel p-5">
              <h2 className="font-display text-xl">Staff Account Readiness</h2>
              {data.account_staff
                .filter((s) => !s.email_confirmed || !s.has_signed_in)
                .map((s) => (
                  <p className="text-sm mt-3" key={s.id}>
                    {s.full_name} ·{" "}
                    {s.email_confirmed
                      ? "Email confirmed"
                      : "Email confirmation pending"}{" "}
                    ·{" "}
                    {s.has_signed_in
                      ? "Has signed in"
                      : "First sign-in pending"}
                  </p>
                ))}
              <p className="text-xs text-muted mt-3">
                Use the connected membership record to review activation and
                resend an invitation or reset link where authorized.
              </p>
            </section>
          )}
          {data.account_staff.filter((s) => !s.roster_linked).length > 0 && (
            <section className="panel p-5">
              <h2 className="font-display text-xl">
                Staff Accounts Without a Roster Link
              </h2>
              {data.account_staff
                .filter((s) => !s.roster_linked)
                .map((s) => (
                  <p className="text-sm mt-3" key={s.id}>
                    {s.full_name} ·{" "}
                    {s.appointments
                      .map((a) => a.title || a.role.replaceAll("_", " "))
                      .join(", ")}
                    {s.access_suspended ? " · Suspended" : ""}
                    {s.is_test_account ? " · Test account" : ""}
                  </p>
                ))}
              <p className="text-xs text-muted mt-3">
                National reviews assignments in Accounts & Access. These
                accounts are not silently added to officer positions.
              </p>
            </section>
          )}
        </>
      )}
      {tab === "meetings" && (
        <>
          <section className="panel p-5">
            <div className="flex gap-3 justify-between flex-wrap">
              <h2 className="font-display text-xl">Meeting Records</h2>
              <Link className="btn-ghost" to={`/meetings?post=${id}`}>
                {canStart ? "Start / Schedule Meeting" : "Open Meetings"}
              </Link>
            </div>
            <p className="text-xs text-muted mt-3">
              Scheduled, live, completed, and legacy records. Publication is
              shown separately from completion. Most recent 30 records.
            </p>
            <ul className="divide-y divide-hairline mt-3">
              {data.meetings.map((m) => (
                <li key={m.path} className="py-3">
                  <Link className="text-gold text-sm" to={m.path}>
                    {m.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {new Date(m.meeting_at).toLocaleString()} ·{" "}
                    {m.status.replaceAll("_", " ")} ·{" "}
                    {m.published_at
                      ? "Minutes published"
                      : `Minutes ${m.minutes_state}`}
                  </p>
                </li>
              ))}
            </ul>
            {!data.meetings.length && (
              <p className="text-sm mt-3">No meeting records available.</p>
            )}
          </section>
          <section className="panel p-5">
            <h2 className="font-display text-xl">
              Open Tasks & Meeting Follow-up
            </h2>
            <ul className="divide-y divide-hairline mt-3">
              {data.tasks.map((t) => (
                <li key={t.id} className="py-3">
                  <Link className="text-gold text-sm" to={t.path}>
                    {t.title}
                  </Link>
                  <p className="text-xs text-muted">
                    Owner: {t.owner || "Unassigned"} · Due:{" "}
                    {t.due_date || "Not set"} · {t.kind}
                  </p>
                </li>
              ))}
            </ul>
            {!data.tasks.length && (
              <p className="text-sm mt-3">No open tasks recorded.</p>
            )}
          </section>
        </>
      )}
      {tab === "development" && (
        <section className="panel p-5">
          <h2 className="font-display text-xl">Post Development</h2>
          <p className="text-sm mt-3">
            Stage: {data.plan?.stage.replaceAll("_", " ") ?? "Not initialized"}{" "}
            · Owner: {data.plan?.owner_name || "Unassigned"} · Target:{" "}
            {data.plan?.target_date || "Not set"}
          </p>
          <p className="text-sm mt-2">
            Facility plans, location proposals, National approvals, funding
            campaigns, budgets, and launch tasks share one workflow.
          </p>
          <Link className="btn-gold inline-block mt-4" to={dev}>
            Open Post Development
          </Link>
        </section>
      )}
      {tab === "sponsors" && (
        <section className="panel p-5">
          <h2 className="font-display text-xl">Sponsorship</h2>
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Value
              label="Prospect pipeline"
              amount={data.sponsorship.pipeline}
            />
            <Value label="Won / pledged" amount={data.sponsorship.pledged} />
            <Value
              label="Received after refunds"
              amount={data.sponsorship.received}
            />
          </div>
          <p className="text-xs text-muted mt-3">
            Test payments excluded. Receipt allocation to an opening campaign is
            managed in Post Development.
          </p>
          <Link
            className="btn-gold inline-block mt-4"
            to={`/sponsors?post=${id}`}
          >
            Open Sponsor Workflow
          </Link>
        </section>
      )}
      {tab === "finances" && (
        <section className="panel p-5">
          <h2 className="font-display text-xl">Operating Ledger</h2>
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Value label="Recorded income" amount={data.finance.income} />
            <Value label="Recorded expenses" amount={data.finance.expenses} />
            <Value
              label="Recorded balance"
              amount={data.finance.income - data.finance.expenses}
            />
          </div>
          <p className="text-sm mt-4">
            Last entry: {data.finance.last_entry ?? "No entries recorded"} ·
            Future-dated expenses: {money(data.finance.future_expenses)}
          </p>
          <p className="text-sm mt-2">
            Average recorded monthly expenses over 90 days:{" "}
            {money(data.finance.monthly_expense)}
            {data.finance.monthly_expense > 0
              ? ` · Approximate recorded runway: ${Math.max(0, (data.finance.income - data.finance.expenses) / data.finance.monthly_expense).toFixed(1)} months`
              : ""}
          </p>
          <p className="text-xs text-muted mt-3">
            These figures use recorded ledger entries through today. Confirm
            bank balances and outstanding obligations before making spending
            decisions. Sponsor receipts appear here only when recorded in the
            operating ledger; opening totals have their own allocation rules.
          </p>
          {data.can_manage && (
            <Link
              className="btn-gold inline-block mt-4"
              to={`${records}?view=financial`}
            >
              View / Record Transactions
            </Link>
          )}
          <Link
            className="btn-ghost inline-block mt-4 ml-3"
            to={`${dev}&tab=budget`}
          >
            Opening Budget & Spending
          </Link>
        </section>
      )}
      {tab === "documents" && (
        <section className="panel p-5">
          <h2 className="font-display text-xl">Post Documents & Files</h2>
          <p className="text-sm mt-3">
            Open this post’s drive for minutes, agreements, plans, and working
            documents. Existing workspace and sharing permissions apply.
          </p>
          <Link className="btn-gold inline-block mt-4" to={`/drive?post=${id}`}>
            Open Post Drive
          </Link>
          <Link
            className="btn-ghost inline-block mt-4 ml-3"
            to={`${dev}&tab=documents`}
          >
            Launch Documents & History
          </Link>
        </section>
      )}
      {tab === "governance" && (
        <>
          <section className="panel p-5">
            <h2 className="font-display text-xl">
              Operational Health & Record Coverage
            </h2>
            {health.error && (
              <p role="alert" className="text-status-attention mt-3">
                {health.error}
              </p>
            )}
            {!active ? (
              <p className="text-sm mt-3">
                Operating health starts when the post is active. Follow launch
                requirements in Post Development.
              </p>
            ) : score ? (
              <>
                <p className="text-sm mt-3">
                  Composite {score.score}/100 · Status{" "}
                  {score.overall.toUpperCase()} · {score.coverage}% scored
                  record coverage
                </p>
                <p className="text-xs text-muted mt-2">
                  Operational indicators use current account-linked staff,
                  recorded receipts, published meetings, and dated records.
                  Thresholds are{" "}
                  {data.policy.settings.confirmed
                    ? "confirmed by National"
                    : "provisional and awaiting National review"}
                  . Missing financial records require attention. Neutral signals
                  are excluded from the average.
                </p>
                {score.critical.length > 0 && (
                  <p className="text-status-attention text-sm mt-3">
                    Critical: {score.critical.join(", ")}
                  </p>
                )}
                <div className="grid sm:grid-cols-2 gap-3 mt-4">
                  {score.dimensions.map((d) => (
                    <div
                      key={d.key}
                      className={`panel p-3 border-l-4 ${healthColor(d.status)}`}
                    >
                      <strong className="text-sm">
                        {d.label} · {d.status}
                      </strong>
                      <p className="text-xs text-muted mt-1">{d.detail}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm mt-3">Loading current health evidence…</p>
            )}
            {data.can_manage && (
              <Link className="btn-ghost inline-block mt-4" to={records}>
                Manage Reviews, Signatures & Service Records
              </Link>
            )}
            <Link className="btn-ghost inline-block mt-4 ml-3" to="/congress">
              Veterans Congress
            </Link>
          </section>
          {isNational && (
            <HealthPolicyEditor
              key={data.policy.version}
              policy={data.policy}
              onSaved={refresh}
            />
          )}
          <StateEscalations
            posts={[{ id: id!, name: postDisplayName(data.post) }]}
          />
          {isNational && (
            <section className="panel p-5">
              <button
                className="text-sm text-gold"
                onClick={() => setShowAdmin((v) => !v)}
                aria-expanded={showAdmin}
              >
                Post Administration
              </button>
              {showAdmin && (
                <div className="mt-4">
                  <p className="text-sm">
                    Archive removes the post from current operations lists and
                    preserves its records and access. Account suspension is
                    managed separately in Accounts & Access.
                  </p>
                  <label className="block text-sm mt-3">
                    Reason
                    <textarea
                      className="input-field mt-1"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      minLength={5}
                      maxLength={1000}
                    />
                  </label>
                  <button
                    disabled={busy || reason.trim().length < 5}
                    onClick={archive}
                    className="btn-ghost mt-3"
                  >
                    {busy
                      ? "Saving…"
                      : data.post.archived_at
                        ? "Restore Post"
                        : "Archive Post"}
                  </button>
                  {data.archive_history.map((h) => (
                    <p className="text-xs text-muted mt-3" key={h.id}>
                      {h.action} · {new Date(h.created_at).toLocaleString()} ·{" "}
                      {h.actor_name} · {h.reason}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="panel p-4 text-left hover:border-gold">
      <p className="eyebrow">{label}</p>
      <p className="font-display text-2xl mt-2 capitalize">{value}</p>
      <p className="text-xs text-muted mt-2">{detail}</p>
    </button>
  );
}
function Value({ label, amount }: { label: string; amount: number }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="font-display text-2xl mt-2">{money(amount)}</p>
    </div>
  );
}
