import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/lib/workspaces";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import ActionQueue from "@/components/workspaces/ActionQueue";
import StateEscalations from "@/components/workspaces/StateEscalations";
import { POST_STATUS_LABELS, type PostStatus } from "@/lib/types";

import { usePostHealth, healthColor } from "@/lib/usePostHealth";

interface StatePost {
  id: string;
  name: string;
  city: string;
  state: string;
  status: PostStatus;
  health_status: string;
  archived_at: string | null;
  active_members: number;
  last_meeting: string | null;
  open_actions: number;
  overdue_actions: number;
  draft_meetings: number;
  active_campaigns: number;
  support_requests: number;
}
export default function StateHome() {
  const { isNational } = useAuth();
  const { data, error, loading, refresh } = useWorkspace<{
    state: string | null;
    posts: StatePost[];
  }>("cvoa_state_workspace");
  const [healthVersion, setHealthVersion] = useState(0);
  const health = usePostHealth(
    data?.posts
      .filter((p) => p.status === "active_post" && !p.archived_at)
      .map((p) => p.id) ?? [],
    healthVersion,
  );
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [supportOnly, setSupportOnly] = useState(false);
  const needs = (p: StatePost) =>
    [
      p.support_requests > 0
        ? `${p.support_requests} open support request(s)`
        : "",
      p.overdue_actions > 0 ? `${p.overdue_actions} overdue task(s)` : "",
      p.draft_meetings > 0
        ? `${p.draft_meetings} meeting report(s) awaiting publication`
        : "",
      p.status !== "active_post"
        ? `Launch stage: ${POST_STATUS_LABELS[p.status]}`
        : "",
      !p.last_meeting ? "No published meeting report" : "",
    ].filter(Boolean);
  const visible =
    data?.posts.filter(
      (p) =>
        !p.archived_at &&
        (!state || p.state === state) &&
        `${p.name} ${p.city} ${p.state}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()) &&
        (!supportOnly || needs(p).length > 0),
    ) ?? [];
  return (
    <div>
      <PageHeader
        eyebrow={
          isNational
            ? "National → States → Posts"
            : `State Command · ${data?.state ?? "Assigned state"}`
        }
        title="State Overview"
      />
      <p className="text-muted text-sm mb-6">
        Monitor post readiness, membership, meeting reports, and outstanding
        work. National retains appointment and approval authority; post staff
        manage daily operations.
      </p>
      <button
        className="btn-ghost mb-4"
        onClick={() => {
          refresh();
          setHealthVersion((v) => v + 1);
        }}
      >
        Refresh post activity &amp; health
      </button>
      <ActionQueue />
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {data && (
        <>
          {isNational && (
            <label className="block mb-6 text-sm">
              State
              <select
                className="input-field mt-2 max-w-xs"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="">All states</option>
                {[...new Set(data.posts.map((p) => p.state))]
                  .sort()
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <label className="text-sm flex-1 min-w-48">
              Find a post
              <input
                className="input-field mt-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Post name, city, or state"
              />
            </label>
            <label className="text-sm flex items-center gap-2 pb-3">
              <input
                type="checkbox"
                checked={supportOnly}
                onChange={(e) => setSupportOnly(e.target.checked)}
              />
              Needs support only
            </label>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            {[
              ["Posts", visible.length],
              [
                "Active Members",
                visible.reduce((n, p) => n + p.active_members, 0),
              ],
              ["Open Tasks", visible.reduce((n, p) => n + p.open_actions, 0)],
            ].map(([label, count]) => (
              <div key={label} className="panel p-4">
                <p className="eyebrow">{label}</p>
                <p className="font-display text-3xl">{count}</p>
              </div>
            ))}
          </div>
          {visible.length === 0 && (
            <p className="text-muted">
              No posts match this view. Clear the filters to see all assigned
              posts.
            </p>
          )}
          <section className="panel p-5 mb-6">
            <h2 className="font-display text-xl">Posts needing support</h2>
            <p className="text-xs text-muted mt-1 mb-3">
              Recorded work and reporting gaps; contact the post to confirm what
              help is needed.
            </p>
            {visible.filter((p) => needs(p).length).length === 0 ? (
              <p className="text-sm text-muted">No support flags recorded.</p>
            ) : (
              <ul className="space-y-3">
                {visible
                  .filter((p) => needs(p).length)
                  .sort(
                    (a, b) =>
                      b.support_requests +
                      b.overdue_actions -
                      (a.support_requests + a.overdue_actions),
                  )
                  .map((p) => (
                    <li key={p.id} className="text-sm">
                      <Link
                        className="text-gold font-medium"
                        to={`/post-overview/${p.id}`}
                      >
                        {p.name} →
                      </Link>
                      <p className="text-muted">{needs(p).join(" · ")}</p>
                    </li>
                  ))}
              </ul>
            )}
          </section>
          {health.error && (
            <p role="alert" className="text-status-attention mb-4">
              Health scores unavailable: {health.error}
            </p>
          )}
          <div className="space-y-4">
            {visible.map((p) => (
              <section
                key={p.id}
                className={`panel p-5 border-l-4 ${healthColor(health.scores[p.id]?.overall)}`}
              >
                <h2 className="font-display text-xl">
                  <Link
                    className="text-gold hover:underline"
                    to={`/post-overview/${p.id}`}
                  >
                    {p.name} →
                  </Link>
                </h2>
                <p className="text-sm text-muted">
                  {p.city}, {p.state} · {POST_STATUS_LABELS[p.status]}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm my-4">
                  <div>
                    <dt className="text-muted">Active members</dt>
                    <dd>
                      <Link
                        className="hover:underline"
                        to={`/post-overview/${p.id}`}
                      >
                        {p.active_members} → Overview
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Post health</dt>
                    <dd
                      className={`font-medium ${healthColor(health.scores[p.id]?.overall)}`}
                    >
                      {p.status !== "active_post"
                        ? "Launch readiness · forming"
                        : health.scores[p.id]
                          ? `${health.scores[p.id].score}/100 · ${health.scores[p.id].overall.toUpperCase()}`
                          : health.loading
                            ? "Loading score…"
                            : "Score unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Last published meeting</dt>
                    <dd>
                      <Link
                        className="hover:underline"
                        to={`/post-overview/${p.id}?tab=meetings`}
                      >
                        {p.last_meeting ?? "Awaiting report"} →
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Open tasks / overdue</dt>
                    <dd>
                      <Link
                        className="hover:underline"
                        to={`/post-overview/${p.id}?tab=meetings`}
                      >
                        {p.open_actions} / {p.overdue_actions ?? 0} →
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">
                      Fundraising campaigns underway
                    </dt>
                    <dd>
                      <Link
                        className="hover:underline"
                        to={`/post-overview/${p.id}?tab=development`}
                      >
                        {p.active_campaigns ?? 0} →
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Open support requests</dt>
                    <dd>{p.support_requests ?? 0}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-4">
                  <Link
                    className="text-sm text-gold"
                    to={`/post-overview/${p.id}`}
                  >
                    Open post dashboard →
                  </Link>
                  <Link
                    className="text-sm text-gold"
                    to={`/fundraising?post=${p.id}`}
                  >
                    Fundraising
                  </Link>
                  {isNational && (
                    <Link className="text-sm text-gold" to={`/health/${p.id}`}>
                      Manage Post →
                    </Link>
                  )}
                </div>
                <p className="text-xs text-muted mt-3">
                  For intervention or a missing report, contact the post
                  commander or escalate to National.
                </p>
              </section>
            ))}
          </div>
          <StateEscalations posts={visible} />
        </>
      )}
    </div>
  );
}
