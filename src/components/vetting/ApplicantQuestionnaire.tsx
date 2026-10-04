import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspaces";
import {
  VETTING_QUESTIONS,
  type Answers,
  type Questionnaire,
} from "@/lib/vetting";

export default function ApplicantQuestionnaire({
  applicationId,
  reviewer = false,
  email,
}: {
  applicationId: string;
  reviewer?: boolean;
  email?: string;
}) {
  const { data, loading, error, refresh } = useWorkspace<Questionnaire | null>(
    "cvoa_vetting_questionnaire",
    { p_application: applicationId },
  );
  const [answers, setAnswers] = useState<Answers>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState(""),
    [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (data) {
      setAnswers(data.answers);
      setEditing(!data.submitted_at);
      setDirty(false);
    }
  }, [data]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function request() {
    setBusy(true);
    setFailure("");
    try {
      const r = await supabase.rpc("cvoa_request_vetting_questionnaire", {
        p_application: applicationId,
      });
      if (r.error) throw r.error;
      setMessage(
        "Questionnaire requested in the applicant portal. Use the email button to notify them from your email app.",
      );
      refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent, submit = false) {
    event.preventDefault();
    if (!data || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const r = await supabase.rpc("cvoa_save_vetting_questionnaire", {
        p_application: applicationId,
        p_version: data.workflow_version,
        p_answers: answers,
        p_submit: submit,
      });
      if (r.error) throw r.error;
      setDirty(false);
      setMessage(
        submit
          ? "Questionnaire submitted to National."
          : "Draft saved. National will see your answers after submission.",
      );
      refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const invite = `Please complete your CVOA post applicant questionnaire. Sign in at https://www.cvoa.one/ and open My Post Applications, then select your application. Your responses help National prepare for the interview. Please use the secure portal for documents. This questionnaire does not itself approve a post or charter.`;
  return (
    <section className="panel p-5 mt-5">
      <h3 className="font-display text-2xl">Applicant questionnaire</h3>
      <p className="text-sm text-muted mt-2 mb-4">
        Ten questions prepare the interview and identify missing work.
        Charter-petition requirements are separate from this initial review.
      </p>
      {loading && <p>Loading questionnaire…</p>}
      {(error || failure) && (
        <p role="alert" className="text-red-400 mb-3">
          {error || failure}
          <button
            type="button"
            className="btn-ghost mt-2 block"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Reload the saved questionnaire and discard unsaved entries?",
                )
              )
                refresh();
            }}
          >
            Reload saved questionnaire
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="text-gold mb-3">
          {message}
        </p>
      )}
      {reviewer && !loading && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            className="btn-ghost"
            disabled={busy || !!data}
            onClick={request}
          >
            {data ? "Questionnaire requested" : "Request in applicant portal"}
          </button>
          {data && email && (
            <a
              className="btn-ghost"
              href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("CVOA post applicant questionnaire")}&body=${encodeURIComponent(invite)}`}
            >
              Compose questionnaire email
            </a>
          )}
        </div>
      )}
      {!loading && !data && !error && (
        <p className="text-sm text-muted">
          {reviewer
            ? "Request this questionnaire so the applicant can complete it in My Post Applications."
            : "National has not requested a questionnaire yet."}
        </p>
      )}
      {data && (
        <>
          <p className="eyebrow mb-4">
            {data.submitted_at
              ? `Submitted ${new Date(data.submitted_at).toLocaleString()}`
              : reviewer
                ? "Awaiting applicant submission"
                : "Draft · save your progress before leaving"}
          </p>
          {reviewer ? (
            data.submitted_at ? (
              <dl className="space-y-4">
                {VETTING_QUESTIONS.map((q) => (
                  <div key={q.id}>
                    <dt className="font-medium">{q.title}</dt>
                    <dd className="mt-1 text-sm whitespace-pre-wrap break-words">
                      {data.answers[q.id] || "No response recorded."}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">
                The applicant’s unfinished draft is private until submitted.
              </p>
            )
          ) : (
            <form onSubmit={(e) => void save(e, true)} className="space-y-4">
              {VETTING_QUESTIONS.map((q) => (
                <label className="block text-sm" key={q.id}>
                  {q.title}
                  <span className="block text-muted text-xs mt-1">
                    {q.hint}
                  </span>
                  <textarea
                    disabled={busy || !editing}
                    className="input-field mt-2"
                    rows={3}
                    maxLength={2000}
                    required
                    value={answers[q.id] || ""}
                    onChange={(e) => {
                      setAnswers((v) => ({ ...v, [q.id]: e.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
              ))}
              <p className="text-sm text-muted">
                By submitting, you confirm these responses describe your current
                plans accurately. This is not the formal charter petition or
                chartering agreement.
              </p>
              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy}
                      onClick={(e) => void save(e, false)}
                    >
                      Save draft
                    </button>
                    <button className="btn-gold" disabled={busy}>
                      {busy ? "Saving…" : "Submit to National"}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    Update submitted responses
                  </button>
                )}
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
