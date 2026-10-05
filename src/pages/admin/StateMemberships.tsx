import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import { useWorkspace } from "@/lib/workspaces";
import { useAuth } from "@/context/AuthContext";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import PersonWorkspace from "@/components/access/PersonWorkspace";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import { readAllRows } from "@/lib/readAllRows";
import type { LinkedMembership } from "@/lib/access";
import { ListPagination, LIST_PAGE_SIZE } from "@/components/ui/ListPagination";
export default function StateMemberships() {
  const [params, setParams] = useSearchParams(),
    postFilter = params.get("post") ?? "";
  const { profile } = useAuth(),
    [rows, setRows] = useState<LinkedMembership[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<LinkedMembership | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0),
    [page, setPage] = useState(0);
  const { data } = useWorkspace<{ posts: { id: string; name: string }[] }>(
    "cvoa_state_workspace",
  );
  const names = new Map(data?.posts.map((p) => [p.id, p.name]));
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void readAllRows<LinkedMembership>(() =>
      supabase
        .from("members")
        .select(
          "id,full_name,email,membership_number,membership_type,membership_status,dd214_review_status,post_id",
        )
        .order("id"),
    )
      .then((r) => {
        if (active) {
          setRows(r);
          setPage(0);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load the state roster.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profile?.state, version]);
  useEffect(() => {
    const highlight = params.get("highlight");
    if (!highlight) return;
    const found = rows.find(
      (r) => r.id === highlight && (!postFilter || r.post_id === postFilter),
    );
    if (found) {
      setSelected(found);
      const next = new URLSearchParams(params);
      next.delete("highlight");
      setParams(next, { replace: true });
    }
  }, [rows, params, postFilter, setParams]);
  const visible = rows.filter(
    (r) =>
      (!postFilter || r.post_id === postFilter) &&
      `${r.full_name} ${r.email ?? ""} ${r.membership_number ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div>
      <PageHeader
        eyebrow={`State oversight · ${profile?.state ?? "Assignment required"}`}
        title="State Membership Roster"
      />
      <p className="text-sm text-muted mb-6">
        Read membership, affiliation, activation, and verification information
        for posts in your assigned state. National manages access appointments;
        post staff manage member changes.
      </p>
      <label className="block text-sm mb-4">
        Post
        <select
          className="input-field mt-2"
          value={postFilter}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("post", e.target.value);
            else next.delete("post");
            setParams(next);
            setPage(0);
          }}
        >
          <option value="">All posts in my state</option>
          {data?.posts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm mb-4">
        Search state members
        <input
          className="input-field mt-2"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <WorkspaceStatus
        loading={loading}
        error={error}
        retry={() => setVersion((v) => v + 1)}
      />
      <div className="grid md:grid-cols-2 gap-3">
        {visible
          .slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE)
          .map((m) => (
            <button
              key={m.id}
              className="panel p-4 text-left hover:border-gold"
              onClick={() => setSelected(m)}
            >
              <span className="font-display text-xl">{m.full_name}</span>
              <span className="block text-sm text-muted mt-2">
                {m.post_id
                  ? (names.get(m.post_id) ?? "Assigned post")
                  : "National at large"}{" "}
                · {m.membership_status.replaceAll("_", " ")}
              </span>
            </button>
          ))}
      </div>
      {!loading && visible.length === 0 && (
        <p className="text-muted">
          No members match within your assigned posts.
        </p>
      )}
      <ListPagination
        page={page}
        total={visible.length}
        onPageChange={setPage}
      />
      {selected && (
        <Modal title="Member workspace" onClose={() => setSelected(null)}>
          <PersonWorkspace memberId={selected.id} />
        </Modal>
      )}
    </div>
  );
}
