import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import type { PostDashboard } from "@/pages/posts/model";
export function MeetingsPanel({ postId }: { postId: string }) {
  const [data, setData] = useState<PostDashboard | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setLoading(true);
    void supabase
      .rpc("cvoa_post_dashboard", { p_post: postId })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setData(data as PostDashboard);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId, version]);
  return (
    <section>
      <Link
        className="btn-ghost inline-block mb-4"
        to={`/meetings?post=${postId}`}
      >
        Open Meetings
      </Link>
      <WorkspaceStatus
        loading={loading}
        error={error}
        retry={() => setVersion((v) => v + 1)}
      />
      {data && (
        <>
          <p className="text-xs text-muted mb-3">
            Most recent meeting records across URO and legacy tools.
          </p>
          {data.meetings.length ? (
            <ul className="divide-y divide-hairline">
              {data.meetings.map((m) => (
                <li key={m.path} className="py-3 text-sm">
                  <Link className="text-gold" to={m.path}>
                    {m.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {new Date(m.meeting_at).toLocaleString()} ·{" "}
                    {m.status.replaceAll("_", " ")} ·{" "}
                    {m.published_at ? "Published minutes" : m.minutes_state}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No meeting records available.</p>
          )}
        </>
      )}
    </section>
  );
}
