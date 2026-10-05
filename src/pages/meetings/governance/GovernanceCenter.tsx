import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import BodySetup from "./BodySetup";
import { GovernanceForm, options } from "./Forms";
import { actionState, iso, timestamp, type RecordData } from "./model";
export default function GovernanceCenter() {
  const { profile } = useAuth(),
    navigate = useNavigate();
  const [queryParams] = useSearchParams(),
    linkedPost = queryParams.get("post");
  const [directory, setDirectory] = useState<RecordData | null>(null),
    [bodyId, setBodyId] = useState(""),
    [error, setError] = useState(""),
    [setup, setSetup] = useState(false),
    [creating, setCreating] = useState(false),
    [schedule, setSchedule] = useState(false),
    [registry, setRegistry] = useState<RecordData | null>(null),
    [term, setTerm] = useState(""),
    [tab, setTab] = useState("actions"),
    [interim, setInterim] = useState(false),
    [showRegister, setShowRegister] = useState(false),
    [status, setStatus] = useState("all");
  async function load() {
    const { data, error } = await supabase.rpc("uro_directory");
    if (error) throw error;
    setDirectory(data);
    setBodyId((v) => v);
  }
  useEffect(() => {
    let alive = true;
    setDirectory(null);
    setRegistry(null);
    setError("");
    supabase.rpc("uro_directory").then(({ data, error }: RecordData) => {
      if (!alive) return;
      if (error) setError(error.message);
      else {
        setDirectory(data);
        setBodyId(
          data?.bodies?.find((b: RecordData) => b.post_id === linkedPost)?.id ??
            "",
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [
    profile?.id,
    profile?.role,
    profile?.post_id,
    profile?.state,
    linkedPost,
  ]);
  useEffect(() => {
    let alive = true;
    setRegistry(null);
    if (!bodyId || !showRegister) return;
    const timer = setTimeout(() => {
      supabase
        .rpc("uro_registry", { p_body: bodyId, p_term: term })
        .then(({ data, error }: RecordData) => {
          if (!alive) return;
          if (error) setError(error.message);
          else setRegistry(data);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [bodyId, term, directory, showRegister]);
  const body = directory?.bodies?.find((b: RecordData) => b.id === bodyId),
    sessions =
      directory?.sessions?.filter(
        (s: RecordData) =>
          (!bodyId || s.body_id === bodyId) &&
          (status === "all" ||
            (status === "completed"
              ? !!s.ended_at
              : status === "live"
                ? !!s.started_at && !s.ended_at
                : !s.started_at)),
      ) || [];
  return (
    <div className="space-y-6">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Meetings</h1>
          <p className="text-muted">
            Schedule a meeting, run it with URO, and read the record.
          </p>
        </div>
        <Link className="btn-ghost" to="/meetings/legacy">
          Legacy records
        </Link>
      </div>
      {error && (
        <p role="alert" className="panel p-4 text-status-attention">
          {error}
        </p>
      )}
      {!directory && !error && <p>Loading meeting workspaces…</p>}
      {linkedPost &&
        directory &&
        !directory.bodies?.some(
          (b: RecordData) => b.post_id === linkedPost,
        ) && (
          <p className="panel p-4 text-sm text-status-attention">
            This post has no meeting workspace yet. A commander must configure
            its post governing body before scheduling. The list below shows your
            existing meeting workspaces.
          </p>
        )}
      {directory && (
        <>
          <div className="flex gap-3 flex-wrap">
            <select
              aria-label="Governing body"
              className="input-field max-w-md"
              value={bodyId}
              onChange={(e) => setBodyId(e.target.value)}
            >
              <option value="">All meetings in my scope</option>
              {directory.bodies?.map((b: RecordData) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Meeting status"
              className="input-field max-w-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="live">In progress</option>
              <option value="completed">Completed</option>
            </select>
            {directory.national ||
            directory.states?.length ||
            directory.posts?.length ? (
              <button
                className="btn-gold"
                onClick={() => {
                  const available =
                    directory.bodies?.filter((b: RecordData) => b.manage) || [];
                  if (!available.length) {
                    setCreating(true);
                    setSetup(true);
                  } else {
                    if (!body?.manage) setBodyId(available[0].id);
                    setSchedule(true);
                  }
                }}
              >
                Start Meeting
              </button>
            ) : null}
          </div>
          <details className="panel p-4">
            <summary>Meeting settings</summary>
            <div className="flex flex-wrap gap-2 mt-3">
              {directory.national ||
              directory.states?.length ||
              directory.posts?.length ? (
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setCreating(true);
                    setSetup(true);
                  }}
                >
                  Set up a meeting group
                </button>
              ) : null}
              {body?.manage && (
                <>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setCreating(false);
                      setSetup(true);
                    }}
                  >
                    Chair, secretary &amp; voting roster
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => setInterim(true)}
                  >
                    Record interim action
                  </button>
                </>
              )}
            </div>
            <p className="text-muted mt-3">
              Choose a group to edit its one-time settings. Starting a meeting
              prepares its agenda and attendance; the Chair calls it to order
              when ready.
            </p>
          </details>
          {directory && (
            <>
              <section className="panel p-5">
                <h2 className="font-display text-xl">
                  {body?.name || "Meetings in my scope"}
                </h2>
                <div className="divide-y divide-hairline">
                  {sessions.map((s: RecordData) => (
                    <Link
                      className="block py-4 hover:text-gold"
                      aria-disabled={s.readable === false}
                      onClick={(e) => {
                        if (s.readable === false) e.preventDefault();
                      }}
                      to={
                        s.readable === false
                          ? "/meetings"
                          : `/meetings/session/${s.id}`
                      }
                      key={s.id}
                    >
                      <strong>{s.title}</strong>
                      {s.readable === false && (
                        <span className="text-sm text-muted">
                          {" "}
                          • Record available after publication
                        </span>
                      )}
                      <p className="text-sm text-muted">
                        {timestamp(s.scheduled_at)} •{" "}
                        {
                          directory.bodies?.find(
                            (b: RecordData) => b.id === s.body_id,
                          )?.name
                        }{" "}
                        •{" "}
                        {s.ended_at
                          ? "Completed"
                          : s.started_at
                            ? "In progress"
                            : "Scheduled"}
                        {s.ended_at && !s.published_at
                          ? " • Minutes awaiting publication"
                          : ""}
                      </p>
                    </Link>
                  ))}
                  {!sessions.length && (
                    <p className="py-5 text-muted">No meetings scheduled.</p>
                  )}
                </div>
              </section>
              <details
                className="panel p-5 space-y-4"
                onToggle={(e) => setShowRegister(e.currentTarget.open)}
              >
                <summary>Search decisions and assignments</summary>
                {!bodyId && (
                  <p>Choose a meeting group above to search its records.</p>
                )}
                <input
                  className="input-field"
                  aria-label="Search governance records"
                  placeholder="Search motions, decisions, reports and minutes"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {[
                    "actions",
                    "motions",
                    "decisions",
                    "meetings",
                    "agenda",
                    "procedure",
                    "interim",
                  ].map((t) => (
                    <button
                      className={tab === t ? "btn-gold" : "btn-ghost"}
                      onClick={() => setTab(t)}
                      key={t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {registry?.[tab]?.map((r: RecordData) => (
                  <Link
                    className="block border-b border-hairline py-3"
                    key={r.id}
                    to={
                      tab === "interim" && !r.meeting_id
                        ? "/meetings"
                        : `/meetings/session/${r.meeting_id || r.id}`
                    }
                  >
                    <strong>
                      {r.identifier ? `${r.identifier}: ` : ""}
                      {r.title ||
                        r.current_text ||
                        r.text ||
                        r.body ||
                        r.action}
                    </strong>
                    <p className="text-muted text-sm">
                      {r.status ? actionState(r) : r.minutes_state}{" "}
                      {r.due_date && `• Due ${r.due_date}`}
                    </p>
                  </Link>
                ))}
                {registry && !registry[tab]?.length && (
                  <p className="text-muted">No matching records.</p>
                )}
              </details>
            </>
          )}
        </>
      )}
      {setup && directory && (
        <BodySetup
          body={creating ? undefined : body}
          directory={directory}
          onClose={() => setSetup(false)}
          onSaved={async () => {
            await load();
          }}
        />
      )}
      {interim && (
        <GovernanceForm
          title="Record delegated interim action"
          onClose={() => setInterim(false)}
          fields={[
            {
              key: "action",
              label: "Action taken",
              type: "textarea",
              required: true,
            },
            {
              key: "authority",
              label: "Existing delegated authority",
              type: "textarea",
              required: true,
            },
            {
              key: "reason",
              label: "Reason action was necessary",
              type: "textarea",
              required: true,
            },
            {
              key: "occurred_at",
              label: "Actual action time",
              type: "datetime-local",
              required: true,
            },
            {
              key: "financial_amount",
              label: "Financial amount",
              type: "number",
              min: 0,
            },
            {
              key: "ratification_required",
              label: "Body ratification required",
              type: "checkbox",
            },
            {
              key: "meeting_id",
              label: "Future meeting for ratification",
              type: "select",
              options: sessions
                .filter((s: RecordData) =>
                  ["prepare", "review"].includes(s.phase),
                )
                .map((s: RecordData) => ({ value: s.id, label: s.title })),
            },
          ]}
          onSubmit={async (v) => {
            const r = await supabase.rpc("uro_record_interim", {
              p_body: bodyId,
              p_data: {
                ...v,
                occurred_at: iso(v.occurred_at),
                financial_amount: v.financial_amount
                  ? Number(v.financial_amount)
                  : null,
                meeting_id: v.meeting_id || null,
              },
            });
            if (r.error) throw r.error;
            await load();
          }}
        />
      )}
      {schedule && (
        <GovernanceForm
          title="Start Meeting"
          onClose={() => setSchedule(false)}
          fields={[
            {
              key: "body_id",
              label: "National, state or post meeting group",
              type: "select",
              required: true,
              options:
                directory?.bodies
                  ?.filter((b: RecordData) => b.manage)
                  .map((b: RecordData) => ({ value: b.id, label: b.name })) ||
                [],
            },
            { key: "title", label: "Meeting title", required: true },
            {
              key: "type",
              label: "Meeting type",
              type: "select",
              options: options(["regular", "special", "emergency"]),
              required: true,
            },
            {
              key: "scheduled_at",
              label: "Scheduled start",
              type: "datetime-local",
              required: true,
            },
            { key: "target_end", label: "Target end", type: "datetime-local" },
            { key: "location", label: "Location" },
            { key: "virtual_link", label: "Authorized remote meeting link" },
            {
              key: "purpose",
              label: "Purpose or emergency justification",
              type: "textarea",
            },
          ]}
          initial={{
            body_id: bodyId,
            title: `${body?.name || "CVOA"} meeting`,
            type: "regular",
            scheduled_at: new Date(
              Date.now() - new Date().getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16),
          }}
          onSubmit={async (v) => {
            const data = { ...v };
            for (const key of [
              "scheduled_at",
              "target_end",
              "packet_deadline",
              "agenda_deadline",
              "amendment_deadline",
            ])
              data[key] = iso(v[key] || "");
            const { data: id, error } = await supabase.rpc("uro_create", {
              p_body: v.body_id,
              p_data: data,
            });
            if (error) throw error;
            navigate(`/meetings/session/${id}`);
          }}
        />
      )}
    </div>
  );
}
