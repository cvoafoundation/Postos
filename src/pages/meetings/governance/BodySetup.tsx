import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { URO_RULES, type RecordData } from "./model";
export default function BodySetup({
  body,
  directory,
  onClose,
  onSaved,
}: {
  body?: RecordData;
  directory: RecordData;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState(body?.name ?? ""),
    [jurisdiction, setJurisdiction] = useState(
      body?.jurisdiction ??
        (directory.national
          ? "national"
          : directory.states?.length
            ? "state"
            : "post"),
    );
  const [state, setState] = useState(
      body?.state ?? directory.states?.[0] ?? "",
    ),
    [post, setPost] = useState(body?.post_id ?? directory.posts?.[0]?.id ?? "");
  const [chair, setChair] = useState(body?.chair_id ?? profile?.id ?? ""),
    [secretary, setSecretary] = useState(
      body?.secretary_id ?? profile?.id ?? "",
    ),
    [rules, setRules] = useState<RecordData>(body?.rules ?? URO_RULES);
  const [candidates, setCandidates] = useState<RecordData[]>([]),
    [members, setMembers] = useState<RecordData[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (body)
      void Promise.all([
        supabase.rpc("uro_candidates", { p_body: body.id }),
        supabase
          .from("uro_body_members")
          .select("*")
          .eq("body_id", body.id)
          .eq("active", true),
      ]).then(([c, m]) => {
        if (!active) return;
        if (c.error || m.error) setError((c.error ?? m.error).message);
        else {
          setCandidates([
            ...new Map(
              (c.data ?? []).map((x: RecordData) => [
                x.profile_id ?? x.member_id,
                x,
              ]),
            ).values(),
          ] as RecordData[]);
          setMembers(m.data ?? []);
        }
      });
    return () => {
      active = false;
    };
  }, [body?.id]);
  function toggle(
    candidate: RecordData,
    key: "included" | "voting" | "committee_chair",
    checked: boolean,
  ) {
    const match = (m: RecordData) =>
      candidate.profile_id
        ? m.profile_id === candidate.profile_id
        : m.member_id === candidate.member_id;
    setMembers((ms) => {
      const old = ms.find(match);
      if (key === "included")
        return checked
          ? [
              ...ms.filter((m) => !match(m)),
              { ...candidate, voting: false, committee_chair: false },
            ]
          : ms.filter((m) => !match(m));
      return ms.map((m) => (match(m) ? { ...m, [key]: checked } : m));
    });
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.rpc("uro_body_setup", {
        p_id: body?.id ?? null,
        p_data: {
          name,
          jurisdiction,
          state: state || null,
          post_id: post || null,
          chair_id: chair || null,
          secretary_id: secretary || null,
          rules: {
            ...rules,
            quorum_count: rules.quorum_count
              ? Number(rules.quorum_count)
              : null,
            notice_hours:
              rules.notice_hours === ""
                ? null
                : rules.notice_hours == null
                  ? null
                  : Number(rules.notice_hours),
            speaking_seconds: Number(rules.speaking_seconds),
          },
          members,
        },
      });
      if (r.error) throw r.error;
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={body ? "Governing body and rules" : "Create governing body"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Select the body’s actual participants and voters under its governing
          authority. Staff access provides administration and oversight. Voting
          requires explicit membership in this body.
        </p>
        <label className="block text-sm">
          Body name
          <input
            className="input-field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Jurisdiction
          <select
            className="input-field mt-1"
            disabled={!!body}
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
          >
            {directory.national && <option value="national">National</option>}
            {(directory.national || directory.states?.length > 0) && (
              <option value="state">State</option>
            )}
            {directory.posts?.length > 0 && <option value="post">Post</option>}
          </select>
        </label>
        {jurisdiction === "state" && (
          <label className="block text-sm">
            State
            <input
              className="input-field mt-1"
              value={state}
              maxLength={2}
              disabled={!!body}
              onChange={(e) => setState(e.target.value.toUpperCase())}
            />
          </label>
        )}
        {jurisdiction === "post" && (
          <label className="block text-sm">
            Post
            <select
              className="input-field mt-1"
              value={post}
              disabled={!!body}
              onChange={(e) => setPost(e.target.value)}
            >
              {directory.posts.map((p: RecordData) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {body ? (
          <>
            <label className="block text-sm">
              Chair
              <select
                className="input-field mt-1"
                value={chair}
                onChange={(e) => setChair(e.target.value)}
              >
                <option value="">Unassigned</option>
                {candidates
                  .filter((c) => c.profile_id)
                  .map((c) => (
                    <option key={c.profile_id} value={c.profile_id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              Secretary
              <select
                className="input-field mt-1"
                value={secretary}
                onChange={(e) => setSecretary(e.target.value)}
              >
                <option value="">Unassigned</option>
                {candidates
                  .filter((c) => c.profile_id)
                  .map((c) => (
                    <option key={c.profile_id} value={c.profile_id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              Find roster participants
              <input
                className="input-field mt-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="max-h-72 overflow-auto border border-hairline">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      "Participant",
                      "Include",
                      "Voting member",
                      "Committee chair",
                    ].map((x) => (
                      <th key={x} className="table-head">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates
                    .filter((c) =>
                      c.name?.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((c) => {
                      const m = members.find((m) =>
                        c.profile_id
                          ? m.profile_id === c.profile_id
                          : m.member_id === c.member_id,
                      );
                      return (
                        <tr key={c.profile_id ?? c.member_id}>
                          <td className="table-cell">
                            {c.name}
                            <span className="block text-xs text-muted">
                              {c.role}
                            </span>
                          </td>
                          {(
                            ["included", "voting", "committee_chair"] as const
                          ).map((k) => (
                            <td className="table-cell" key={k}>
                              <input
                                type="checkbox"
                                aria-label={`${k.replaceAll("_", " ")} ${c.name}`}
                                checked={k === "included" ? !!m : !!m?.[k]}
                                disabled={k !== "included" && !m}
                                onChange={(e) => toggle(c, k, e.target.checked)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            Create the body first, then select participants from its scoped
            membership and account directory.
          </p>
        )}
        <label className="block text-sm">
          Rule version
          <input
            className="input-field mt-1"
            value={rules.version}
            onChange={(e) =>
              setRules((r) => ({ ...r, version: e.target.value }))
            }
          />
        </label>
        <p className="text-sm">
          Voting denominator: eligible voters present, including abstentions.
          Quorum default: majority of voting membership.
        </p>
        <label className="block text-sm">
          Superior quorum count (optional)
          <input
            className="input-field mt-1"
            type="number"
            min={1}
            value={rules.quorum_count ?? ""}
            onChange={(e) =>
              setRules((r) => ({ ...r, quorum_count: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm">
          Notice period, hours
          <input
            className="input-field mt-1"
            type="number"
            min={0}
            value={rules.notice_hours ?? ""}
            onChange={(e) =>
              setRules((r) => ({ ...r, notice_hours: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm">
          Notice authority
          <textarea
            className="input-field mt-1"
            value={rules.notice_authority ?? ""}
            placeholder="Governing-document provision and required delivery method"
            onChange={(e) =>
              setRules((r) => ({ ...r, notice_authority: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm">
          Voting membership authority
          <textarea
            className="input-field mt-1"
            value={rules.voting_authority ?? ""}
            placeholder="Which body members can vote and the governing provision"
            onChange={(e) =>
              setRules((r) => ({ ...r, voting_authority: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm">
          Recused members count toward quorum
          <select
            className="input-field mt-1"
            value={
              rules.recusal_counts_quorum == null
                ? ""
                : String(rules.recusal_counts_quorum)
            }
            onChange={(e) =>
              setRules((r) => ({
                ...r,
                recusal_counts_quorum:
                  e.target.value === "" ? null : e.target.value === "true",
              }))
            }
          >
            <option value="">Unresolved: block affected votes</option>
            <option value="true">Yes, under governing authority</option>
            <option value="false">No, under governing authority</option>
          </select>
        </label>
        <label className="block text-sm">
          Speaking turn, seconds
          <input
            type="number"
            className="input-field mt-1"
            min={15}
            value={rules.speaking_seconds}
            onChange={(e) =>
              setRules((r) => ({ ...r, speaking_seconds: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm">
          <input
            type="checkbox"
            className="mr-2"
            checked={!!rules.remote_authorized}
            onChange={(e) =>
              setRules((r) => ({ ...r, remote_authorized: e.target.checked }))
            }
          />
          Remote participation is authorized by governing documents
        </label>
        <label className="block text-sm">
          <input
            type="checkbox"
            className="mr-2"
            disabled={!body}
            checked={!!rules.configured}
            onChange={(e) =>
              setRules((r) => ({ ...r, configured: e.target.checked }))
            }
          />
          I confirm this body’s roster and governing requirements
        </label>
        <p className="text-xs text-muted">
          Changes apply to new meetings. Preparing meetings can explicitly
          refresh their rules and roster. Live and archived meetings retain
          their snapshots.
        </p>
        {error && (
          <p role="alert" className="text-status-attention">
            {error}
          </p>
        )}
        <button
          className="btn-gold"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save body configuration"}
        </button>
      </div>
    </Modal>
  );
}
