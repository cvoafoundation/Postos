import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Channel } from "./types";
type Answer = {
  question: string;
  answer: string;
  sources: { id: string; title: string; path: string }[];
  snapshot_at: string;
  truncated: boolean;
};
export function Assistant({
  channels,
  userId,
}: {
  channels: Channel[];
  userId: string;
}) {
  const [question, setQuestion] = useState(""),
    [team, setTeam] = useState(""),
    [answers, setAnswers] = useState<Answer[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [ready, setReady] = useState<boolean | null>(null);
  const active = useRef(true),
    sequence = useRef(0);
  useEffect(() => {
    active.current = true;
    void checkConnection();
    return () => {
      active.current = false;
      sequence.current++;
    };
  }, [userId]);
  async function checkConnection() {
    setReady(null);
    const r = await supabase.functions.invoke("cvoa-assistant", {
      method: "GET",
    });
    if (!active.current) return;
    if (r.error) {
      setError(
        "Could not check the assistant connection. Refresh your session and try again.",
      );
      return;
    }
    setReady(!!r.data?.configured);
    setError("");
  }
  async function ask(text = question) {
    if (!text.trim() || busy || !ready) return;
    setBusy(true);
    setError("");
    const seq = ++sequence.current;
    try {
      const result = await supabase.functions.invoke("cvoa-assistant", {
        body: { question: text, channel_id: team || null },
      });
      if (result.error) {
        let message = result.error.message;
        try {
          const detail = await result.error.context?.json();
          message = detail?.error || message;
        } catch {}
        throw new Error(message);
      }
      if (result.data?.error) throw new Error(result.data.error);
      if (active.current && seq === sequence.current) {
        setAnswers((a) => [...a, { question: text, ...result.data }]);
        setQuestion("");
      }
    } catch (e) {
      if (active.current && seq === sequence.current)
        setError(e instanceof Error ? e.message : "Could not get an answer.");
    } finally {
      if (active.current && seq === sequence.current) setBusy(false);
    }
  }
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <header>
        <Sparkles size={24} className="mb-3" />
        <h2 className="font-display text-3xl">CVOA assistant</h2>
        <p className="text-sm text-muted mt-2">
          Ask what needs attention, get a next-step plan, or prepare a draft
          update. Each answer refreshes records you can access and links to its
          sources.
        </p>
      </header>
      <div className="panel p-4 text-xs text-muted leading-relaxed">
        You review and carry out suggested steps. The assistant prepares
        guidance and drafts; organizational authority stays with the appointed
        people. Its current context includes connected work and your open
        assignments. Select a team to include its reports and engagement log.
        Direct messages and Ethics Tribunal records are excluded.
      </div>
      {ready === null && (
        <p role="status" className="text-xs text-muted">
          Checking the assistant connection…
        </p>
      )}
      {ready === false && (
        <section className="panel p-4 space-y-2">
          <h3 className="font-semibold text-sm">AI connection needs setup</h3>
          <p className="text-xs text-muted">
            National administration must add ANTHROPIC_API_KEY in this project's
            Supabase Edge Function secrets. Your connected work remains
            available on Home.
          </p>
          <button
            className="btn-ghost text-xs underline"
            onClick={() => void checkConnection()}
          >
            Check connection again
          </button>
        </section>
      )}
      <label className="block text-sm">
        Optional team context
        <select
          className="input-field w-full mt-2"
          aria-label="Assistant team context"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          disabled={busy || !ready}
        >
          <option value="">Connected work and my assignments</option>
          {channels
            .filter((c) => c.scope !== "direct" && !c.archived)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        {[
          "What needs my attention first?",
          "Help me plan my next three steps.",
          "Draft a completed / next / blocked update from the available records.",
        ].map((q) => (
          <button
            disabled={busy || !ready}
            className="btn-ghost text-xs border border-hairline rounded p-3 text-left"
            key={q}
            onClick={() => void ask(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="space-y-4">
        {answers.map((a, index) => (
          <article className="panel p-5 space-y-3" key={index}>
            <p className="text-sm font-semibold">{a.question}</p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {a.answer}
            </p>
            {a.truncated && (
              <p className="text-xs text-muted">
                This answer reached its length limit. Ask a more focused
                question for the remaining detail.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {a.sources.map((s) => (
                <a
                  className="text-xs underline border border-hairline rounded p-2"
                  key={s.id}
                  href={s.path}
                >
                  [{s.id}] {s.title}
                </a>
              ))}
            </div>
            <div className="flex justify-between gap-3 text-[10px] text-muted">
              <span>Snapshot: {new Date(a.snapshot_at).toLocaleString()}</span>
              <button
                className="flex gap-1 items-center"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(a.answer)
                    .then(() => {
                      setCopied(true);
                    })
                    .catch(() =>
                      setError(
                        "Copy is unavailable in this browser. Select the answer text to copy it.",
                      ),
                    );
                }}
              >
                <Copy size={12} />
                Copy answer
              </button>
            </div>
          </article>
        ))}
      </div>
      {copied && (
        <p role="status" className="text-xs text-muted">
          Answer copied.
        </p>
      )}
      {error && (
        <p role="alert" className="panel p-4 text-sm">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted">
          Checking your authorized records and preparing an answer…
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
        className="panel p-4"
      >
        <label className="block text-sm" htmlFor="assistant-question">
          Ask a specific question
        </label>
        <textarea
          id="assistant-question"
          className="input-field w-full mt-2"
          rows={3}
          maxLength={2000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What should I follow up on today?"
          disabled={busy || !ready}
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-[10px] text-muted">
            Answers stay in this browser tab. Review drafts before use.
          </p>
          <button
            className="btn-gold text-xs flex gap-2"
            disabled={busy || !ready || !question.trim()}
          >
            <Send size={14} />
            Ask assistant
          </button>
        </div>
      </form>
    </div>
  );
}
