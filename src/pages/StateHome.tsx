import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/lib/workspaces";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import ActionQueue from "@/components/workspaces/ActionQueue";
import StateEscalations from "@/components/workspaces/StateEscalations";
import { POST_STATUS_LABELS, type PostStatus } from "@/lib/types";

interface StatePost {
  id: string;
  name: string;
  city: string;
  state: string;
  status: PostStatus;
  health_status: string;
  active_members: number;
  last_meeting: string | null;
  open_actions: number;
}
export default function StateHome() {
  const { isNational } = useAuth();
  const { data, error, loading, refresh } = useWorkspace<{
    state: string | null;
    posts: StatePost[];
  }>("cvoa_state_workspace");
  const [state, setState] = useState("");
  const visible = data?.posts.filter((p) => !state || p.state === state) ?? [];
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
              No posts are assigned to this state yet.
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {visible.map((p) => (
              <section key={p.id} className="panel p-5">
                <h2 className="font-display text-xl">{p.name}</h2>
                <p className="text-sm text-muted">
                  {p.city}, {p.state} · {POST_STATUS_LABELS[p.status]}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm my-4">
                  <div>
                    <dt className="text-muted">Active members</dt>
                    <dd>{p.active_members}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Post health</dt>
                    <dd className="capitalize">{p.health_status}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Last published meeting</dt>
                    <dd>{p.last_meeting ?? "Awaiting report"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Open tasks</dt>
                    <dd>{p.open_actions}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-4">
                  <Link className="text-sm text-gold" to={`/post-overview/${p.id}`}>Post operations →</Link>
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
