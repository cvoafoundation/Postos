import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, CheckCircle2, CircleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/layout/AppShell";
import { supabase } from "@/lib/supabase";
import { readAllRows } from "@/lib/readAllRows";
import {
  GovernanceForm,
  type FieldSpec,
} from "@/pages/meetings/governance/Forms";
import BuildAPost from "@/pages/build-a-post/BuildAPost";
import Fundraising from "@/pages/fundraising/Fundraising";
import {
  stages,
  label,
  money,
  nextActions,
  type LaunchPost,
  type Task,
  type Location,
  type Standard,
  type LocationCheck,
  type BudgetItem,
} from "./model";
const tabs = [
  "overview",
  "facility",
  "locations",
  "fundraising",
  "budget",
  "tasks",
  "documents",
];
const tabLabel: Record<string, string> = {
  overview: "Overview",
  facility: "Facility Plan",
  locations: "Locations & Approvals",
  fundraising: "Fundraising",
  budget: "Budget & Spending",
  tasks: "Tasks",
  documents: "Documents & History",
};
type Dialog = {
  title: string;
  fields: FieldSpec[];
  initial?: Record<string, any>;
  submit: (v: Record<string, any>) => Promise<void>;
};
const text = (key: string, label: string, required = false): FieldSpec => ({
  key,
  label,
  required,
});
const dollarsField = (key: string, label: string): FieldSpec => ({
  key,
  label,
  type: "number",
  min: 0,
  step: 0.01,
  required: true,
});
const cents = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.round(n * 100) / 100 !== n)
    throw Error("Enter a nonnegative amount with two decimal places.");
  return Math.round(n * 100);
};
async function rpc(name: string, args: any) {
  const r = await supabase.rpc(name, args);
  if (r.error) throw Error(r.error.message);
  return r.data;
}
export default function PostDevelopment() {
  const { profile, isNational } = useAuth();
  const [params, setParams] = useSearchParams();
  const postId = params.get("post") ?? "",
    tab = tabs.includes(params.get("tab") ?? "")
      ? params.get("tab")!
      : "overview";
  const [posts, setPosts] = useState<LaunchPost[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [locations, setLocations] = useState<Location[]>([]),
    [standards, setStandards] = useState<Standard[]>([]),
    [checks, setChecks] = useState<LocationCheck[]>([]),
    [budget, setBudget] = useState<BudgetItem[]>([]),
    [projects, setProjects] = useState<any[]>([]),
    [documents, setDocuments] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [search, setSearch] = useState("");
  const post = posts.find((p) => p.id === postId),
    plan = post?.plan;
  const canEdit =
    isNational ||
    (["post_commander", "post_officer"].includes(profile?.role ?? "") &&
      postId === profile?.post_id);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const directory = await rpc("cvoa_launch_directory", {});
      if (sequence !== loadSequence.current) return;
      setPosts(directory);
      if (!postId) {
        setTasks([]);
        setLocations([]);
        return;
      }
      if (!directory.some((p: LaunchPost) => p.id === postId))
        throw Error("This post is outside your assigned workspace.");
      const [t, l, s, b, p, d, h, r] = await Promise.all([
        readAllRows<Task>(() =>
          supabase
            .from("launch_tasks")
            .select("*")
            .eq("post_id", postId)
            .order("id"),
        ),
        readAllRows<Location>(() =>
          supabase
            .from("launch_locations")
            .select("*")
            .eq("post_id", postId)
            .order("id"),
        ),
        readAllRows<Standard>(() =>
          supabase
            .from("launch_standards")
            .select("*")
            .order("label")
            .order("id"),
        ),
        readAllRows<BudgetItem>(() =>
          supabase
            .from("launch_budget_items")
            .select("*")
            .eq("post_id", postId)
            .order("id"),
        ),
        readAllRows<any>(() =>
          supabase
            .from("post_facility_projects")
            .select("*,build_a_post_modules(name)")
            .eq("post_id", postId)
            .order("id"),
        ),
        readAllRows<any>(() =>
          supabase
            .from("launch_documents")
            .select("*")
            .eq("post_id", postId)
            .order("id"),
        ),
        supabase
          .from("launch_history")
          .select("*")
          .eq("post_id", postId)
          .order("created_at", { ascending: false })
          .limit(100),
        readAllRows<any>(() =>
          supabase
            .from("launch_reviews")
            .select("*")
            .eq("post_id", postId)
            .order("created_at", { ascending: false })
            .order("id"),
        ),
      ]);
      if (h.error) throw h.error;
      const ch = l.length
        ? await readAllRows<LocationCheck>(() =>
            supabase
              .from("launch_location_checks")
              .select("*")
              .in(
                "location_id",
                l.map((x) => x.id),
              )
              .order("location_id")
              .order("standard_id"),
          )
        : [];
      if (sequence !== loadSequence.current) return;
      setTasks(t);
      setLocations(l);
      setStandards(s);
      setChecks(ch);
      setBudget(b);
      setProjects(p);
      setDocuments(d);
      setHistory(h.data ?? []);
      setReviews(r);
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [postId, profile?.id]);
  useEffect(() => {
    setTasks([]);
    setLocations([]);
    setChecks([]);
    setBudget([]);
    setProjects([]);
    setDocuments([]);
    setHistory([]);
    setReviews([]);
    void load();
    return () => {
      loadSequence.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!postId && posts.length === 1)
      setParams({ post: posts[0].id, tab }, { replace: true });
  }, [postId, posts, tab, setParams]);
  async function mutate(action: string, data: any = {}) {
    await rpc("cvoa_launch_mutate", {
      p_post: postId,
      p_version: plan?.version ?? 0,
      p_action: action,
      p_data: data,
    });
    await load();
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const openPlan = () =>
    setDialog({
      title: "Launch Plan",
      initial: plan ?? { owner_name: profile?.full_name },
      fields: [
        text("owner_name", "Launch owner", true),
        {
          key: "target_date",
          label: "Target opening date",
          type: "date",
          required: true,
        },
        {
          key: "services",
          label: "Services planned for initial opening",
          type: "textarea",
          required: true,
        },
        {
          key: "help_needed",
          label: "Help needed from State or National",
          type: "textarea",
        },
      ],
      submit: (v) => mutate("plan", v),
    });
  const openTask = (t?: Task) =>
    setDialog({
      title: t ? "Edit Launch Task" : "Add Launch Task",
      initial: t ?? { required: false, complete: false },
      fields: [
        text("label", "Task", true),
        text("owner_name", "Responsible person"),
        { key: "due_date", label: "Due date", type: "date" },
        ...(isNational
          ? [
              {
                key: "required",
                label: "Required before opening",
                type: "checkbox",
              } as FieldSpec,
            ]
          : []),
        { key: "complete", label: "Completed", type: "checkbox" },
        { key: "note", label: "Progress / evidence", type: "textarea" },
      ],
      submit: (v) => mutate("task", { ...t, ...v }),
    });
  const openLocation = (l?: Location) =>
    setDialog({
      title: l
        ? "Edit Location (Requires Another Review)"
        : "Add Location Candidate",
      initial: l
        ? {
            ...l,
            monthly_cost: Number(l.monthly_cost_cents) / 100,
            upfront_cost: Number(l.upfront_cost_cents) / 100,
          }
        : { tenure: "lease", monthly_cost: 0, upfront_cost: 0 },
      fields: [
        text("name", "Location name", true),
        text("address", "Full address", true),
        {
          key: "tenure",
          label: "Arrangement",
          type: "select",
          required: true,
          options: ["lease", "purchase", "donated"].map((value) => ({
            value,
            label: value,
          })),
        },
        dollarsField("monthly_cost", "Monthly cost (USD)"),
        dollarsField("upfront_cost", "Upfront cost (USD)"),
        { key: "square_feet", label: "Square feet", type: "number", min: 1 },
        {
          key: "details",
          label: "Rooms, condition, proposed terms and improvements",
          type: "textarea",
        },
      ],
      submit: (v) =>
        mutate("location", {
          ...v,
          monthly_cost_cents: cents(v.monthly_cost),
          upfront_cost_cents: cents(v.upfront_cost),
        }),
    });
  const openReview = (l: Location) =>
    setDialog({
      title: `National Review: ${l.name}`,
      fields: [
        {
          key: "decision",
          label: "Decision",
          type: "select",
          required: true,
          options: [
            { value: "approved", label: "Approve Location" },
            { value: "changes_requested", label: "Request Changes" },
            { value: "declined", label: "Decline Location" },
          ],
        },
        {
          key: "feedback",
          label: "Reasons, conditions and next steps",
          type: "textarea",
          required: true,
        },
      ],
      submit: (v) => mutate("location_review", { id: l.id, ...v }),
    });
  const openBudget = (b?: BudgetItem) =>
    setDialog({
      title: "Opening Budget Item",
      initial: b
        ? { ...b, amount: Number(b.amount_cents) / 100 }
        : { amount: 0 },
      fields: [
        text("label", "Item", true),
        text("category", "Category (space, improvements, reserve, etc.)", true),
        dollarsField("amount", "Estimated cost (USD)"),
      ],
      submit: (v) => mutate("budget", { ...v, amount_cents: cents(v.amount) }),
    });
  const openStandard = (s?: Standard) =>
    setDialog({
      title: "National Launch Standard",
      initial: s ?? { category: "location", required: false, active: true },
      fields: [
        text("label", "Standard", true),
        {
          key: "category",
          label: "Applies to",
          type: "select",
          required: true,
          options: [
            { value: "location", label: "Location Review" },
            { value: "opening", label: "Opening Task Template" },
          ],
        },
        { key: "required", label: "Required", type: "checkbox" },
        { key: "active", label: "Active", type: "checkbox" },
      ],
      submit: async (v) => {
        await rpc("cvoa_launch_standard", {
          p_id: s?.id ?? null,
          p_label: v.label,
          p_category: v.category,
          p_required: !!v.required,
          p_active: !!v.active,
        });
        await load();
      },
    });
  async function upload(file: File, locationId?: string) {
    if (
      file.size > 20 * 1024 * 1024 ||
      !["pdf", "doc", "docx", "jpg", "jpeg", "png"].includes(
        file.name.split(".").pop()?.toLowerCase() ?? "",
      )
    )
      throw Error("Use a PDF, Word document, JPG or PNG up to 20 MB.");
    const directory = await rpc("cvoa_drive_directory", {});
    const workspace = directory.workspaces.find(
      (w: any) => w.post_id === postId,
    );
    if (!workspace) throw Error("Post drive unavailable.");
    const id = crypto.randomUUID(),
      path = `${workspace.id}/${id}/root/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase()}`;
    const r = await supabase.storage.from("ncc-drive").upload(path, file);
    if (r.error) throw r.error;
    await rpc("cvoa_drive_create", {
      p_workspace: workspace.id,
      p_parent: null,
      p_kind: "file",
      p_name: file.name.slice(0, 200),
      p_content: null,
      p_path: path,
      p_mime: file.type || null,
      p_size: file.size,
      p_id: id,
    });
    await mutate("document", {
      location_id: locationId ?? null,
      name: file.name,
      path,
    });
  }
  async function openFile(path: string) {
    const r = await supabase.storage
      .from("ncc-drive")
      .createSignedUrl(path, 300);
    if (r.error) throw r.error;
    window.open(r.data.signedUrl, "_blank", "noopener,noreferrer");
  }
  const changeTab = (key: string) => setParams({ post: postId, tab: key });
  const selectPost = (id: string) =>
    setParams(id ? { post: id, tab } : { tab });
  const uploadInput = (locationId?: string) => (
    <label className="btn-ghost cursor-pointer inline-block">
      {busy ? "Uploading…" : "Upload Photos / Documents"}
      <input
        type="file"
        className="sr-only"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void run(() => upload(f, locationId));
        }}
      />
    </label>
  );
  return (
    <div>
      <PageHeader
        eyebrow="From Formation to Opening"
        title="Post Development"
        action={
          <button
            className="btn-ghost"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Refresh
          </button>
        }
      />
      <p className="text-sm text-muted mb-5">
        Plan the location, fund the opening, complete the work and get National
        approval. State leadership sees its state; local staff manage their own
        post.
      </p>
      <label className="block text-sm mb-5">
        Post
        <select
          className="input-field mt-1 max-w-xl"
          value={postId}
          onChange={(e) => selectPost(e.target.value)}
        >
          <option value="">All Assigned Posts</option>
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.state}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="panel p-4 mb-4 text-status-attention">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-muted mb-4">
          Loading launch workspace…
        </p>
      )}
      {!postId && (
        <>
          <h2 className="font-display text-2xl mb-3">Launch Review Queue</h2>
          <p className="text-sm text-muted mb-4">
            Submitted locations, opening reviews, overdue work and requests for
            help appear first. Select a post to read its complete record.
          </p>
          <label className="block text-sm mb-4">
            Find a post
            <input
              className="input-field mt-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Post name or state"
            />
          </label>
          <div className="space-y-3">
            {[...posts]
              .sort(
                (a, b) =>
                  Number(
                    !!(
                      b.pending_locations ||
                      b.overdue_tasks ||
                      b.plan?.stage === "opening_review" ||
                      b.plan?.help_needed
                    ),
                  ) -
                  Number(
                    !!(
                      a.pending_locations ||
                      a.overdue_tasks ||
                      a.plan?.stage === "opening_review" ||
                      a.plan?.help_needed
                    ),
                  ),
              )
              .filter((p) =>
                `${p.name} ${p.state}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((p) => (
                <button
                  key={p.id}
                  className="panel p-5 w-full text-left hover:border-gold"
                  onClick={() => selectPost(p.id)}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-display text-xl">
                      {p.name} · {p.state}
                    </h3>
                    <span className="text-gold">
                      {p.plan ? label(p.plan.stage) : "Not Started"}
                    </span>
                  </div>
                  <p className="text-sm mt-2">
                    Owner: {p.plan?.owner_name || "Unassigned"} · Target:{" "}
                    {p.plan?.target_date || "Not Set"} · Funding gap:{" "}
                    {money(Number(p.funding.remaining_cents))}
                  </p>
                  <p className="text-sm text-muted mt-2">
                    {p.pending_locations} location reviews · {p.overdue_tasks}{" "}
                    overdue tasks
                    {p.plan?.help_needed
                      ? ` · Help: ${p.plan.help_needed}`
                      : ""}
                  </p>
                </button>
              ))}
          </div>
          {!loading && !posts.length && (
            <p>No posts are assigned to this workspace.</p>
          )}
        </>
      )}
      {post && !plan && (
        <section className="panel p-6">
          <h2 className="font-display text-2xl">
            Start {post.name}'s Launch Workspace
          </h2>
          <p className="text-sm text-muted my-3">
            Existing facility projects, campaigns and sponsor receipts stay in
            place. Existing active posts begin at Open &amp; Operating.
          </p>
          {canEdit ? (
            <button
              disabled={busy}
              className="btn-gold"
              onClick={() =>
                void run(() =>
                  mutate("initialize", { owner_name: profile?.full_name }),
                )
              }
            >
              Start Post Development
            </button>
          ) : (
            <p>Ask the post commander or National to start this workspace.</p>
          )}
        </section>
      )}
      {post && plan && (
        <>
          <nav
            aria-label="Post development"
            className="flex flex-wrap gap-2 mb-5"
          >
            {tabs.map((key) => (
              <button
                key={key}
                className={tab === key ? "btn-gold" : "btn-ghost"}
                aria-current={tab === key ? "page" : undefined}
                onClick={() => changeTab(key)}
              >
                {tabLabel[key]}
              </button>
            ))}
          </nav>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            {[
              ["Opening Budget", post.funding.budget_cents],
              ["Received", post.funding.received_cents],
              ["Spent", post.funding.spent_cents],
              ["Available", post.funding.available_cents],
              ["Still Needed", post.funding.remaining_cents],
            ].map(([name, amount]) => (
              <div className="panel p-4" key={name}>
                <div className="text-xs text-muted">{name}</div>
                <div className="font-display text-2xl">
                  {money(Number(amount))}
                </div>
              </div>
            ))}
          </div>
          {tab === "overview" && (
            <>
              <section className="panel p-5 mb-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <h2 className="font-display text-2xl">Next Three Actions</h2>
                  {canEdit && (
                    <button className="btn-ghost" onClick={openPlan}>
                      Edit Launch Plan
                    </button>
                  )}
                </div>
                <ol className="list-decimal pl-5 space-y-2 mt-3">
                  {nextActions(post, tasks, locations).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
                <p className="text-sm text-muted mt-4">
                  Owner: {plan.owner_name || "Unassigned"} · Target:{" "}
                  {plan.target_date || "Not Set"} · Last updated:{" "}
                  {new Date(plan.updated_at).toLocaleDateString()}
                </p>
                <p className="text-sm whitespace-pre-wrap mt-2">
                  Initial services: {plan.services || "Not Specified"}
                </p>
                {plan.help_needed && (
                  <p className="text-status-attention mt-2">
                    Help requested: {plan.help_needed}
                  </p>
                )}
              </section>
              <section className="panel p-5 mb-5">
                <h2 className="font-display text-xl">
                  Funding and Opening Readiness
                </h2>
                <p className="text-sm text-muted mt-2">
                  Funding progress and permission to open are separate.
                  Sponsorship pledges are promises, not money available to
                  spend. Agreed Won sponsorships:{" "}
                  {money(Number(post.funding.pledged_cents))}.
                </p>
                <progress
                  className="w-full my-3"
                  aria-label="Opening funding progress"
                  max={Math.max(1, Number(post.funding.budget_cents))}
                  value={Math.max(0, Number(post.funding.received_cents))}
                />
                <p>
                  {tasks.filter((t) => t.required && t.complete).length}/
                  {tasks.filter((t) => t.required).length} required launch tasks
                  complete ·{" "}
                  {locations.find((l) => l.id === plan.selected_location_id)
                    ?.status ?? "No Location Submitted"}
                </p>
              </section>
              <div className="max-w-3xl mx-auto">
                {stages.map((s, i) => {
                  const current = plan.stage === s.key,
                    done = stages.findIndex((x) => x.key === plan.stage) > i;
                  return (
                    <div key={s.key}>
                      <section
                        className={`panel p-5 ${current ? "border-gold" : ""}`}
                      >
                        <div className="flex gap-3 items-start">
                          {done ? (
                            <CheckCircle2 className="text-status-active shrink-0" />
                          ) : (
                            <CircleAlert
                              className={`${current ? "text-gold" : "text-muted"} shrink-0`}
                            />
                          )}
                          <div className="flex-1">
                            <h3 className="font-display text-2xl">{s.title}</h3>
                            <p className="text-sm text-muted mt-1">
                              {s.detail}
                            </p>
                            <p className="text-xs mt-2">
                              {done
                                ? "Stage Completed"
                                : current
                                  ? "Current Stage"
                                  : "Upcoming"}
                            </p>
                            {current && canEdit && (
                              <div className="flex flex-wrap gap-2 mt-4">
                                {s.key === "planning" && (
                                  <>
                                    <button
                                      className="btn-ghost"
                                      onClick={openPlan}
                                    >
                                      Complete Launch Plan
                                    </button>
                                    <button
                                      className="btn-gold"
                                      disabled={busy}
                                      onClick={() =>
                                        void run(() =>
                                          mutate("stage", { stage: "funding" }),
                                        )
                                      }
                                    >
                                      Begin Funding &amp; Search
                                    </button>
                                  </>
                                )}
                                {["funding", "location_review"].includes(
                                  s.key,
                                ) && (
                                  <button
                                    className="btn-gold"
                                    onClick={() => changeTab("locations")}
                                  >
                                    Open Locations &amp; Reviews
                                  </button>
                                )}
                                {s.key === "setup" && (
                                  <>
                                    <button
                                      className="btn-ghost"
                                      onClick={() => changeTab("tasks")}
                                    >
                                      Complete Launch Tasks
                                    </button>
                                    <button
                                      className="btn-gold"
                                      disabled={busy}
                                      onClick={() =>
                                        void run(() =>
                                          mutate("stage", {
                                            stage: "opening_review",
                                          }),
                                        )
                                      }
                                    >
                                      Submit Opening Readiness
                                    </button>
                                  </>
                                )}
                                {s.key === "opening_review" && isNational && (
                                  <button
                                    className="btn-gold"
                                    onClick={() =>
                                      setDialog({
                                        title: "National Opening Decision",
                                        fields: [
                                          {
                                            key: "stage",
                                            label: "Decision",
                                            type: "select",
                                            required: true,
                                            options: [
                                              {
                                                value: "open",
                                                label: "Approve Opening",
                                              },
                                              {
                                                value: "setup",
                                                label: "Return for More Work",
                                              },
                                            ],
                                          },
                                          {
                                            key: "feedback",
                                            label:
                                              "Reasons, funding review and any conditions",
                                            type: "textarea",
                                            required: true,
                                          },
                                        ],
                                        submit: (v) => mutate("stage", v),
                                      })
                                    }
                                  >
                                    Review &amp; Decide
                                  </button>
                                )}
                                {s.key === "open" && (
                                  <Link
                                    className="btn-gold"
                                    to={`/health/${post.id}`}
                                  >
                                    Open Post Dashboard
                                  </Link>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </section>
                      {i < stages.length - 1 && (
                        <ArrowDown
                          className="text-gold mx-auto my-2"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {tab === "facility" && <BuildAPost key={postId} embedded />}
          {tab === "fundraising" && (
            <Fundraising key={postId} embedded onChanged={load} />
          )}
          {tab === "locations" && (
            <>
              <div className="flex flex-wrap gap-3 mb-4">
                {canEdit && (
                  <button className="btn-gold" onClick={() => openLocation()}>
                    Add Location Candidate
                  </button>
                )}
                {isNational && (
                  <button className="btn-ghost" onClick={() => openStandard()}>
                    Add National Standard
                  </button>
                )}
              </div>
              <p className="text-sm text-muted mb-4">
                Compare candidates before submitting your preferred space.
                Photos, floor plans and proposed lease documents stay private.
                Changes to a submitted or approved location require
                resubmission.
              </p>
              {!locations.length && (
                <p className="panel p-5">
                  No locations added. Fundraising can begin while the team
                  searches.
                </p>
              )}
              <div className="space-y-5">
                {locations.map((l) => (
                  <section className="panel p-5" key={l.id}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <h2 className="font-display text-2xl">{l.name}</h2>
                      <span
                        className={
                          l.status === "approved"
                            ? "text-status-active"
                            : "text-gold"
                        }
                      >
                        {l.status.replaceAll("_", " ")} · Revision {l.revision}
                      </span>
                    </div>
                    <p className="mt-2">{l.address}</p>
                    <p className="text-sm text-muted mt-1">
                      {l.tenure} · Monthly {money(Number(l.monthly_cost_cents))}{" "}
                      · Upfront {money(Number(l.upfront_cost_cents))} ·{" "}
                      {l.square_feet ?? "Unknown"} sq. ft.
                    </p>
                    <p className="whitespace-pre-wrap text-sm my-3">
                      {l.details}
                    </p>
                    <h3 className="eyebrow mb-3">Location Standards</h3>
                    {standards
                      .filter((s) => s.active && s.category === "location")
                      .map((s) => {
                        const c = checks.find(
                          (c) =>
                            c.location_id === l.id && c.standard_id === s.id,
                        );
                        return (
                          <div
                            key={s.id}
                            className="border-t border-hairline py-3"
                          >
                            <div className="flex flex-wrap justify-between gap-2">
                              <p>
                                {s.label}{" "}
                                <span className="text-xs text-muted">
                                  ({s.required ? "Required" : "Recommended"})
                                </span>
                              </p>
                              {canEdit && (
                                <button
                                  className="btn-ghost text-xs"
                                  onClick={() =>
                                    setDialog({
                                      title: s.label,
                                      initial: c ?? { response: "unknown" },
                                      fields: [
                                        {
                                          key: "response",
                                          label: "Status",
                                          type: "select",
                                          required: true,
                                          options: [
                                            {
                                              value: "yes",
                                              label: "Meets Standard",
                                            },
                                            {
                                              value: "no",
                                              label: "Does Not Meet",
                                            },
                                            {
                                              value: "later",
                                              label: "Planned for Later",
                                            },
                                            {
                                              value: "unknown",
                                              label: "Not Yet Evaluated",
                                            },
                                          ],
                                        },
                                        {
                                          key: "note",
                                          label: "Explanation / evidence",
                                          type: "textarea",
                                        },
                                      ],
                                      submit: (v) =>
                                        mutate("location_check", {
                                          location_id: l.id,
                                          standard_id: s.id,
                                          ...v,
                                        }),
                                    })
                                  }
                                >
                                  Update
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-muted">
                              {c?.response ?? "unknown"}
                              {c?.note ? ` · ${c.note}` : ""}
                            </p>
                          </div>
                        );
                      })}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {canEdit && (
                        <>
                          <button
                            className="btn-ghost"
                            onClick={() => openLocation(l)}
                          >
                            Edit Candidate
                          </button>
                          {uploadInput(l.id)}
                          {l.status !== "submitted" && (
                            <button
                              className="btn-gold"
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  mutate("location_submit", { id: l.id }),
                                )
                              }
                            >
                              Submit to National
                            </button>
                          )}
                        </>
                      )}
                      {isNational && l.status === "submitted" && (
                        <button
                          className="btn-gold"
                          onClick={() => openReview(l)}
                        >
                          National Review
                        </button>
                      )}
                      {canEdit &&
                        l.id === plan.selected_location_id &&
                        l.status === "approved" && (
                          <button
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                mutate("location_secured", {
                                  secured: !l.secured,
                                }),
                              )
                            }
                          >
                            {l.secured
                              ? "Mark Space Not Yet Secured"
                              : "Record Space Secured"}
                          </button>
                        )}
                    </div>
                    {documents
                      .filter((d) => d.location_id === l.id)
                      .map((d) => (
                        <button
                          className="block text-gold text-sm mt-2"
                          key={d.id}
                          onClick={() => void run(() => openFile(d.path))}
                        >
                          {d.name}
                        </button>
                      ))}
                    {reviews
                      .filter((r) => r.location_id === l.id)
                      .map((r) => (
                        <details
                          key={r.id}
                          className="border-t border-hairline pt-3 mt-3"
                        >
                          <summary className="cursor-pointer">
                            National: {r.decision.replaceAll("_", " ")} ·{" "}
                            {new Date(r.created_at).toLocaleDateString()}
                          </summary>
                          <p className="whitespace-pre-wrap text-sm my-2">
                            {r.feedback}
                          </p>
                          <p className="text-xs text-muted">
                            Reviewed revision {r.snapshot.location?.revision} ·{" "}
                            {r.snapshot.location?.address}
                          </p>
                        </details>
                      ))}
                  </section>
                ))}
              </div>
              {isNational && (
                <details className="panel p-5 mt-5">
                  <summary className="cursor-pointer">
                    Configure National Standards &amp; Launch Templates
                  </summary>
                  <p className="text-sm text-muted my-3">
                    Location standards apply to all locations. Changing them
                    requires unopened locations to be reviewed again. Opening
                    templates seed new launch workspaces; edit existing posts'
                    tasks separately. Education and employment spaces start as
                    recommended.
                  </p>
                  {standards.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap justify-between gap-2 border-t border-hairline py-3"
                    >
                      <span>
                        {s.label} · {s.category} ·{" "}
                        {s.required ? "Required" : "Recommended"} ·{" "}
                        {s.active ? "Active" : "Inactive"}
                      </span>
                      <button
                        className="btn-ghost"
                        onClick={() => openStandard(s)}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
          {tab === "budget" && (
            <>
              <div className="flex gap-3 mb-4">
                {canEdit && (
                  <>
                    <button className="btn-gold" onClick={() => openBudget()}>
                      Add Budget Item
                    </button>
                    {!budget.length && (
                      <button
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => void run(() => mutate("budget_starter"))}
                      >
                        Use Opening Budget Starter
                      </button>
                    )}
                  </>
                )}
                <button
                  className="btn-ghost"
                  onClick={() => changeTab("fundraising")}
                >
                  Record Income / Expense
                </button>
                <button className="btn-ghost" onClick={() => window.print()}>
                  Print Funding Summary
                </button>
              </div>
              <p className="text-sm text-muted mb-4">
                Facility module budgets are included automatically. Add space
                costs, improvements outside those modules and an operating
                reserve here. Candidate location costs are estimates and must be
                deliberately added to this budget. Do not add a module's cost a
                second time.
              </p>
              <div className="space-y-3">
                {projects.map((p) => (
                  <Link
                    to={`/build-a-post/${p.module_id}?post=${postId}`}
                    className="panel p-4 block"
                    key={p.id}
                  >
                    <span>
                      {p.build_a_post_modules?.name ?? "Facility Module"} ·{" "}
                      {money(Math.round(Number(p.target_budget ?? 0) * 100))}
                    </span>
                    <p className="text-xs text-muted mt-1">
                      {p.opening_scope
                        ? "Included in Opening Budget"
                        : "Later Improvement, Excluded"}{" "}
                      ·{" "}
                      {p.required_for_opening
                        ? "Required Before Opening"
                        : "Recommended"}{" "}
                      · {p.status}
                    </p>
                  </Link>
                ))}
                {budget.map((b) => (
                  <div className="panel p-4" key={b.id}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <span>
                        {b.label} · {money(Number(b.amount_cents))}
                      </span>
                      <span className="text-sm text-muted">
                        {b.category} ·{" "}
                        {b.approved
                          ? "National Reviewed"
                          : "Estimate Awaiting Review"}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {canEdit && (
                        <button
                          className="btn-ghost"
                          onClick={() => openBudget(b)}
                        >
                          Edit
                        </button>
                      )}
                      {isNational && (
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              mutate("budget_approve", {
                                id: b.id,
                                approved: !b.approved,
                              }),
                            )
                          }
                        >
                          {b.approved
                            ? "Return to Estimate"
                            : "Approve Budget Item"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted mt-5">
                Existing manually entered fundraising records may overlap with
                older ledger entries. Reconcile historical records before
                relying on these totals. New campaign entries use one linked
                ledger record; allocated sponsor payments and refunds are
                counted once.
              </p>
            </>
          )}
          {tab === "tasks" && (
            <>
              <div className="flex flex-wrap gap-3 mb-4">
                {canEdit && (
                  <button className="btn-gold" onClick={() => openTask()}>
                    Add Task
                  </button>
                )}
                <button
                  className="btn-ghost"
                  onClick={() => changeTab("facility")}
                >
                  Open Facility Checklists
                </button>
              </div>
              <p className="text-sm text-muted mb-4">
                National sets required launch tasks. National-required facility
                checklists must also be complete before opening review.
              </p>
              {isNational &&
                projects.map((p) => (
                  <div className="panel p-4 mb-3" key={p.id}>
                    <span>
                      {p.build_a_post_modules?.name ?? "Facility Module"} ·{" "}
                      {p.required_for_opening ? "Required" : "Recommended"}
                    </span>
                    <button
                      className="btn-ghost ml-3"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          mutate("project_requirement", {
                            id: p.id,
                            required: !p.required_for_opening,
                          }),
                        )
                      }
                    >
                      {p.required_for_opening
                        ? "Make Recommended"
                        : "Require Before Opening"}
                    </button>
                  </div>
                ))}
              <div className="space-y-3">
                {tasks.map((t) => (
                  <section className="panel p-4" key={t.id}>
                    <div className="flex gap-3">
                      {t.complete ? (
                        <CheckCircle2 className="text-status-active shrink-0" />
                      ) : (
                        <CircleAlert className="text-status-attention shrink-0" />
                      )}
                      <div>
                        <h3 className="font-display text-xl">{t.label}</h3>
                        <p className="text-sm text-muted">
                          {t.required ? "Required" : "Recommended"} · Owner:{" "}
                          {t.owner_name || "Unassigned"} · Due:{" "}
                          {t.due_date || "Not Set"}
                        </p>
                        <p className="text-sm whitespace-pre-wrap mt-2">
                          {t.note}
                        </p>
                        {canEdit && (
                          <button
                            className="btn-ghost mt-2"
                            onClick={() => openTask(t)}
                          >
                            Update Task
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
          {tab === "documents" && (
            <>
              <div className="flex flex-wrap gap-3 mb-4">
                {canEdit && uploadInput()}
                <button className="btn-ghost" onClick={() => window.print()}>
                  Print Launch Record
                </button>
                <Link className="btn-ghost" to="/shared-files">
                  Documents &amp; Files
                </Link>
              </div>
              <h2 className="font-display text-xl mb-3">Launch Documents</h2>
              {documents.map((d) => (
                <button
                  className="panel p-4 block w-full text-left mb-2"
                  key={d.id}
                  onClick={() => void run(() => openFile(d.path))}
                >
                  {d.name} · {new Date(d.created_at).toLocaleDateString()}
                </button>
              ))}
              <h2 className="font-display text-xl mt-6 mb-3">
                National Decisions
              </h2>
              {reviews.map((r) => (
                <details className="panel p-4 mb-2" key={r.id}>
                  <summary className="cursor-pointer">
                    {r.decision.replaceAll("_", " ")} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                  </summary>
                  <p className="whitespace-pre-wrap text-sm mt-3">
                    {r.feedback}
                  </p>
                  <p className="text-xs text-muted mt-2">
                    Reviewer: {r.reviewer_name}
                  </p>
                </details>
              ))}
              <h2 className="font-display text-xl mt-6 mb-3">
                Recent Activity
              </h2>
              <p className="text-xs text-muted mb-2">
                Latest 100 changes. The full history remains stored.
              </p>
              {history.map((h) => (
                <div
                  className="border-t border-hairline py-3 text-sm"
                  key={h.id}
                >
                  <p>
                    {h.action.replaceAll("_", " ")} · {h.actor_name} ·{" "}
                    {new Date(h.created_at).toLocaleString()}
                  </p>
                  <p className="text-muted">
                    {h.detail.label ||
                      h.detail.name ||
                      h.detail.feedback ||
                      h.detail.stage ||
                      h.detail.help_needed ||
                      ""}
                  </p>
                </div>
              ))}
            </>
          )}
        </>
      )}
      {dialog && (
        <GovernanceForm
          title={dialog.title}
          fields={dialog.fields}
          initial={dialog.initial}
          onSubmit={dialog.submit}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
