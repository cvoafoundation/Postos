import { useEffect, useState } from "react";
import {
  ArrowRight,
  AlertCircle,
  MessageSquare,
  ListTodo,
  RefreshCw,
} from "lucide-react";
import { ModuleWork } from "./ModuleWork";
import { supabase } from "@/lib/supabase";
import { STATUS, type Channel, type Task, type Report } from "./types";

type Update = Report & { channel_id: string };
export function OperationsHome({
  userId,
  channels,
  mine,
  onGo,
  onGuide,
}: {
  userId: string;
  channels: Channel[];
  mine: boolean;
  onGo: (id: string, tab: string) => void;
  onGuide: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let taskQuery = supabase.from("ops_tasks").select("*");
        taskQuery = taskQuery.in("status", ["on_track", "at_risk", "blocked"]);
        if (mine) taskQuery = taskQuery.eq("owner_id", userId);
        const [actions, reports] = await Promise.all([
          taskQuery.order("due_date", { ascending: true }).limit(200),
          supabase
            .from("ops_reports")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(20),
        ]);
        if (actions.error || reports.error)
          throw new Error(actions.error?.message || reports.error?.message);
        if (active) {
          setTasks(actions.data || []);
          setUpdates(reports.data || []);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load your work.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [userId, mine, revision]);
  const channelName = (id: string) =>
    channels.find((c) => c.id === id)?.name || "Team conversation";
  const localToday = new Date();
  const today = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const own = tasks.filter(
    (t) => t.owner_id === userId && t.status !== "complete",
  );
  const visible = mine
    ? own
    : tasks.filter(
        (t) =>
          t.status !== "complete" &&
          (t.owner_id === userId ||
            t.status === "blocked" ||
            t.due_date < today),
      );
  const teams = channels.filter((c) => c.scope !== "direct" && !c.archived);
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">
            {mine ? "My work" : "Your Operations home"}
          </h2>
          <p className="text-sm text-muted mt-2">
            {mine
              ? "Your assigned actions, across every team you can access."
              : "See what needs attention, share progress, and keep CVOA moving."}
          </p>
        </div>
        <button
          className="btn-ghost self-start"
          aria-label="Refresh home"
          onClick={() => setRevision((r) => r + 1)}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {error && (
        <p role="alert" className="border border-red-900 p-3 text-sm">
          {error}
        </p>
      )}
      {!mine && (
        <section className="panel p-5">
          <div className="flex justify-between gap-3">
            <h3 className="font-semibold">Start here</h3>
            <button className="text-xs underline text-muted" onClick={onGuide}>
              Read the operating guide
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-5 mt-4">
            {[
              [
                "1. Choose your team",
                "Open a conversation below. Share an update or ask a question in plain language.",
              ],
              [
                "2. Give the next step an owner",
                "Use Actions to name one person, an outcome, and a deadline.",
              ],
              [
                "3. Keep everyone informed",
                "Log an engagement in Activity, or use Reports for completed, next, and blocked work.",
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <h4 className="text-sm font-semibold">{title}</h4>
                <p className="text-xs text-muted leading-relaxed mt-2">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          ["Assigned to me", own.length, ListTodo],
          [
            "My overdue actions",
            own.filter((t) => t.due_date < today).length,
            AlertCircle,
          ],
          [
            "My blocked actions",
            own.filter((t) => t.status === "blocked").length,
            AlertCircle,
          ],
        ].map(([title, count, Icon]) => {
          const Component = Icon as typeof ListTodo;
          return (
            <div className="panel p-4" key={String(title)}>
              <Component size={18} className="text-muted mb-3" />
              <p className="text-2xl font-semibold">{String(count)}</p>
              <p className="text-xs text-muted mt-1">{String(title)}</p>
            </div>
          );
        })}
      </div>
      {!mine && <ModuleWork />}
      <section>
        <h3 className="font-semibold mb-3">
          {mine ? "Assigned to you" : "Needs attention"}
        </h3>
        <p className="text-xs text-muted mb-3">
          {mine
            ? "Open an action to update its progress in the team workspace."
            : "Your assignments, plus overdue and blocked actions visible to you. Earliest deadlines first."}
        </p>
        {loading ? (
          <p role="status" className="text-sm text-muted">
            Loading your work…
          </p>
        ) : visible.length ? (
          <div className="space-y-2">
            {visible.map((t) => (
              <button
                key={t.id}
                className="panel p-4 w-full text-left flex justify-between items-center gap-3 hover:bg-surface"
                onClick={() => onGo(t.channel_id, "actions")}
              >
                <div>
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="text-xs text-muted mt-1">
                    {channelName(t.channel_id)} · {STATUS[t.status] || t.status}{" "}
                    · Due {t.due_date}
                    {t.owner_id === userId ? " · Assigned to you" : ""}
                  </p>
                </div>
                <ArrowRight size={16} className="shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="panel p-5 text-sm text-muted">
            {mine
              ? "You have no open assigned actions."
              : "No assigned, overdue, or blocked actions in the current view. Open a team below to share progress or plan the next step."}
          </div>
        )}
      </section>
      {!mine && (
        <section>
          <h3 className="font-semibold mb-3">Your team conversations</h3>
          <p className="text-xs text-muted mb-3">
            Each conversation has its own messages, actions, activity log, and
            reports. Access follows your CVOA role.
          </p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {teams.map((c) => (
              <button
                key={c.id}
                onClick={() => onGo(c.id, "messages")}
                className="panel p-4 text-left hover:bg-surface"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} />
                  <strong className="text-sm break-words">{c.name}</strong>
                  {Number(c.unread) > 0 && (
                    <span className="ml-auto text-xs bg-white text-black px-2 rounded">
                      {c.unread} new
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-2 line-clamp-2">
                  {c.description || "Open this team workspace"}
                </p>
                <p className="text-xs mt-3 underline">Open conversation</p>
              </button>
            ))}
          </div>
          {!teams.length && !loading && (
            <p className="text-sm text-muted">
              Your team conversations are loading or have not been assigned yet.
            </p>
          )}
        </section>
      )}
      {!mine && (
        <section>
          <h3 className="font-semibold mb-3">Latest team reports</h3>
          {updates.length ? (
            <div className="space-y-3">
              {updates.map((r) => (
                <button
                  key={r.id}
                  className="panel p-4 text-left w-full hover:bg-surface"
                  onClick={() => onGo(r.channel_id, "reports")}
                >
                  <p className="text-xs text-muted">
                    {channelName(r.channel_id)} · {r.period}
                  </p>
                  <p className="text-sm mt-2 whitespace-pre-wrap line-clamp-3">
                    {r.completed || "No completed work reported."}
                  </p>
                  {r.blocked && (
                    <p className="text-xs mt-2 line-clamp-2">
                      <strong>Needs help:</strong> {r.blocked}
                    </p>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No reports yet. Use Reports in your team to share what is
              completed, what comes next, and where you need help.
            </p>
          )}
        </section>
      )}
      <p className="text-[11px] text-muted">
        Shows up to 200 earliest actions and 20 latest reports you can access.
        Updates every 30 seconds.
      </p>
    </div>
  );
}
