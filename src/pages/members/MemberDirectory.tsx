import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { ListPagination, LIST_PAGE_SIZE } from "@/components/ui/ListPagination";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import { useWorkspace } from "@/lib/workspaces";
import { useAuth } from "@/context/AuthContext";
type Directory = {
  total: number;
  members: {
    id: string;
    full_name: string;
    post_id: string | null;
    post_name: string | null;
    city: string | null;
    state: string | null;
  }[];
};
export default function MemberDirectory() {
  const { isNational, profile } = useAuth();
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [state, setState] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, loading, error, refresh } = useWorkspace<Directory>(
    "cvoa_member_directory",
    { p_search: search, p_state: state, p_page: page, p_size: LIST_PAGE_SIZE },
  );
  const staff =
    isNational ||
    ["post_commander", "post_officer", "state_commander"].includes(
      profile?.role ?? "",
    );
  return (
    <div>
      <PageHeader
        eyebrow="CVOA Community"
        title="Member Directory"
        action={
          staff ? (
            <Link className="btn-ghost" to="/members">
              Manage Membership Roster
            </Link>
          ) : undefined
        }
      />
      <p className="text-sm text-muted mb-6">
        Find active CVOA members and their post or state affiliation. Contact
        information, service documents, payments, and account permissions stay
        private.
      </p>
      <div className="flex flex-wrap gap-4 mb-5">
        <label className="text-sm flex-1">
          Search Members or Posts
          <input
            className="input-field mt-1"
            placeholder="Name, post, city, or state…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="text-sm">
          State
          <input
            className="input-field mt-1 w-24"
            maxLength={2}
            placeholder="All"
            value={state}
            onChange={(e) => {
              setState(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""));
              setPage(0);
            }}
          />
        </label>
        <button className="btn-ghost self-end" onClick={refresh}>
          Refresh
        </button>
      </div>
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {data && (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {["Member", "Post", "Location"].map((s) => (
                    <th scope="col" key={s} className="table-head">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td className="table-cell">{m.full_name}</td>
                    <td className="table-cell">
                      {m.post_name ?? "National At-Large"}
                    </td>
                    <td className="table-cell text-muted">
                      {[m.city, m.state].filter(Boolean).join(", ") ||
                        "Not Listed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.members.length && (
              <p className="p-5 text-sm text-muted">
                No members match this search.
              </p>
            )}
          </div>
          <ListPagination
            page={page}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
