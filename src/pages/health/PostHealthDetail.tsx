import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { type DimensionStatus } from "@/lib/postHealth";
import { usePostHealth, healthColor } from "@/lib/usePostHealth";
import {
  POST_STATUS_LABELS,
  POST_STATUS_ORDER,
  type PostStatus,
} from "@/lib/types";
import type {
  AnnualReview,
  CommunityServiceEvent,
  FinancialTransaction,
  GovernanceFormType,
  GovernanceSignature,
  Post,
} from "@/lib/types";
import { PostChecklistView } from "@/components/checklist/PostChecklistView";
import { OfficersPanel } from "@/components/posts/OfficersPanel";
import { MembersPanel } from "@/components/posts/MembersPanel";
import { MeetingsPanel } from "@/components/posts/MeetingsPanel";
import { RecruitingPanel } from "@/components/posts/RecruitingPanel";
import { SponsorsPanel } from "@/components/posts/SponsorsPanel";
import { postDisplayName } from "@/pages/posts/model";
import { format } from "date-fns";
import { Plus, Scale, FileCheck, Copy, Check, ArrowRight } from "lucide-react";

function toneFor(status: DimensionStatus) {
  if (status === "green") return "active" as const;
  if (status === "yellow") return "developing" as const;
  if (status === "red") return "attention" as const;
  return "neutral" as const;
}

type PostTab =
  | "main"
  | "officers"
  | "members"
  | "meetings"
  | "recruiting"
  | "sponsors"
  | "build_a_post";

// Shared by both the active-post and still-forming views — Officers,
// Members, Meetings, Recruiting, Sponsors, and Build A Post all work the
// same regardless of stage; only the first tab's label and content differ
// (Health once live, Checklist while forming).
function PostTabBar({
  tab,
  setTab,
  mainLabel,
}: {
  tab: PostTab;
  setTab: (t: PostTab) => void;
  mainLabel: string;
}) {
  const tabs: { key: PostTab; label: string }[] = [
    { key: "main", label: mainLabel },
    { key: "officers", label: "Officers" },
    { key: "members", label: "Members" },
    { key: "meetings", label: "Meetings" },
    { key: "recruiting", label: "Recruiting" },
    { key: "sponsors", label: "Sponsors" },
    { key: "build_a_post", label: "Post Development" },
  ];
  return (
    <div className="flex gap-1 mb-6 border-b border-hairline flex-wrap">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`px-4 py-2 text-sm font-mono uppercase tracking-wide border-b-2 -mb-px transition-colors ${
            tab === t.key
              ? "border-gold text-gold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function PostHealthDetail() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [queryParams] = useSearchParams();
  const { profile, isNational } = useAuth();

  const loadSequence = useRef(0);
  const [post, setPost] = useState<Post | null>(null);
  const [healthVersion, setHealthVersion] = useState(0);
  const health = usePostHealth(
    post?.status === "active_post" ? [post.id] : [],
    healthVersion,
  );
  const result = post ? health.scores[post.id] : undefined;
  const [signatures, setSignatures] = useState<GovernanceSignature[]>([]);
  const [annualReview, setAnnualReview] = useState<AnnualReview | null>(null);
  const [serviceEvents, setServiceEvents] = useState<CommunityServiceEvent[]>(
    [],
  );
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSignature, setShowSignature] = useState(false);
  const [showService, setShowService] = useState(false);
  const [showTransaction, setShowTransaction] = useState(false);
  const [tab, setTab] = useState<PostTab>(() =>
    ["officers", "members", "meetings", "recruiting", "sponsors"].includes(
      queryParams.get("tab") ?? "",
    )
      ? (queryParams.get("tab") as PostTab)
      : "main",
  );
  const [healthView, setHealthView] = useState<
    | "overview"
    | "governance"
    | "annual_review"
    | "community_service"
    | "financial"
  >(() =>
    ["governance", "annual_review", "community_service", "financial"].includes(
      queryParams.get("view") ?? "",
    )
      ? (queryParams.get("view") as
          "governance" | "annual_review" | "community_service" | "financial")
      : "overview",
  );

  // Forming-post view only
  const [checklistPct, setChecklistPct] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  async function load() {
    if (!postId) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    const currentYear = new Date().getFullYear();
    const [postRes, sigsRes, reviewRes, serviceRes, txRes] = await Promise.all([
      supabase.from("posts").select("*").eq("id", postId).single(),
      supabase.from("governance_signatures").select("*").eq("post_id", postId),
      supabase
        .from("annual_reviews")
        .select("*")
        .eq("post_id", postId)
        .eq("review_year", currentYear)
        .maybeSingle(),
      supabase
        .from("community_service_events")
        .select("*")
        .eq("post_id", postId),
      supabase.from("financial_transactions").select("*").eq("post_id", postId),
    ]);

    if (sequence !== loadSequence.current) return;
    const failure = [postRes, sigsRes, reviewRes, serviceRes, txRes].find(
      (r) => r.error,
    )?.error;
    if (failure) {
      setRecordError(failure.message);
      setLoading(false);
      return;
    }
    setRecordError(null);
    const postData = postRes.data as Post;
    setPost(postData);
    setSignatures((sigsRes.data ?? []) as GovernanceSignature[]);
    setAnnualReview((reviewRes.data as AnnualReview) ?? null);
    setReviewNotes(reviewRes.data?.notes ?? "");
    setServiceEvents((serviceRes.data ?? []) as CommunityServiceEvent[]);
    setTransactions((txRes.data ?? []) as FinancialTransaction[]);

    setHealthVersion((v) => v + 1);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    return () => {
      loadSequence.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, profile?.id, profile?.role, profile?.state, profile?.post_id]);

  useEffect(() => {
    if (!postId) return;
    supabase
      .from("checklist_items")
      .select("is_complete")
      .eq("post_id", postId)
      .then(({ data }: any) => {
        const items = data ?? [];
        setChecklistPct(
          items.length > 0
            ? Math.round(
                (items.filter((i: any) => i.is_complete).length /
                  items.length) *
                  100,
              )
            : null,
        );
      });
  }, [postId]);

  function copyShareLink() {
    if (!postId) return;
    const link = `${window.location.origin}/post-checklist/${postId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Opening approval is handled by the launch workspace.
  async function advanceStatus(next: PostStatus) {
    if (!postId || !post || !isNational) return;
    if (next === "active_post") {
      navigate(`/post-development?post=${post.id}`);
      return;
    }
    setAdvancing(true);
    const patch = { status: next };
    const { error } = await supabase
      .from("posts")
      .update(patch)
      .eq("id", postId)
      .select("id")
      .single();
    if (error) {
      setAdvancing(false);
      window.alert(`Status was not changed: ${error.message}`);
      return;
    }
    setAdvancing(false);
    load();
  }

  async function toggleReviewItem(field: keyof AnnualReview) {
    if (!postId || reviewBusy) return;
    setReviewBusy(true);
    setRecordError(null);
    const current = annualReview,
      newValue = current ? !current[field] : true;
    const result = current
      ? await supabase
          .from("annual_reviews")
          .update({ [field]: newValue })
          .eq("id", current.id)
          .select("id")
          .single()
      : await supabase
          .from("annual_reviews")
          .insert({
            post_id: postId,
            review_year: new Date().getFullYear(),
            [field]: newValue,
          })
          .select("id")
          .single();
    setReviewBusy(false);
    if (result.error) {
      setRecordError(result.error.message);
      return;
    }
    await load();
  }
  async function markReviewComplete() {
    if (!postId || !annualReview || reviewBusy) return;
    setReviewBusy(true);
    setRecordError(null);
    const result = await supabase
      .from("annual_reviews")
      .update({
        completed_at: new Date().toISOString(),
        notes: reviewNotes.trim(),
      })
      .eq("id", annualReview.id)
      .select("id")
      .single();
    setReviewBusy(false);
    if (result.error) {
      setRecordError(result.error.message);
      return;
    }
    await load();
  }
  if (loading)
    return <p className="text-sm text-muted">Loading post records…</p>;
  if (!post)
    return (
      <div>
        <p role="alert">{recordError ?? "Post records unavailable."}</p>
        <button className="btn-ghost" onClick={load}>
          Retry
        </button>
      </div>
    );

  const income = transactions
    .filter(
      (t) =>
        t.transaction_type === "income" &&
        t.transaction_date <= new Date().toISOString().slice(0, 10),
    )
    .reduce((s, t) => s + Number(t.amount), 0);
  const expense = transactions
    .filter(
      (t) =>
        t.transaction_type === "expense" &&
        t.transaction_date <= new Date().toISOString().slice(0, 10),
    )
    .reduce((s, t) => s + Number(t.amount), 0);

  // A post that hasn't gone active yet doesn't have a meaningful health
  // score — there's nothing to measure. It needs a checklist and a way to
  // advance, not a composite score built mostly from empty signals.
  if (post.status !== "active_post") {
    const currentIndex = POST_STATUS_ORDER.indexOf(post.status);
    const nextStatus = POST_STATUS_ORDER[currentIndex + 1];

    return (
      <div>
        <button
          onClick={() => navigate(`/health/${post.id}`)}
          className="text-xs font-mono text-muted hover:text-gold mb-4"
        >
          ← Back to Post Dashboard
        </button>

        <div className="flex items-center justify-between">
          <PageHeader
            eyebrow={`${post.city ?? ""} ${post.state}`}
            title={postDisplayName(post)}
          />
        </div>

        {recordError && (
          <p role="alert" className="panel p-4 mb-4 text-status-attention">
            {recordError}
          </p>
        )}
        <PostTabBar tab={tab} setTab={setTab} mainLabel="Checklist" />

        {tab === "main" && (
          <>
            <div className="panel p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div>
                  <div className="eyebrow mb-1">Post Status</div>
                  <StatusBadge
                    label={POST_STATUS_LABELS[post.status]}
                    tone="developing"
                  />
                </div>
                {checklistPct !== null && (
                  <div className="text-xs text-muted font-mono ml-4">
                    Checklist {checklistPct}% complete
                    {checklistPct < 100 &&
                      isNational &&
                      " — you can still advance manually if that's the right call"}
                  </div>
                )}
              </div>
              {isNational && nextStatus && (
                <button
                  onClick={() => advanceStatus(nextStatus)}
                  disabled={advancing}
                  className="btn-gold flex items-center gap-2 disabled:opacity-50"
                >
                  {advancing
                    ? "Advancing…"
                    : nextStatus === "active_post"
                      ? "Review Opening in Post Development"
                      : `Advance to ${POST_STATUS_LABELS[nextStatus]}`}{" "}
                  <ArrowRight size={14} />
                </button>
              )}
            </div>

            {isNational && post.status !== "charter_ready" && (
              <div className="panel p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg">Ready to launch?</h2>
                  <p className="text-sm text-muted">
                    Review the location, funding and opening requirements in
                    Post Development.
                  </p>
                </div>
                <button
                  className="btn-gold"
                  disabled={advancing}
                  onClick={() => advanceStatus("active_post")}
                >
                  Review Opening in Post Development
                </button>
              </div>
            )}
            <div className="panel p-4 mb-6 flex items-center justify-between gap-4">
              <div>
                <div className="eyebrow mb-1">Shareable Link</div>
                <p className="text-sm text-muted">
                  Share this with {post.name} — they can view and check off
                  items themselves, no login required. You'll both always be
                  looking at the same live checklist.
                </p>
              </div>
              <button
                onClick={copyShareLink}
                className="btn-gold flex items-center gap-2 shrink-0"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>

            <PostChecklistView postId={post.id} />
          </>
        )}
        {tab === "officers" && (
          <OfficersPanel postId={post.id} postName={post.name} />
        )}
        {tab === "members" && <MembersPanel postId={post.id} />}
        {tab === "meetings" && <MeetingsPanel postId={post.id} />}
        {tab === "recruiting" && <RecruitingPanel postId={post.id} />}
        {tab === "sponsors" && <SponsorsPanel postId={post.id} />}
        {tab === "build_a_post" && (
          <button
            className="btn-gold"
            onClick={() => navigate(`/post-development?post=${post.id}`)}
          >
            Open Post Development
          </button>
        )}
      </div>
    );
  }

  if (!result)
    return (
      <div>
        <p
          role={health.error ? "alert" : undefined}
          className="text-sm text-muted"
        >
          {health.error ?? "Loading health score…"}
        </p>
        <button
          className="btn-ghost mt-3"
          onClick={() => setHealthVersion((v) => v + 1)}
        >
          Refresh score
        </button>
      </div>
    );

  return (
    <div>
      <button
        onClick={() => navigate(`/health/${post.id}`)}
        className="text-xs font-mono text-muted hover:text-gold mb-4"
      >
        ← Back to Post Dashboard
      </button>

      <div className="flex items-center justify-between">
        <PageHeader
          eyebrow={`${post.city ?? ""} ${post.state}`}
          title={postDisplayName(post)}
        />
      </div>

      {recordError && (
        <p role="alert" className="panel p-4 mb-4 text-status-attention">
          {recordError}
        </p>
      )}
      <PostTabBar tab={tab} setTab={setTab} mainLabel="Health" />

      {tab === "main" && (
        <>
          <div
            className={`panel p-6 mb-6 flex items-center gap-6 border-l-4 ${healthColor(result.overall)}`}
          >
            <div className="text-center">
              <div
                className={`font-display text-6xl ${result.overall === "green" ? "text-status-active" : result.overall === "yellow" ? "text-status-developing" : "text-status-attention"}`}
              >
                {result.score}
              </div>
              <div className="eyebrow mt-1">Composite Score</div>
            </div>
            <div className="flex-1">
              <StatusBadge
                label={result.overall.toUpperCase()}
                tone={toneFor(result.overall)}
              />
              <p className="text-sm text-muted mt-2">
                Scored record coverage: {result.coverage}%. Neutral signals are
                excluded. Critical issues:{" "}
                {result.critical.join(", ") || "None flagged"}.
              </p>
            </div>
          </div>

          {healthView === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {result.dimensions.map((d) => {
                const action: (() => void) | null =
                  d.key === "officers"
                    ? () => setTab("officers")
                    : d.key === "membership"
                      ? () => setTab("members")
                      : d.key === "governance"
                        ? () => setHealthView("governance")
                        : d.key === "annual_review"
                          ? () => setHealthView("annual_review")
                          : d.key === "community_service"
                            ? () => setHealthView("community_service")
                            : d.key === "financial"
                              ? () => setHealthView("financial")
                              : d.key === "sponsors"
                                ? () => setTab("sponsors")
                                : d.key === "meetings"
                                  ? () => setTab("meetings")
                                  : d.key === "congress"
                                    ? () => navigate("/congress")
                                    : null;
                return (
                  <button
                    key={d.key}
                    onClick={action ?? undefined}
                    disabled={!action}
                    className={`panel border-l-4 ${healthColor(d.status)} p-4 flex items-center justify-between gap-4 text-left ${action ? "hover:border-gold transition-colors cursor-pointer" : "cursor-default"}`}
                  >
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {d.label}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {d.detail}
                      </div>
                    </div>
                    <StatusBadge label={d.status} tone={toneFor(d.status)} />
                  </button>
                );
              })}
            </div>
          )}

          {healthView !== "overview" && (
            <button
              onClick={() => setHealthView("overview")}
              className="text-xs font-mono text-muted hover:text-gold mb-4"
            >
              ← Back to Health Overview
            </button>
          )}

          {healthView === "governance" && (
            <div className="panel p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="eyebrow flex items-center gap-2">
                  <FileCheck size={14} /> Governance Sign-offs
                </div>
                <button
                  onClick={() => setShowSignature(true)}
                  className="text-xs text-gold hover:text-gold-bright flex items-center gap-1"
                >
                  <Plus size={12} /> Log Signature
                </button>
              </div>
              {signatures.length === 0 ? (
                <p className="text-sm text-muted">No signatures on file.</p>
              ) : (
                <div className="space-y-2">
                  {[...signatures]
                    .sort((a, b) => b.signed_at.localeCompare(a.signed_at))
                    .map((s) => (
                      <div
                        key={s.id}
                        className="flex justify-between items-center text-sm border-b border-hairline/60 pb-2"
                      >
                        <div>
                          <div className="text-ink">{s.signer_name}</div>
                          <div className="text-xs text-muted">
                            {s.form_type.replaceAll("_", " ")}
                          </div>
                        </div>
                        <span className="text-muted font-mono text-xs">
                          {format(new Date(s.signed_at), "MMM d, yyyy")}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {healthView === "annual_review" && (
            <div className="panel p-6 max-w-lg">
              <div className="eyebrow mb-4 flex items-center gap-2">
                <Scale size={14} /> {new Date().getFullYear()} Annual Review
              </div>
              <p className="text-sm text-muted mb-4">
                A once-a-year check that the basics are still in order — bylaws,
                finances, officer roster, and required filings.
              </p>
              <div className="space-y-3">
                {(
                  [
                    ["bylaws_reviewed", "Bylaws reviewed"],
                    ["financial_audit_complete", "Financial audit complete"],
                    ["officer_roster_current", "Officer roster current"],
                    ["required_filings_current", "Required filings current"],
                  ] as [keyof AnnualReview, string][]
                ).map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!annualReview?.[field]}
                      disabled={reviewBusy}
                      onChange={() => toggleReviewItem(field)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="block text-sm mt-4">
                Supporting evidence or document references
                <textarea
                  className="input-field mt-1"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  minLength={5}
                />
              </label>
              {annualReview && !annualReview.completed_at && (
                <button
                  onClick={markReviewComplete}
                  disabled={
                    reviewBusy ||
                    reviewNotes.trim().length < 5 ||
                    ![
                      annualReview.bylaws_reviewed,
                      annualReview.financial_audit_complete,
                      annualReview.officer_roster_current,
                      annualReview.required_filings_current,
                    ].every(Boolean)
                  }
                  className="btn-gold text-sm mt-5 px-4 py-2"
                >
                  Complete Supported Review
                </button>
              )}
              {annualReview?.completed_at && (
                <p className="text-sm text-status-active mt-5">
                  {new Date().getFullYear()} review completed{" "}
                  {format(new Date(annualReview.completed_at), "MMM d, yyyy")}
                </p>
              )}
            </div>
          )}

          {healthView === "community_service" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted">
                  Every logged community service event for this post, most
                  recent first.
                </p>
                <button
                  onClick={() => setShowService(true)}
                  className="btn-gold flex items-center gap-2 text-sm shrink-0"
                >
                  <Plus size={14} /> Log Event
                </button>
              </div>
              {serviceEvents.length === 0 ? (
                <p className="text-sm text-muted">No events logged yet.</p>
              ) : (
                <div className="space-y-3">
                  {[...serviceEvents]
                    .sort((a, b) => b.event_date.localeCompare(a.event_date))
                    .map((e) => (
                      <div key={e.id} className="panel p-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm font-medium text-ink">
                            {e.title}
                          </div>
                          <span className="text-xs text-muted font-mono">
                            {format(new Date(e.event_date), "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="text-xs text-gold mb-2">
                          {e.category}
                        </div>
                        <div className="flex gap-4 text-xs text-muted mb-2">
                          {e.attendees_count !== null && (
                            <span>
                              {e.attendees_count} attendee
                              {e.attendees_count !== 1 ? "s" : ""}
                            </span>
                          )}
                          {e.hours_contributed !== null && (
                            <span>
                              {e.hours_contributed} hour
                              {e.hours_contributed !== 1 ? "s" : ""} contributed
                            </span>
                          )}
                        </div>
                        {e.description && (
                          <p className="text-sm text-muted">{e.description}</p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {healthView === "financial" && (
            <div>
              <div className="panel p-5 mb-4 flex items-center justify-between">
                <div className="flex gap-6 text-sm">
                  <span className="text-status-active">
                    In: ${income.toLocaleString()}
                  </span>
                  <span className="text-status-attention">
                    Out: ${expense.toLocaleString()}
                  </span>
                  <span className="font-medium text-ink">
                    Balance: ${(income - expense).toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() => setShowTransaction(true)}
                  className="btn-gold flex items-center gap-2 text-sm shrink-0"
                >
                  <Plus size={14} /> Log Transaction
                </button>
              </div>
              {transactions.length === 0 ? (
                <p className="text-sm text-muted">
                  No transactions logged yet.
                </p>
              ) : (
                <div className="panel overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="table-head">Date</th>
                        <th className="table-head">Category</th>
                        <th className="table-head">Description</th>
                        <th className="table-head">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...transactions]
                        .sort((a, b) =>
                          b.transaction_date.localeCompare(a.transaction_date),
                        )
                        .map((t) => (
                          <tr key={t.id}>
                            <td className="table-cell text-muted text-xs whitespace-nowrap">
                              {format(
                                new Date(t.transaction_date),
                                "MMM d, yyyy",
                              )}
                            </td>
                            <td className="table-cell whitespace-nowrap">
                              {t.category}
                            </td>
                            <td className="table-cell text-muted">
                              {t.description ?? "—"}
                            </td>
                            <td
                              className={`table-cell font-mono whitespace-nowrap ${t.transaction_type === "income" ? "text-status-active" : "text-status-attention"}`}
                            >
                              {t.transaction_type === "income" ? "+" : "-"}$
                              {Number(t.amount).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {tab === "officers" && (
        <OfficersPanel postId={post.id} postName={post.name} />
      )}
      {tab === "members" && <MembersPanel postId={post.id} />}
      {tab === "meetings" && <MeetingsPanel postId={post.id} />}
      {tab === "recruiting" && <RecruitingPanel postId={post.id} />}
      {tab === "sponsors" && <SponsorsPanel postId={post.id} />}
      {tab === "build_a_post" && (
        <button
          className="btn-gold"
          onClick={() => navigate(`/post-development?post=${post.id}`)}
        >
          Open Post Development
        </button>
      )}

      {showSignature && (
        <LogSignatureModal
          postId={post.id}
          recordedBy={profile?.id ?? null}
          onClose={() => setShowSignature(false)}
          onSaved={() => {
            setShowSignature(false);
            load();
          }}
        />
      )}
      {showService && (
        <LogServiceModal
          postId={post.id}
          createdBy={profile?.id ?? null}
          onClose={() => setShowService(false)}
          onSaved={() => {
            setShowService(false);
            load();
          }}
        />
      )}
      {showTransaction && (
        <LogTransactionModal
          postId={post.id}
          createdBy={profile?.id ?? null}
          onClose={() => setShowTransaction(false)}
          onSaved={() => {
            setShowTransaction(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="panel w-full max-w-md p-5">
        <div className="font-display text-xl tracking-wide mb-4">{title}</div>
        {children}
      </div>
    </div>
  );
}

function LogSignatureModal({
  postId,
  recordedBy,
  onClose,
  onSaved,
}: {
  postId: string;
  recordedBy: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [signerId, setSignerId] = useState("");
  const [officers, setOfficers] = useState<
    { name: string; profile_id: string; appointed: boolean }[]
  >([]);
  useEffect(() => {
    let active = true;
    void supabase
      .rpc("cvoa_post_dashboard", { p_post: postId })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setSaveError(error.message);
        else
          setOfficers([
            ...new Map<
              string,
              { name: string; profile_id: string; appointed: boolean }
            >(
              (data?.staff ?? [])
                .filter(
                  (f: { profile_id: string | null; appointed: boolean }) =>
                    f.profile_id && f.appointed,
                )
                .map(
                  (f: {
                    name: string;
                    profile_id: string;
                    appointed: boolean;
                  }) => [f.profile_id, f],
                ),
            ).values(),
          ]);
      });
    return () => {
      active = false;
    };
  }, [postId]);
  const [formType, setFormType] = useState<GovernanceFormType>(
    "conflict_of_interest",
  );
  const [signedAt, setSignedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const result = await supabase.from("governance_signatures").insert({
      post_id: postId,
      signer_name: officers.find((f) => f.profile_id === signerId)?.name,
      profile_id: signerId,
      form_type: formType,
      signed_at: signedAt,
      recorded_by: recordedBy,
    });
    setSaving(false);
    if (result.error) {
      setSaveError(result.error.message);
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title="Log Governance Signature" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {saveError && (
          <p role="alert" className="text-status-attention text-sm">
            {saveError}
          </p>
        )}
        <label className="block text-sm">
          Current officer
          <select
            required
            className="input-field mt-1"
            value={signerId}
            onChange={(e) => setSignerId(e.target.value)}
          >
            <option value="">Choose a linked officer…</option>
            {officers.map((o) => (
              <option key={o.profile_id} value={o.profile_id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <select
          className="input-field"
          value={formType}
          onChange={(e) => setFormType(e.target.value as GovernanceFormType)}
        >
          <option value="conflict_of_interest">Conflict of Interest</option>
          <option value="officer_acknowledgment">Officer Acknowledgment</option>
        </select>
        <input
          aria-label="Date signed"
          required
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          className="input-field"
          value={signedAt}
          onChange={(e) => setSignedAt(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-gold flex-1 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function LogServiceModal({
  postId,
  createdBy,
  onClose,
  onSaved,
}: {
  postId: string;
  createdBy: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    category: "Community Project",
    event_date: "",
    attendees_count: "",
    hours_contributed: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const result = await supabase.from("community_service_events").insert({
      post_id: postId,
      title: form.title,
      category: form.category,
      event_date: form.event_date,
      attendees_count: form.attendees_count
        ? Number(form.attendees_count)
        : null,
      hours_contributed: form.hours_contributed
        ? Number(form.hours_contributed)
        : null,
      description: form.description || null,
      created_by: createdBy,
    });
    setSaving(false);
    if (result.error) {
      setSaveError(result.error.message);
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title="Log Community Service Event" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {saveError && (
          <p role="alert" className="text-status-attention text-sm">
            {saveError}
          </p>
        )}
        <input
          required
          placeholder="Event title"
          className="input-field"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            className="input-field"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
          >
            <option>Food Drive</option>
            <option>Veteran Outreach</option>
            <option>School Presentation</option>
            <option>Community Project</option>
            <option>Other</option>
          </select>
          <input
            required
            type="date"
            className="input-field"
            value={form.event_date}
            onChange={(e) => update("event_date", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            min={0}
            placeholder="Attendees"
            className="input-field"
            value={form.attendees_count}
            onChange={(e) => update("attendees_count", e.target.value)}
          />
          <input
            type="number"
            min={0}
            placeholder="Hours contributed"
            className="input-field"
            value={form.hours_contributed}
            onChange={(e) => update("hours_contributed", e.target.value)}
          />
        </div>
        <textarea
          placeholder="Description"
          className="input-field"
          rows={2}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-gold flex-1 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function LogTransactionModal({
  postId,
  createdBy,
  onClose,
  onSaved,
}: {
  postId: string;
  createdBy: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    transaction_type: "income",
    category: "Other",
    amount: "",
    description: "",
    transaction_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
      setSaving(false);
      setSaveError("Enter a positive amount.");
      return;
    }
    const result = await supabase.from("financial_transactions").insert({
      post_id: postId,
      transaction_type: form.transaction_type,
      category: form.category,
      amount: Number(form.amount),
      description: form.description || null,
      transaction_date: form.transaction_date,
      created_by: createdBy,
    });
    setSaving(false);
    if (result.error) {
      setSaveError(result.error.message);
      return;
    }
    onSaved();
  }

  return (
    <ModalShell title="Log Financial Transaction" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {saveError && (
          <p role="alert" className="text-status-attention text-sm">
            {saveError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <select
            className="input-field"
            value={form.transaction_type}
            onChange={(e) => update("transaction_type", e.target.value)}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <input
            required
            type="date"
            className="input-field"
            value={form.transaction_date}
            onChange={(e) => update("transaction_date", e.target.value)}
          />
        </div>
        <input
          placeholder="Category (e.g. Dues, Event Costs, Sponsorship)"
          className="input-field"
          value={form.category}
          onChange={(e) => update("category", e.target.value)}
        />
        <input
          required
          type="number"
          min={0}
          step="0.01"
          placeholder="Amount ($)"
          className="input-field"
          value={form.amount}
          onChange={(e) => update("amount", e.target.value)}
        />
        <textarea
          placeholder="Description"
          className="input-field"
          rows={2}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-gold flex-1 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
