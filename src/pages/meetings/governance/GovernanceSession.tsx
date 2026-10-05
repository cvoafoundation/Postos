import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { GovernanceForm, options, type FieldSpec } from "./Forms";
import {
  actionState,
  datetimeInput,
  iso,
  readiness,
  textDownload,
  timestamp,
  votesRequired,
  type RecordData,
} from "./model";
type Dialog = {
  title: string;
  fields: FieldSpec[];
  initial?: RecordData;
  action: string;
  transform?: (v: RecordData) => RecordData;
};
const text = (key: string, label: string, required = false): FieldSpec => ({
  key,
  label,
  required,
});
const area = (key: string, label: string, required = false): FieldSpec => ({
  key,
  label,
  type: "textarea",
  required,
});
const choice = (
  key: string,
  label: string,
  values: string[],
  required = true,
): FieldSpec => ({
  key,
  label,
  type: "select",
  options: options(values),
  required,
});
export default function GovernanceSession() {
  const { sessionId } = useParams(),
    { profile } = useAuth(),
    [data, setData] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("packet"),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [clock, setClock] = useState(Date.now());
  const inFlight = useRef(false),
    current = useRef<RecordData | null>(null),
    generation = useRef(0);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const key = generation.current;
    try {
      const { data, error } = await supabase.rpc("uro_state", {
        p_session: sessionId,
      });
      if (key !== generation.current) return;
      if (error) throw error;
      current.current = data;
      setData(data);
    } catch (e) {
      if (key === generation.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, [sessionId]);
  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    setData(null);
    current.current = null;
    load();
    const timer = setInterval(load, 5000),
      tick = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      generation.current++;
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [load, profile?.id, profile?.role, profile?.post_id, profile?.state]);
  async function command(action: string, value: RecordData = {}) {
    if (busy) throw new Error("Another action is saving.");
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.rpc("uro_command", {
        p_session: sessionId,
        p_action: action,
        p_data: value,
        p_version: current.current?.session.version,
      });
      if (error) throw error;
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const run = (action: string, value: RecordData = {}) =>
    void command(action, value).catch(() => {});
  if (!data)
    return (
      <div className="panel p-5">
        <Link to="/meetings">Back to meetings</Link>
        <p role={error ? "alert" : undefined}>
          {error || "Loading meeting record…"}
        </p>
      </div>
    );
  const s = data.session,
    per = data.permissions,
    people: RecordData[] = data.participants,
    me = people.find((p) => p.profile_id === profile?.id),
    agenda: RecordData[] = data.agenda,
    proposals: RecordData[] = data.proposals,
    q = data.quorum;
  const official = per.chair || per.secretary,
    live = s.phase === "meet",
    editable = !s.ended_at,
    personOptions = people
      .filter((p) => p.profile_id)
      .map((p) => ({ value: p.profile_id, label: p.name })),
    agendaOptions = agenda.map((a) => ({ value: a.id, label: a.title }));
  const selectPerson: FieldSpec = {
    key: "owner_id",
    label: "Responsible person",
    type: "select",
    options: personOptions,
  };
  function form(
    title: string,
    action: string,
    fields: FieldSpec[],
    initial: RecordData = {},
    transform?: (v: RecordData) => RecordData,
  ) {
    setDialog({ title, action, fields, initial, transform });
  }
  function agendaForm(a: RecordData = {}) {
    form(
      a.id ? "Edit agenda item" : "Prepare agenda item",
      "agenda",
      [
        text("title", "Item title", true),
        choice("classification", "Treatment", [
          "information",
          "consent",
          "discussion",
          "decision",
          "emergency",
        ]),
        choice("readiness", "Readiness", [
          "draft",
          "needs_information",
          "ready_for_review",
          "ready_for_decision",
          "blocked",
        ]),
        selectPerson,
        {
          key: "estimated_minutes",
          label: "Estimated minutes",
          type: "number",
          min: 1,
        },
        area("background", "Background"),
        area("question", "Question for the body"),
        area("alternatives", "Alternatives considered"),
        area("impact", "Operational impact"),
        area("cost", "Cost and funding source"),
        area("proposed_text", "Proposed exact motion"),
        area("report_body", "Written report"),
        area("late_reason", "Reason for admitting late business"),
      ],
      {
        ...a,
        ...a.brief,
        classification: a.classification || "discussion",
        readiness: a.readiness || "draft",
        estimated_minutes: a.estimated_minutes || 10,
      },
      (v) => ({
        ...v,
        owner_id: v.owner_id || null,
        estimated_minutes: Number(v.estimated_minutes || 10),
        brief: {
          background: v.background,
          question: v.question,
          alternatives: v.alternatives,
          impact: v.impact,
          cost: v.cost,
        },
      }),
    );
  }
  function propose(kind = "main", context: RecordData = {}) {
    form(
      "Submit motion",
      "propose",
      [
        choice("kind", "Motion type", [
          "main",
          "amendment",
          "refer",
          "postpone",
          "table",
          "reconsider",
          "close_debate",
          "extend_debate",
          "chair_challenge",
          "emergency_override",
          "suspend_rule",
          "uro_amendment",
          "consent",
          "withdraw",
        ]),
        {
          key: "agenda_id",
          label: "Agenda item",
          type: "select",
          options: agendaOptions,
        },
        {
          key: "parent_id",
          label: "Related main motion",
          type: "select",
          options: proposals
            .filter((p) => p.kind === "main")
            .map((p) => ({
              value: p.id,
              label: `${p.identifier}: ${p.current_text}`,
            })),
        },
        area("text", "Exact proposed text", true),
        {
          key: "action_required",
          label: "Creates an assignment",
          type: "checkbox",
        },
        text("action_title", "Assignment title"),
        {
          key: "committee_recommendation",
          label: "Submitted as an adopted committee recommendation",
          type: "checkbox",
        },
        {
          key: "committee_voting_members",
          label: "Number of voting committee members",
          type: "number",
          min: 1,
        },
        selectPerson,
        { key: "due_date", label: "Assignment due date", type: "date" },
        {
          key: "reporting_required",
          label: "Report back required",
          type: "checkbox",
        },
        {
          key: "authorized_amount",
          label: "Authorized amount in dollars",
          type: "number",
          min: 0,
        },
        text("rule", "Specific rule to suspend or amend"),
        area("authority", "Applicable superior authority"),
        {
          key: "suspendable",
          label: "This is a suspendable URO rule",
          type: "checkbox",
        },
        {
          key: "prior_notice_confirmed",
          label: "Required prior written amendment notice confirmed",
          type: "checkbox",
        },
        text("prior_notice_evidence", "Prior notice evidence"),
        {
          key: "approves_minutes_id",
          label: "Prior minutes to approve",
          type: "select",
          options: data!.previous_minutes
            .filter((m: RecordData) => m.minutes_state === "certified")
            .map((m: RecordData) => ({ value: m.id, label: m.title })),
        },
      ],
      { kind, agenda_id: s.current_agenda_id, ...context },
      (v) => ({
        ...v,
        agenda_id: v.agenda_id || null,
        parent_id: v.parent_id || null,
        context: {
          ...context,
          committee_recommendation: !!v.committee_recommendation,
          committee_voting_members: Number(v.committee_voting_members || 0),
          action_required: !!v.action_required,
          action_title: v.action_title,
          owner_id: v.owner_id || null,
          due_date: v.due_date || null,
          reporting_required: !!v.reporting_required,
          authorized_amount: v.authorized_amount
            ? Number(v.authorized_amount)
            : null,
          rule: v.rule,
          authority: v.authority,
          suspendable: !!v.suspendable,
          prior_notice_confirmed: !!v.prior_notice_confirmed,
          prior_notice_evidence: v.prior_notice_evidence,
          approves_minutes_id: v.approves_minutes_id || null,
        },
      }),
    );
  }
  function actionForm(a: RecordData = {}) {
    form(
      a.id ? "Update action" : "Assign action",
      a.id ? "action_update" : "action",
      [
        text("title", "Action", !a.id),
        selectPerson,
        { key: "due_date", label: "Due date", type: "date" },
        ...(a.id
          ? [
              choice("status", "Progress", [
                "open",
                "in_progress",
                "blocked",
                "completed",
              ]),
              area("progress", "Progress update"),
              area("evidence", "Completion evidence or document link"),
            ]
          : [
              {
                key: "decision_id",
                label: "Authorizing decision",
                type: "select",
                options: data!.decisions.map((d: RecordData) => ({
                  value: d.id,
                  label: `${d.identifier}: ${d.text}`,
                })),
              } as FieldSpec,
              choice("priority", "Priority", ["normal", "high", "urgent"]),
              {
                key: "reporting_required",
                label: "Report back required",
                type: "checkbox",
              } as FieldSpec,
            ]),
      ],
      { ...a, priority: a.priority || "normal" },
      (v) => ({
        ...v,
        owner_id: v.owner_id || null,
        due_date: v.due_date || null,
        decision_id: v.decision_id || null,
      }),
    );
  }
  const elapsed = s.started_at
    ? Math.max(
        0,
        Math.floor(
          ((s.ended_at
            ? new Date(s.ended_at).getTime()
            : s.recess_started_at
              ? new Date(s.recess_started_at).getTime()
              : clock) -
            new Date(s.started_at).getTime()) /
            1000,
        ) - s.recess_seconds,
      )
    : 0;
  return (
    <div className="space-y-5">
      <Link className="text-gold" to="/meetings">
        ← Meetings &amp; Governance
      </Link>
      <div>
        <h1 className="font-display text-3xl">{s.title}</h1>
        <p className="text-muted">
          {data.body.name} • {timestamp(s.scheduled_at)} • {s.type}
        </p>
      </div>
      <ol className="flex flex-wrap gap-2" aria-label="Meeting lifecycle">
        {["prepare", "review", "meet", "execute", "archive"].map((phase, i) => (
          <li
            key={phase}
            className={`rounded px-3 py-2 ${s.phase === phase ? "bg-gold text-black" : "bg-charcoal text-muted"}`}
          >
            {i + 1}. {phase}
          </li>
        ))}
      </ol>
      {error && (
        <p className="panel p-4 text-status-attention" role="alert">
          {error}
        </p>
      )}
      <section className="panel p-4 flex flex-wrap gap-5">
        <strong>{s.state?.replaceAll("_", " ")}</strong>
        <span
          className={
            q.satisfied ? "text-status-active" : "text-status-attention"
          }
        >
          Quorum: {q.present} present / {q.required} required
        </span>
        <span>
          {Math.floor(elapsed / 60)} minutes of meeting time
          {s.recess_started_at ? " • Recessed" : ""}
        </span>
        <span>Packet {readiness(agenda)}% ready</span>
        <span>
          Chair:{" "}
          {people.find((p) => p.profile_id === s.chair_id)?.name ||
            "Assigned administrator"}{" "}
          • Secretary:{" "}
          {people.find((p) => p.profile_id === s.secretary_id)?.name ||
            "Assigned administrator"}
        </span>
      </section>
      {!!data.issues.length && (
        <details className="panel p-4" open>
          <summary className="text-status-attention">
            Needs attention ({data.issues.length})
          </summary>
          <ul className="list-disc pl-5 mt-2">
            {data.issues.map((issue: string) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="Meeting sections">
        {[
          "packet",
          "attendance",
          "live",
          "actions",
          "record",
          "procedure",
          "private notes",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "btn-gold" : "btn-ghost"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "packet" && (
        <section className="panel p-5 space-y-4">
          <h2 className="font-display text-xl">Prepared meeting packet</h2>
          <p>{s.purpose}</p>
          <p className="text-muted">
            Agenda deadline: {timestamp(s.agenda_deadline)} • Packet deadline:{" "}
            {timestamp(s.packet_deadline)} • Notice deadline:{" "}
            {timestamp(s.notice_deadline)}
          </p>
          {s.virtual_link && /^https?:\/\//i.test(s.virtual_link) && (
            <a
              className="text-gold"
              href={s.virtual_link}
              target="_blank"
              rel="noreferrer"
            >
              Join authorized remote meeting
            </a>
          )}
          <div className="flex gap-2 flex-wrap">
            {editable && (me?.voting || official) && (
              <button className="btn-gold" onClick={() => agendaForm()}>
                Add agenda item
              </button>
            )}
            {!s.started_at && (official || per.manage) && (
              <>
                <button
                  className="btn-ghost"
                  onClick={() =>
                    form(
                      "Edit meeting preparation",
                      "edit_setup",
                      [
                        text("title", "Meeting title", true),
                        {
                          key: "scheduled_at",
                          label: "Start time",
                          type: "datetime-local",
                          required: true,
                        },
                        {
                          key: "target_end",
                          label: "Target end",
                          type: "datetime-local",
                        },
                        text("location", "Location"),
                        text("virtual_link", "Authorized remote link"),
                        area("purpose", "Meeting purpose"),
                        {
                          key: "packet_deadline",
                          label: "Packet deadline",
                          type: "datetime-local",
                        },
                        {
                          key: "agenda_deadline",
                          label: "Agenda deadline",
                          type: "datetime-local",
                        },
                        {
                          key: "amendment_deadline",
                          label: "Amendment deadline",
                          type: "datetime-local",
                        },
                      ],
                      {
                        ...s,
                        ...Object.fromEntries(
                          [
                            "scheduled_at",
                            "target_end",
                            "packet_deadline",
                            "agenda_deadline",
                            "amendment_deadline",
                          ].map((k) => [k, datetimeInput(s[k])]),
                        ),
                      },
                      (v) => ({
                        ...v,
                        ...Object.fromEntries(
                          [
                            "scheduled_at",
                            "target_end",
                            "packet_deadline",
                            "agenda_deadline",
                            "amendment_deadline",
                          ].map((k) => [k, iso(v[k] || "")]),
                        ),
                      }),
                    )
                  }
                >
                  Edit schedule
                </button>
                <Link className="btn-ghost" to="/meetings">
                  Configure body rules
                </Link>
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Send this meeting notice by email to its roster? Existing deliveries for this packet revision will not be sent again.",
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      const r = await supabase.functions.invoke(
                        "send-meeting-notice",
                        { body: { session_id: sessionId } },
                      );
                      if (r.error) throw r.error;
                      setError(
                        r.data.incomplete
                          ? `${r.data.sent} notices sent; ${r.data.incomplete} need manual delivery or sender verification.`
                          : "",
                      );
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Email meeting notice
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => run("refresh_roster")}
                >
                  Refresh rules &amp; roster
                </button>
                <button
                  className="btn-ghost"
                  onClick={() =>
                    form(
                      "Record actual meeting notice",
                      "record_notice",
                      [
                        text("method", "Delivery method", true),
                        {
                          key: "sent_at",
                          label: "Actual sent time",
                          type: "datetime-local",
                          required: true,
                        },
                        area(
                          "evidence",
                          "Delivery evidence and recipients reached",
                          true,
                        ),
                      ],
                      { sent_at: datetimeInput(new Date().toISOString()) },
                      (v) => ({ ...v, sent_at: iso(v.sent_at) }),
                    )
                  }
                >
                  Record notice delivery
                </button>
                {s.phase === "prepare" && (
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => run("packet_ready")}
                  >
                    Open packet review
                  </button>
                )}
              </>
            )}
            {me && (
              <>
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => run("review_packet", { state: "reviewed" })}
                >
                  Mark packet reviewed
                </button>
                <button
                  className="btn-ghost"
                  onClick={() =>
                    form(
                      "Question or advance submission",
                      "question",
                      [
                        choice("kind", "Submission", [
                          "question",
                          "minutes_correction",
                          "future_agenda",
                          "recommendation",
                        ]),
                        {
                          key: "agenda_id",
                          label: "Related item",
                          type: "select",
                          options: agendaOptions,
                        },
                        area("body", "Submission", true),
                      ],
                      {},
                      (v) => ({ ...v, agenda_id: v.agenda_id || null }),
                    )
                  }
                >
                  Submit question
                </button>
              </>
            )}
          </div>
          {agenda.map((a) => (
            <article
              key={a.id}
              className="border border-hairline rounded p-4 space-y-2"
            >
              <h3 className="font-display text-lg">{a.title}</h3>
              <p className="text-muted">
                {a.classification} • {a.readiness.replaceAll("_", " ")} •{" "}
                {a.status} • {a.estimated_minutes} min
              </p>
              {Object.entries(a.brief || {}).map(
                ([key, value]) =>
                  value && (
                    <p key={key}>
                      <strong>{key.replaceAll("_", " ")}: </strong>
                      {String(value)}
                    </p>
                  ),
              )}
              {a.report_body && (
                <p className="whitespace-pre-wrap">{a.report_body}</p>
              )}
              {a.proposed_text && (
                <p className="border-l-2 border-gold pl-3">{a.proposed_text}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                {editable && (official || a.created_by === profile?.id) && (
                  <button className="btn-ghost" onClick={() => agendaForm(a)}>
                    Edit item
                  </button>
                )}
                {live && per.chair && (
                  <button
                    className="btn-gold"
                    onClick={() =>
                      form(
                        "Open agenda item",
                        "open_item",
                        [area("reason", "Reason if not ready for decision")],
                        { id: a.id },
                      )
                    }
                  >
                    Open item
                  </button>
                )}
                {live &&
                  me?.voting &&
                  a.classification === "consent" &&
                  a.status === "pending" && (
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => run("consent_remove", { id: a.id })}
                    >
                      Remove from consent
                    </button>
                  )}
              </div>
            </article>
          ))}
          {data.questions.map((a: RecordData) => (
            <div key={a.id} className="border-b border-hairline py-3">
              <p>
                {a.kind}: {a.body}
              </p>
              <p className="text-muted">{a.answer || "Awaiting response"}</p>
              {official && editable && (
                <button
                  className="btn-ghost"
                  onClick={() =>
                    form(
                      "Respond to submission",
                      "answer",
                      [area("answer", "Response", true)],
                      { id: a.id, answer: a.answer },
                    )
                  }
                >
                  Respond
                </button>
              )}
            </div>
          ))}
          <h3 className="font-display text-lg">Previous minutes</h3>
          {data.previous_minutes.map((m: RecordData) => (
            <p key={m.id}>
              <Link className="text-gold" to={`/meetings/session/${m.id}`}>
                {m.title}
              </Link>{" "}
              • {m.minutes_state}
            </p>
          ))}
          <h3 className="font-display text-lg">Linked documents</h3>
          <p className="text-muted">
            Documents retain their Drive sharing permissions. Share the source
            file with participants before adding it to the packet.
          </p>
          {data.documents.map((d: RecordData) => (
            <p key={d.id}>
              {d.accessible ? (
                <Link
                  className="text-gold"
                  to={`/shared-files?item=${d.item_id}`}
                >
                  {d.label}
                </Link>
              ) : (
                `${d.label} (source access required)`
              )}
            </p>
          ))}
          {editable && (official || me?.voting) && (
            <button
              className="btn-ghost"
              onClick={async () => {
                const { data: files, error } = await supabase
                  .from("cvoa_drive_items")
                  .select("id,name")
                  .is("deleted_at", null)
                  .order("name")
                  .limit(200);
                if (error) {
                  setError(error.message);
                  return;
                }
                form(
                  "Link existing Drive document",
                  "attach_document",
                  [
                    {
                      key: "item_id",
                      label: "Available document",
                      type: "select",
                      required: true,
                      options: files.map((f: RecordData) => ({
                        value: f.id,
                        label: f.name,
                      })),
                    },
                    text("label", "Packet label", true),
                    {
                      key: "agenda_id",
                      label: "Related agenda item",
                      type: "select",
                      options: agendaOptions,
                    },
                  ],
                  {},
                  (v) => ({ ...v, agenda_id: v.agenda_id || null }),
                );
              }}
            >
              Link document
            </button>
          )}
          {data.notice_delivery_status?.map((d: RecordData) => (
            <p key={d.state} className="text-muted text-sm">
              Email deliveries: {d.recipients} {d.state}
            </p>
          ))}
          {data.notices.map((n: RecordData) => (
            <p className="text-muted text-sm" key={n.id}>
              Notice: {timestamp(n.sent_at)} • {n.method} • {n.evidence}
            </p>
          ))}
          <p className="text-muted text-sm">
            {
              data.reviews.filter((r: RecordData) => r.state === "reviewed")
                .length
            }{" "}
            participants marked their packet reviewed.
          </p>
        </section>
      )}
      {tab === "attendance" && (
        <section className="panel p-5 space-y-4">
          <h2 className="font-display text-xl">
            Attendance &amp; voting eligibility
          </h2>
          <p className="text-muted">
            Voting eligibility comes from the approved body roster. Guests and
            nonvoting staff do not count in vote thresholds. Changes during an
            open vote require the Chair to cancel that vote first.
          </p>
          {me && editable && (
            <div className="flex gap-2">
              {["accepted", "declined", "tentative"].map((state) => (
                <button
                  className="btn-ghost"
                  disabled={busy}
                  key={state}
                  onClick={() => run("rsvp", { state })}
                >
                  {state.replaceAll("_", " ")}
                </button>
              ))}
            </div>
          )}
          {people.map((p) => (
            <div
              className="flex items-center justify-between flex-wrap gap-3 border-b border-hairline py-3"
              key={p.id}
            >
              <div>
                <strong>{p.name}</strong>
                <p className="text-muted text-sm">
                  {p.guest
                    ? "Guest"
                    : p.voting
                      ? "Voting roster member"
                      : "Nonvoting participant"}{" "}
                  • RSVP {p.rsvp} • {p.presence}
                </p>
              </div>
              {editable && (official || p.profile_id === profile?.id) && (
                <select
                  className="input-field max-w-40"
                  disabled={busy}
                  aria-label={`${p.name} attendance`}
                  value={p.presence}
                  onChange={(e) =>
                    run("attendance", { id: p.id, presence: e.target.value })
                  }
                >
                  {[
                    "absent",
                    "present",
                    "remote",
                    "excused",
                    "away",
                    "left",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {official && editable && (
            <button
              className="btn-ghost"
              onClick={() =>
                form("Register nonvoting guest", "guest", [
                  text("name", "Guest name", true),
                ])
              }
            >
              Add guest
            </button>
          )}
        </section>
      )}
      {tab === "live" && (
        <section className="space-y-4">
          <div className="panel p-5 space-y-3">
            <h2 className="font-display text-xl">Live meeting</h2>
            {!s.started_at && per.chair && (
              <button
                className="btn-gold"
                disabled={busy}
                onClick={() => run("start")}
              >
                Call meeting to order
              </button>
            )}
            {live && (
              <>
                <p className="text-lg">
                  {agenda.find((a) => a.id === s.current_agenda_id)?.title ||
                    "Select an agenda item from the packet"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {per.chair && (
                    <>
                      {[
                        "clarification",
                        "deliberation",
                        "amendments",
                        "final_question",
                        "action_review",
                        "member_floor",
                      ].map((state) => (
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          key={state}
                          onClick={() => run("stage", { state })}
                        >
                          {state.replaceAll("_", " ")}
                        </button>
                      ))}
                      <button
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() =>
                          run(s.recess_started_at ? "resume" : "recess")
                        }
                      >
                        {s.recess_started_at ? "Resume" : "Recess"}
                      </button>
                      <button
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => run("complete_item")}
                      >
                        Complete current item
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() =>
                          form("Adjourn meeting", "adjourn", [
                            {
                              key: "action_review_confirmed",
                              label:
                                "Assignments, owners, deadlines and unfinished business reviewed",
                              type: "checkbox",
                              required: true,
                            },
                          ])
                        }
                      >
                        Adjourn after action review
                      </button>
                    </>
                  )}
                  {me && (
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => run("floor_request")}
                    >
                      Request floor
                    </button>
                  )}
                  {(me?.voting || per.chair) && (
                    <button className="btn-gold" onClick={() => propose()}>
                      Submit motion
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="panel p-5 space-y-3">
            <h3 className="font-display text-xl">Floor queue</h3>
            <p className="text-muted">
              First turns should precede second turns. The Chair manages
              recognition and procedural judgment.
            </p>
            {data.floor
              .filter((f: RecordData) => f.status !== "yielded")
              .map((f: RecordData) => (
                <div key={f.id} className="flex flex-wrap gap-3 items-center">
                  <strong>
                    {people.find((p) => p.id === f.participant_id)?.name}
                  </strong>
                  <span>
                    {f.status}
                    {f.recognized_at &&
                      ` • ${Math.max(0, f.seconds_allowed - Math.floor(((s.recess_started_at ? new Date(s.recess_started_at).getTime() : clock) - new Date(f.recognized_at).getTime()) / 1000))} seconds remaining`}
                  </span>
                  {per.chair && f.status === "waiting" && (
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => run("recognize", { id: f.id })}
                    >
                      Recognize
                    </button>
                  )}
                  {(per.chair || f.participant_id === me?.id) && (
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => run("yield", { id: f.id })}
                    >
                      Yield
                    </button>
                  )}
                  {per.chair && f.status === "recognized" && (
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => run("extend_floor", { id: f.id })}
                    >
                      Apply adopted extension
                    </button>
                  )}
                </div>
              ))}
          </div>
          {proposals.map((p) => (
            <article className="panel p-5 space-y-3" key={p.id}>
              <h3 className="font-display text-xl">
                {p.identifier} • {p.kind.replaceAll("_", " ")}
              </h3>
              <p className="whitespace-pre-wrap text-lg">{p.current_text}</p>
              <p className="text-muted">
                {p.status.replaceAll("_", " ")} •{" "}
                {p.threshold.replaceAll("_", " ")} of eligible members present
                {p.eligible_present
                  ? ` • ${votesRequired(p.eligible_present, p.threshold)} of ${p.eligible_present} required`
                  : ""}
              </p>
              {p.kind === "chair_challenge" && (
                <p className="text-status-attention">
                  Vote YES to sustain the ruling. Reversal requires NO votes
                  from at least two thirds of eligible members present.
                </p>
              )}
              {p.result && (
                <p>
                  Yes {p.result.yes} • No {p.result.no} • Abstain{" "}
                  {p.result.abstain} • Not cast {p.result.not_cast} •
                  Denominator {p.result.denominator}
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                {editable &&
                  me?.voting &&
                  !p.second_id &&
                  !p.second_exempt &&
                  ["draft", "introduced"].includes(p.status) &&
                  p.maker_id !== profile?.id && (
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => run("second", { id: p.id })}
                    >
                      Second
                    </button>
                  )}
                {live && per.chair && p.status === "draft" && (
                  <button
                    className="btn-ghost"
                    onClick={() =>
                      form(
                        "State motion before the body",
                        "introduce",
                        [
                          area(
                            "germaneness_reason",
                            "Germaneness finding for amendment",
                          ),
                        ],
                        { id: p.id },
                      )
                    }
                  >
                    Introduce
                  </button>
                )}
                {live &&
                  per.chair &&
                  ["introduced", "before_body"].includes(p.status) && (
                    <button
                      className="btn-gold"
                      onClick={() =>
                        form(
                          "Open vote",
                          "open_vote",
                          [
                            choice("method", "Voting method", [
                              "digital",
                              "secret",
                              "voice",
                              "hands",
                              "roll_call",
                            ]),
                            {
                              key: "unanimous_consent",
                              label:
                                "Seek unanimous consent with opportunity to object",
                              type: "checkbox",
                            },
                          ],
                          { id: p.id, method: "digital" },
                        )
                      }
                    >
                      Open vote
                    </button>
                  )}
                {live && me?.voting && p.status === "consent_open" && (
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => run("object", { id: p.id })}
                  >
                    Object to unanimous consent
                  </button>
                )}
                {live &&
                  p.status === "voting" &&
                  ["digital", "secret"].includes(p.method) &&
                  p.electorate?.includes(me?.id) &&
                  ["yes", "no", "abstain"].map((choice) => (
                    <button
                      className={
                        data.my_ballots.some(
                          (b: RecordData) =>
                            b.proposal_id === p.id && b.round === p.vote_round && b.choice === choice,
                        )
                          ? "btn-gold"
                          : "btn-ghost"
                      }
                      disabled={busy}
                      key={choice}
                      onClick={() => run("vote", { id: p.id, choice })}
                    >
                      {choice}
                    </button>
                  ))}
                {live &&
                  per.chair &&
                  p.status === "voting" &&
                  p.method === "roll_call" && (
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        form(
                          "Record assisted roll-call vote",
                          "record_ballot",
                          [
                            {
                              key: "participant_id",
                              label: "Eligible voter",
                              type: "select",
                              required: true,
                              options: people
                                .filter((v) => p.electorate.includes(v.id))
                                .map((v) => ({ value: v.id, label: v.name })),
                            },
                            choice("choice", "Recorded vote", [
                              "yes",
                              "no",
                              "abstain",
                            ]),
                          ],
                          { id: p.id },
                        )
                      }
                    >
                      Record roll-call vote
                    </button>
                  )}
                {live &&
                  per.chair &&
                  ["voting", "consent_open"].includes(p.status) && (
                    <>
                      <button
                        className="btn-gold"
                        onClick={() =>
                          form(
                            "Announce vote result",
                            "close_vote",
                            [
                              ...(!["digital", "secret", "roll_call"].includes(
                                p.method,
                              ) && p.status !== "consent_open"
                                ? ["yes", "no", "abstain"].map(
                                    (key) =>
                                      ({
                                        key,
                                        label: `${key} count`,
                                        type: "number",
                                        min: 0,
                                        required: true,
                                      }) as FieldSpec,
                                  )
                                : []),
                              {
                                key: "opportunity_confirmed",
                                label:
                                  "All eligible members had a reasonable opportunity to vote or object",
                                type: "checkbox",
                              },
                            ],
                            { id: p.id },
                            (v) => ({
                              ...v,
                              yes: Number(v.yes || 0),
                              no: Number(v.no || 0),
                              abstain: Number(v.abstain || 0),
                            }),
                          )
                        }
                      >
                        Close &amp; announce result
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() =>
                          form(
                            "Cancel vote",
                            "cancel_vote",
                            [area("reason", "Reason for cancellation", true)],
                            { id: p.id },
                          )
                        }
                      >
                        Cancel vote
                      </button>
                    </>
                  )}
                {per.chair &&
                  live &&
                  ["draft", "introduced", "before_body"].includes(p.status) && (
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        form(
                          "Record procedural disposition",
                          "dispose",
                          [
                            choice("status", "Disposition", [
                              "out_of_order",
                              "unseconded",
                            ]),
                            area("reason", "Reason", true),
                          ],
                          { id: p.id },
                        )
                      }
                    >
                      Dispose procedurally
                    </button>
                  )}
              </div>
            </article>
          ))}
        </section>
      )}
      {tab === "actions" && (
        <section className="panel p-5 space-y-4">
          <h2 className="font-display text-xl">Decisions &amp; execution</h2>
          {data.decisions.map((d: RecordData) => (
            <p className="border-b border-hairline py-3" key={d.id}>
              <strong>{d.identifier}</strong> {d.text}
            </p>
          ))}
          {official && editable && (
            <button className="btn-gold" onClick={() => actionForm()}>
              Assign action
            </button>
          )}
          {data.actions.map((a: RecordData) => (
            <article key={a.id} className="border-b border-hairline py-3">
              <strong>{a.title}</strong>
              <p
                className={
                  actionState(a) === "overdue"
                    ? "text-status-attention"
                    : "text-muted"
                }
              >
                {actionState(a)} •{" "}
                {people.find((p) => p.profile_id === a.owner_id)?.name ||
                  "Owner needed"}{" "}
                • Due {a.due_date || "date needed"}
              </p>
              <p>{a.progress}</p>
              <p className="text-muted">{a.evidence}</p>
              {(official || a.owner_id === profile?.id) && (
                <button className="btn-ghost" onClick={() => actionForm(a)}>
                  Update action
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === "procedure" && (
        <section className="panel p-5 space-y-4">
          <h2 className="font-display text-xl">Procedure &amp; safeguards</h2>
          <p className="text-muted">
            Superior governing documents control eligibility, notice, remote
            participation and recusals. An override does not change quorum,
            account permissions or protected rights.
          </p>
          {me && (
            <button
              className="btn-ghost"
              onClick={() =>
                form("Raise procedural matter", "challenge", [
                  choice("kind", "Matter", [
                    "point_of_procedure",
                    "clarification",
                    "privilege",
                    "procedure_objection",
                    "quorum",
                    "chair_challenge",
                  ]),
                  area("body", "What happened?", true),
                  text("rule", "Applicable rule"),
                  area("remedy", "Requested remedy"),
                ])
              }
            >
              Raise matter
            </button>
          )}
          {live && me?.voting && (
            <button
              className="btn-ghost"
              onClick={() =>
                form("Declare recusal", "recuse", [
                  area("reason", "Conflict and reason", true),
                ])
              }
            >
              Declare recusal
            </button>
          )}
          {data.challenges.map((c: RecordData) => (
            <article
              className="border-b border-hairline py-3 space-y-2"
              key={c.id}
            >
              <strong>
                {c.kind.replaceAll("_", " ")} • {c.disposition}
              </strong>
              <p>{c.body}</p>
              <p>
                {c.rule} • {c.remedy}
              </p>
              <p className="text-muted">
                Ruling: {c.ruling || "Awaiting Chair"}
              </p>
              {per.chair && c.disposition === "pending" && (
                <button
                  className="btn-ghost"
                  onClick={() =>
                    form(
                      "Issue Chair ruling",
                      "rule",
                      [area("ruling", "Ruling and grounds", true)],
                      { id: c.id },
                    )
                  }
                >
                  Rule
                </button>
              )}
              {live && me?.voting && c.disposition === "ruled" && (
                <button
                  className="btn-ghost"
                  onClick={() =>
                    propose("chair_challenge", {
                      challenge_id: c.id,
                      text: "Shall the ruling of the Chair be sustained?",
                    })
                  }
                >
                  Challenge ruling before body
                </button>
              )}
            </article>
          ))}
          <h3 className="font-display text-lg">Official event log</h3>
          {data.events.map((e: RecordData) => (
            <details
              key={e.id}
              className="text-sm border-b border-hairline py-2"
            >
              <summary>
                {timestamp(e.occurred_at)} • {e.action} •{" "}
                {people.find((p) => p.profile_id === e.actor_id)?.name ||
                  "Authorized administrator"}
              </summary>
              <pre className="whitespace-pre-wrap break-words text-muted">
                {JSON.stringify(e.detail, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      )}
      {tab === "record" && (
        <section className="panel p-5 space-y-4">
          <h2 className="font-display text-xl">Meeting record</h2>
          <p>
            {s.minutes_state} •{" "}
            {s.published_at
              ? `Published ${timestamp(s.published_at)}`
              : "Not published"}
          </p>
          <p className="text-muted">
            Secretary certification, formal body approval, and publication are
            separate steps. Corrections remain visible as addenda.
          </p>
          <div className="flex flex-wrap gap-2">
            {s.minutes && (
              <>
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const dir = await supabase.rpc("cvoa_drive_directory");
                      if (dir.error) throw dir.error;
                      const b = data.body,
                        w = dir.data.workspaces.find(
                          (w: RecordData) =>
                            w.level >= 3 &&
                            (b.jurisdiction === "national"
                              ? w.kind === "national"
                              : b.jurisdiction === "state"
                                ? w.kind === "state" && w.state === b.state
                                : w.post_id === b.post_id),
                        );
                      if (!w)
                        throw new Error(
                          "A Drive workspace with editing permission is required.",
                        );
                      const body = `Exported copy of meeting record. Status: ${s.minutes_state}. Source: https://www.cvoa.one/meetings/session/${s.id}\n\n${s.minutes}`;
                      const r = await supabase.rpc("cvoa_drive_create", {
                        p_workspace: w.id,
                        p_parent: null,
                        p_kind: "document",
                        p_name: `${s.title} minutes`.slice(0, 200),
                        p_content: {
                          type: "doc",
                          content: body
                            .split("\n")
                            .map((line) => ({
                              type: "paragraph",
                              ...(line
                                ? { content: [{ type: "text", text: line }] }
                                : {}),
                            })),
                        },
                      });
                      if (r.error) throw r.error;
                      window.location.assign(`/shared-files?item=${r.data}`);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Save copy to Drive
                </button>
                <button
                  className="btn-ghost"
                  onClick={() =>
                    textDownload(
                      `${s.title.replace(/[^a-z0-9]/gi, "_")}-minutes.txt`,
                      s.minutes,
                    )
                  }
                >
                  Export minutes
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    const w = window.open("", "_blank");
                    if (!w) return;
                    w.document.title = s.title;
                    const pre = w.document.createElement("pre");
                    pre.textContent = s.minutes;
                    pre.style.whiteSpace = "pre-wrap";
                    w.document.body.append(pre);
                    w.print();
                  }}
                >
                  Print / Save PDF
                </button>
              </>
            )}
            {per.secretary && s.phase === "execute" && (
              <button
                className="btn-gold"
                disabled={busy}
                onClick={() => run("certify")}
              >
                Secretary: certify reviewed draft
              </button>
            )}
            {official && s.minutes_state !== "draft" && (
              <button
                className="btn-ghost"
                disabled={busy}
                onClick={() => run("publish_record")}
              >
                Publish certified record
              </button>
            )}
            {official && s.minutes_state === "certified" && (
              <button
                className="btn-ghost"
                onClick={() =>
                  form("Record formal minutes approval", "minutes_approve", [
                    {
                      key: "decision_id",
                      label: "Later body decision approving these minutes",
                      type: "select",
                      required: true,
                      options: data.approval_decisions.map((d: RecordData) => ({
                        value: d.id,
                        label: `${d.identifier}: ${d.text}`,
                      })),
                    },
                  ])
                }
              >
                Record body approval
              </button>
            )}
            {per.secretary && s.ended_at && (
              <button
                className="btn-ghost"
                onClick={() =>
                  form("Add auditable correction", "correct_record", [
                    text("target", "Record element", true),
                    area("previous", "Previous recorded value", true),
                    area("new", "Corrected value", true),
                    area("reason", "Reason", true),
                    area("authority", "Correction authority", true),
                  ])
                }
              >
                Add correction
              </button>
            )}
          </div>
          <pre className="whitespace-pre-wrap break-words text-sm">
            {s.minutes || "A factual draft is generated after adjournment."}
          </pre>
          <p className="text-muted">
            {data.decisions.length} adopted decisions • {data.actions.length}{" "}
            assignments • {Math.floor(s.recess_seconds / 60)} recess minutes
            excluded from meeting time
          </p>
        </section>
      )}
      {tab === "private notes" && (
        <section className="panel p-5 space-y-4">
          <h2 className="font-display text-xl">Your private working notes</h2>
          <p className="text-muted">
            Visible only to your account. These are not minutes, official
            findings, or a substitute for the separate ethics process.
          </p>
          <button
            className="btn-ghost"
            onClick={() =>
              form("Add private note", "note", [
                choice("kind", "Note type", [
                  "personal_note",
                  "secretary_working_note",
                  "follow_up",
                ]),
                area("body", "Private note", true),
              ])
            }
          >
            Add private note
          </button>
          {data.notes.map((n: RecordData) => (
            <article className="border-b border-hairline py-3" key={n.id}>
              <p className="text-muted">
                {timestamp(n.created_at)} • {n.kind.replaceAll("_", " ")}
              </p>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </article>
          ))}
        </section>
      )}
      {dialog && (
        <GovernanceForm
          title={dialog.title}
          fields={dialog.fields}
          initial={dialog.initial}
          onClose={() => setDialog(null)}
          onSubmit={(v) =>
            command(dialog.action, dialog.transform ? dialog.transform(v) : v)
          }
        />
      )}
    </div>
  );
}
