import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/layout/AppShell";
import { supabase } from "@/lib/supabase";
import { readAllRows } from "@/lib/readAllRows";
import { toCents, dollars } from "@/lib/workspaces";
import {
  GovernanceForm,
  type FieldSpec,
} from "@/pages/meetings/governance/Forms";
interface Campaign {
  id: string;
  post_id: string;
  title: string;
  goal_cents: number;
  owner_name: string;
  deadline: string;
  status: string;
  results_note: string;
  launch_funding: boolean;
  story: string;
  published: boolean;
  public_slug: string;
}
interface Entry {
  voided_at: string | null;
  void_reason: string | null;
  id: string;
  campaign_id: string;
  entry_type: string;
  amount_cents: number;
  entry_date: string;
  description: string;
}
async function rpc(name: string, args: any) {
  const r = await supabase.rpc(name, args);
  if (r.error) throw Error(r.error.message);
  return r.data;
}
export default function Fundraising({
  embedded = false,
  onChanged,
}: {
  embedded?: boolean;
  onChanged?: () => Promise<void>;
}) {
  const { profile, isNational } = useAuth(),
    [params] = useSearchParams();
  const postId = params.get("post") ?? profile?.post_id ?? "";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [entries, setEntries] = useState<Entry[]>([]),
    [payments, setPayments] = useState<any[]>([]),
    [allocations, setAllocations] = useState<any[]>([]),
    [donations, setDonations] = useState<any[]>([]),
    [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<Campaign | null | undefined>(undefined);
  const canEdit =
    isNational ||
    (["post_commander", "post_officer"].includes(profile?.role ?? "") &&
      postId === profile?.post_id);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!postId) return;
      const c = await readAllRows<Campaign>(() =>
        supabase
          .from("fundraising_campaigns")
          .select("*")
          .eq("post_id", postId)
          .order("deadline")
          .order("id"),
      );
      setCampaigns(c);
      const ids = c.map((x) => x.id);
      const [e, p, a, d, f] = await Promise.all([
        ids.length
          ? readAllRows<Entry>(() =>
              supabase
                .from("fundraising_entries")
                .select("*")
                .in("campaign_id", ids)
                .order("id"),
            )
          : [],
        readAllRows<any>(() =>
          supabase
            .from("sponsor_payments")
            .select("*,sponsors(company)")
            .eq("post_id", postId)
            .order("id"),
        ),
        ids.length
          ? readAllRows<any>(() =>
              supabase
                .from("launch_payment_allocations")
                .select("*")
                .in("campaign_id", ids)
                .order("payment_id"),
            )
          : [],
        ids.length
          ? readAllRows<any>(() =>
              supabase
                .from("campaign_donations")
                .select("*")
                .in("campaign_id", ids)
                .order("id"),
            )
          : [],
        readAllRows<any>(() =>
          supabase
            .from("post_facility_projects")
            .select("id,build_a_post_modules(name)")
            .eq("post_id", postId)
            .order("id"),
        ),
      ]);
      setEntries(e);
      setPayments(p);
      setAllocations(a);
      setDonations(d);
      setProjects(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [postId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function saved() {
    await load();
    await onChanged?.();
  }
  const campaignFields: FieldSpec[] = [
    { key: "title", label: "Campaign / Event Name", required: true },
    {
      key: "goal",
      label: "Goal (USD)",
      type: "number",
      min: 0.01,
      step: 0.01,
      required: true,
    },
    { key: "owner_name", label: "Responsible person", required: true },
    {
      key: "deadline",
      label: "Deadline / Event date",
      type: "date",
      required: true,
    },
    {
      key: "launch_funding",
      label: "Contributes to the post opening budget",
      type: "checkbox",
    },
    {
      key: "story",
      label: "Public campaign story (no private information)",
      type: "textarea",
    },
    ...(isNational
      ? [
          {
            key: "published",
            label: "Approve public campaign page",
            type: "checkbox",
          } as FieldSpec,
        ]
      : []),
  ];
  return (
    <div>
      {!embedded && (
        <PageHeader eyebrow="Post Development" title="Fundraising" />
      )}
      <div className="flex flex-wrap justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-2xl">Campaigns &amp; Events</h2>
          <p className="text-sm text-muted mt-2">
            Connect fundraising to opening or run a separate program campaign.
            Stripe donations and allocated sponsorship receipts count when
            received, with refunds deducted.
          </p>
        </div>
        {canEdit && postId && (
          <button className="btn-gold" onClick={() => setEditing(null)}>
            New Campaign / Event
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-status-attention my-3">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading campaigns…</p>}
      <div className="space-y-5">
        {campaigns.map((c) => (
          <CampaignCard
            key={c.id}
            campaign={c}
            entries={entries.filter((e) => e.campaign_id === c.id)}
            allocatedPayments={payments.filter((p) =>
              allocations.some(
                (a) => a.payment_id === p.id && a.campaign_id === c.id,
              ),
            )}
            availablePayments={payments.filter(
              (p) =>
                p.stripe_livemode !== false &&
                !allocations.some((a) => a.payment_id === p.id),
            )}
            donations={donations.filter((d) => d.campaign_id === c.id)}
            projects={projects}
            canEdit={canEdit}
            onSaved={saved}
            onEdit={() => setEditing(c)}
          />
        ))}
      </div>
      {!loading && !campaigns.length && (
        <p className="panel p-5">
          No campaigns yet. Start with a location fund, an event or a specific
          equipment need.
        </p>
      )}
      {editing !== undefined && (
        <GovernanceForm
          title={editing ? "Edit Campaign" : "New Campaign"}
          fields={campaignFields}
          initial={
            editing
              ? { ...editing, goal: Number(editing.goal_cents) / 100 }
              : {
                  owner_name: profile?.full_name,
                  launch_funding: true,
                  goal: "",
                  published: false,
                }
          }
          onClose={() => setEditing(undefined)}
          onSubmit={async (v) => {
            await rpc("cvoa_launch_campaign", {
              p_post: postId,
              p_id: editing?.id ?? null,
              p_data: { ...editing, ...v, goal_cents: toCents(v.goal) },
            });
            await saved();
          }}
        />
      )}
    </div>
  );
}
function CampaignCard({
  campaign: c,
  entries,
  allocatedPayments,
  availablePayments,
  donations,
  projects,
  canEdit,
  onSaved,
  onEdit,
}: {
  campaign: Campaign;
  entries: Entry[];
  allocatedPayments: any[];
  availablePayments: any[];
  donations: any[];
  projects: any[];
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onEdit: () => void;
}) {
  const [voidEntry, setVoidEntry] = useState<Entry | null>(null);
  const [dialog, setDialog] = useState<
      "entry" | "allocation" | "status" | null
    >(null),
    [error, setError] = useState("");
  const offline = entries
      .filter((e) => e.entry_type === "income" && !e.voided_at)
      .reduce((n, e) => n + Number(e.amount_cents), 0),
    receivedSponsors = allocatedPayments.reduce(
      (n, p) =>
        n + Math.round((Number(p.amount) - Number(p.refunded_amount)) * 100),
      0,
    ),
    receivedDonations = donations
      .filter((d) => d.livemode)
      .reduce(
        (n, d) => n + Number(d.amount_cents) - Number(d.refunded_cents),
        0,
      ),
    income = offline + receivedSponsors + receivedDonations,
    expense = entries
      .filter((e) => e.entry_type === "expense" && !e.voided_at)
      .reduce((n, e) => n + Number(e.amount_cents), 0);
  const publicUrl = `${window.location.origin}/campaign/${c.public_slug}`;
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="font-display text-2xl">{c.title}</h3>
        {canEdit && (
          <button className="btn-ghost" onClick={onEdit}>
            Edit Campaign
          </button>
        )}
      </div>
      <p className="text-sm text-muted mt-1">
        {c.owner_name} · Due {c.deadline} · {c.status} ·{" "}
        {c.launch_funding ? "Opening Fund" : "Separate Program / Event"}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        {[
          ["Goal", c.goal_cents],
          ["Received", income],
          ["Expenses", expense],
          ["Net Raised", income - expense],
        ].map(([label, amount]) => (
          <div key={label}>
            <div className="text-xs text-muted">{label}</div>
            <div className="font-display text-xl">
              {dollars(Number(amount))}
            </div>
          </div>
        ))}
      </div>
      <progress
        className="w-full mb-3"
        aria-label="Net raised toward campaign goal"
        max={Number(c.goal_cents)}
        value={Math.max(0, income - expense)}
      />
      <p className="text-xs text-muted">
        Received includes {dollars(receivedSponsors)} allocated sponsorships and{" "}
        {dollars(receivedDonations)} online donations. Test payments are
        excluded. Record only money not already represented by these receipts.
      </p>
      {c.story && <p className="text-sm whitespace-pre-wrap my-4">{c.story}</p>}
      {c.published ? (
        <div className="my-4">
          <a
            className="text-gold"
            target="_blank"
            rel="noopener noreferrer"
            href={publicUrl}
          >
            Open Public Campaign Page
          </a>
          <input
            className="input-field mt-2"
            aria-label="Shareable campaign link"
            readOnly
            value={publicUrl}
          />
          <p className="text-xs text-muted mt-1">
            Donations are available when the campaign status is Active.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted my-3">
          Public page awaits National approval. Editing the title, goal or story
          returns it for approval.
        </p>
      )}
      {error && (
        <p role="alert" className="text-status-attention">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="btn-ghost" onClick={() => setDialog("status")}>
            Update Status &amp; Results
          </button>
          {c.status !== "completed" && (
            <>
              <button className="btn-gold" onClick={() => setDialog("entry")}>
                Record Income / Expense
              </button>
              <button
                className="btn-ghost"
                onClick={() => setDialog("allocation")}
              >
                Allocate Sponsor Receipt
              </button>
            </>
          )}
        </div>
      )}
      {c.results_note && (
        <p className="whitespace-pre-wrap text-sm mt-3">
          Results: {c.results_note}
        </p>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm">
          Payments &amp; Entries (
          {entries.length + allocatedPayments.length + donations.length})
        </summary>
        <div className="text-sm space-y-2 mt-3">
          {entries.map((e) => (
            <p key={e.id}>
              {e.entry_date} · {e.entry_type} ·{" "}
              {dollars(Number(e.amount_cents))} · {e.description}
              {e.voided_at ? (
                <span className="text-status-attention">
                  {" "}
                  · Voided: {e.void_reason}
                </span>
              ) : (
                canEdit && (
                  <button
                    className="text-gold ml-3"
                    onClick={() => setVoidEntry(e)}
                  >
                    Void Incorrect / Duplicate Entry
                  </button>
                )
              )}
            </p>
          ))}
          {allocatedPayments.map((p) => (
            <p key={p.id}>
              Sponsor: {p.sponsors?.company ?? "Post Donation"} ·{" "}
              {dollars(
                Math.round(
                  (Number(p.amount) - Number(p.refunded_amount)) * 100,
                ),
              )}{" "}
              net received
            </p>
          ))}
          {donations.map((d) => (
            <p key={d.id}>
              Online Donation ·{" "}
              {dollars(Number(d.amount_cents) - Number(d.refunded_cents))} ·{" "}
              {d.livemode ? "Verified" : "TEST, Excluded"} ·{" "}
              {new Date(d.paid_at).toLocaleDateString()}
            </p>
          ))}
        </div>
      </details>
      {voidEntry && (
        <GovernanceForm
          title="Void Incorrect Fundraising Entry"
          fields={[
            {
              key: "reason",
              label: "Why is this entry incorrect or duplicated?",
              type: "textarea",
              required: true,
            },
          ]}
          onClose={() => setVoidEntry(null)}
          onSubmit={async (v) => {
            await rpc("cvoa_launch_void_entry", {
              p_entry: voidEntry.id,
              p_reason: v.reason,
            });
            await onSaved();
          }}
        >
          <p className="text-sm text-muted">
            The original record stays in history. Linked ledger entries receive
            an offsetting correction. Voiding a record does not refund or
            reverse a real payment.
          </p>
        </GovernanceForm>
      )}
      {dialog === "entry" && (
        <GovernanceForm
          title="Record Received Income / Expense"
          initial={{
            type: "income",
            date: new Date().toISOString().slice(0, 10),
          }}
          fields={[
            {
              key: "type",
              label: "Type",
              type: "select",
              required: true,
              options: [
                { value: "income", label: "Received Income" },
                { value: "expense", label: "Expense" },
              ],
            },
            {
              key: "amount",
              label: "Amount (USD)",
              type: "number",
              step: 0.01,
              min: 0.01,
              required: true,
            },
            { key: "date", label: "Date", type: "date", required: true },
            {
              key: "description",
              label: "Source, purpose and reference",
              required: true,
            },
            {
              key: "project",
              label: "Facility project (expenses only, optional)",
              type: "select",
              options: projects.map((p) => ({
                value: p.id,
                label: p.build_a_post_modules?.name ?? p.id,
              })),
            },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            await rpc("cvoa_launch_entry", {
              p_campaign: c.id,
              p_type: v.type,
              p_cents: toCents(v.amount),
              p_date: v.date,
              p_description: v.description,
              p_project: v.project || null,
            });
            await onSaved();
          }}
        />
      )}
      {dialog === "allocation" && (
        <GovernanceForm
          title="Allocate a Received Sponsor Payment"
          fields={[
            {
              key: "payment",
              label: "Unallocated payment from this post",
              type: "select",
              required: true,
              options: availablePayments.map((p) => ({
                value: p.id,
                label: `${p.sponsors?.company ?? "Donation"} · ${dollars(Math.round((Number(p.amount) - Number(p.refunded_amount)) * 100))}`,
              })),
            },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            await rpc("cvoa_launch_allocate", {
              p_payment: v.payment,
              p_campaign: c.id,
            });
            await onSaved();
          }}
        >
          <p className="text-xs text-muted">
            Each receipt funds one campaign. Refunds update its contribution
            automatically. If this was already entered manually, reconcile that
            entry before allocating the receipt.
          </p>
        </GovernanceForm>
      )}
      {dialog === "status" && (
        <GovernanceForm
          title="Campaign Status & Results"
          initial={c}
          fields={[
            {
              key: "status",
              label: "Status",
              type: "select",
              required: true,
              options: ["planning", "active", "completed"].map((value) => ({
                value,
                label: value,
              })),
            },
            {
              key: "results_note",
              label: "Results / follow-up (required to complete)",
              type: "textarea",
            },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={async (v) => {
            setError("");
            const r = await supabase
              .from("fundraising_campaigns")
              .update({ status: v.status, results_note: v.results_note ?? "" })
              .eq("id", c.id)
              .select("id")
              .single();
            if (r.error) throw Error(r.error.message);
            await onSaved();
          }}
        />
      )}
    </section>
  );
}
