import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { SponsorPayment } from "@/lib/types";
import {
  SponsorCalendar,
  CollectSponsorPayment,
  SponsorStageForm,
} from "./SponsorWorkflow";
import {
  SPONSOR_STAGES,
  SPONSOR_CATEGORIES,
  money,
  edgeError,
} from "./sponsorship";

export function SponsorDetailModal({
  sponsor,
  onClose,
  onUpdated,
}: {
  sponsor: any;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { profile } = useAuth();
  const [tier, setTier] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    setTier(null);
    if (sponsor.tier_id)
      void supabase
        .from("sponsor_tiers")
        .select("*")
        .eq("id", sponsor.tier_id)
        .single()
        .then((r) => {
          if (alive && !r.error) setTier(r.data);
        });
    return () => {
      alive = false;
    };
  }, [sponsor.tier_id]);
  const [amount, setAmount] = useState(String(sponsor.sponsorship_value)),
    [contact, setContact] = useState({
      contact_name: sponsor.contact_name || "",
      email: sponsor.email || "",
      phone: sponsor.phone || "",
    }),
    [payments, setPayments] = useState<any[]>([]),
    [activity, setActivity] = useState<any[]>([]),
    [requests, setRequests] = useState<any[]>([]),
    [notes, setNotes] = useState<any[]>([]),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [collect, setCollect] = useState(false),
    [manual, setManual] = useState(false),
    [stage, setStage] = useState(""),
    [category, setCategory] = useState(sponsor.category || ""),
    [agreementStart, setAgreementStart] = useState(
      sponsor.agreement_start_date || "",
    ),
    [agreementEnd, setAgreementEnd] = useState(
      sponsor.agreement_end_date || "",
    );
  const load = useCallback(async () => {
    const results = await Promise.all([
      supabase
        .from("sponsor_payments")
        .select("*")
        .eq("sponsor_id", sponsor.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("sponsor_activity")
        .select("*")
        .eq("sponsor_id", sponsor.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("sponsor_checkout_requests")
        .select("*")
        .eq("sponsor_id", sponsor.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("sponsor_notes")
        .select("*")
        .eq("sponsor_id", sponsor.id)
        .order("created_at", { ascending: false }),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }
    setPayments(results[0].data || []);
    setActivity(results[1].data || []);
    setRequests(results[2].data || []);
    setNotes(results[3].data || []);
  }, [sponsor.id]);
  useEffect(() => {
    void load();
  }, [load, sponsor.workflow_version]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("cvoa_sponsor_save", {
        p_sponsor: sponsor.id,
        p_version: sponsor.workflow_version,
        p_data: {
          ...contact,
          sponsorship_value: Number(amount),
          category,
          agreement_start_date: agreementStart || null,
          agreement_end_date: agreementEnd || null,
        },
      });
      if (r.error) throw r.error;
      onUpdated();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function viewFile(path: string) {
    const r = await supabase.storage
      .from("sponsor-agreements")
      .createSignedUrl(path, 600);
    if (r.error) setError(r.error.message);
    else window.open(r.data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function checkPayment(request: any) {
    setBusy(true);
    setError("");
    try {
      const r = await supabase.functions.invoke("create-sponsorship-checkout", {
        body: { action: "status", session_id: request.session_id },
      });
      if (r.error) throw new Error(await edgeError(r.error));
      setError(
        r.data.status === "paid"
          ? "Payment confirmed and recorded."
          : r.data.status === "expired"
            ? "This checkout expired."
            : "Payment has not been completed.",
      );
      await load();
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={sponsor.company} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-gold font-mono">
          {SPONSOR_STAGES.find((s) => s.key === sponsor.stage)?.label}
        </p>
        {error && (
          <p role="status" className="text-sm text-status-attention">
            {error}
          </p>
        )}
        {tier && (
          <section className="panel p-4 border-gold/30">
            <h3 className="font-display text-xl text-gold">
              {tier.name} sponsor
            </h3>
            <ul className="text-sm list-disc pl-4">
              {tier.benefits?.map((benefit: string) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          </section>
        )}
        <section className="space-y-3">
          <label className="block text-sm">
            Agreed sponsorship / donation amount ($)
            <input
              className="input-field mt-1"
              type="number"
              min="0"
              max="999999.99"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {(["contact_name", "email", "phone"] as const).map((key) => (
            <label key={key} className="block text-sm">
              {
                {
                  contact_name: "Contact person",
                  email: "Contact email",
                  phone: "Contact phone",
                }[key]
              }
              <input
                className="input-field mt-1"
                type={key === "email" ? "email" : "text"}
                value={contact[key]}
                onChange={(e) =>
                  setContact({ ...contact, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <label className="block text-sm">
            Business category
            <select
              className="input-field mt-1"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Choose a category</option>
              {SPONSOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy}
            className="btn-gold"
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save amount and contact"}
          </button>
        </section>
        <div className="flex flex-wrap gap-2">
          <button className="btn-gold" onClick={() => setCollect(true)}>
            Collect Stripe payment
          </button>
          <button className="btn-ghost" onClick={() => setManual(true)}>
            Record cash / check / wire
          </button>
          <select
            aria-label="Move sponsor to a workflow step"
            className="input-field"
            value=""
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">Move to another step…</option>
            {SPONSOR_STAGES.filter((s) => s.key !== sponsor.stage).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <SponsorCalendar sponsor={sponsor} />
        {sponsor.meeting_start && (
          <button
            className="btn-ghost"
            onClick={() => setStage("meeting_scheduled")}
          >
            Edit meeting details
          </button>
        )}
        <section className="space-y-2 border-t border-hairline pt-4">
          <h3 className="font-display text-xl">Proposal</h3>
          {sponsor.proposal_text && (
            <p className="whitespace-pre-wrap text-sm">
              {sponsor.proposal_text}
            </p>
          )}
          {sponsor.proposal_storage_path && (
            <button
              className="btn-ghost"
              onClick={() => void viewFile(sponsor.proposal_storage_path)}
            >
              Open proposal document
            </button>
          )}
          <button
            className="btn-ghost"
            onClick={() => setStage("proposal_sent")}
          >
            Write / upload proposal
          </button>
          {sponsor.agreement_storage_path && (
            <button
              className="btn-ghost"
              onClick={() => void viewFile(sponsor.agreement_storage_path)}
            >
              Open signed agreement
            </button>
          )}
        </section>
        <section className="border-t border-hairline pt-4 space-y-3">
          <h3 className="font-display text-xl">Signed agreement</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Starts
              <input
                className="input-field mt-1"
                type="date"
                value={agreementStart}
                onChange={(e) => setAgreementStart(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Ends / renewal due
              <input
                className="input-field mt-1"
                type="date"
                value={agreementEnd}
                onChange={(e) => setAgreementEnd(e.target.value)}
              />
            </label>
          </div>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => void save()}
          >
            Save agreement dates
          </button>
          <label className="block text-sm">
            Upload signed agreement (PDF, image or Word document)
            <input
              className="input-field mt-2"
              disabled={busy}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                setError("");
                try {
                  if (
                    f.size > 20 * 1024 * 1024 ||
                    !/\.(pdf|docx?|jpe?g|png)$/i.test(f.name)
                  )
                    throw new Error(
                      "Choose a supported agreement file under 20 MB.",
                    );
                  const path = `${sponsor.id}/agreements/${crypto.randomUUID()}.${f.name.split(".").pop()?.toLowerCase()}`;
                  const upload = await supabase.storage
                    .from("sponsor-agreements")
                    .upload(path, f);
                  if (upload.error) throw upload.error;
                  const r = await supabase.rpc("cvoa_sponsor_save", {
                    p_sponsor: sponsor.id,
                    p_version: sponsor.workflow_version,
                    p_data: { agreement_storage_path: path },
                  });
                  if (r.error) throw r.error;
                  onUpdated();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </section>
        <section className="border-t border-hairline pt-4 space-y-2">
          <h3 className="font-display text-xl">
            Payments received:{" "}
            {money(
              payments
                .filter((p) => p.stripe_livemode !== false)
                .reduce(
                  (sum, p) =>
                    sum + Number(p.amount) - Number(p.refunded_amount || 0),
                  0,
                ),
            )}
          </h3>
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between gap-3 text-sm">
              <span>
                {p.stripe_livemode === false
                  ? "TEST payment"
                  : p.payment_method === "card"
                    ? "✓ Stripe confirmed"
                    : p.payment_method}
                {Number(p.refunded_amount) > 0
                  ? ` • Refunded ${money(p.refunded_amount)}`
                  : ""}{" "}
                • {p.payment_date}
              </span>
              <strong>{money(p.amount)}</strong>
            </div>
          ))}
          {!payments.length && (
            <p className="text-muted text-sm">No money received yet.</p>
          )}
          <h4 className="font-display text-lg mt-3">Payment requests</h4>
          {requests.map((r) => (
            <div key={r.id} className="panel p-3 text-sm space-y-2">
              <p>
                {money(r.amount_cents / 100)} • {r.status}
                {r.livemode === false ? " • TEST MODE" : ""}
                {r.expires_at
                  ? ` • Expires ${new Date(r.expires_at).toLocaleString()}`
                  : ""}
              </p>
              {r.session_id && (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-ghost text-xs"
                    disabled={busy}
                    onClick={() => void checkPayment(r)}
                  >
                    Check Stripe payment
                  </button>
                  {r.url && new Date(r.expires_at).getTime() > Date.now() && (
                    <a
                      className="btn-ghost text-xs"
                      target="_blank"
                      rel="noreferrer"
                      href={r.url}
                    >
                      Open checkout
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
        <section className="border-t border-hairline pt-4 space-y-3">
          <h3 className="font-display text-xl">Activity and next steps</h3>
          {sponsor.notes && (
            <p className="text-sm whitespace-pre-wrap">
              Initial interest: {sponsor.notes}
            </p>
          )}
          <textarea
            className="input-field"
            aria-label="Add sponsor follow-up note"
            placeholder="Record a follow-up or next step…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="btn-ghost"
            disabled={busy || !note.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await supabase.from("sponsor_notes").insert({
                sponsor_id: sponsor.id,
                author_id: profile?.id,
                note: note.trim(),
              });
              setBusy(false);
              if (r.error) setError(r.error.message);
              else {
                setNote("");
                await load();
              }
            }}
          >
            Add note
          </button>
          {activity.map((a) => (
            <article key={a.id} className="border-l-2 border-gold pl-3 text-sm">
              <p className="font-medium">
                {a.kind === "stage_changed"
                  ? `${a.detail.previous_stage.replaceAll("_", " ")} → ${a.detail.new_stage.replaceAll("_", " ")}`
                  : a.kind.replaceAll("_", " ")}
              </p>
              <p className="text-xs text-muted">
                {new Date(a.created_at).toLocaleString()} •{" "}
                {a.detail.recorded_by_name || "Post member"}
              </p>
              {a.detail.person && (
                <p>
                  Spoke with {a.detail.person} by{" "}
                  {a.detail.method?.replaceAll("_", " ")}
                </p>
              )}
              {a.detail.summary && (
                <p className="whitespace-pre-wrap">{a.detail.summary}</p>
              )}
              {a.detail.email && <p>{a.detail.email}</p>}
              {a.detail.phone && <p>{a.detail.phone}</p>}
              {a.detail.previous_amount !== a.detail.new_amount &&
                a.detail.new_amount !== undefined && (
                  <p>
                    Agreed amount: {money(a.detail.previous_amount)} →{" "}
                    {money(a.detail.new_amount)}
                  </p>
                )}
            </article>
          ))}
          {notes.map((n) => (
            <p
              key={n.id}
              className="text-sm whitespace-pre-wrap border-l-2 border-hairline pl-3"
            >
              {n.note}
              <span className="block text-xs text-muted">
                {new Date(n.created_at).toLocaleString()}
              </span>
            </p>
          ))}
        </section>
      </div>
      {collect && (
        <CollectSponsorPayment
          sponsor={sponsor}
          onClose={() => {
            setCollect(false);
            void load();
            onUpdated();
          }}
          onSaved={() => void load()}
        />
      )}{" "}
      {manual && (
        <RecordPaymentModal
          postId={sponsor.post_id}
          sponsorId={sponsor.id}
          onClose={() => setManual(false)}
          onSaved={() => {
            setManual(false);
            void load();
            onUpdated();
          }}
        />
      )}
      {stage && (
        <SponsorStageForm
          sponsor={sponsor}
          stage={stage}
          onClose={() => setStage("")}
          onSaved={() => {
            setStage("");
            onUpdated();
            void load();
          }}
        />
      )}
    </Modal>
  );
}
export function RecordPaymentModal({
  postId,
  sponsorId,
  donorNameDefault,
  onClose,
  onSaved,
}: {
  postId: string | null;
  sponsorId: string | null;
  donorNameDefault?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    donor_name: donorNameDefault ?? "",
    amount: "",
    payment_method: "check" as SponsorPayment["payment_method"],
    payment_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Enter an amount greater than $0.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("sponsor_payments").insert({
      recorded_by: profile?.id,
      post_id: postId,
      sponsor_id: sponsorId,
      donor_name: sponsorId ? null : form.donor_name || null,
      amount: Number(form.amount),
      payment_method: form.payment_method,
      payment_date: form.payment_date,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
  }

  return (
    <Modal title="Record a Payment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {!sponsorId && (
          <input
            required
            placeholder="Donor name"
            className="input-field"
            value={form.donor_name}
            onChange={(e) => update("donor_name", e.target.value)}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">
              $
            </span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount"
              className="input-field pl-6"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
            />
          </div>
          <input
            required
            type="date"
            className="input-field"
            value={form.payment_date}
            onChange={(e) => update("payment_date", e.target.value)}
          />
        </div>
        <select
          className="input-field"
          value={form.payment_method}
          onChange={(e) =>
            update(
              "payment_method",
              e.target.value as SponsorPayment["payment_method"],
            )
          }
        >
          <option value="check">Check</option>
          <option value="cash">Cash</option>
          <option value="wire">Wire Transfer</option>
          <option value="other">Other</option>
        </select>
        <input
          placeholder="Notes (optional)"
          className="input-field"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
        {error && <p className="text-status-attention text-sm">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="btn-gold w-full disabled:opacity-50"
        >
          {saving ? "Recording…" : "Record Payment"}
        </button>
      </form>
    </Modal>
  );
}
