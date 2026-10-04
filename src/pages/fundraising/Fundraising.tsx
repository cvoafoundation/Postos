import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/layout/AppShell";
import { WorkspaceStatus } from "@/components/workspaces/WorkspaceStatus";
import { supabase } from "@/lib/supabase";
import { readAllRows } from "@/lib/readAllRows";
import { toCents, dollars } from "@/lib/workspaces";
import { ListPagination, LIST_PAGE_SIZE } from "@/components/ui/ListPagination";

interface Campaign {
  id: string;
  post_id: string;
  title: string;
  goal_cents: number;
  owner_name: string;
  deadline: string;
  status: string;
  results_note: string;
}
interface Entry {
  id: string;
  campaign_id: string;
  entry_type: string;
  amount_cents: number;
  entry_date: string;
  description: string;
}
interface PostChoice {
  id: string;
  name: string;
  state: string;
}
export default function Fundraising() {
  const { profile, isNational } = useAuth();
  const [params] = useSearchParams();
  const [posts, setPosts] = useState<PostChoice[]>([]),
    [postId, setPostId] = useState(
      params.get("post") ?? profile?.post_id ?? "",
    );
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [postsError, setPostsError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [page, setPage] = useState(0);
  const [form, setForm] = useState({
    title: "",
    goal: "",
    owner: profile?.full_name ?? "",
    deadline: "",
  });
  const canEdit =
    isNational ||
    (["post_commander", "post_officer"].includes(profile?.role ?? "") &&
      postId === profile?.post_id);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let rows: PostChoice[];
        if (profile?.role === "state_commander") {
          const r = await supabase.rpc("cvoa_state_workspace");
          if (r.error) throw r.error;
          rows = r.data.posts;
        } else {
          rows = await readAllRows<PostChoice>(() => {
            let q = supabase.from("posts").select("id,name,state").order("id");
            if (!isNational)
              q = q.eq(
                "id",
                profile?.post_id ?? "00000000-0000-0000-0000-000000000000",
              );
            return q;
          });
        }
        if (active) {
          setPosts(rows);
          setPostId((id) =>
            rows.some((p) => p.id === id) ? id : (rows[0]?.id ?? ""),
          );
        }
      } catch (e) {
        if (active) setPostsError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.post_id, profile?.role, isNational]);
  useEffect(() => {
    let active = true;
    setPage(0);
    setCampaigns([]);
    setEntries([]);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (!postId) return;
        const rows = await readAllRows<Campaign>(() =>
          supabase
            .from("fundraising_campaigns")
            .select("*")
            .eq("post_id", postId)
            .order("id"),
        );
        const all: Entry[] = [];
        for (let i = 0; i < rows.length; i += 100) {
          const ids = rows.slice(i, i + 100).map((c) => c.id);
          all.push(
            ...(await readAllRows<Entry>(() =>
              supabase
                .from("fundraising_entries")
                .select("*")
                .in("campaign_id", ids)
                .order("id"),
            )),
          );
        }
        if (active) {
          setCampaigns(
            rows.sort((a, b) => a.deadline.localeCompare(b.deadline)),
          );
          setEntries(all);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [postId, version]);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase
        .from("fundraising_campaigns")
        .insert({
          post_id: postId,
          title: form.title.trim(),
          goal_cents: toCents(form.goal),
          owner_name: form.owner.trim(),
          deadline: form.deadline,
          created_by: profile?.id,
        });
      if (r.error) throw r.error;
      setForm({ ...form, title: "", goal: "", deadline: "" });
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader eyebrow="Post Operations" title="Fundraising" />
      <p className="text-sm text-muted mb-5">
        Plan a campaign, assign its owner, record income and expenses, and close
        it with results. Entries are campaign records; reconcile them with the
        post’s financial ledger. Sponsor pledges count as income when received.
      </p>
      <label className="block text-sm mb-5">
        Post
        <select
          className="input-field max-w-md mt-1"
          value={postId}
          onChange={(e) => setPostId(e.target.value)}
        >
          {posts.length === 0 && <option value="">No assigned posts</option>}
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.state}
            </option>
          ))}
        </select>
      </label>
      <WorkspaceStatus
        loading={loading}
        error={postsError ?? error}
        retry={() => setVersion((v) => v + 1)}
      />
      {canEdit && postId && (
        <form onSubmit={create} className="panel p-5 mb-6 space-y-3">
          <h2 className="font-display text-xl">New Campaign / Event</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              Title
              <input
                className="input-field mt-1"
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Goal (USD)
              <input
                className="input-field mt-1"
                required
                inputMode="decimal"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Responsible owner
              <input
                className="input-field mt-1"
                required
                maxLength={200}
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Deadline / event date
              <input
                className="input-field mt-1"
                type="date"
                required
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </label>
          </div>
          <button className="btn-gold" disabled={busy}>
            Create Campaign
          </button>
        </form>
      )}
      {!loading && postId && campaigns.length === 0 && (
        <p className="text-muted mb-4">No campaigns recorded for this post.</p>
      )}
      <div className="space-y-5">
        {campaigns
          .slice(page * LIST_PAGE_SIZE, (page + 1) * LIST_PAGE_SIZE)
          .map((c) => (
            <CampaignCard
              key={`${c.id}-${version}`}
              campaign={c}
              entries={entries.filter((e) => e.campaign_id === c.id)}
              canEdit={canEdit}
              onSaved={() => setVersion((v) => v + 1)}
            />
          ))}
      </div>
      <ListPagination
        total={campaigns.length}
        page={page}
        onPageChange={setPage}
      />
    </div>
  );
}
function CampaignCard({
  campaign: c,
  entries,
  canEdit,
  onSaved,
}: {
  campaign: Campaign;
  entries: Entry[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [status, setStatus] = useState(c.status),
    [note, setNote] = useState(c.results_note),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "income",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
  });
  const income = entries
      .filter((e) => e.entry_type === "income")
      .reduce((n, e) => n + Number(e.amount_cents), 0),
    expense = entries
      .filter((e) => e.entry_type === "expense")
      .reduce((n, e) => n + Number(e.amount_cents), 0);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (status === "completed" && !note.trim())
        throw new Error("Record the outcome before closing the campaign.");
      const r = await supabase
        .from("fundraising_campaigns")
        .update({ status, results_note: note })
        .eq("id", c.id)
        .select("id")
        .single();
      if (r.error) throw r.error;
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function record(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await supabase
        .from("fundraising_entries")
        .insert({
          campaign_id: c.id,
          entry_type: form.type,
          amount_cents: toCents(form.amount),
          entry_date: form.date,
          description: form.description.trim(),
          recorded_by: profile?.id,
        });
      if (r.error) throw r.error;
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel p-5">
      <h2 className="font-display text-2xl">{c.title}</h2>
      <p className="text-sm text-muted mt-1">
        Owner: {c.owner_name} · Due {c.deadline} · {c.status}
      </p>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        {[
          ["Goal", Number(c.goal_cents)],
          ["Income", income],
          ["Expenses", expense],
          ["Net Raised", income - expense],
        ].map(([label, amount]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-display text-xl">{dollars(Number(amount))}</dd>
          </div>
        ))}
      </dl>
      <label className="text-xs text-muted block">
        Net raised toward goal
        <progress
          className="w-full mt-1"
          max={Number(c.goal_cents)}
          value={Math.max(0, income - expense)}
        />
      </label>
      {error && (
        <p role="alert" className="text-status-attention text-sm my-3">
          {error}
        </p>
      )}
      {canEdit ? (
        <div className="space-y-3 mt-4">
          <label className="block text-sm">
            Status
            <select
              className="input-field mt-1"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="block text-sm">
            Results / follow-up
            <textarea
              className="input-field mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="btn-ghost" disabled={busy} onClick={save}>
            Save Status & Results
          </button>
        </div>
      ) : (
        c.results_note && (
          <p className="text-sm whitespace-pre-wrap my-3">{c.results_note}</p>
        )
      )}
      {canEdit && c.status !== "completed" && (
        <form
          onSubmit={record}
          className="border-t border-hairline pt-4 mt-5 space-y-3"
        >
          <h3 className="eyebrow">Record Received Income or Expense</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm">
              Type
              <select
                className="input-field mt-1"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <label className="text-sm">
              Amount (USD)
              <input
                className="input-field mt-1"
                required
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Date
              <input
                className="input-field mt-1"
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
          </div>
          <label className="block text-sm">
            Description
            <input
              className="input-field mt-1"
              required
              maxLength={1000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <button className="btn-gold" disabled={busy}>
            Record Entry
          </button>
        </form>
      )}
      <details className="mt-5">
        <summary className="text-sm cursor-pointer">
          Entries ({entries.length})
        </summary>
        <ul className="text-sm mt-3 space-y-2">
          {entries.map((e) => (
            <li key={e.id}>
              {e.entry_date} · {e.entry_type} ·{" "}
              {dollars(Number(e.amount_cents))} · {e.description}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted mt-3">
          Entries retain their history. Record a clearly described correcting
          entry to reconcile an error.
        </p>
      </details>
    </section>
  );
}
