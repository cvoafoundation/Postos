import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
export interface ModuleItem {
  id: string;
  title: string;
  due_date: string | null;
  kind: string;
  path: string;
  module: string;
  next_step: string;
}
export function ModuleWork() {
  const [data, setData] = useState<{
      total: number;
      items: ModuleItem[];
    } | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("All"),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const r = await supabase.rpc("ops_module_queue");
      if (!active) return;
      if (r.error) {
        setError(r.error.message);
        return;
      }
      setData(r.data);
      setError("");
    }
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [version]);
  const modules = ["All", ...new Set(data?.items.map((i) => i.module) || [])];
  const items =
    data?.items.filter((i) => filter === "All" || i.module === filter) || [];
  return (
    <section className="panel p-5" aria-label="Connected module work">
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-semibold">Work from across CVOA.ONE</h3>
          <p className="text-xs text-muted mt-2">
            Meetings, membership, applications, launch, fundraising, and
            sponsorship. Complete each step in its original record; this list
            updates automatically.
          </p>
        </div>
        <button
          className="btn-ghost self-start"
          aria-label="Refresh connected work"
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm mt-3">
          {error}
        </p>
      ) : !data ? (
        <p role="status" className="text-sm text-muted mt-3">
          Loading connected work…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mt-4">
            {modules.map((m) => (
              <button
                key={m}
                aria-pressed={filter === m}
                className={`text-xs px-3 py-2 rounded border border-hairline ${filter === m ? "bg-white text-black" : "text-muted hover:bg-surface"}`}
                onClick={() => setFilter(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted my-3">
            {data.total} source items · showing up to 100 by date · refreshed
            every 30 seconds
          </p>
          <div className="divide-y divide-hairline">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.path}
                className="py-4 flex gap-3 justify-between hover:text-gold"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    {item.module}
                  </p>
                  <p className="text-sm font-semibold mt-1">{item.title}</p>
                  <p className="text-xs text-muted mt-2">{item.next_step}</p>
                  <p className="text-xs text-muted mt-2">
                    {item.due_date
                      ? `Reference / due date: ${item.due_date}`
                      : "No date recorded"}
                  </p>
                </div>
                <ArrowUpRight size={17} className="shrink-0 mt-4" />
              </a>
            ))}
          </div>
          {!items.length && (
            <p className="text-sm text-muted py-4">
              No items need attention in this view.
            </p>
          )}
        </>
      )}
    </section>
  );
}
