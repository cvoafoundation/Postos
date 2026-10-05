import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { GovernanceForm } from "@/pages/meetings/governance/Forms";
import { SponsorDetailModal, RecordPaymentModal } from "./SponsorDetail";
import { SponsorStageForm, CollectSponsorPayment } from "./SponsorWorkflow";
import { SPONSOR_STAGES, money } from "./sponsorship";

export default function SponsorsCRM() {
  const { profile } = useAuth(),
    [params] = useSearchParams();
  const [posts, setPosts] = useState<any[]>([]),
    [postId, setPostId] = useState(params.get("post") || "all"),
    [sponsors, setSponsors] = useState<any[]>([]),
    [payments, setPayments] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false),
    [viewing, setViewing] = useState<any>(null),
    [transition, setTransition] = useState<{
      sponsor: any;
      stage: string;
    } | null>(null),
    [collect, setCollect] = useState<any>(null),
    [donation, setDonation] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    const results = await Promise.all([
      supabase.rpc("cvoa_sponsor_directory"),
      supabase
        .from("sponsors")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("sponsor_payments")
        .select("*")
        .order("payment_date", { ascending: false }),
    ]);
    const failure = results.find((r) => r.error);
    if (failure?.error) {
      setError(failure.error.message);
      setLoading(false);
      return;
    }
    setPosts(results[0].data.posts);
    setSponsors(results[1].data || []);
    setPayments(results[2].data || []);
    setViewing((current: any) =>
      current
        ? (results[1].data || []).find((s: any) => s.id === current.id) || null
        : null,
    );
    setLoading(false);
  }, [profile?.id, profile?.role, profile?.post_id, profile?.state]);
  useEffect(() => {
    setSponsors([]);
    setPayments([]);
    setLoading(true);
    void load();
  }, [load]);
  useEffect(() => {
    if (!viewing && params.get("sponsor")) {
      const s = sponsors.find((s) => s.id === params.get("sponsor"));
      if (s) setViewing(s);
    }
  }, [params, sponsors]);
  const filtered = sponsors.filter(
      (s) =>
        (postId === "all" || s.post_id === postId) &&
        `${s.company} ${s.contact_name || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
    visiblePayments = payments
      .filter((p) => p.stripe_livemode !== false)
      .filter((p) => postId === "all" || p.post_id === postId),
    received = visiblePayments.reduce(
      (n, p) => n + Number(p.amount) - Number(p.refunded_amount || 0),
      0,
    );
  const save = async () => {
    setTransition(null);
    await load();
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Sponsorship"
        eyebrow="Post sponsorship workspace"
        action={
          <button
            className="btn-gold"
            onClick={() => setAdding(true)}
            disabled={!posts.length}
          >
            Add sponsor
          </button>
        }
      />
      <p className="text-muted">
        Follow each sponsor from first contact to a commitment and payment.
        Members work within their own post.
      </p>
      {error && (
        <p role="alert" className="panel p-4 text-status-attention">
          {error}
          <button className="btn-ghost ml-3" onClick={() => void load()}>
            Refresh
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="text-gold">
          {notice}
        </p>
      )}
      <div className="flex gap-3 flex-wrap">
        <select
          aria-label="Post sponsorship workspace"
          className="input-field max-w-sm"
          value={postId}
          onChange={(e) => setPostId(e.target.value)}
        >
          <option value="all">All posts in my scope</option>
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Search sponsors"
          className="input-field max-w-sm"
          placeholder="Search company or contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-ghost" onClick={() => void load()}>
          Refresh payments
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="panel p-4">
          <p className="eyebrow">Money received</p>
          <strong className="font-display text-2xl text-status-active">
            {money(received)}
          </strong>
          <p className="text-xs text-muted">
            Verified Stripe receipts and recorded offline payments
          </p>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Agreed sponsorships</p>
          <strong className="font-display text-2xl">
            {money(
              filtered
                .filter((s) => s.stage === "won")
                .reduce((n, s) => n + Number(s.sponsorship_value), 0),
            )}
          </strong>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Prospective commitments</p>
          <strong className="font-display text-2xl">
            {money(
              filtered
                .filter((s) => !["won", "lost"].includes(s.stage))
                .reduce((n, s) => n + Number(s.sponsorship_value), 0),
            )}
          </strong>
        </div>
      </div>
      {postId !== "all" && (
        <div className="panel p-4 flex flex-wrap gap-3">
          <button
            className="btn-ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/become-a-sponsor/${postId}`,
                );
                setNotice("Sponsor interest link copied.");
              } catch {
                setError("Unable to copy the link.");
              }
            }}
          >
            Copy public sponsor interest link
          </button>
          <button className="btn-ghost" onClick={() => setDonation(true)}>
            Record cash / check donation
          </button>
        </div>
      )}
      {loading ? (
        <p>Loading sponsorships…</p>
      ) : !posts.length ? (
        <p className="panel p-5">
          Join a post to use its sponsorship workspace.
        </p>
      ) : (
        <div className="space-y-4">
          {SPONSOR_STAGES.map((stage, index) => (
            <section key={stage.key} className="space-y-3">
              <div className="panel p-4">
                <h2 className="font-display text-2xl">
                  {index + 1}. {stage.label}{" "}
                  <span className="text-muted text-lg">
                    ({filtered.filter((s) => s.stage === stage.key).length})
                  </span>
                </h2>
                <p className="text-sm text-muted">{stage.help}</p>
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
                  {filtered
                    .filter((s) => s.stage === stage.key)
                    .map((s) => (
                      <article key={s.id} className="panel p-4 space-y-3">
                        <button
                          className="text-left block w-full"
                          onClick={() => setViewing(s)}
                        >
                          <h3 className="font-display text-xl text-gold">
                            {s.company}
                          </h3>
                          <p className="text-sm">
                            {s.contact_name || "Contact needed"}
                          </p>
                          <p className="text-xs text-muted">
                            {posts.find((p) => p.id === s.post_id)?.name ||
                              "National"}{" "}
                            • Agreed {money(s.sponsorship_value)}
                          </p>
                          <p className="text-xs text-status-active">
                            Received{" "}
                            {money(
                              payments
                                .filter(
                                  (p) =>
                                    p.stripe_livemode !== false &&
                                    p.sponsor_id === s.id,
                                )
                                .reduce(
                                  (n, p) =>
                                    n +
                                    Number(p.amount) -
                                    Number(p.refunded_amount || 0),
                                  0,
                                ),
                            )}
                          </p>
                        </button>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => setViewing(s)}
                          >
                            Open / edit
                          </button>
                          <button
                            className="btn-ghost text-xs"
                            onClick={() => setCollect(s)}
                          >
                            Collect payment
                          </button>
                          {index < 4 && (
                            <button
                              className="btn-gold text-xs"
                              onClick={() =>
                                setTransition({
                                  sponsor: s,
                                  stage: SPONSOR_STAGES[index + 1].key,
                                })
                              }
                            >
                              {SPONSOR_STAGES[index + 1].label} →
                            </button>
                          )}
                          {s.stage !== "lost" && (
                            <button
                              className="text-xs text-muted"
                              onClick={() =>
                                setTransition({ sponsor: s, stage: "lost" })
                              }
                            >
                              Not proceeding
                            </button>
                          )}
                          {s.stage === "lost" && (
                            <button
                              className="btn-ghost text-xs"
                              onClick={() =>
                                setTransition({
                                  sponsor: s,
                                  stage: "identified",
                                })
                              }
                            >
                              Reopen lead
                            </button>
                          )}
                        </div>
                        {s.meeting_start && (
                          <p className="text-xs text-muted">
                            Meeting:{" "}
                            {new Date(s.meeting_start).toLocaleString()}
                          </p>
                        )}
                        {s.stage === "proposal_sent" && (
                          <p className="text-xs text-status-active">
                            {s.proposal_text || s.proposal_storage_path
                              ? "✓ Proposal saved"
                              : "Proposal details needed"}
                          </p>
                        )}
                      </article>
                    ))}
                </div>
                {!filtered.some((s) => s.stage === stage.key) && (
                  <p className="text-sm text-muted mt-3">
                    No sponsors at this step.
                  </p>
                )}
              </div>
              {index < 4 && (
                <div
                  aria-hidden="true"
                  className="text-center text-gold text-xl"
                >
                  ↓
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {adding && (
        <GovernanceForm
          title="Add sponsor"
          onClose={() => setAdding(false)}
          fields={[
            {
              key: "post_id",
              label: "Post",
              type: "select",
              required: true,
              options: posts.map((p) => ({ value: p.id, label: p.name })),
            },
            { key: "company", label: "Company / donor name", required: true },
            { key: "contact_name", label: "Contact person" },
            { key: "email", label: "Email", type: "email" },
            { key: "phone", label: "Phone" },
            {
              key: "sponsorship_value",
              label: "Potential sponsorship amount ($)",
              type: "number",
              min: 0,
              step: 0.01,
            },
          ]}
          initial={{
            post_id: postId === "all" ? posts[0]?.id : postId,
            sponsorship_value: 0,
          }}
          onSubmit={async (v) => {
            const r = await supabase.from("sponsors").insert({
              ...v,
              sponsorship_value: Number(v.sponsorship_value || 0),
              stage: "identified",
            });
            if (r.error) throw r.error;
            await load();
          }}
        />
      )}
      {transition && (
        <SponsorStageForm
          sponsor={transition.sponsor}
          stage={transition.stage}
          onClose={() => setTransition(null)}
          onSaved={() => void save()}
        />
      )}
      {viewing && (
        <SponsorDetailModal
          sponsor={viewing}
          onClose={() => setViewing(null)}
          onUpdated={() => void load()}
        />
      )}
      {collect && (
        <CollectSponsorPayment
          sponsor={collect}
          onClose={() => {
            setCollect(null);
            void load();
          }}
          onSaved={() => void load()}
        />
      )}
      {donation && (
        <RecordPaymentModal
          postId={postId}
          sponsorId={null}
          onClose={() => setDonation(false)}
          onSaved={() => {
            setDonation(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
