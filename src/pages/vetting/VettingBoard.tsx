import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWorkspace } from "@/lib/workspaces";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { PipelineSummary } from "@/lib/applicationPipeline";
import { POST_STATUS_LABELS, type PostApplication } from "@/lib/types";
import {
  VETTING_CATEGORIES,
  VETTING_QUESTIONS,
  RECOMMENDATIONS,
  validateScores,
  scoreAverage,
  vettingReport,
  type Answers,
  type SavedReview,
  type Questionnaire,
} from "@/lib/vetting";
import ApplicantQuestionnaire from "@/components/vetting/ApplicantQuestionnaire";
import { ApplicationDetailModal } from "@/pages/applications/ApplicationDetail";

export default function VettingBoard() {
  const { data, loading, error, refresh } = useWorkspace<PipelineSummary>(
    "cvoa_application_pipeline",
  );
  const [params, setParams] = useSearchParams(),
    [selected, setSelected] = useState<string>(params.get("application") || ""),
    [search, setSearch] = useState(""),
    [dirty, setDirty] = useState(false),
    [detail, setDetail] = useState<PostApplication | null>(null);
  const entries = data?.applications || [],
    a = entries.find((e) => e.application.id === selected)?.application;
  const candidates = entries.filter((e) =>
    [
      e.application.name,
      e.application.city,
      e.application.state,
      e.application.email,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function choose(id: string) {
    if (
      dirty &&
      !window.confirm("Discard the unsaved review before switching applicants?")
    )
      return;
    setDirty(false);
    setSelected(id);
    setParams({ application: id });
  }
  return (
    <div>
      <PageHeader eyebrow="Module 2" title="Vetting System" />
      <p className="text-sm text-muted mb-6">
        Review the applicant’s plans, record interview evidence, and save a
        scorecard. Recommendations support Council review; approval and post
        launch remain in the application pipeline.
      </p>
      {loading && <p>Loading applicants…</p>}
      {error && (
        <div role="alert" className="panel p-4 mb-4">
          {error}
          <button className="btn-ghost ml-3" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="space-y-2">
          <label className="block text-sm">
            Find an applicant
            <input
              className="input-field mt-2 mb-3"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, city or state"
            />
          </label>
          <p className="eyebrow">
            Applicants & saved reviews · {candidates.length}
          </p>
          {!loading && !error && candidates.length === 0 && (
            <EmptyState
              title="No matching applicants"
              hint="Clear the search or check the Application Pipeline."
            />
          )}
          {candidates.map(({ application: x, evidence }) => (
            <button
              key={x.id}
              disabled={false}
              onClick={() => choose(x.id)}
              aria-pressed={selected === x.id}
              className={`panel w-full text-left p-3 ${selected === x.id ? "border-gold" : ""}`}
            >
              <span className="block text-sm font-medium">{x.name}</span>
              <span className="block text-xs text-muted">
                {x.city}, {x.state} · {POST_STATUS_LABELS[x.status]}
              </span>
              <span className="block text-xs text-gold mt-1">
                {evidence.complete_scorecards} complete saved scorecard(s)
              </span>
            </button>
          ))}
        </aside>
        <div className="lg:col-span-2 min-w-0">
          {a ? (
            <>
              <div className="panel p-5">
                <h2 className="font-display text-3xl">{a.name}</h2>
                <p className="text-sm text-muted">
                  {a.city}, {a.state} · {POST_STATUS_LABELS[a.status]}
                </p>
                <p className="text-sm whitespace-pre-wrap mt-3">
                  <strong>Why they applied: </strong>
                  {a.motivation || "Not recorded."}
                </p>
                <p className="text-sm whitespace-pre-wrap mt-2">
                  <strong>Leadership experience: </strong>
                  {a.leadership_experience || "Not recorded."}
                </p>
                <p className="text-sm mt-2">
                  Service document:{" "}
                  {a.dd214_storage_path ? "On file" : "Missing"} · review:{" "}
                  {a.dd214_review_status}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Link className="btn-ghost" to="/applications">
                    Application Pipeline
                  </Link>
                  <button className="btn-ghost" onClick={() => setDetail(a)}>
                    Documents, feedback & sign-offs
                  </button>
                </div>
              </div>
              <ReviewWorkspace
                key={a.id}
                application={a}
                onDirty={setDirty}
                onSaved={refresh}
              />
            </>
          ) : (
            <EmptyState
              title="Select an applicant"
              hint="View their questionnaire, record the interview, and review saved scorecards."
            />
          )}
        </div>
      </div>
      {detail && (
        <ApplicationDetailModal
          application={detail}
          onClose={() => setDetail(null)}
          onDeleted={() => {
            setDetail(null);
            setSelected("");
            refresh();
          }}
        />
      )}
    </div>
  );
}
function ReviewWorkspace({
  application: a,
  onDirty,
  onSaved,
}: {
  application: PostApplication;
  onDirty: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth(),
    { data, loading, error, refresh } = useWorkspace<{
      scorecards: SavedReview[];
      questionnaire: Questionnaire | null;
    }>("cvoa_vetting_record", { p_application: a.id });
  const [reviewId, setReviewId] = useState(() => crypto.randomUUID()),
    [scores, setScores] = useState<Record<string, string>>({}),
    [answers, setAnswers] = useState<Answers>({}),
    [notes, setNotes] = useState(""),
    [tasks, setTasks] = useState(""),
    [recommendation, setRecommendation] = useState("needs_follow_up"),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false),
    [saved, setSaved] = useState(false);
  const editable = [
    "application_submitted",
    "interview_scheduled",
    "vetting",
    "approved",
  ].includes(a.status);
  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirty]);
  function change() {
    setDirty(true);
    setMessage("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || saved) return;
    setFailure("");
    if (!validateScores(scores)) {
      setFailure(
        "Choose an explicit score from 1 to 10 for all five categories.",
      );
      return;
    }
    if (!profile) {
      setFailure("Sign in with a National account before saving.");
      return;
    }
    setBusy(true);
    try {
      const r = await supabase.rpc("cvoa_save_vetting_scorecard", {
        p_id: reviewId,
        p_application: a.id,
        p_scores: Object.fromEntries(
          VETTING_CATEGORIES.map((c) => [c.key, Number(scores[c.key])]),
        ),
        p_notes: notes,
        p_answers: answers,
        p_recommendation: recommendation,
        p_follow_up: tasks,
      });
      if (r.error) throw r.error;
      if (!r.data?.id)
        throw new Error(
          "No saved scorecard was returned. Your entries are still here; retry saving.",
        );
      setDirty(false);
      setSaved(true);
      setMessage(
        "Scorecard saved. It is now part of this applicant’s review history.",
      );
      refresh();
      onSaved();
    } catch (e) {
      setFailure(
        (e as Error).message ||
          "Could not save. Your entries have been preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function startNew() {
    if (
      dirty &&
      !window.confirm("Discard the unsaved review and start another?")
    )
      return;
    setReviewId(crypto.randomUUID());
    setScores({});
    setAnswers({});
    setNotes("");
    setTasks("");
    setRecommendation("needs_follow_up");
    setSaved(false);
    setDirty(false);
    setMessage("");
    setFailure("");
  }
  async function exportReport(print = false, archive = false) {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      const r = await supabase.rpc("cvoa_vetting_record", {
        p_application: a.id,
      });
      if (r.error) throw r.error;
      const html = vettingReport(a, r.data.scorecards, r.data.questionnaire);
      if (archive) {
        if (!profile) throw new Error("Sign in before saving to CVOA Drive.");
        const reportId = crypto.randomUUID();
        const path = `root/vetting-reports/${profile.id}/${a.id}/${reportId}.html`;
        const file = new Blob([html], { type: "text/html;charset=utf-8" });
        const upload = await supabase.storage
          .from("ncc-drive")
          .upload(path, file, { contentType: "text/html" });
        if (upload.error) throw upload.error;
        const record = await supabase.rpc("cvoa_archive_vetting_report", {
          p_id: reportId,
          p_application: a.id,
          p_path: path,
          p_bytes: file.size,
        });
        if (record.error) {
          await supabase.storage.from("ncc-drive").remove([path]);
          throw record.error;
        }
        setMessage(
          "Saved a confidential report to the root of CVOA Drive. It is visible to National only.",
        );
      } else if (print) {
        const w = window.open("", "_blank");
        if (!w)
          throw new Error(
            "Allow this site to open the print report, or use Download report.",
          );
        w.opener = null;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      } else {
        const url = URL.createObjectURL(
          new Blob([html], { type: "text/html;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `CVOA-vetting-${a.id}.html`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ApplicantQuestionnaire applicationId={a.id} reviewer email={a.email} />
      <section className="panel p-5 mt-5">
        <h3 className="font-display text-2xl">Interview & scorecard</h3>
        <p className="text-sm text-muted mt-2 mb-4">
          1–3: substantial gaps · 4–6: developing / follow-up needed · 7–8:
          demonstrated readiness · 9–10: strong, specific evidence. Scores
          support judgment; there is no automatic pass threshold.
        </p>
        {failure && (
          <p role="alert" className="text-red-400 mb-3">
            {failure}
          </p>
        )}
        {message && (
          <p role="status" className="text-gold mb-3">
            {message}
          </p>
        )}
        {!editable && (
          <p className="text-sm text-muted mb-4">
            New scorecards are recorded during application review and vetting.
            Saved history and exports remain available at every stage.
          </p>
        )}
        {editable && (
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={busy || saved} className="space-y-4">
              {VETTING_CATEGORIES.map((c) => (
                <label key={c.key} className="block text-sm">
                  {c.label}
                  <span className="block text-xs text-muted mt-1">
                    {c.hint}
                  </span>
                  <select
                    required
                    className="input-field mt-2"
                    value={scores[c.key] || ""}
                    onChange={(e) => {
                      setScores((v) => ({ ...v, [c.key]: e.target.value }));
                      change();
                    }}
                  >
                    <option value="">Not scored — choose 1–10</option>
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <details>
                <summary className="cursor-pointer text-gold">
                  Guided interview questions & responses
                </summary>
                <p className="text-xs text-muted mt-2">
                  Record what the applicant said and the evidence supporting
                  your scores. Applicant-submitted responses stay separately
                  attributed.
                </p>
                <div className="space-y-4 mt-4">
                  {VETTING_QUESTIONS.map((q) => (
                    <label className="block text-sm" key={q.id}>
                      {q.title}
                      <span className="block text-xs text-muted mt-1">
                        {q.hint}
                      </span>
                      <textarea
                        className="input-field mt-2"
                        rows={3}
                        maxLength={2000}
                        value={answers[q.id] || ""}
                        onChange={(e) => {
                          setAnswers((v) => ({ ...v, [q.id]: e.target.value }));
                          change();
                        }}
                      />
                    </label>
                  ))}
                </div>
              </details>
              <label className="block text-sm">
                Reviewer notes / evidence
                <textarea
                  className="input-field mt-2"
                  rows={3}
                  maxLength={5000}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    change();
                  }}
                />
              </label>
              <label className="block text-sm">
                Follow-up tasks, owner and target date
                <textarea
                  className="input-field mt-2"
                  rows={3}
                  maxLength={2000}
                  value={tasks}
                  onChange={(e) => {
                    setTasks(e.target.value);
                    change();
                  }}
                />
              </label>
              <label className="block text-sm">
                Reviewer recommendation
                <select
                  className="input-field mt-2"
                  value={recommendation}
                  onChange={(e) => {
                    setRecommendation(e.target.value);
                    change();
                  }}
                >
                  {Object.entries(RECOMMENDATIONS)
                    .filter(([k]) => k !== "not_recorded")
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button className="btn-gold" disabled={busy || saved}>
                {busy
                  ? "Saving…"
                  : saved
                    ? "Scorecard saved"
                    : "Save Scorecard"}
              </button>
              {saved && (
                <button type="button" className="btn-ghost" onClick={startNew}>
                  Start another review
                </button>
              )}
            </div>
            <p className="text-xs text-muted">
              Saved reviews retain their reviewer and date. A new review adds to
              history. Save before exporting; unsaved entries are excluded.
            </p>
          </form>
        )}
      </section>
      <section className="panel p-5 mt-5">
        <h3 className="font-display text-2xl">Saved reviews & export</h3>
        <p className="text-sm text-muted mt-2 mb-4">
          Save a confidential report directly to CVOA Drive’s National-only root,
          download it, or choose Save as PDF in the print dialog. Only saved reviews
          and submitted applicant responses are included.
        </p>
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            className="btn-gold"
            disabled={loading || busy}
            onClick={() => void exportReport(false, true)}
          >
            {busy ? "Working…" : "Save report to CVOA Drive"}
          </button>
          <Link className="btn-ghost" to="/drive">
            Open CVOA Drive
          </Link>
          <button
            className="btn-ghost"
            disabled={loading || busy}
            onClick={() => void exportReport()}
          >
            Download report
          </button>
          <button
            className="btn-ghost"
            disabled={loading || busy}
            onClick={() => void exportReport(true)}
          >
            Print / save PDF
          </button>
          <button className="btn-ghost" onClick={refresh}>
            Refresh saved reviews
          </button>
        </div>
        {loading && <p>Loading saved reviews…</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && !data?.scorecards.length && (
          <p>No saved reviews yet.</p>
        )}
        <div className="space-y-4">
          {data?.scorecards.map((r) => (
            <article key={r.id} className="border border-hairline p-4">
              <h4 className="font-medium">
                {r.reviewer_name || "Reviewer not recorded"} ·{" "}
                {new Date(r.created_at).toLocaleString()}
              </h4>
              <p className="text-sm text-gold mt-1">
                {RECOMMENDATIONS[r.recommendation] || r.recommendation} ·
                Average {scoreAverage(r)}/10
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
                {VETTING_CATEGORIES.map((c) => (
                  <div key={c.key}>
                    <dt className="text-muted">{c.label}</dt>
                    <dd>{r[`${c.key}_score`] ?? "Not scored"}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm whitespace-pre-wrap mt-3">
                {r.notes || "No reviewer notes recorded."}
              </p>
              {r.follow_up_tasks && (
                <p className="text-sm whitespace-pre-wrap mt-2">
                  <strong>Follow-up: </strong>
                  {r.follow_up_tasks}
                </p>
              )}
              <details className="mt-3 text-sm">
                <summary className="text-gold cursor-pointer">
                  Interview responses
                </summary>
                {VETTING_QUESTIONS.map((q) => (
                  <div key={q.id} className="mt-3">
                    <p className="font-medium">{q.title}</p>
                    <p className="whitespace-pre-wrap break-words">
                      {r.question_answers?.[q.id] || "Not recorded."}
                    </p>
                  </div>
                ))}
              </details>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
