import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { readAllRows } from "@/lib/readAllRows";
import { WorkspaceStatus } from "./WorkspaceStatus";
interface Escalation {
  id: string;
  post_id: string;
  subject: string;
  message: string;
  status: string;
  response: string;
  created_at: string;
}
export default function StateEscalations({
  posts,
}: {
  posts: { id: string; name: string }[];
}) {
  const { profile, isNational } = useAuth();
  const [rows, setRows] = useState<Escalation[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ post: "", subject: "", message: "" }),
    [responses, setResponses] = useState<Record<string, string>>({});
  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await readAllRows<Escalation>(() =>
          supabase.from("state_escalations").select("*").order("id"),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [profile?.id, profile?.role, profile?.state, profile?.post_id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await supabase
        .from("state_escalations")
        .insert({
          post_id: form.post,
          author_id: profile?.id,
          subject: form.subject.trim(),
          message: form.message.trim(),
        });
      if (r.error) throw r.error;
      setForm({ ...form, subject: "", message: "" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resolve(r: Escalation) {
    setBusy(true);
    setError(null);
    try {
      const result = await supabase
        .from("state_escalations")
        .update({ status: "resolved", response: responses[r.id]?.trim() })
        .eq("id", r.id)
        .select("id")
        .single();
      if (result.error) throw result.error;
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel p-5 mt-6">
      <h2 className="font-display text-2xl">Escalations to National</h2>
      <p className="text-sm text-muted mt-2">Saved to National’s review queue in States &amp; Posts. National can respond here and close the request. This does not send an email automatically.</p>
      <WorkspaceStatus loading={loading} error={error} retry={load} />
      {posts.length > 0 && (
        <form onSubmit={submit} className="space-y-3 mt-4">
          <label className="block text-sm">
            Post
            <select
              className="input-field mt-1"
              required
              value={form.post}
              onChange={(e) => setForm({ ...form, post: e.target.value })}
            >
              <option value="">Select post…</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Subject
            <input
              className="input-field mt-1"
              required
              maxLength={200}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Issue / requested assistance
            <textarea
              className="input-field mt-1"
              required
              maxLength={5000}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </label>
          <button className="btn-gold" disabled={busy}>
            Submit to National
          </button>
        </form>
      )}
      <ul className="space-y-4 mt-6">
        {rows
          .filter((r) => posts.some((p) => p.id === r.post_id))
          .map((r) => (
            <li key={r.id} className="border-t border-hairline pt-4">
              <h3 className="font-display text-lg">{r.subject}</h3>
              <p className="text-xs text-muted">
                {posts.find((p) => p.id === r.post_id)?.name} · {r.status} ·{" "}
                {r.created_at.slice(0, 10)}
              </p>
              <p className="text-sm mt-2 whitespace-pre-wrap">{r.message}</p>
              {r.response && (
                <p className="text-sm text-gold mt-2">National: {r.response}</p>
              )}
              {isNational && r.status === "open" && (
                <>
                  <label className="block text-sm mt-3">
                    National response
                    <textarea
                      className="input-field mt-1"
                      value={responses[r.id] ?? ""}
                      onChange={(e) =>
                        setResponses((v) => ({ ...v, [r.id]: e.target.value }))
                      }
                    />
                  </label>
                  <button
                    className="btn-ghost mt-3"
                    disabled={busy || !responses[r.id]?.trim()}
                    onClick={() => resolve(r)}
                  >
                    Respond & Resolve
                  </button>
                </>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}
