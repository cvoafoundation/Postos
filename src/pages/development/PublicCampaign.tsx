import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { edgeError } from "@/pages/sponsors/sponsorship";
import { money } from "./model";
export default function PublicCampaign() {
  const { slug } = useParams(),
    [campaign, setCampaign] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [amount, setAmount] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef({ id: crypto.randomUUID(), amount: "" });
  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.rpc("cvoa_public_campaign", { p_slug: slug }).then((r) => {
      if (!active) return;
      if (r.error) setError("This campaign could not be loaded.");
      else setCampaign(r.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [slug]);
  async function donate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (request.current.amount !== amount)
        request.current = { id: crypto.randomUUID(), amount };
      const r = await supabase.functions.invoke("create-campaign-checkout", {
        body: {
          action: "create",
          slug,
          request_id: request.current.id,
          amount: Number(amount),
        },
      });
      if (r.error) throw Error(await edgeError(r.error));
      if (!r.data.url) throw Error("Checkout link unavailable.");
      window.location.assign(r.data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-base px-4 py-12">
      <section className="panel max-w-3xl mx-auto p-6 sm:p-10">
        <img
          className="w-24 h-24 mx-auto mb-6"
          src="/images/cvoa-logo.png"
          alt="Combat Veterans of America"
        />
        {loading ? (
          <p role="status">Loading campaign…</p>
        ) : campaign ? (
          <>
            <p className="eyebrow">
              {campaign.post_name} · {campaign.state}
            </p>
            <h1 className="font-display text-4xl mt-3">{campaign.title}</h1>
            <p className="text-sm text-muted mt-3">
              Goal {money(Number(campaign.goal_cents))} · Received{" "}
              {money(Number(campaign.received_cents))} · Target{" "}
              {campaign.deadline}
            </p>
            <progress
              className="w-full my-5"
              aria-label="Campaign funding progress"
              max={Number(campaign.goal_cents)}
              value={Math.max(0, Number(campaign.received_cents))}
            />
            <p className="whitespace-pre-wrap leading-relaxed">
              {campaign.story}
            </p>
            {campaign.status === "active" ? (
              <form
                onSubmit={donate}
                className="mt-8 border-t border-hairline pt-5 space-y-3"
              >
                <h2 className="font-display text-2xl">Support This Campaign</h2>
                <label className="block text-sm">
                  Donation amount (USD)
                  <input
                    required
                    className="input-field mt-2"
                    type="number"
                    min="1"
                    max="999999.99"
                    step=".01"
                    disabled={busy}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <button className="btn-gold" disabled={busy}>
                  {busy ? "Opening Stripe…" : "Donate Securely With Stripe"}
                </button>
                <p className="text-xs text-muted">
                  You will enter payment information on Stripe's secure
                  checkout. CVOA.ONE does not store card numbers.
                </p>
              </form>
            ) : (
              <p className="text-muted mt-6">
                This campaign is {campaign.status} and is not currently
                accepting online donations.
              </p>
            )}
          </>
        ) : (
          <p>This campaign is not publicly available.</p>
        )}
        {error && (
          <p role="alert" className="text-status-attention mt-4">
            {error}
          </p>
        )}
        <a className="text-gold block mt-8" href="/">
          Return to CVOA.ONE
        </a>
      </section>
    </main>
  );
}
