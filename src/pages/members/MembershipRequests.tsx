import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import { readAllRows } from "@/lib/readAllRows";
import { supabase } from "@/lib/supabase";
import { ListPagination, LIST_PAGE_SIZE } from "@/components/ui/ListPagination";
interface RequestRow {
  id: string;
  member_id: string;
  target_post_id: string | null;
  reason: string;
  created_at: string;
}
export default function MembershipRequests() {
  const [rows, setRows] = useState<RequestRow[]>([]),
    [posts, setPosts] = useState<Record<string, string>>({}),
    [members, setMembers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [notes, setNotes] = useState<Record<string, string>>({});
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [r, p, m] = await Promise.all([
        readAllRows<RequestRow>(() =>
          supabase
            .from("membership_change_requests")
            .select("*")
            .eq("status", "pending")
            .order("id"),
        ),
        readAllRows<{ id: string; name: string }>(() =>
          supabase.from("posts").select("id,name").order("id"),
        ),
        readAllRows<{ id: string; full_name: string }>(() =>
          supabase.from("members").select("id,full_name").order("id"),
        ),
      ]);
      setRows(r);
      setPosts(Object.fromEntries(p.map((x) => [x.id, x.name])));
      setMembers(Object.fromEntries(m.map((x) => [x.id, x.full_name])));
      setPage(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function decide(r: RequestRow, approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc("cvoa_review_post_change", {
        p_request: r.id,
        p_approve: approve,
        p_note: notes[r.id] ?? "",
      });
      if (result.error) throw result.error;
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="National · Membership"
        title="Post Affiliation Requests"
      />
      <WorkspaceStatus loading={loading} error={error} retry={load} />
      {!loading && rows.length === 0 && (
        <p className="text-muted">No pending requests.</p>
      )}
      <div className="space-y-4">
        {rows
          .slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE)
          .map((r) => (
            <section key={r.id} className="panel p-5">
              <Link
                className="text-gold"
                to={`/members?highlight=${r.member_id}`}
              >
                {members[r.member_id] ?? "Member"}
              </Link>
              <p className="text-sm mt-2">
                Requested post:{" "}
                {r.target_post_id
                  ? (posts[r.target_post_id] ?? "Unavailable post")
                  : "National at large"}
              </p>
              <p className="text-sm text-muted mt-2 whitespace-pre-wrap">
                {r.reason}
              </p>
              <label className="block text-sm mt-4">
                Decision explanation (visible to member)
                <textarea
                  className="input-field mt-1"
                  value={notes[r.id] ?? ""}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                  }
                />
              </label>
              <div className="flex gap-3 mt-3">
                <button
                  className="btn-gold"
                  disabled={busy || !notes[r.id]?.trim()}
                  onClick={() => decide(r, true)}
                >
                  Approve Transfer
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy || !notes[r.id]?.trim()}
                  onClick={() => decide(r, false)}
                >
                  Decline
                </button>
              </div>
            </section>
          ))}
      </div>
      <ListPagination total={rows.length} page={page} onPageChange={setPage} />
    </div>
  );
}
