import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import BodySetup from "./BodySetup";
import { GovernanceForm, options } from "./Forms";
import {
  actionState,
  iso,
  phaseLabel,
  timestamp,
  type RecordData,
} from "./model";
export default function GovernanceCenter() {
  const { profile } = useAuth(),
    navigate = useNavigate();
  const [directory, setDirectory] = useState<RecordData | null>(null),
    [bodyId, setBodyId] = useState(""),
    [error, setError] = useState(""),
    [setup, setSetup] = useState(false),
    [creating, setCreating] = useState(false),
    [schedule, setSchedule] = useState(false),
    [registry, setRegistry] = useState<RecordData | null>(null),
    [term, setTerm] = useState(""),
    [tab, setTab] = useState("actions"),
    [interim, setInterim] = useState(false);
  async function load() {
    const { data, error } = await supabase.rpc("uro_directory");
    if (error) throw error;
    setDirectory(data);
    setBodyId((v) => v || data.bodies?.[0]?.id || "");
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
        setBodyId(data.bodies?.[0]?.id || "");
      }
    });
    return () => {
      alive = false;
    };
  }, [profile?.id, profile?.role, profile?.post_id, profile?.state]);
  useEffect(() => {
    let alive = true;
    setRegistry(null);
    if (!bodyId) return;
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
  }, [bodyId, term, directory]);
  const body = directory?.bodies?.find((b: RecordData) => b.id === bodyId),
    sessions =
      directory?.sessions?.filter((s: RecordData) => s.body_id === bodyId) ||
      [];
  return (
    <div className="space-y-6">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Meetings &amp; Governance</h1>
          <p className="text-muted">
            Unified Rules of Order. Prepare, review, meet, execute, archive.
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
      {directory && (
        <>
          <div className="flex gap-3 flex-wrap">
            <select
              aria-label="Governing body"
              className="input-field max-w-md"
              value={bodyId}
              onChange={(e) => setBodyId(e.target.value)}
            >
              <option value="">Choose a governing body</option>
              {directory.bodies?.map((b: RecordData) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
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
                Create governing body
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
                  Rules &amp; voting roster
                </button>
                <button className="btn-gold" onClick={() => setSchedule(true)}>
                  Schedule meeting
                </button>
                <button className="btn-ghost" onClick={() => setInterim(true)}>
                  Record interim action
                </button>
              </>
            )}
          </div>
          {!body && (
            <p className="panel p-5">
              Choose or create a governing body. Access to a workspace does not
              automatically confer voting rights.
            </p>
          )}
          {body && (
            <>
              <section className="panel p-5">
                <h2 className="font-display text-xl">{body.name}</h2>
                <p className="text-muted">
                  {body.jurisdiction} •{" "}
                  {body.rules?.configured
                    ? "Rules confirmed"
                    : "Confirm governing documents and voting roster before call to order"}
                </p>
                <div className="divide-y divide-hairline">
                  {sessions.map((s: RecordData) => (
                    <Link
                      className="block py-4 hover:text-gold"
                      to={`/meetings/session/${s.id}`}
                      key={s.id}
                    >
                      <strong>{s.title}</strong>
                      <p className="text-sm text-muted">
                        {timestamp(s.scheduled_at)} • {s.phase} •{" "}
                        {phaseLabel(s)}
                      </p>
                    </Link>
                  ))}
                  {!sessions.length && (
                    <p className="py-5 text-muted">No meetings scheduled.</p>
                  )}
                </div>
              </section>
              <section className="panel p-5 space-y-4">
                <h2 className="font-display text-xl">Governance register</h2>
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
              </section>
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
          title="Schedule meeting"
          onClose={() => setSchedule(false)}
          fields={[
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
            {
              key: "packet_deadline",
              label: "Packet review deadline",
              type: "datetime-local",
            },
            {
              key: "agenda_deadline",
              label: "Agenda submission deadline",
              type: "datetime-local",
            },
            {
              key: "amendment_deadline",
              label: "Amendment submission deadline",
              type: "datetime-local",
            },
          ]}
          initial={{ title: `${body?.name} meeting`, type: "regular" }}
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
              p_body: bodyId,
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
