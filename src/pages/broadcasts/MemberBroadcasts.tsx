import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import {
  Mail,
  Plus,
  Paperclip,
  Trash2,
  Eye,
  Send,
  ArrowLeft,
} from "lucide-react";
type Media = { path: string; name: string; type: string; size: number };
type Broadcast = {
  id: string;
  owner_id: string;
  subject: string;
  body: string;
  attachments: Media[];
  status: string;
  revision: number;
  created_at: string;
  sent_at: string | null;
  next_attempt_at: string;
  scope_kind: "national" | "state" | "post";
  scope_state: string | null;
  scope_post_id: string | null;
  target_state: string | null;
  target_post_id: string | null;
  audience_type: string | null;
  audience_status: string | null;
  event: {
    title: string;
    starts_at: string;
    ends_at: string | null;
    location: string;
  } | null;
};
const types: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
};
const size = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
async function api(action: string, values: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("member-broadcasts", {
    body: { action, ...values },
  });
  if (error) {
    let message = error.message;
    try {
      const response = await error.context?.json();
      message = response?.error || message;
    } catch {
      /* network failure */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
type Scope = {
  scope_id: string;
  kind: string;
  state: string | null;
  post_id: string | null;
  label: string;
};
const criteriaFrom = (b: Broadcast) => ({
  target_state: b.target_state || "",
  target_post_id: b.target_post_id || "",
  audience_type: b.audience_type || "",
  audience_status: b.audience_status || "",
});
const localTime = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const eventFrom = (b: Broadcast) => ({
  enabled: !!b.event,
  title: b.event?.title || "",
  start: localTime(b.event?.starts_at || null),
  end: localTime(b.event?.ends_at || null),
  location: b.event?.location || "",
});
export default function MemberBroadcasts() {
  const { profile, scopes, selectedScope } = useAuth();
  if (
    !profile ||
    !scopes.some((s) =>
      [
        "national_commander",
        "state_commander",
        "post_commander",
        "post_officer",
      ].includes(s.role),
    )
  )
    return (
      <div className="panel p-6">
        An assigned Battalion or Company officer workspace is required.
      </div>
    );
  return (
    <BroadcastWorkspace
      key={`${profile.id}:${selectedScope}`}
      actorId={profile.id}
    />
  );
}
function BroadcastWorkspace({ actorId }: { actorId: string }) {
  const { selectedScope } = useAuth();
  const [scopeOptions, setScopeOptions] = useState<Scope[]>([]),
    [newScope, setNewScope] = useState(""),
    [posts, setPosts] = useState<{ id: string; name: string; state: string }[]>(
      [],
    );
  const [criteria, setCriteria] = useState({
    target_state: "",
    target_post_id: "",
    audience_type: "",
    audience_status: "",
  });
  const [eventForm, setEventForm] = useState({
    enabled: false,
    title: "",
    start: "",
    end: "",
    location: "",
  });
  const [responses, setResponses] = useState<{
    counts: Record<string, number>;
    people: any[];
  }>({ counts: {}, people: [] });
  const [rows, setRows] = useState<Broadcast[]>([]),
    [current, setCurrent] = useState<Broadcast | null>(null);
  const [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [files, setFiles] = useState<Media[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({}),
    [issues, setIssues] = useState<any[]>([]),
    [audience, setAudience] = useState<number | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [confirmCancel, setConfirmCancel] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const lock = useRef(false),
    input = useRef<HTMLInputElement>(null),
    selection = useRef("");
  const draft = current?.status === "draft";
  const dirty =
    !!current &&
    (subject !== current.subject ||
      body !== current.body ||
      JSON.stringify(files) !== JSON.stringify(current.attachments) ||
      JSON.stringify(criteria) !== JSON.stringify(criteriaFrom(current)) ||
      JSON.stringify(eventForm) !== JSON.stringify(eventFrom(current)));
  async function refreshList() {
    const result = await api("list");
    setRows(result.broadcasts);
  }
  useEffect(() => {
    let alive = true;
    Promise.all([api("list"), api("context")])
      .then(([list, a]) => {
        if (alive) {
          setRows(list.broadcasts);
          setScopeOptions(a.scopes);
          setPosts(a.posts);
          setNewScope(
            a.scopes.some((s: Scope) => s.scope_id === selectedScope)
              ? selectedScope
              : a.scopes[0]?.scope_id || "",
          );
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    if (!current || current.status === "draft") return;
    let alive = true;
    const id = current.id;
    const refresh = async () => {
      try {
        const result = await api("get", { id });
        if (alive && selection.current === id) {
          setCurrent(result.broadcast);
          setStats(result.stats);
          setIssues(result.issues);
          setResponses(result.responses || { counts: {}, people: [] });
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [current?.id, current?.status]);
  useEffect(() => {
    if (!preview) {
      setImageUrls({});
      return;
    }
    let alive = true;
    const urls: Record<string, string> = {};
    void Promise.all(
      files
        .filter((f) => f.type.startsWith("image/"))
        .map(async (f) => {
          const result = await supabase.storage
            .from("member-broadcasts")
            .createSignedUrl(f.path, 300);
          if (result.error) throw result.error;
          urls[f.path] = result.data.signedUrl;
        }),
    )
      .then(() => {
        if (alive) setImageUrls(urls);
      })
      .catch(() => {
        if (alive)
          setError(
            "Some preview images could not load. Check the attachments before sending.",
          );
      });
    return () => {
      alive = false;
    };
  }, [preview, files]);
  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function choose(b: Broadcast) {
    selection.current = b.id;
    setCurrent(b);
    setSubject(b.subject);
    setBody(b.body);
    setFiles(b.attachments);
    setCriteria(criteriaFrom(b));
    setEventForm(eventFrom(b));
    setAudience(null);
    setResponses({ counts: {}, people: [] });
    setStats({});
    setIssues([]);
    setError("");
    setNotice("");
  }
  async function open(b: Broadcast) {
    if (dirty && !window.confirm("Discard unsaved changes to this draft?"))
      return;
    await run(async () => {
      const r = await api("get", { id: b.id });
      choose(r.broadcast);
      setStats(r.stats);
      setIssues(r.issues);
      setResponses(r.responses || { counts: {}, people: [] });
    });
  }
  async function save() {
    if (!current) throw new Error("Choose a broadcast first");
    if (!dirty) return current;
    const r = await api("save", {
      id: current.id,
      revision: current.revision,
      subject,
      body,
      attachments: files,
      ...criteria,
      event: eventForm.enabled
        ? {
            title: eventForm.title,
            starts_at: new Date(eventForm.start).toISOString(),
            ends_at: eventForm.end
              ? new Date(eventForm.end).toISOString()
              : null,
            location: eventForm.location,
          }
        : null,
    });
    setCurrent(r.broadcast);
    setRows((old) =>
      old.map((x) => (x.id === r.broadcast.id ? r.broadcast : x)),
    );
    return r.broadcast as Broadcast;
  }
  async function upload(selected: File[]) {
    await run(async () => {
      if (!current || !draft)
        throw new Error("Choose an editable draft to add media");
      if (files.length + selected.length > 8)
        throw new Error("Up to 8 attachments per broadcast");
      if (
        files.reduce((n, f) => n + f.size, 0) +
          selected.reduce((n, f) => n + f.size, 0) >
        10 * 1024 * 1024
      )
        throw new Error("Attachments must total 10 MB or less");
      for (const f of selected)
        if (!types[f.type] || !f.size || f.size > 8 * 1024 * 1024)
          throw new Error(`${f.name}: use a supported file up to 8 MB`);
      const added: Media[] = [];
      try {
        for (const f of selected) {
          const path = `${current.id}/${crypto.randomUUID()}.${types[f.type]}`;
          const r = await supabase.storage
            .from("member-broadcasts")
            .upload(path, f, { contentType: f.type, upsert: false });
          if (r.error) throw r.error;
          added.push({
            path,
            name: f.name.slice(0, 140),
            type: f.type,
            size: f.size,
          });
        }
      } finally {
        setFiles((old) => [...old, ...added]);
      }
      setNotice("Media added. Save the draft to keep these attachments.");
    });
  }
  const total = Object.values(stats).reduce((n, v) => n + Number(v), 0);
  return (
    <>
      <PageHeader
        title="Member Broadcasts"
        eyebrow="Member Communications"
        description="Email your assigned membership, narrow the audience, or invite members to an event. Recipients receive private, individually addressed emails."
        action={
          <button
            className="btn-gold flex items-center gap-2"
            disabled={busy || !newScope}
            onClick={() => {
              if (dirty && !window.confirm("Discard unsaved draft changes?"))
                return;
              void run(async () => {
                const r = await api("create", { scope: newScope });
                choose(r.broadcast);
                await refreshList();
              });
            }}
          >
            <Plus size={16} />
            New broadcast
          </button>
        }
      />
      <div className="panel p-4 mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="broadcast-workspace" className="text-sm">
          Workspace for new broadcasts
        </label>
        <select
          id="broadcast-workspace"
          className="input"
          value={newScope}
          disabled={busy}
          onChange={(e) => setNewScope(e.target.value)}
        >
          {scopeOptions.map((s) => (
            <option key={s.scope_id} value={s.scope_id}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          Audience access comes from your current officer appointments.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="panel p-4 mb-4 border-red-500 text-red-400"
        >
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="panel p-4 mb-4 text-gold">
          {notice}
        </div>
      )}
      {!current ? (
        <div className="panel p-4 sm:p-6">
          <h2 className="font-display text-xl mb-2">Messages</h2>
          <p className="text-sm text-muted mb-6">
            Your assigned workspaces determine which broadcasts you can manage.
            National Command can reach all members; Battalion officers can reach
            their state, and Company officers can reach their Company. Counts
            appear after you choose the audience.
          </p>
          {loading ? (
            <p role="status">Loading broadcasts…</p>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center">
              <Mail className="mx-auto mb-3 text-gold" />
              <p>No broadcasts yet. Start with New broadcast.</p>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {rows.map((b) => (
                <li key={b.id}>
                  <button
                    className="w-full text-left py-4 flex flex-wrap justify-between gap-2 hover:text-gold"
                    onClick={() => void open(b)}
                    disabled={busy}
                  >
                    <span>
                      <strong className="block">
                        {b.subject || "Untitled draft"}
                      </strong>
                      <span className="text-xs text-muted">
                        {new Date(b.created_at).toLocaleString()}
                      </span>
                    </span>
                    <span className="text-sm capitalize">
                      {b.status === "complete"
                        ? "Processing complete — view results"
                        : b.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="btn-ghost mt-4"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await refreshList();
              })
            }
          >
            Refresh
          </button>
        </div>
      ) : (
        <>
          <button
            className="btn-ghost mb-4 flex gap-2 items-center"
            disabled={busy}
            onClick={() => {
              if (dirty && !window.confirm("Discard unsaved draft changes?"))
                return;
              selection.current = "";
              setCurrent(null);
              void run(refreshList);
            }}
          >
            <ArrowLeft size={16} />
            All broadcasts
          </button>
          <div className="panel p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-display text-xl">
                {draft ? "Compose message" : current.subject}
              </h2>
              <span className="text-sm text-muted">
                {draft
                  ? dirty
                    ? "Unsaved changes"
                    : "Draft saved"
                  : current.status}
              </span>
            </div>
            <p className="text-sm text-gold">
              Audience boundary:{" "}
              {current.scope_kind === "national"
                ? "National membership"
                : current.scope_kind === "state"
                  ? `${current.scope_state} Battalion`
                  : posts.find((p) => p.id === current.scope_post_id)?.name ||
                    "Assigned Company"}
            </p>
            {draft && (
              <section className="border border-hairline rounded p-4 space-y-4">
                <h3 className="font-display text-xl">Choose recipients</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {current.scope_kind === "national" && (
                    <label className="text-sm">
                      State (optional)
                      <input
                        className="input w-full mt-2"
                        placeholder="All states, or two-letter code"
                        maxLength={2}
                        value={criteria.target_state}
                        disabled={busy}
                        onChange={(e) =>
                          setCriteria((c) => ({
                            ...c,
                            target_state: e.target.value.toUpperCase(),
                            target_post_id: "",
                          }))
                        }
                      />
                    </label>
                  )}
                  {current.scope_kind !== "post" && (
                    <label className="text-sm">
                      Company
                      <select
                        className="input w-full mt-2"
                        value={criteria.target_post_id}
                        disabled={busy}
                        onChange={(e) =>
                          setCriteria((c) => ({
                            ...c,
                            target_post_id: e.target.value,
                          }))
                        }
                      >
                        <option value="">All in this audience</option>
                        {posts
                          .filter(
                            (p) =>
                              (current.scope_kind !== "state" ||
                                p.state === current.scope_state) &&
                              (!criteria.target_state ||
                                p.state === criteria.target_state),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.state})
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label className="text-sm">
                    Membership term
                    <select
                      className="input w-full mt-2"
                      value={criteria.audience_type}
                      disabled={busy}
                      onChange={(e) =>
                        setCriteria((c) => ({
                          ...c,
                          audience_type: e.target.value,
                        }))
                      }
                    >
                      <option value="">All terms</option>
                      <option value="annual">Annual</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Membership status
                    <select
                      className="input w-full mt-2"
                      value={criteria.audience_status}
                      disabled={busy}
                      onChange={(e) =>
                        setCriteria((c) => ({
                          ...c,
                          audience_status: e.target.value,
                        }))
                      }
                    >
                      <option value="">All statuses</option>
                      <option value="active">Active</option>
                      <option value="lapsed">Lapsed</option>
                      <option value="pending_payment">Payment pending</option>
                    </select>
                  </label>
                </div>
                <p className="text-xs text-muted">
                  These filters narrow your assigned audience. Removed members
                  and flagged test accounts are excluded, and duplicate
                  addresses receive one email. Battalion membership follows
                  Company affiliation, using the member’s state for unaffiliated
                  members.
                </p>
              </section>
            )}
            {draft && (
              <section className="border border-hairline rounded p-4 space-y-4">
                <label className="flex gap-3 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={eventForm.enabled}
                    disabled={busy}
                    onChange={(e) =>
                      setEventForm((f) => ({ ...f, enabled: e.target.checked }))
                    }
                  />
                  Include an event invitation with tracked RSVPs
                </label>
                {eventForm.enabled && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="text-sm sm:col-span-2">
                      Event title
                      <input
                        className="input w-full mt-2"
                        maxLength={180}
                        value={eventForm.title}
                        disabled={busy}
                        onChange={(e) =>
                          setEventForm((f) => ({ ...f, title: e.target.value }))
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Starts (your device’s time zone)
                      <input
                        type="datetime-local"
                        className="input w-full mt-2"
                        value={eventForm.start}
                        disabled={busy}
                        onChange={(e) =>
                          setEventForm((f) => ({ ...f, start: e.target.value }))
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Ends (optional)
                      <input
                        type="datetime-local"
                        className="input w-full mt-2"
                        value={eventForm.end}
                        disabled={busy}
                        onChange={(e) =>
                          setEventForm((f) => ({ ...f, end: e.target.value }))
                        }
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      Location or meeting link
                      <input
                        className="input w-full mt-2"
                        maxLength={1000}
                        value={eventForm.location}
                        disabled={busy}
                        onChange={(e) =>
                          setEventForm((f) => ({
                            ...f,
                            location: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <p className="text-xs text-muted sm:col-span-2">
                      The email includes an RSVP button. Members sign in to
                      record or change their own response. Test-email RSVP links
                      activate for actual recipients after sending.
                    </p>
                  </div>
                )}
              </section>
            )}
            {draft && (
              <>
                <div>
                  <label
                    className="block text-sm mb-2"
                    htmlFor="broadcast-subject"
                  >
                    Subject
                  </label>
                  <input
                    id="broadcast-subject"
                    className="input w-full"
                    value={subject}
                    maxLength={180}
                    disabled={busy}
                    onChange={(e) =>
                      setSubject(e.target.value.replace(/[\r\n]/g, " "))
                    }
                  />
                </div>
                <div>
                  <label
                    className="block text-sm mb-2"
                    htmlFor="broadcast-body"
                  >
                    Message
                  </label>
                  <textarea
                    id="broadcast-body"
                    className="input w-full min-h-[300px]"
                    rows={12}
                    value={body}
                    maxLength={30000}
                    disabled={busy}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <p className="text-xs text-muted mt-2">
                    A CVOA letterhead and personal greeting are included. Use{" "}
                    {"{{first_name}}"} or {"{{name}}"} in the message for
                    personalization. Paragraphs and line breaks are preserved.
                  </p>
                </div>
              </>
            )}
            <section>
              <h3 className="text-sm font-semibold mb-2">
                Photos & attachments
              </h3>
              <p className="text-xs text-muted mb-3">
                Images appear below your message. PDF, Word, MP4 video and MP3
                audio are attached. Up to 8 files, 8 MB per file, 10 MB total.
                For larger videos, paste a sharing link in the message.
              </p>
              <ul className="space-y-2">
                {files.map((f) => (
                  <li
                    key={f.path}
                    className="flex gap-3 items-center border border-hairline p-3 rounded"
                  >
                    <Paperclip size={16} className="shrink-0" />
                    <span className="text-sm break-all flex-1">
                      {f.name}{" "}
                      <span className="text-muted">({size(f.size)})</span>
                    </span>
                    {draft && (
                      <button
                        aria-label={`Remove ${f.name}`}
                        disabled={busy}
                        onClick={() =>
                          setFiles((old) =>
                            old.filter((x) => x.path !== f.path),
                          )
                        }
                        className="p-2"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {draft && (
                <>
                  <input
                    ref={input}
                    type="file"
                    className="hidden"
                    multiple
                    accept={Object.keys(types).join(",")}
                    onChange={(e) => {
                      const f = Array.from(e.target.files || []);
                      e.target.value = "";
                      void upload(f);
                    }}
                  />
                  <button
                    className="btn-ghost mt-3"
                    disabled={busy || files.length >= 8}
                    onClick={() => input.current?.click()}
                  >
                    Add media or documents
                  </button>
                </>
              )}
            </section>
            {draft ? (
              <div className="flex flex-wrap gap-3 border-t border-hairline pt-5">
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await save();
                      setNotice("Draft saved.");
                    })
                  }
                >
                  Save draft
                </button>
                <button
                  className="btn-ghost flex items-center gap-2"
                  disabled={busy}
                  onClick={() => setPreview(true)}
                >
                  <Eye size={16} />
                  Preview
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy || !subject.trim() || !body.trim()}
                  onClick={() =>
                    void run(async () => {
                      const b = await save();
                      const r = await api("test", {
                        id: b.id,
                        revision: b.revision,
                      });
                      setNotice(
                        `Test email sent to ${r.sent_to}. Check your inbox and attachments.`,
                      );
                    })
                  }
                >
                  Send test to me
                </button>
                <button
                  className="btn-gold flex items-center gap-2"
                  disabled={busy || !subject.trim() || !body.trim()}
                  onClick={() =>
                    void run(async () => {
                      const b = await save();
                      const r = await api("audience", { id: b.id });
                      setAudience(r.count);
                      setConfirm(true);
                    })
                  }
                >
                  <Send size={16} />
                  Review & send
                </button>
              </div>
            ) : (
              <>
                <div className="border-t border-hairline pt-5">
                  {current.event && (
                    <section className="mb-6">
                      <h3 className="font-display text-xl mb-3">
                        Event RSVPs — {current.event.title}
                      </h3>
                      <p className="text-sm mb-3">
                        {responses.counts.yes || 0} attending ·{" "}
                        {responses.counts.maybe || 0} maybe ·{" "}
                        {responses.counts.no || 0} unable to attend ·{" "}
                        {responses.counts.awaiting || 0} awaiting response
                      </p>
                      <details>
                        <summary className="cursor-pointer text-sm">
                          View responses (latest 500)
                        </summary>
                        <ul className="divide-y divide-hairline">
                          {responses.people.map((p) => (
                            <li
                              key={p.email}
                              className="py-3 text-sm break-words"
                            >
                              {p.member_name} — {p.email}:{" "}
                              {
                                (
                                  {
                                    yes: "Attending",
                                    maybe: "Maybe",
                                    no: "Unable to attend",
                                  } as Record<string, string>
                                )[p.rsvp]
                              }
                              <span className="text-muted block">
                                {new Date(p.rsvp_at).toLocaleString()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </section>
                  )}
                  <h3 className="font-display text-xl mb-3">
                    Delivery results
                  </h3>
                  <p className="text-sm mb-4">
                    {total} recipients · {stats.sent || 0} accepted by email
                    provider · {stats.pending || 0} waiting ·{" "}
                    {stats.sending || 0} in progress · {stats.failed || 0}{" "}
                    rejected · {stats.uncertain || 0} unconfirmed ·{" "}
                    {stats.skipped || 0} skipped
                  </p>
                  <p className="text-xs text-muted mb-4">
                    Acceptance confirms sending, not inbox placement or reading.
                    The queue runs in small batches and continues when you leave
                    this page. Broadcasts share a 1,000-recipient rolling
                    24-hour budget; Google may impose additional limits.
                    Provider failures pause that broadcast for an hour.
                  </p>
                  {(stats.uncertain || 0) > 0 && (
                    <p className="text-sm text-gold mb-3">
                      Unconfirmed messages are never automatically resent.
                      Verify receipt before arranging another delivery.
                    </p>
                  )}
                  {issues.length > 0 && (
                    <details className="mb-4">
                      <summary className="cursor-pointer">
                        Delivery issues (up to 100)
                      </summary>
                      <ul className="divide-y divide-hairline mt-3">
                        {issues.map((x) => (
                          <li key={x.id} className="py-3 text-sm break-words">
                            {x.member_name} — {x.email}
                            <br />
                            <span className="text-muted">
                              {x.state}: {x.failure}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => setPreview(true)}
                    >
                      View message
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => void open(current)}
                    >
                      Refresh status
                    </button>
                    {current.status === "queued" && (
                      <button
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => setConfirmCancel(true)}
                      >
                        Stop remaining emails
                      </button>
                    )}
                    {(stats.failed || 0) > 0 &&
                      current.status !== "cancelled" && (
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Retry only explicitly rejected deliveries? Sent and unconfirmed emails will not be resent.",
                              )
                            )
                              return;
                            void run(async () => {
                              await api("retry", { id: current.id });
                              const r = await api("get", { id: current.id });
                              setCurrent(r.broadcast);
                              setStats(r.stats);
                              setIssues(r.issues);
                              setResponses(
                                r.responses || { counts: {}, people: [] },
                              );
                              setNotice("Rejected deliveries requeued.");
                            });
                          }}
                        >
                          Retry rejected deliveries
                        </button>
                      )}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
      {preview && (
        <Modal
          title="Email preview"
          size="wide"
          onClose={() => setPreview(false)}
        >
          <div className="text-sm text-muted mb-4">
            {subject || "(No subject)"} · Sample recipient: Jane Member
          </div>
          <article className="bg-white text-neutral-900 p-6 sm:p-10 rounded">
            <img src="/images/cvoa-logo.png" alt="CVOA" className="w-20 mb-4" />
            <h2 className="font-bold text-xl border-b-2 border-amber-700 pb-4 mb-6">
              Combat Veterans of America
            </h2>
            <p className="mb-5">Dear Jane Member,</p>
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {body
                .replace(/\{\{first_name\}\}/g, "Jane")
                .replace(/\{\{name\}\}/g, "Jane Member")}
            </p>
            {files
              .filter((f) => f.type.startsWith("image/"))
              .map((f) => (
                <div key={f.path} className="mt-5">
                  {imageUrls[f.path] ? (
                    <img
                      src={imageUrls[f.path]}
                      alt={f.name}
                      className="max-w-full h-auto"
                    />
                  ) : (
                    <p>Loading {f.name}…</p>
                  )}
                </div>
              ))}
            {eventForm.enabled && (
              <section className="border p-4 mt-5">
                <h3 className="font-bold">{eventForm.title}</h3>
                <p>
                  {eventForm.start
                    ? new Date(eventForm.start).toLocaleString()
                    : "Choose a start time"}
                </p>
                <p>{eventForm.location}</p>
                <span className="inline-block bg-black text-white px-4 py-2 mt-3">
                  RSVP to this event
                </span>
              </section>
            )}
            <p className="border-t mt-6 pt-5">
              {current?.scope_kind === "national"
                ? "National Command"
                : current?.scope_kind === "state"
                  ? `${current.scope_state} Battalion Leadership`
                  : "Company Leadership"}
              <br />
              CVOA.ONE
            </p>
          </article>
          <p className="text-xs text-muted mt-4">
            Attachments: {files.map((f) => f.name).join(", ") || "None"}. Email
            clients may display images differently.
          </p>
        </Modal>
      )}
      {confirm && current && (
        <Modal
          title="Send to this audience?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p className="mb-4">
            <strong>{subject}</strong>
          </p>
          <p className="text-sm mb-4">
            Send this message and {files.length} attachment(s) to{" "}
            <strong>{audience ?? "all"} unique member email addresses</strong>.
            The audience is refreshed when sending starts. Each recipient sees
            only their own address.
          </p>
          <p className="text-sm text-muted mb-6">
            Sending starts automatically from the queue. Messages already sent
            cannot be recalled.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep editing
            </button>
            <button
              className="btn-gold"
              disabled={busy || !audience}
              onClick={() =>
                void run(async () => {
                  const r = await api("send", {
                    id: current.id,
                    revision: current.revision,
                  });
                  setConfirm(false);
                  const view = await api("get", { id: current.id });
                  setCurrent(view.broadcast);
                  setStats(view.stats);
                  setIssues(view.issues);
                  setResponses(view.responses || { counts: {}, people: [] });
                  setNotice(
                    `Broadcast queued${r.count ? ` for ${r.count} members` : ""}. Delivery begins within a minute.`,
                  );
                })
              }
            >
              {busy ? "Queuing…" : "Send to selected members"}
            </button>
          </div>
        </Modal>
      )}
      {confirmCancel && current && (
        <Modal
          title="Stop remaining emails?"
          onClose={() => {
            if (!busy) setConfirmCancel(false);
          }}
        >
          <p className="text-sm mb-6">
            This stops waiting messages. Emails already sent or in progress
            cannot be recalled.
          </p>
          <button
            className="btn-gold"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("cancel", { id: current.id });
                setConfirmCancel(false);
                const r = await api("get", { id: current.id });
                setCurrent(r.broadcast);
                setStats(r.stats);
                setIssues(r.issues);
                setResponses(r.responses || { counts: {}, people: [] });
                setNotice("Remaining emails stopped.");
              })
            }
          >
            Stop remaining emails
          </button>
        </Modal>
      )}
    </>
  );
}
