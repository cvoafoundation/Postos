import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Home,
  Hash,
  Lock,
  MessageSquare,
  Plus,
  Search,
  X,
  ListTodo,
  Activity as ActivityIcon,
  FileText,
  BookOpen,
  AtSign,
  Pin,
  RefreshCw,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Composer, MessageCard, type ComposerDraft } from "./Conversation";
import { Assistant } from "./Assistant";
import { OperationsHome } from "./OperationsHome";
import { SOP } from "./sop";
import {
  STATUS,
  type Channel,
  type Message,
  type Person,
  type Reaction,
  type Task,
  type Activity,
  type Report,
  type Workspace,
} from "./types";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const checked = (result: any) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const readableError = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Could not complete this operation. Please retry.";
function Field({
  label,
  name,
  draft,
  setDraft,
  type = "text",
  required = false,
  multiline = false,
}: {
  label: string;
  name: string;
  draft: Record<string, string>;
  setDraft: (value: Record<string, string>) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  const props = {
    value: draft[name] || "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft({ ...draft, [name]: e.target.value }),
    required,
    className: "input-field w-full mt-1",
    maxLength: 5000,
  };
  return (
    <label className="block text-sm">
      {label}
      {multiline ? (
        <textarea {...props} rows={3} />
      ) : (
        <input {...props} type={type} />
      )}
    </label>
  );
}
export default function Operations() {
  const { session, selectedScope } = useAuth();
  return (
    <OperationsWorkspace
      key={`${session?.user.id}:${selectedScope}`}
      userId={session?.user.id || ""}
    />
  );
}
function OperationsWorkspace({ userId }: { userId: string }) {
  const [channels, setChannels] = useState<Channel[]>([]),
    [selected, setSelected] = useState(""),
    [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [directory, setDirectory] = useState<Person[]>([]),
    [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<Message[]>([]),
    [thread, setThread] = useState<Message | null>(null),
    [replies, setReplies] = useState<Message[]>([]),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [reactions, setReactions] = useState<Reaction[]>([]);
  const [taskEditing, setTaskEditing] = useState<Task | null>(null),
    [pinned, setPinned] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]),
    [activity, setActivity] = useState<Activity[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [presence, setPresence] = useState<
      { user_id: string; last_seen: string; typing_until: string | null }[]
    >([]);
  const [tab, setTab] = useState("home"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [connection, setConnection] = useState("Connecting"),
    [sidebar, setSidebar] = useState(false),
    [showPeople, setShowPeople] = useState(false);
  const [search, setSearch] = useState(""),
    [results, setResults] = useState<Message[] | null>(null),
    [modal, setModal] = useState(""),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Message | null>(null),
    [source, setSource] = useState<Message | null>(null),
    [older, setOlder] = useState(false),
    [actionFilter, setActionFilter] = useState("all");
  const channel = channels.find((c) => c.id === selected),
    generation = useRef(0),
    loadSequence = useRef(0),
    draftCache = useRef(new Map<string, ComposerDraft>()),
    mounted = useRef(true),
    callbacks = useRef({
      refresh: async () => {},
      load: async () => {},
      presence: async () => {},
    }),
    typingAt = useRef(0),
    bottom = useRef<HTMLDivElement>(null),
    pendingThread = useRef<string | null>(null),
    messagePane = useRef<HTMLDivElement>(null),
    lastMessage = useRef("");
  const fail = (e: unknown) => {
    if (mounted.current) setError(readableError(e));
  };
  const name = (id: string) =>
    people.find((p) => p.id === id)?.full_name ||
    directory.find((p) => p.id === id)?.full_name ||
    "Member";
  const label = (c: Channel) =>
    c.scope === "direct"
      ? "Direct message"
      : c.scope === "national"
        ? "National"
        : c.state ||
          workspaces.find((w) => w.post_id === c.post_id)?.label ||
          "Post";
  async function refresh() {
    const rows = checked(await supabase.rpc("ops_channel_list")) as Channel[];
    if (!mounted.current) return;
    setChannels(rows);
    setSelected((old) =>
      rows.some((c) => c.id === old)
        ? old
        : rows.find((c) => c.name === "general")?.id || rows[0]?.id || "",
    );
  }
  async function heartbeat() {
    if (!selected || document.visibilityState !== "visible") return;
    const r = await supabase
      .from("ops_presence")
      .upsert(
        { channel_id: selected, user_id: userId, typing_until: null },
        { onConflict: "channel_id,user_id" },
      );
    if (r.error) fail(r.error);
  }
  async function load() {
    if (!selected) return;
    const revision = generation.current,
      loadId = ++loadSequence.current;
    const queries = await Promise.all([
      supabase
        .from("ops_messages")
        .select("*")
        .eq("channel_id", selected)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(75),
      supabase.rpc("ops_channel_people", { p_channel: selected }),
      supabase.rpc("ops_thread_counts", { p_channel: selected }),
      supabase
        .from("ops_tasks")
        .select("*")
        .eq("channel_id", selected)
        .order("due_date")
        .limit(200),
      supabase
        .from("ops_activity")
        .select("*")
        .eq("channel_id", selected)
        .order("activity_date", { ascending: false })
        .limit(100),
      supabase
        .from("ops_reports")
        .select("*")
        .eq("channel_id", selected)
        .order("period", { ascending: false })
        .limit(100),
      supabase
        .from("ops_presence")
        .select("*")
        .eq("channel_id", selected)
        .gte("last_seen", new Date(Date.now() - 90000).toISOString()),
      thread
        ? supabase
            .from("ops_messages")
            .select("*")
            .eq("channel_id", selected)
            .eq("parent_id", thread.id)
            .order("created_at")
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (
      !mounted.current ||
      revision !== generation.current ||
      loadId !== loadSequence.current
    )
      return;
    if (queries.some((r) => r.error)) {
      setMessages([]);
      setReplies([]);
      setTasks([]);
      setActivity([]);
      setReports([]);
      setPeople([]);
      setThread(null);
      setLoading(false);
      throw new Error(
        queries.find((r) => r.error)?.error.message ||
          "Access verification failed",
      );
    }
    const [ms, ps, cs, ts, as, rs, pr, replyRows] = queries.map(checked);
    const newest = ms[0]?.id;
    const pane = messagePane.current;
    const nearBottom =
      !lastMessage.current ||
      !pane ||
      pane.scrollHeight - pane.scrollTop - pane.clientHeight < 140;
    if (newest !== lastMessage.current) {
      lastMessage.current = newest;
      if (nearBottom)
        setTimeout(() => {
          if (messagePane.current)
            messagePane.current.scrollTop = messagePane.current.scrollHeight;
        }, 0);
    }
    const recent = (ms as Message[]).reverse();
    setMessages((previous) =>
      recent.length
        ? Array.from(
            new Map(
              [
                ...previous.filter(
                  (m) =>
                    m.channel_id === selected &&
                    m.created_at < recent[0].created_at,
                ),
                ...recent,
              ].map((m) => [m.id, m]),
            ).values(),
          ).sort((a, b) => a.created_at.localeCompare(b.created_at))
        : [],
    );
    setPeople(ps);
    setCounts(
      Object.fromEntries(cs.map((c: any) => [c.parent_id, Number(c.replies)])),
    );
    setTasks(ts);
    setActivity(as);
    setReports(rs);
    setPresence(pr);
    setReplies(replyRows);
    setOlder(ms.length === 75);
    const ids = [...ms, ...replyRows].map((m: Message) => m.id);
    const rx = ids.length
      ? await supabase.from("ops_reactions").select("*").in("message_id", ids)
      : { data: [], error: null };
    if (
      !mounted.current ||
      revision !== generation.current ||
      loadId !== loadSequence.current
    )
      return;
    setReactions(checked(rx));
    if (tab === "pinned") {
      const ps = await supabase
        .from("ops_messages")
        .select("*")
        .eq("channel_id", selected)
        .eq("pinned", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (mounted.current && revision === generation.current)
        setPinned(checked(ps));
    }
    setLoading(false);
    if (tab === "messages" && document.visibilityState === "visible") {
      checked(await supabase.rpc("ops_mark_read", { p_channel: selected }));
      window.dispatchEvent(new Event("operations-read"));
      await refresh();
    }
  }
  callbacks.current = { refresh, load, presence: heartbeat };
  useEffect(() => {
    mounted.current = true;
    let active = true;
    (async () => {
      checked(await supabase.rpc("ops_bootstrap"));
      const spaces = checked(await supabase.rpc("ops_workspaces"));
      const rows = checked(await supabase.rpc("ops_channel_list"));
      const general = rows.find((c: Channel) => c.name === "general");
      const ds = general
        ? checked(
            await supabase.rpc("ops_channel_people", { p_channel: general.id }),
          )
        : [];
      if (active) {
        setWorkspaces(spaces);
        setDirectory(ds);
        setChannels(rows);
        const params = new URLSearchParams(window.location.search);
        const linked = rows.find(
          (c: Channel) => c.id === params.get("channel"),
        );
        setSelected(linked?.id || general?.id || rows[0]?.id || "");
        if (
          linked &&
          ["actions", "reports", "messages", "activity"].includes(
            params.get("view") || "",
          )
        )
          setTab(params.get("view")!);
        setLoading(false);
      }
    })().catch(fail);
    return () => {
      active = false;
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    setMessages([]);
    setReplies([]);
    setPeople([]);
    setTasks([]);
    setActivity([]);
    setReports([]);
    setPresence([]);
    setThread(null);
    setResults(null);
    setShowPeople(false);
    setError("");
    setLoading(!!selected);
    lastMessage.current = "";
    if (selected) void callbacks.current.load().catch(fail);
    const pending = pendingThread.current;
    pendingThread.current = null;
    if (pending) {
      const revision = generation.current;
      void supabase
        .from("ops_messages")
        .select("*")
        .eq("id", pending)
        .eq("channel_id", selected)
        .single()
        .then(checked)
        .then((m: Message) => {
          if (mounted.current && revision === generation.current) setThread(m);
        })
        .catch(fail);
    }
  }, [selected]);
  useEffect(() => {
    if (selected) void load().catch(fail);
  }, [thread?.id, tab]);
  useEffect(() => {
    if (!selected) return;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(pending);
      pending = setTimeout(
        () => void callbacks.current.load().catch(fail),
        150,
      );
    };
    let subscription = supabase.channel(`operations-${userId}-${selected}`);
    for (const table of [
      "ops_messages",
      "ops_tasks",
      "ops_activity",
      "ops_reports",
      "ops_presence",
    ])
      subscription = subscription.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `channel_id=eq.${selected}`,
        },
        reload,
      );
    subscription = subscription
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ops_reactions" },
        reload,
      )
      .subscribe((status: string) => {
        if (mounted.current)
          setConnection(
            status === "SUBSCRIBED"
              ? "Live"
              : status === "CHANNEL_ERROR"
                ? "Reconnecting"
                : "Connecting",
          );
      });
    const all = supabase
      .channel(`operations-unread-${userId}-${selected}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ops_messages" },
        () => void callbacks.current.refresh().catch(fail),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ops_channels" },
        () => void callbacks.current.refresh().catch(fail),
      )
      .subscribe();
    void heartbeat();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void callbacks.current.presence();
        void callbacks.current.load().catch(fail);
        void callbacks.current.refresh().catch(fail);
      }
    }, 30000);
    return () => {
      clearTimeout(pending);
      clearInterval(interval);
      void supabase.removeChannel(subscription);
      void supabase.removeChannel(all);
      void supabase
        .from("ops_presence")
        .delete()
        .eq("channel_id", selected)
        .eq("user_id", userId);
    };
  }, [selected, userId]);
  async function typing() {
    if (!channel?.can_write || Date.now() - typingAt.current < 4000) return;
    typingAt.current = Date.now();
    await supabase.from("ops_presence").upsert(
      {
        channel_id: selected,
        user_id: userId,
        typing_until: new Date().toISOString(),
      },
      { onConflict: "channel_id,user_id" },
    );
  }
  async function send(
    body: string,
    mentions: string[],
    attachments: any[],
    parent_id: string | null = null,
  ) {
    checked(
      await supabase.from("ops_messages").insert({
        channel_id: selected,
        body,
        mentions,
        attachments,
        parent_id,
      }),
    );
    await load();
  }
  async function react(m: Message, emoji: string) {
    if (!channel?.can_write) return;
    const exists = reactions.some(
      (r) => r.message_id === m.id && r.user_id === userId && r.emoji === emoji,
    );
    checked(
      await (exists
        ? supabase
            .from("ops_reactions")
            .delete()
            .eq("message_id", m.id)
            .eq("user_id", userId)
            .eq("emoji", emoji)
        : supabase
            .from("ops_reactions")
            .insert({ message_id: m.id, user_id: userId, emoji })),
    );
    await load();
  }
  function open(which: string, m: Message | null = null) {
    setError("");
    setTaskEditing(null);
    setSource(m);
    setEditing(which === "edit" ? m : null);
    setModal(which);
    setDraft({
      owner_id: userId,
      due_date: today(),
      cycle_start: today(),
      activity_date: today(),
      activity_type: "Engagement",
      period: today().slice(0, 7),
      workspace: "0",
      title: m?.body.slice(0, 160) || "",
      body: m?.body || "",
      follow_up_owner: userId,
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (modal === "channel") {
        const w = workspaces.filter((w) => w.can_manage)[
          Number(draft.workspace || 0)
        ];
        checked(
          await supabase.rpc("ops_create_channel", {
            p_name: draft.name,
            p_description: draft.description || "",
            p_scope: w.scope,
            p_state: w.state,
            p_post: w.post_id,
            p_staff: draft.staff_only === "true",
            p_private: draft.private === "true",
            p_participants: (draft.participants || "")
              .split(",")
              .filter(Boolean),
            p_read_only: draft.read_only === "true",
          }),
        );
        await refresh();
      }
      if (modal === "dm") {
        const id = checked(
          await supabase.rpc("ops_open_dm", { p_other: draft.person }),
        );
        await refresh();
        setSelected(id);
        setTab("messages");
      }
      if (modal === "task") {
        const values = {
          channel_id: selected,
          title: draft.title,
          outcome: draft.outcome || "",
          measure: draft.measure || "",
          owner_id: draft.owner_id,
          due_date: draft.due_date,
          priority: draft.priority === "true",
          cycle_start: draft.cycle_start,
          source_message_id: source?.id || null,
        };
        if (taskEditing) {
          const { channel_id, source_message_id, ...changes } = values;
          checked(
            await supabase
              .from("ops_tasks")
              .update(changes)
              .eq("id", taskEditing.id),
          );
        } else checked(await supabase.from("ops_tasks").insert(values));
      }
      if (modal === "activity")
        checked(
          await supabase.rpc("ops_log_activity", {
            p_channel: selected,
            p_data: draft,
          }),
        );
      if (modal === "report")
        checked(
          await supabase.rpc("ops_submit_report", {
            p_channel: selected,
            p_period: `${draft.period}-01`,
            p_completed: draft.completed || "No significant movement",
            p_next: draft.next_action || "",
            p_blocked: draft.blocked || "",
          }),
        );
      if (modal === "edit" && editing)
        checked(
          await supabase
            .from("ops_messages")
            .update({ body: draft.body })
            .eq("id", editing.id),
        );
      setModal("");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function searchMessages(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) {
      setResults(null);
      return;
    }
    try {
      setResults(
        checked(
          await supabase
            .from("ops_messages")
            .select("*")
            .textSearch("search", search, {
              type: "websearch",
              config: "english",
            })
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(50),
        ),
      );
    } catch (e) {
      fail(e);
    }
  }
  async function olderMessages() {
    if (!messages[0]) return;
    const earlier = checked(
      await supabase
        .from("ops_messages")
        .select("*")
        .eq("channel_id", selected)
        .is("parent_id", null)
        .lt("created_at", messages[0].created_at)
        .order("created_at", { ascending: false })
        .limit(75),
    ) as Message[];
    setMessages([...earlier.reverse(), ...messages]);
    setOlder(earlier.length === 75);
  }
  function jumpTo(m: Message) {
    setResults(null);
    setTab("messages");
    const id = m.parent_id || m.id;
    if (selected !== m.channel_id) {
      pendingThread.current = id;
      setSelected(m.channel_id);
    } else
      void supabase
        .from("ops_messages")
        .select("*")
        .eq("id", id)
        .eq("channel_id", selected)
        .single()
        .then(checked)
        .then(setThread)
        .catch(fail);
  }
  const card = (m: Message) => (
    <MessageCard
      key={m.id}
      message={m}
      userId={userId}
      canManage={!!channel?.can_manage}
      replies={counts[m.id]}
      reactions={reactions}
      onReply={setThread}
      onReact={(m, emoji) => void react(m, emoji).catch(fail)}
      onTask={(m) => open("task", m)}
      onEdit={(m) => open("edit", m)}
      onRemove={(m) => {
        if (
          confirm(
            "Remove this message from the conversation? Its previous text remains in the protected record history.",
          )
        )
          void supabase
            .from("ops_messages")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", m.id)
            .then(checked)
            .then(load)
            .catch(fail);
      }}
      onPin={(m) =>
        void supabase
          .from("ops_messages")
          .update({ pinned: !m.pinned })
          .eq("id", m.id)
          .then(checked)
          .then(load)
          .catch(fail)
      }
      onError={fail}
    />
  );
  const tabs = [
    ["messages", "Messages", MessageSquare],
    ["actions", "Actions", ListTodo],
    ["activity", "Activity", ActivityIcon],
    ["reports", "Reports", FileText],
    ["sop", "SOP", BookOpen],
  ] as const;
  const visibleTasks = tasks.filter((t) =>
    actionFilter === "mine"
      ? t.owner_id === userId
      : actionFilter === "overdue"
        ? t.status !== "complete" && t.due_date < today()
        : actionFilter === "priorities"
          ? t.priority
          : true,
  );
  const typingNames = presence
    .filter(
      (p) =>
        p.user_id !== userId &&
        p.typing_until &&
        new Date(p.typing_until).getTime() > Date.now(),
    )
    .map((p) => name(p.user_id));
  const globalView = [
    "home",
    "mywork",
    "overview",
    "mentions",
    "sop",
    "assistant",
  ].includes(tab);
  const navigate = (next: string) => {
    setTab(next);
    setResults(null);
    setThread(null);
    setShowPeople(false);
    setSidebar(false);
  };
  return (
    <div className="p-3 md:p-5 flex flex-col h-[calc(100dvh-64px)] min-h-[400px]">
      <header className="flex items-center gap-3 mb-3">
        <button
          className="md:hidden btn-ghost"
          onClick={() => setSidebar(!sidebar)}
          aria-label="Show channels"
        >
          <Hash size={18} />
        </button>
        <div>
          <h1 className="font-display text-3xl leading-none">Operations</h1>
          <p className="text-xs text-muted mt-1">
            Own · Act · Capture · Follow through · Report
          </p>
        </div>
        <form
          onSubmit={searchMessages}
          className="ml-auto flex items-center gap-2 border border-hairline rounded px-2 py-1.5"
        >
          <Search size={15} />
          <input
            aria-label="Search Operations messages"
            placeholder="Search messages"
            className="bg-transparent outline-none text-sm w-24 sm:w-48"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {results && (
            <button
              type="button"
              onClick={() => {
                setResults(null);
                setSearch("");
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </form>
        <button
          aria-label="Refresh Operations"
          className="btn-ghost p-2"
          onClick={() => {
            void refresh().catch(fail);
            void load().catch(fail);
          }}
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {error && !modal && (
        <div
          role="alert"
          className="text-sm border border-red-900 bg-red-950/20 p-3 mb-2 flex justify-between"
        >
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0 border border-hairline rounded-lg overflow-hidden bg-charcoal relative">
        <nav
          aria-label="Operations navigation"
          className="w-16 md:w-20 shrink-0 border-r border-hairline bg-base flex flex-col items-center py-3 gap-2 overflow-y-auto"
        >
          {(
            [
              ["home", "Home", Home],
              ["mywork", "My work", ListTodo],
              ["messages", "Conversations", MessageSquare],
              ["mentions", "Mentions", AtSign],
              ["overview", "Overview", ActivityIcon],
              ["sop", "Guide", BookOpen],
              ["assistant", "Assistant", Sparkles],
            ] as const
          ).map(([key, title, Icon]) => (
            <button
              key={key}
              aria-label={title}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => navigate(key)}
              className={`w-full px-1 py-3 flex flex-col items-center gap-1 rounded text-[10px] break-words ${tab === key ? "bg-elevated text-white" : "text-muted hover:bg-surface"}`}
            >
              <Icon size={20} />
              {title}
            </button>
          ))}
        </nav>
        <aside
          className={`${globalView && !sidebar ? "hidden" : sidebar ? "flex" : "hidden md:flex"} flex-col w-52 shrink-0 border-r border-hairline bg-base absolute md:static inset-y-0 left-16 z-20`}
        >
          <div className="px-4 py-3 border-b border-hairline flex justify-between items-center">
            <strong className="text-sm">Team conversations</strong>
            <button
              onClick={() => open("channel")}
              disabled={!workspaces.some((w) => w.can_manage)}
              aria-label="Create channel"
              className="text-muted"
            >
              <Plus size={16} />
            </button>
          </div>
          <nav
            className="p-2 flex-1 overflow-y-auto"
            aria-label="Operations channels"
          >
            <button
              onClick={() => {
                setTab("overview");
                setResults(null);
                setSidebar(false);
              }}
              className="flex gap-2 text-sm w-full px-2 py-2 rounded hover:bg-surface"
            >
              <ListTodo size={15} />
              Workspace overview
            </button>
            <button
              onClick={() => {
                setTab("mentions");
                setResults(null);
                setSidebar(false);
              }}
              className="flex gap-2 text-sm w-full px-2 py-2 rounded hover:bg-surface"
            >
              <AtSign size={15} />
              Mentions
            </button>
            <button
              onClick={() => {
                setTab("pinned");
                setResults(null);
                setSidebar(false);
              }}
              className="flex gap-2 text-sm w-full px-2 py-2 rounded hover:bg-surface"
            >
              <Pin size={15} />
              Pinned in channel
            </button>
            {["national", "state", "post", "direct"].map((scope) => (
              <div key={scope} className="mt-5">
                <div className="flex items-center justify-between px-2 mb-1 text-[10px] uppercase tracking-widest text-muted">
                  {scope === "direct" ? "Direct messages" : `${scope} teams`}
                  {scope === "direct" && (
                    <button
                      aria-label="New direct message"
                      onClick={() => open("dm")}
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                {channels
                  .filter((c) => c.scope === scope)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelected(c.id);
                        setTab("messages");
                        setResults(null);
                        setSidebar(false);
                      }}
                      className={`flex w-full gap-2 px-2 py-2 rounded text-sm text-left ${selected === c.id ? "bg-elevated text-white" : "text-muted hover:bg-surface"}`}
                    >
                      <span className="mt-0.5">
                        {c.scope === "direct" ? (
                          <MessageSquare size={14} />
                        ) : c.private ? (
                          <Lock size={14} />
                        ) : (
                          <Hash size={14} />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">
                          {c.name}
                          {c.archived ? " (archived)" : ""}
                        </span>
                        {["post", "state"].includes(c.scope) && (
                          <span className="block text-[10px] truncate">
                            {label(c)}
                          </span>
                        )}
                      </span>
                      {Number(c.unread) > 0 && (
                        <span className="rounded bg-white text-black text-[10px] px-1.5 h-fit">
                          {c.unread}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <div className="p-3 border-t border-hairline text-[10px] text-muted flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connection === "Live" ? "bg-green-500" : "bg-yellow-500"}`}
            />
            {connection} · Private account session
          </div>
        </aside>
        <section className="flex-1 min-w-0 flex flex-col">
          {!globalView && (
            <div className="px-4 py-3 border-b border-hairline flex justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold truncate">
                  {channel?.scope === "direct" ? "" : "# "}
                  {channel?.name || "Your workspace"}
                </h2>
                <p className="text-xs text-muted truncate">
                  {channel?.description ||
                    (channel?.scope === "direct"
                      ? "Only the two participants can read this conversation."
                      : "Choose a channel to begin.")}
                </p>
              </div>
              <button
                aria-label="Show channel members"
                className="text-xs text-muted shrink-0 flex gap-1 items-center"
                onClick={() => setShowPeople(!showPeople)}
              >
                <Users size={15} />
                {presence.length} active · {people.length} people
              </button>
            </div>
          )}
          {showPeople && !globalView && (
            <div className="p-3 border-b border-hairline flex flex-wrap gap-3 text-xs max-h-28 overflow-auto">
              {people.map((p) => (
                <span key={p.id} className="inline-flex gap-1 items-center">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${presence.some((a) => a.user_id === p.id) ? "bg-green-500" : "bg-muted"}`}
                  />
                  {p.full_name}
                </span>
              ))}
              {channel?.can_manage && (
                <button
                  className="underline"
                  onClick={() => {
                    void supabase
                      .rpc("ops_archive_channel", {
                        p_channel: selected,
                        p_archived: !channel.archived,
                      })
                      .then(checked)
                      .then(refresh)
                      .catch(fail);
                  }}
                >
                  {channel.archived ? "Reopen channel" : "Archive channel"}
                </button>
              )}
            </div>
          )}
          {!globalView && (
            <div className="flex gap-1 border-b border-hairline px-2 overflow-x-auto">
              {tabs.map(([key, title, Icon]) => (
                <button
                  key={key}
                  onClick={() => {
                    setTab(key);
                    setResults(null);
                  }}
                  className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs border-b-2 ${tab === key ? "border-white" : "border-transparent text-muted"}`}
                >
                  <Icon size={13} />
                  {title}
                </button>
              ))}
            </div>
          )}
          <div ref={messagePane} className="flex-1 min-h-0 overflow-y-auto">
            {loading && (
              <p role="status" className="p-5 text-sm text-muted">
                Loading Operations…
              </p>
            )}
            {results !== null ? (
              <div className="p-4 space-y-3">
                <h3 className="font-semibold">
                  Search results · {results.length}
                </h3>
                {results.map((m) => (
                  <button
                    key={m.id}
                    className="panel p-3 text-left w-full"
                    onClick={() => jumpTo(m)}
                  >
                    <p className="text-xs text-muted">
                      #{channels.find((c) => c.id === m.channel_id)?.name} ·{" "}
                      {m.author_name}
                    </p>
                    <p className="text-sm mt-1 whitespace-pre-wrap">
                      {m.body.replace(/@\[([^\]]+)\]\([0-9a-f-]+\)/g, "@$1")}
                    </p>
                  </button>
                ))}
              </div>
            ) : tab === "home" || tab === "mywork" ? (
              <OperationsHome
                userId={userId}
                channels={channels}
                mine={tab === "mywork"}
                onGuide={() => navigate("sop")}
                onGo={(id, next) => {
                  setSelected(id);
                  navigate(next);
                }}
              />
            ) : tab === "assistant" ? (
              <Assistant userId={userId} channels={channels} />
            ) : tab === "messages" ? (
              <>
                {older && (
                  <button
                    className="w-full py-3 text-xs underline text-muted"
                    onClick={() => void olderMessages().catch(fail)}
                  >
                    Load earlier messages
                  </button>
                )}
                {!loading && messages.length === 0 && (
                  <div className="p-8 text-sm text-muted">
                    <MessageSquare size={28} className="mb-3" />
                    This conversation is ready. Share an update, ask for help,
                    or assign the next action.
                  </div>
                )}
                {messages.map(card)}
                <div ref={bottom} />
              </>
            ) : tab === "actions" ? (
              <div className="p-4 space-y-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Accountable actions</h3>
                    <p className="text-xs text-muted mt-1">
                      One owner, clear outcome, measure, and deadline.
                    </p>
                  </div>
                  <button
                    className="btn-gold text-xs"
                    disabled={!channel?.can_write}
                    onClick={() => open("task")}
                  >
                    New action
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="panel p-3">
                    {tasks.filter((t) => t.status !== "complete").length} open
                  </div>
                  <div className="panel p-3">
                    {
                      tasks.filter(
                        (t) => t.status !== "complete" && t.due_date < today(),
                      ).length
                    }{" "}
                    overdue
                  </div>
                  <div className="panel p-3">
                    {tasks.filter((t) => t.status === "blocked").length} blocked
                  </div>
                </div>
                <select
                  aria-label="Filter actions"
                  className="input-field"
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="all">All actions</option>
                  <option value="mine">Assigned to me</option>
                  <option value="overdue">Overdue</option>
                  <option value="priorities">90-day priorities</option>
                </select>
                {visibleTasks.map((t) => (
                  <article className="panel p-4 space-y-2" key={t.id}>
                    <div className="flex justify-between gap-3">
                      <h4 className="font-semibold text-sm">{t.title}</h4>
                      <select
                        aria-label={`Status for ${t.title}`}
                        value={t.status}
                        disabled={
                          !channel?.can_write ||
                          !(
                            t.owner_id === userId ||
                            t.created_by === userId ||
                            channel?.can_manage
                          )
                        }
                        onChange={(e) =>
                          void supabase
                            .from("ops_tasks")
                            .update({ status: e.target.value })
                            .eq("id", t.id)
                            .then(checked)
                            .then(load)
                            .catch(fail)
                        }
                        className="bg-surface rounded text-xs p-1"
                      >
                        {Object.entries(STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-muted">
                      Owner: {name(t.owner_id)} · Due {t.due_date}
                      {t.priority
                        ? ` · 90-day cycle from ${t.cycle_start}`
                        : ""}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{t.outcome}</p>
                    <p className="text-xs text-muted">
                      Completion measure: {t.measure || "Not recorded"}
                    </p>
                    {channel?.can_write &&
                      (t.owner_id === userId ||
                        t.created_by === userId ||
                        channel?.can_manage) && (
                        <button
                          className="text-xs underline"
                          onClick={() => {
                            open("task");
                            setTaskEditing(t);
                            setDraft({
                              title: t.title,
                              outcome: t.outcome,
                              measure: t.measure,
                              owner_id: t.owner_id,
                              due_date: t.due_date,
                              priority: String(t.priority),
                              cycle_start: t.cycle_start,
                            });
                          }}
                        >
                          Edit action / reassign owner
                        </button>
                      )}
                  </article>
                ))}
                {!visibleTasks.length && (
                  <p className="text-sm text-muted">No actions in this view.</p>
                )}
              </div>
            ) : tab === "activity" ? (
              <div className="p-4 space-y-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Activity & intelligence</h3>
                    <p className="text-xs text-muted mt-1">
                      Capture what happened, what you learned, and who follows
                      up.
                    </p>
                  </div>
                  <button
                    className="btn-gold text-xs"
                    disabled={!channel?.can_write}
                    onClick={() => open("activity")}
                  >
                    Log engagement
                  </button>
                </div>
                {activity.map((a) => (
                  <article key={a.id} className="panel p-4 space-y-2">
                    <p className="text-xs text-muted">
                      {a.activity_date} · {a.activity_type} · {name(a.owner_id)}
                    </p>
                    <h4 className="font-semibold text-sm">
                      {a.topic || a.organization}
                    </h4>
                    <p className="text-xs text-muted">
                      {[
                        a.contact,
                        a.organization,
                        a.state,
                        a.district ? `District ${a.district}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{a.takeaway}</p>
                    {a.opportunity && (
                      <p className="text-sm">Opportunity: {a.opportunity}</p>
                    )}
                    {a.follow_up_task_id && (
                      <button
                        className="text-xs underline"
                        onClick={() => {
                          setTab("actions");
                          setActionFilter("all");
                        }}
                      >
                        Follow-up action assigned →
                      </button>
                    )}
                  </article>
                ))}
                {!activity.length && (
                  <p className="text-sm text-muted">
                    No engagements recorded yet.
                  </p>
                )}
              </div>
            ) : tab === "reports" ? (
              <div className="p-4 space-y-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Monthly accountability</h3>
                    <p className="text-xs text-muted mt-1">
                      Completed · Next · Blocked
                    </p>
                  </div>
                  <button
                    className="btn-gold text-xs"
                    disabled={!channel?.can_write}
                    onClick={() => {
                      open("report");
                      const own = reports.find(
                        (r) =>
                          r.owner_id === userId &&
                          r.period.slice(0, 7) === today().slice(0, 7),
                      );
                      if (own)
                        setDraft({
                          period: own.period.slice(0, 7),
                          completed: own.completed,
                          next_action: own.next_action,
                          blocked: own.blocked,
                        });
                    }}
                  >
                    Write my update
                  </button>
                </div>
                {reports.map((r) => (
                  <article key={r.id} className="panel p-4 space-y-3">
                    <h4 className="text-sm font-semibold">
                      {name(r.owner_id)} · {r.period.slice(0, 7)}
                    </h4>
                    {[
                      ["Completed", r.completed],
                      ["Next", r.next_action],
                      ["Blocked", r.blocked],
                    ].map(([title, text]) => (
                      <div key={title}>
                        <p className="text-[10px] uppercase tracking-widest text-muted">
                          {title}
                        </p>
                        <p className="text-sm whitespace-pre-wrap mt-1">
                          {text || "None reported"}
                        </p>
                      </div>
                    ))}
                  </article>
                ))}
                {!reports.length && (
                  <p className="text-sm text-muted">
                    No reports yet. “No significant movement” is an acceptable
                    accurate update.
                  </p>
                )}
              </div>
            ) : tab === "sop" ? (
              <div className="p-5 space-y-5 max-w-3xl">
                <section className="panel p-5 space-y-3">
                  <h2 className="font-display text-2xl">
                    How to use Operations
                  </h2>
                  <p className="text-sm text-muted">
                    Start on Home to see what needs attention. My work shows
                    your assignments. Conversations opens your team workspace.
                  </p>
                  <p className="text-sm text-muted">
                    <strong className="text-white">Messages:</strong> share an
                    update or ask for help. Reply in thread keeps the replies
                    together under one message. Mention a person to bring it to
                    their attention.
                  </p>
                  <p className="text-sm text-muted">
                    <strong className="text-white">Actions:</strong> turn a
                    commitment into an assigned task with a deadline. Update its
                    status as work progresses.
                  </p>
                  <p className="text-sm text-muted">
                    <strong className="text-white">Activity:</strong> record a
                    meaningful engagement, what you learned, and who owns the
                    follow-up.
                  </p>
                  <p className="text-sm text-muted">
                    <strong className="text-white">Reports:</strong> tell your
                    team what is completed, what comes next, and what is
                    blocked. Overview gives leaders a view across the teams they
                    can access.
                  </p>
                  <button
                    className="btn-gold text-xs"
                    onClick={() => navigate("home")}
                  >
                    Go to Operations home
                  </button>
                </section>
                <div>
                  <h3 className="font-display text-2xl">
                    CVOA operating framework
                  </h3>
                  <p className="text-xs text-muted mt-1">
                    SOP-001 · v1.0 · NCC owner · Quarterly review
                  </p>
                  <p className="text-sm mt-3">
                    Working reference summary of your proposed SOP. Formal
                    approval and effective date remain to be recorded. Authority
                    follows CVOA’s governing documents and authorized
                    appointments.
                  </p>
                </div>
                {SOP.map(([title, text], i) => (
                  <section key={title}>
                    <h4 className="font-semibold mb-2">
                      {i + 1}. {title}
                    </h4>
                    <p className="text-sm text-muted leading-relaxed">{text}</p>
                  </section>
                ))}
              </div>
            ) : tab === "overview" ? (
              <Overview
                onChannel={(id) => {
                  setSelected(id);
                  setTab("actions");
                }}
                workspaces={workspaces}
              />
            ) : tab === "pinned" ? (
              <div className="p-4">
                <h3 className="font-semibold mb-3">
                  Pinned messages in this channel
                </h3>
                {pinned.map(card)}
                {!pinned.length && (
                  <p className="text-sm text-muted">
                    No pinned messages in this channel.
                  </p>
                )}
              </div>
            ) : tab === "mentions" ? (
              <Mentions userId={userId} onSelect={jumpTo} />
            ) : null}
          </div>
          {tab === "messages" && !results && selected && (
            <>
              <p className="px-4 text-xs text-muted min-h-5">
                {typingNames.length
                  ? `${typingNames.join(", ")} typing…`
                  : channel?.archived
                    ? "This channel is archived."
                    : !channel?.can_write
                      ? "This channel is read-only."
                      : ""}
              </p>
              <Composer
                key={selected}
                drafts={draftCache.current}
                draftKey={selected}
                channelId={selected}
                userId={userId}
                people={people}
                disabled={!channel?.can_write}
                placeholder={`Message ${channel?.scope === "direct" ? "" : "#"}${channel?.name || "channel"}`}
                onSend={(body, mentions, files) => send(body, mentions, files)}
                onTyping={() => void typing()}
              />
            </>
          )}
        </section>
        {thread && !results && (
          <aside className="absolute lg:static inset-0 z-10 lg:w-80 lg:shrink-0 flex flex-col bg-charcoal border-l border-hairline">
            <div className="p-4 flex justify-between border-b border-hairline">
              <strong className="text-sm">Thread</strong>
              <button aria-label="Close thread" onClick={() => setThread(null)}>
                <X size={17} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {card(thread)}
              <p className="px-4 py-2 text-xs text-muted">
                {replies.length} replies
              </p>
              {replies.map(card)}
            </div>
            <Composer
              key={thread.id}
              drafts={draftCache.current}
              draftKey={thread.id}
              channelId={selected}
              userId={userId}
              people={people}
              disabled={!channel?.can_write}
              placeholder="Reply in thread"
              onSend={(body, mentions, files) =>
                send(body, mentions, files, thread.id)
              }
              onTyping={() => void typing()}
            />
          </aside>
        )}
      </div>
      {modal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ops-modal-title"
            className="bg-charcoal border border-hairline rounded-xl w-full max-w-xl max-h-[90dvh] overflow-y-auto p-5"
          >
            <div className="flex justify-between mb-4">
              <h2 id="ops-modal-title" className="font-display text-2xl">
                {
                  {
                    channel: "Create channel",
                    dm: "Direct message",
                    task: "Assign an action",
                    activity: "Log an engagement",
                    report: "Monthly update",
                    edit: "Edit message",
                  }[modal]
                }
              </h2>
              <button
                aria-label="Close dialog"
                disabled={busy}
                onClick={() => setModal("")}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              {modal === "channel" && (
                <>
                  <label className="block text-sm">
                    Workspace
                    <select
                      required
                      className="input-field w-full mt-1"
                      value={draft.workspace}
                      onChange={(e) =>
                        setDraft({ ...draft, workspace: e.target.value })
                      }
                    >
                      {workspaces
                        .filter((w) => w.can_manage)
                        .map((w, i) => (
                          <option
                            key={`${w.scope}-${w.post_id}-${w.state}`}
                            value={i}
                          >
                            {w.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Field
                    label="Channel name (lowercase letters, numbers, hyphens)"
                    name="name"
                    draft={draft}
                    setDraft={setDraft}
                    required
                  />
                  <Field
                    label="Purpose"
                    name="description"
                    draft={draft}
                    setDraft={setDraft}
                  />
                  {[
                    ["staff_only", "Leadership and staff only"],
                    [
                      "private",
                      "Limit to selected participants and workspace leadership",
                    ],
                    [
                      "read_only",
                      "Announcements: leadership posts, everyone authorized reads",
                    ],
                  ].map(([key, title]) => (
                    <label key={key} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft[key] === "true"}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [key]: String(e.target.checked),
                          })
                        }
                      />
                      {title}
                    </label>
                  ))}
                  {draft.private === "true" && (
                    <label className="block text-sm">
                      Participants
                      <select
                        multiple
                        aria-label="Channel participants"
                        className="input-field w-full h-32 mt-1"
                        value={(draft.participants || "").split(",")}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            participants: Array.from(e.target.selectedOptions)
                              .map((o) => o.value)
                              .join(","),
                          })
                        }
                      >
                        {directory.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="text-xs text-muted">
                    National can oversee organizational channels. Direct
                    messages remain participant-only.
                  </p>
                </>
              )}
              {modal === "dm" && (
                <label className="block text-sm">
                  Person
                  <select
                    required
                    className="input-field w-full mt-1"
                    value={draft.person || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, person: e.target.value })
                    }
                  >
                    <option value="">Choose a member</option>
                    {directory
                      .filter((p) => p.id !== userId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {modal === "task" && (
                <>
                  <Field
                    label="Action or 90-day priority"
                    name="title"
                    draft={draft}
                    setDraft={setDraft}
                    required
                  />
                  <Field
                    label="Expected outcome"
                    name="outcome"
                    draft={draft}
                    setDraft={setDraft}
                    multiline
                    required
                  />
                  <Field
                    label="How will completion be demonstrated?"
                    name="measure"
                    draft={draft}
                    setDraft={setDraft}
                    multiline
                    required
                  />
                  <label className="block text-sm">
                    Accountable owner
                    <select
                      required
                      className="input-field w-full mt-1"
                      value={draft.owner_id}
                      onChange={(e) =>
                        setDraft({ ...draft, owner_id: e.target.value })
                      }
                    >
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Deadline"
                    name="due_date"
                    draft={draft}
                    setDraft={setDraft}
                    type="date"
                    required
                  />
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.priority === "true"}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          priority: String(e.target.checked),
                        })
                      }
                    />
                    90-day leadership priority
                  </label>
                  {draft.priority === "true" && (
                    <Field
                      label="Cycle start"
                      name="cycle_start"
                      draft={draft}
                      setDraft={setDraft}
                      type="date"
                      required
                    />
                  )}
                </>
              )}
              {modal === "activity" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Date"
                      name="activity_date"
                      draft={draft}
                      setDraft={setDraft}
                      type="date"
                      required
                    />
                    <Field
                      label="Activity type"
                      name="activity_type"
                      draft={draft}
                      setDraft={setDraft}
                      required
                    />
                  </div>
                  {[
                    ["contact", "Who did you meet?"],
                    ["organization", "Organization"],
                    ["state", "State / region"],
                    ["district", "Congressional district, when relevant"],
                    ["topic", "Issue or topic"],
                  ].map(([key, title]) => (
                    <Field
                      key={key}
                      label={title}
                      name={key}
                      draft={draft}
                      setDraft={setDraft}
                    />
                  ))}
                  <Field
                    label="What did you learn?"
                    name="takeaway"
                    draft={draft}
                    setDraft={setDraft}
                    multiline
                    required
                  />
                  <Field
                    label="What opportunity exists?"
                    name="opportunity"
                    draft={draft}
                    setDraft={setDraft}
                    multiline
                  />
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.follow_up === "true"}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          follow_up: String(e.target.checked),
                        })
                      }
                    />
                    Create an assigned follow-up
                  </label>
                  {draft.follow_up === "true" && (
                    <>
                      <Field
                        label="What happens next?"
                        name="follow_up_action"
                        draft={draft}
                        setDraft={setDraft}
                        multiline
                        required
                      />
                      <label className="block text-sm">
                        Follow-up owner
                        <select
                          required
                          className="input-field w-full mt-1"
                          value={draft.follow_up_owner}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              follow_up_owner: e.target.value,
                            })
                          }
                        >
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Field
                        label="Follow-up due"
                        name="follow_up_due"
                        draft={draft}
                        setDraft={setDraft}
                        type="date"
                        required
                      />
                    </>
                  )}
                  <p className="text-xs text-muted">
                    Record meaningful information appropriate for everyone
                    authorized to read this channel.
                  </p>
                </>
              )}
              {modal === "report" && (
                <>
                  <Field
                    label="Reporting month"
                    name="period"
                    draft={draft}
                    setDraft={setDraft}
                    type="month"
                    required
                  />
                  <Field
                    label="Completed: What moved?"
                    name="completed"
                    draft={draft}
                    setDraft={setDraft}
                    multiline
                    required
                  />
                  <Field
                    label="Next: What is the next action?"
                    name="next_action"
                    draft={draft}
                    setDraft={setDraft}
                    multiline
                  />
                  <Field
                    label="Blocked: What needs assistance or a decision?"
                    name="blocked"
                    draft={draft}
                    setDraft={setDraft}
                    multiline
                  />
                </>
              )}
              {modal === "edit" && (
                <Field
                  label="Message"
                  name="body"
                  draft={draft}
                  setDraft={setDraft}
                  multiline
                  required
                />
              )}
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}
              <button disabled={busy} className="btn-gold w-full">
                {busy
                  ? "Saving…"
                  : modal === "dm"
                    ? "Open conversation"
                    : "Save"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Mentions({
  userId,
  onSelect,
}: {
  userId: string;
  onSelect: (m: Message) => void;
}) {
  const [rows, setRows] = useState<Message[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    supabase
      .from("ops_messages")
      .select("*")
      .contains("mentions", [userId])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100)
      .then((r: any) => {
        if (active) {
          if (r.error) setError(r.error.message);
          else setRows(r.data);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <div className="p-4 space-y-3">
      <h3 className="font-semibold">Mentions of you</h3>
      {error && <p role="alert">{error}</p>}
      {rows.map((m) => (
        <button
          className="panel p-3 w-full text-left"
          key={m.id}
          onClick={() => onSelect(m)}
        >
          <p className="text-xs text-muted">
            {m.author_name} · {new Date(m.created_at).toLocaleDateString()}
          </p>
          <p className="text-sm mt-1">
            {m.body.replace(/@\[([^\]]+)\]\([0-9a-f-]+\)/g, "@$1")}
          </p>
        </button>
      ))}
      {!rows.length && (
        <p className="text-sm text-muted">
          Mentions will appear here when someone tags you.
        </p>
      )}
    </div>
  );
}

function Overview({
  onChannel,
  workspaces,
}: {
  onChannel: (id: string) => void;
  workspaces: Workspace[];
}) {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      supabase.rpc("ops_summary").then((r: any) => {
        if (active) {
          if (r.error) setError(r.error.message);
          else setRows(r.data);
        }
      });
    void load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold">Workspace overview</h3>
      <p className="text-sm text-muted">
        Actions, assistance needed, and reporting across your authorized
        organizational channels. Direct conversations remain separate.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          ["Open actions", "open_actions"],
          ["Overdue", "overdue"],
          ["Blocked", "blocked"],
        ].map(([title, key]) => (
          <div key={key} className="panel p-3">
            <strong className="block text-xl mb-1">
              {rows.reduce((n, r) => n + Number(r[key]), 0)}
            </strong>
            {title}
          </div>
        ))}
      </div>
      {rows.map((r) => (
        <button
          key={r.channel_id}
          className="panel p-4 w-full text-left"
          onClick={() => onChannel(r.channel_id)}
        >
          <h4 className="font-semibold text-sm">
            #{r.name} ·{" "}
            {r.state ||
              workspaces.find((w) => w.post_id === r.post_id)?.label ||
              "National"}
          </h4>
          <div className="flex flex-wrap gap-3 text-xs text-muted mt-2">
            <span>{r.open_actions} open</span>
            <span>{r.overdue} overdue</span>
            <span>{r.blocked} blocked</span>
            <span>{r.completed} complete</span>
            <span>{r.engagements} engagements this month</span>
            <span>{r.monthly_reports} monthly reports</span>
          </div>
        </button>
      ))}
    </div>
  );
}
