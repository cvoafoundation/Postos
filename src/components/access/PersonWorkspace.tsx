import RemovePerson from "./RemovePerson";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspaces";
import { getFunctionError } from "@/lib/functionErrors";
import { readAllRows } from "@/lib/readAllRows";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import {
  ROLE_LABELS,
  activationLabel,
  scopeLabel,
  type AccessScope,
  type AccountProfile,
  type LinkedMembership,
} from "@/lib/access";
import type { UserRole } from "@/lib/types";
interface PersonData {
  profile: AccountProfile | null;
  memberships: LinkedMembership[];
  activation: {
    email_confirmed: boolean;
    last_sign_in_at: string | null;
  } | null;
  payments: {
    id: string;
    amount: number;
    status: string;
    paid_at: string | null;
    created_at: string;
  }[];
  staff_records: {
    post_name: string;
    position: string;
    verification_status: string;
  }[];
  scopes: AccessScope[];
  history: {
    id: string;
    action: string;
    reason: string;
    created_at: string;
    actor_name: string | null;
  }[];
}
type PostChoice = { id: string; name: string; state: string };
export default function PersonWorkspace({
  profileId,
  memberId,
  posts: suppliedPosts,
  onChanged,
}: {
  profileId?: string;
  memberId?: string;
  posts?: PostChoice[];
  onChanged?: () => void;
}) {
  const { isNational, profile: viewer } = useAuth();
  const { data, loading, error, refresh } = useWorkspace<PersonData>(
    "cvoa_person_record",
    { p_profile: profileId ?? null, p_member: memberId ?? null },
  );
  const [posts, setPosts] = useState<PostChoice[]>(suppliedPosts ?? []);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const person = data?.profile;
  const [removed, setRemoved] = useState(false);
  useEffect(() => {
    if (suppliedPosts) {
      setPosts(suppliedPosts);
      return;
    }
    if (!isNational) return;
    let active = true;
    void readAllRows<PostChoice>(() =>
      supabase.from("posts").select("id,name,state").order("id"),
    )
      .then((rows) => {
        if (active) setPosts(rows);
      })
      .catch((e) => {
        if (active)
          setActionError(
            e instanceof Error ? e.message : "Could not load post assignments.",
          );
      });
    return () => {
      active = false;
    };
  }, [isNational, suppliedPosts]);
  function changed(text: string) {
    setMessage(text);
    setActionError(null);
    setEditing(false);
    setAdding(false);
    refresh();
    onChanged?.();
  }
  async function sendEmail(membership: LinkedMembership) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "invite-member",
        { body: { member_id: membership.id, method: "email" } },
      );
      if (error || result?.error)
        throw new Error(await getFunctionError(error, result));
      changed(`Activation / password setup email sent to ${membership.email}.`);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not send the email.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function sendAccountEmail() {
    if (!person || busy) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "invite-user",
        { body: { profile_id: person.id } },
      );
      if (error || result?.error)
        throw new Error(await getFunctionError(error, result));
      changed(`Password setup email sent to ${person.email}.`);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not send the setup email.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(scope: AccessScope) {
    if (reason.trim().length < 5) {
      setActionError(
        "Explain why this appointment is ending (at least five characters).",
      );
      return;
    }
    if (
      !window.confirm(
        `End ${ROLE_LABELS[scope.role]} · ${scopeLabel(scope)}? Access provided by this appointment ends immediately; the membership remains preserved.`,
      )
    )
      return;
    setBusy(true);
    setActionError(null);
    try {
      const { error } = await supabase.rpc("cvoa_revoke_appointment", {
        p_appointment: scope.scope_id,
        p_reason: reason,
      });
      if (error) throw error;
      changed("Appointment ended and recorded in access history.");
      setReason("");
    } catch (e) {
      setActionError(
        (e as { message?: string }).message ??
          "Could not end this appointment.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (removed)
    return (
      <p role="status" className="panel p-4">
        Record removed. National can restore it from Removed Records.
      </p>
    );
  return (
    <section className="space-y-5">
      <WorkspaceStatus loading={loading} error={error} retry={refresh} />
      {message && (
        <p role="status" className="panel p-3 text-sm text-status-active">
          {message}
        </p>
      )}
      {actionError && (
        <p role="alert" className="panel p-3 text-sm text-status-attention">
          {actionError}
        </p>
      )}
      {data && (
        <>
          <div className="panel p-4">
            <p className="eyebrow">One person · connected records</p>
            <h2 className="font-display text-2xl mt-1">
              {person?.full_name ?? data.memberships[0]?.full_name ?? "Member"}
            </h2>
            <p className="text-sm text-muted break-all">
              {person?.email ??
                data.memberships[0]?.email ??
                "Email not recorded"}
            </p>
            <dl className="grid grid-cols-2 gap-3 text-sm mt-4">
              <div>
                <dt className="text-muted">Login access</dt>
                <dd>
                  {activationLabel(
                    person
                      ? {
                          ...data.activation,
                          access_suspended: person.access_suspended,
                        }
                      : null,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Last sign-in</dt>
                <dd>
                  {data.activation?.last_sign_in_at
                    ? new Date(
                        data.activation.last_sign_in_at,
                      ).toLocaleDateString()
                    : "No sign-in recorded"}
                </dd>
              </div>
            </dl>
            {isNational && person && data.memberships.length === 0 && (
              <button
                type="button"
                className="text-gold text-sm mt-3 disabled:opacity-50"
                disabled={busy}
                onClick={sendAccountEmail}
              >
                {busy
                  ? "Sending…"
                  : "Resend account activation / password setup email"}
              </button>
            )}
            {person?.is_test_account && (
              <p className="text-xs text-status-developing mt-3">
                Marked as a test account · excluded from ordinary account view
              </p>
            )}
          </div>
          <section className="panel p-4">
            <h3 className="font-display text-xl">Membership & affiliation</h3>
            {isNational && person && (
              <RemovePerson
                profileId={person.id}
                name={person.full_name}
                onRemoved={() => {
                  setRemoved(true);
                  onChanged?.();
                }}
              />
            )}
            {data.memberships.length === 0 ? (
              <p className="text-sm text-muted mt-2">
                No linked membership. A staff appointment can exist without a
                membership record. Review eligibility separately.
              </p>
            ) : (
              data.memberships.map((m) => (
                <div
                  key={m.id}
                  className="border-t border-hairline mt-3 pt-3 text-sm"
                >
                  <RemovePerson
                    memberId={m.id}
                    name={m.full_name}
                    onRemoved={() => {
                      if (memberId === m.id) setRemoved(true);
                      else refresh();
                      onChanged?.();
                    }}
                  />
                  <p>
                    {m.membership_number ?? "Number pending"} ·{" "}
                    {m.membership_type} ·{" "}
                    {m.membership_status.replaceAll("_", " ")}
                  </p>
                  <p className="text-muted mt-1">
                    {m.post_name ??
                      (m.post_id
                        ? "Assigned post"
                        : "At-large member (no post)")}{" "}
                    · Service verification:{" "}
                    {m.dd214_review_status ?? "Not recorded"}
                  </p>
                  <p className="text-muted">
                    {m.expires_at
                      ? `Expires ${m.expires_at}`
                      : m.membership_type === "lifetime"
                        ? "Lifetime membership"
                        : "Expiration not recorded"}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-3">
                    <Link
                      className="text-gold"
                      to={`/members?highlight=${m.id}`}
                    >
                      Open roster record →
                    </Link>
                    {isNational && m.email && (
                      <button
                        type="button"
                        className="text-gold disabled:opacity-50"
                        disabled={busy}
                        onClick={() => sendEmail(m)}
                      >
                        {busy
                          ? "Sending…"
                          : "Resend activation / password setup email"}
                      </button>
                    )}
                  </div>
                  {person &&
                    m.email &&
                    person.email &&
                    m.email.trim().toLowerCase() !==
                      person.email.trim().toLowerCase() && (
                      <p className="text-status-attention mt-2">
                        The membership email differs from the account email.
                        Review identity before changing either record.
                      </p>
                    )}
                </div>
              ))
            )}
          </section>
          <section className="panel p-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <h3 className="font-display text-xl">
                Appointments & effective scope
              </h3>
              {isNational &&
                person &&
                person.id !== viewer?.id &&
                person.role !== "ethics_tribunal" && (
                  <button
                    className="text-gold text-sm"
                    onClick={() => {
                      setEditing(!editing);
                      setAdding(false);
                    }}
                  >
                    {editing ? "Close editor" : "Review account access"}
                  </button>
                )}
            </div>
            <p className="text-xs text-muted mt-2">
              State appointments provide oversight. Post officers manage their
              assigned posts. Delegates receive post visibility and state voting
              summaries; formal ballots require a current primary Congress
              designation. Ethics records stay separately restricted.
            </p>
            {data.scopes.length === 0 && (
              <p className="text-sm text-muted mt-3">
                No linked account appointment.
              </p>
            )}
            <ul className="space-y-3 mt-4">
              {data.scopes.map((scope) => (
                <li
                  key={scope.scope_id}
                  className="border-l-2 border-gold pl-3"
                >
                  <p className="text-sm">
                    {ROLE_LABELS[scope.role]}
                    {scope.title ? ` · ${scope.title}` : ""}
                  </p>
                  <p className="text-sm text-muted">{scopeLabel(scope)}</p>
                  <p className="text-xs text-muted mt-1">
                    Source: {scope.source}
                    {person?.access_suspended ? " · Access suspended" : ""}
                  </p>
                  {isNational &&
                    person?.id !== viewer?.id &&
                    scope.source === "National appointment" && (
                      <button
                        className="text-xs text-status-attention mt-2 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => revoke(scope)}
                      >
                        End this appointment
                      </button>
                    )}
                </li>
              ))}
            </ul>
            {isNational &&
              person &&
              person.id !== viewer?.id &&
              person.role !== "ethics_tribunal" && (
                <>
                  <label className="block text-xs mt-4">
                    Reason for ending an appointment
                    <input
                      className="input-field mt-1"
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Appointment ended, reassigned, or corrected…"
                    />
                  </label>
                  <button
                    className="btn-ghost mt-3 text-sm"
                    onClick={() => {
                      setAdding(!adding);
                      setEditing(false);
                    }}
                  >
                    {adding
                      ? "Close appointment form"
                      : "Add a scoped appointment"}
                  </button>
                  <Link
                    to="/congress/delegates"
                    className="text-gold text-sm block mt-3"
                  >
                    Manage Congress designations →
                  </Link>
                </>
              )}
            {isNational && person?.id === viewer?.id && (
              <p className="text-xs text-muted mt-3">
                Another National administrator must change your permissions.
              </p>
            )}
            {person?.role === "ethics_tribunal" && (
              <p className="text-xs text-muted mt-3">
                Tribunal access changes are reserved for the upcoming ethics
                review.
              </p>
            )}
            {editing && person && (
              <AccessForm
                key={`${person.id}-${person.access_version}`}
                person={person}
                posts={posts}
                onSaved={() =>
                  changed("Account permissions saved with an audit record.")
                }
              />
            )}
            {adding && person && (
              <AppointmentForm
                person={person}
                posts={posts}
                onSaved={() =>
                  changed("Scoped appointment created and recorded.")
                }
              />
            )}
          </section>
          {data.staff_records.length > 0 && (
            <section className="panel p-4">
              <h3 className="font-display text-xl">
                Staff verification records
              </h3>
              <ul className="text-sm space-y-2 mt-3">
                {data.staff_records.map((a, i) => (
                  <li key={i}>
                    {a.post_name} · {a.position.replaceAll("_", " ")} ·{" "}
                    {a.verification_status}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mt-3">
                Supporting roster evidence. Effective authority is listed in
                Appointments & effective scope.
              </p>
            </section>
          )}
          {data.payments.length > 0 && (
            <section className="panel p-4">
              <h3 className="font-display text-xl">
                Recent membership payments
              </h3>
              <ul className="text-sm space-y-2 mt-3">
                {data.payments.map((p) => (
                  <li key={p.id}>
                    ${Number(p.amount).toFixed(2)} · {p.status} ·{" "}
                    {(p.paid_at ?? p.created_at).slice(0, 10)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {isNational && (
            <section className="panel p-4">
              <h3 className="font-display text-xl">Access history</h3>
              {data.history.length === 0 ? (
                <p className="text-sm text-muted mt-2">
                  No access changes recorded since this history was introduced.
                  Existing appointments are shown above.
                </p>
              ) : (
                <ol className="space-y-3 mt-3">
                  {data.history.map((h) => (
                    <li
                      key={h.id}
                      className="text-sm border-t border-hairline pt-3"
                    >
                      <p>
                        {h.action.replaceAll("_", " ")} ·{" "}
                        {new Date(h.created_at).toLocaleString()}
                      </p>
                      <p className="text-muted">
                        {h.actor_name ?? "Trusted system process"} · {h.reason}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
function AccessForm({
  person,
  posts,
  onSaved,
}: {
  person: AccountProfile;
  posts: PostChoice[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    role: person.role,
    post: person.post_id ?? "",
    state: person.state ?? "",
    title: person.title ?? "",
    test: person.is_test_account,
    suspended: person.access_suspended,
    reason: "",
  });
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
    setReview(false);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!review) {
      setReview(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("cvoa_update_account", {
        p_profile: person.id,
        p_version: person.access_version,
        p_role: form.role,
        p_post: form.role === "state_commander" ? null : form.post || null,
        p_state: form.role === "state_commander" ? form.state || null : null,
        p_title: form.title,
        p_test: form.test,
        p_suspended: form.suspended,
        p_reason: form.reason,
      });
      if (error) throw error;
      onSaved();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not save access.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="border-t border-hairline mt-4 pt-4 space-y-3"
    >
      <p className="eyebrow">Review primary account appointment</p>
      <label className="block text-sm">
        Role
        <select
          className="input-field mt-1"
          value={form.role}
          onChange={(e) => update("role", e.target.value as UserRole)}
        >
          {Object.entries(ROLE_LABELS)
            .filter(([role]) => role !== "ethics_tribunal")
            .map(([role, label]) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <ScopeFields
        role={form.role}
        post={form.post}
        state={form.state}
        posts={posts}
        onPost={(v) => update("post", v)}
        onState={(v) => update("state", v)}
      />
      <label className="block text-sm">
        Office / title
        <input
          className="input-field mt-1"
          maxLength={200}
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
        />
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.test}
          onChange={(e) => update("test", e.target.checked)}
        />
        Mark as test account
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.suspended}
          onChange={(e) => update("suspended", e.target.checked)}
        />
        Suspend workspace access · preserve membership
      </label>
      <label className="block text-sm">
        Reason for change
        <textarea
          className="input-field mt-1"
          required
          minLength={5}
          maxLength={1000}
          value={form.reason}
          onChange={(e) => update("reason", e.target.value)}
        />
      </label>
      {review && (
        <div className="panel p-3 text-sm">
          <p className="eyebrow">Confirm these permissions</p>
          <p className="mt-2">
            {ROLE_LABELS[person.role]} → {ROLE_LABELS[form.role]}
          </p>
          <p>
            {form.role === "state_commander"
              ? `State ${form.state}`
              : form.role.startsWith("national_")
                ? "Organization-wide visibility · Ethics records restricted"
                : (posts.find((p) => p.id === form.post)?.name ??
                  "No assigned post")}
          </p>
          <p>
            {form.suspended
              ? "Workspace access will be suspended."
              : "Workspace access will remain enabled."}{" "}
            {form.test ? "Test account." : "Ordinary account."}
          </p>
          <p className="text-muted mt-2">{form.reason}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-status-attention">
          {error}
        </p>
      )}
      <button className="btn-gold disabled:opacity-50" disabled={busy}>
        {busy
          ? "Saving…"
          : review
            ? "Confirm access change"
            : "Review proposed access"}
      </button>
    </form>
  );
}
function ScopeFields({
  role,
  post,
  state,
  posts,
  onPost,
  onState,
}: {
  role: UserRole;
  post: string;
  state: string;
  posts: PostChoice[];
  onPost: (value: string) => void;
  onState: (value: string) => void;
}) {
  return role === "state_commander" ? (
    <label className="block text-sm">
      Assigned state
      <input
        className="input-field mt-1"
        required
        maxLength={2}
        pattern="[A-Z]{2}"
        value={state}
        onChange={(e) => onState(e.target.value.toUpperCase())}
        placeholder="IN"
      />
    </label>
  ) : (
    <label className="block text-sm">
      Assigned post
      <select
        className="input-field mt-1"
        required={["post_commander", "post_officer", "delegate"].includes(role)}
        value={post}
        onChange={(e) => onPost(e.target.value)}
      >
        <option value="">No assigned post</option>
        {posts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.state}
          </option>
        ))}
      </select>
    </label>
  );
}
function AppointmentForm({
  person,
  posts,
  onSaved,
}: {
  person: AccountProfile;
  posts: PostChoice[];
  onSaved: () => void;
}) {
  const [role, setRole] = useState<UserRole>("post_officer"),
    [post, setPost] = useState(""),
    [state, setState] = useState(""),
    [title, setTitle] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        `Grant ${ROLE_LABELS[role]} access to ${role === "state_commander" ? state : posts.find((p) => p.id === post)?.name}? This appointment adds authority alongside existing appointments.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("cvoa_add_appointment", {
        p_profile: person.id,
        p_role: role,
        p_post: role === "state_commander" ? null : post,
        p_state: role === "state_commander" ? state : null,
        p_title: title,
        p_reason: reason,
      });
      if (error) throw error;
      onSaved();
    } catch (e) {
      setError(
        (e as { message?: string }).message ?? "Could not add appointment.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="mt-4 pt-4 border-t border-hairline space-y-3"
    >
      <label className="block text-sm">
        Additional appointment
        <select
          className="input-field mt-1"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          {(
            ["state_commander", "post_commander", "post_officer"] as UserRole[]
          ).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <ScopeFields
        role={role}
        post={post}
        state={state}
        posts={posts}
        onPost={setPost}
        onState={setState}
      />
      <label className="block text-sm">
        Office / title
        <input
          className="input-field mt-1"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Appointment authority / reason
        <textarea
          className="input-field mt-1"
          required
          minLength={5}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-status-attention text-sm">
          {error}
        </p>
      )}
      <button className="btn-gold disabled:opacity-50" disabled={busy}>
        {busy ? "Saving…" : "Review and grant appointment"}
      </button>
    </form>
  );
}
