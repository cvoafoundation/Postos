import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/AppShell";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
interface Overview {
  post: { name: string; state: string; city: string; status: string };
  minutes: {
    id: string;
    title: string;
    meeting_date: string;
    status: string;
  }[];
  tasks: { id: string; description: string; due_date: string | null }[];
  campaigns: { id: string; title: string; status: string }[];
}
export default function ScopedPostOverview() {
  const { postId } = useParams(),
    { profile, isNational } = useAuth();
  const assignedPost = postId ?? profile?.post_id;
  const [data, setData] = useState<Overview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setLoading(true);
    if (!assignedPost) {
      setLoading(false);
      setError(
        "National must assign a post or a current Congress designation before this workspace is available.",
      );
      return;
    }
    void Promise.all([
      supabase
        .from("posts")
        .select("name,state,city,status")
        .eq("id", assignedPost)
        .single(),
      supabase
        .from("uro_meetings")
        .select("id,title,meeting_date,status")
        .eq("post_id", assignedPost)
        .order("meeting_date", { ascending: false })
        .limit(10),
      supabase
        .from("uro_action_items")
        .select("id,description,due_date")
        .eq("post_id", assignedPost)
        .eq("status", "open")
        .order("due_date")
        .limit(20),
      supabase
        .from("fundraising_campaigns")
        .select("id,title,status")
        .eq("post_id", assignedPost)
        .order("created_at", { ascending: false })
        .limit(10),
    ])
      .then(([post, minutes, tasks, campaigns]) => {
        for (const result of [post, minutes, tasks, campaigns])
          if (result.error) throw result.error;
        if (active)
          setData({
            post: post.data,
            minutes: minutes.data ?? [],
            tasks: tasks.data ?? [],
            campaigns: campaigns.data ?? [],
          } as Overview);
      })
      .catch((e) => {
        if (active)
          setError(
            e.message ?? "This post is outside your assigned jurisdiction.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignedPost, version]);
  return (
    <div>
      <PageHeader
        eyebrow={`${profile?.role === "delegate" ? "Congress designation" : "Scoped oversight"} · ${data?.post.state ?? "Assigned jurisdiction"}`}
        title={data?.post.name ?? "Post Overview"}
      />
      <p className="text-sm text-muted mb-6">
        Read post operations within your appointed jurisdiction. Staff
        appointments determine management authority. Congress voting authority
        comes from a current designated seat.
      </p>
      <WorkspaceStatus
        loading={loading}
        error={error}
        retry={() => setVersion((v) => v + 1)}
      />
      {data && (
        <>
          <div className="panel p-4 mb-5">
            <p>
              {data.post.city}, {data.post.state} ·{" "}
              {data.post.status.replaceAll("_", " ")}
            </p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              {isNational && <Link className="btn-gold" to={`/health/${assignedPost}`}>Manage post & launch →</Link>}
              <Link className="text-gold" to="/congress">
                Veterans Congress →
              </Link>
              {profile?.role === "delegate" ? (
                <>
                  <Link className="text-gold" to="/post-officers">
                    Post officers →
                  </Link>
                  <Link className="text-gold" to="/post-members">
                    Post member directory →
                  </Link>
                </>
              ) : (
                <Link className="text-gold" to="/members">
                  Membership Roster →
                </Link>
              )}
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <section className="panel p-5">
              <h2 className="font-display text-xl">Recent meetings</h2>
              {data.minutes.length === 0 ? (
                <p className="text-sm text-muted mt-3">
                  No meeting records available.
                </p>
              ) : (
                <ul className="space-y-3 text-sm mt-3">
                  {data.minutes.map((m) => (
                    <li key={m.id}>
                      <span>{m.title}</span>
                      <span className="text-muted block">
                        {m.meeting_date} · {m.status.replaceAll("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel p-5">
              <h2 className="font-display text-xl">Open post tasks</h2>
              {data.tasks.length === 0 ? (
                <p className="text-sm text-muted mt-3">No open tasks.</p>
              ) : (
                <ul className="space-y-3 text-sm mt-3">
                  {data.tasks.map((t) => (
                    <li key={t.id}>
                      {t.description}
                      <span className="text-muted block">
                        {t.due_date
                          ? `Due ${t.due_date}`
                          : "Deadline not recorded"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel p-5">
              <h2 className="font-display text-xl">Fundraising activity</h2>
              {data.campaigns.length === 0 ? (
                <p className="text-sm text-muted mt-3">
                  No campaigns recorded.
                </p>
              ) : (
                <ul className="space-y-3 text-sm mt-3">
                  {data.campaigns.map((c) => (
                    <li key={c.id}>
                      {c.title} · {c.status.replaceAll("_", " ")}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
