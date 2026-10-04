import { Link } from "react-router-dom";
import { useWorkspace } from "@/lib/workspaces";
import { WorkspaceStatus } from "./WorkspaceStatus";

export default function ActionQueue() {
  const { data, error, loading, refresh } = useWorkspace<{
    total: number;
    items: {
      id: string;
      title: string;
      due_date: string | null;
      kind: string;
      path: string;
    }[];
  }>("cvoa_action_queue");
  return (
    <section className="panel p-5 mb-6" aria-label="Action queue">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-xl">Needs Your Attention</h2>
        <button onClick={refresh} className="text-sm text-gold">
          Refresh
        </button>
      </div>
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {data && (
        <>
          <p className="text-xs text-muted mt-2 mb-4">
            {data.total} open items · deadlines, renewals, minutes, and reviews
            {data.total > 100 ? " · showing the first 100 by due date" : ""}
          </p>
          {data.items.length === 0 ? (
            <p className="text-sm text-muted">
              No items currently require attention.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {data.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    className="flex gap-3 justify-between py-3 text-sm hover:text-gold"
                  >
                    <span>
                      {item.title}
                      <span className="block text-xs text-muted capitalize">
                        {item.kind}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs">
                      {item.due_date ?? "No due date"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
