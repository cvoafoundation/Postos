import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { money, edgeError } from "./sponsorship";
export default function SponsorshipPaymentResult() {
  const [params] = useSearchParams(),
    session = params.get("session_id"),
    canceled = params.get("canceled"),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    if (!session || canceled) return;
    supabase.functions
      .invoke("create-sponsorship-checkout", {
        body: { action: "status", session_id: session },
      })
      .then(async (r) => {
        if (!active) return;
        if (r.error) setError(await edgeError(r.error));
        else {
          setResult(r.data);
          if (r.data.status === "pending" && attempt < 5)
            timer = setTimeout(() => setAttempt((a) => a + 1), 3000);
        }
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, canceled, attempt]);
  return (
    <main className="min-h-screen bg-base px-4 py-16">
      <section className="panel p-8 max-w-xl mx-auto space-y-4 text-center">
        <img
          src="/images/cvoa-logo.png"
          alt="CVOA"
          className="w-20 h-20 mx-auto"
        />
        <h1 className="font-display text-3xl">
          {canceled
            ? "Payment not completed"
            : result?.status === "paid"
              ? "Thank you for supporting CVOA"
              : result?.status === "expired"
                ? "Payment link expired"
                : "Confirming your sponsorship payment"}
        </h1>
        <p className="text-muted">
          {canceled
            ? "You have not completed this checkout. Return to the payment link if you would like to continue."
            : result?.status === "paid"
              ? `${money(result.amount_cents / 100)} has been confirmed by Stripe and recorded for the post.${result.refunded_cents ? ` A refund of ${money(result.refunded_cents / 100)} is recorded.` : ""}`
              : result?.status === "expired"
                ? "Ask your CVOA contact for a new payment link."
                : "Your receipt will appear here after Stripe confirms the payment."}
        </p>
        {result?.livemode === false && (
          <p className="text-gold">TEST MODE • No real money was collected.</p>
        )}
        {error && (
          <p role="alert" className="text-status-attention">
            {error}
          </p>
        )}
        {!session && !canceled && <p>No payment receipt was supplied.</p>}
        {session && result?.status !== "paid" && (
          <button
            className="btn-ghost"
            onClick={() => {
              setError("");
              setAttempt((a) => a + 1);
            }}
          >
            Check payment again
          </button>
        )}
        <a href="/" className="text-gold block">
          Return to CVOA.ONE
        </a>
      </section>
    </main>
  );
}
