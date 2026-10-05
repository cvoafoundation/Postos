import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@14.21.0";

// Public donations are accepted only by National-published active campaigns.
// Service-only reservations apply limits; receipts require a saved unguessable Stripe Session ID.
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "",
    allowed = [
      "https://www.cvoa.one",
      "https://cvoa.one",
      "http://localhost:5173",
    ];
  const headers = {
    "Access-Control-Allow-Origin": allowed.includes(origin)
      ? origin
      : "https://www.cvoa.one",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
  const response = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (origin && !allowed.includes(origin))
    return response({ error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return response({ error: "Use POST." }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? Deno.env.get("STRIPE_KEY");
  if (!key)
    return response(
      { error: "Stripe is not configured for this project." },
      503,
    );
  let body;
  try {
    body = await req.json();
  } catch {
    return response({ error: "Invalid request." }, 400);
  }
  if (!body || !["create", "status"].includes(body.action))
    return response({ error: "Invalid action." }, 400);
  const stripe = new Stripe(key, { apiVersion: "2023-10-16" });
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    if (body.action === "status") {
      if (
        typeof body.session_id !== "string" ||
        !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(body.session_id)
      )
        return response({ error: "Invalid payment receipt." }, 400);
      const { data: request, error } = await service
        .from("campaign_checkout_requests")
        .select("id,session_id,status")
        .eq("session_id", body.session_id)
        .single();
      if (error || !request)
        return response({ error: "Campaign receipt not found." }, 404);
      const session = await stripe.checkout.sessions.retrieve(body.session_id);
      if (
        session.metadata?.kind !== "campaign" ||
        session.metadata?.campaign_request_id !== request.id ||
        request.session_id !== session.id
      )
        return response({ error: "Campaign receipt not found." }, 404);
      if (session.payment_status === "paid") {
        const r = await service.rpc("cvoa_campaign_fulfill", {
          p_request: request.id,
          p_session: session.id,
          p_amount: session.amount_total,
          p_currency: session.currency,
          p_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          p_paid_at: new Date().toISOString(),
          p_live: session.livemode,
        });
        if (r.error) throw r.error;
      }
      let refunded = 0;
      if (
        session.payment_status === "paid" &&
        typeof session.payment_intent === "string"
      ) {
        const intent = await stripe.paymentIntents.retrieve(
          session.payment_intent,
          { expand: ["latest_charge"] },
        );
        if (intent.latest_charge && typeof intent.latest_charge !== "string")
          refunded = intent.latest_charge.amount_refunded;
        const r = await service.rpc("cvoa_campaign_refund", {
          p_intent: session.payment_intent,
          p_refunded_cents: refunded,
        });
        if (r.error) throw r.error;
      }
      if (session.status === "expired" && request.status !== "paid")
        await service
          .from("campaign_checkout_requests")
          .update({ status: "expired" })
          .eq("id", request.id)
          .neq("status", "paid");
      return response({
        status:
          session.payment_status === "paid"
            ? "paid"
            : session.status === "expired"
              ? "expired"
              : "pending",
        amount_cents: session.amount_total,
        currency: session.currency,
        refunded_cents: refunded,
        livemode: session.livemode,
      });
    }
    if (
      typeof body.slug !== "string" ||
      typeof body.request_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.slug) ||
      !/^[0-9a-f-]{36}$/i.test(body.request_id) ||
      typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) ||
      body.amount < 1 ||
      body.amount > 999999.99 ||
      Math.round(body.amount * 100) / 100 !== body.amount
    )
      return response(
        {
          error:
            "Enter a donation amount with two decimal places, starting at $1.",
        },
        400,
      );
    const reservation = await service.rpc("cvoa_campaign_request", {
      p_slug: body.slug,
      p_cents: Math.round(body.amount * 100),
      p_id: body.request_id,
    });
    if (reservation.error)
      return response({ error: reservation.error.message }, 403);
    const request = reservation.data;
    if (request.status === "paid")
      return response(
        { error: "This payment has already been received." },
        409,
      );
    if (request.session_id) {
      const existing = await stripe.checkout.sessions.retrieve(
        request.session_id,
      );
      if (existing.status === "open")
        return response({
          url: existing.url,
          session_id: existing.id,
          livemode: existing.livemode,
        });
      return response(
        {
          error:
            existing.status === "complete"
              ? "Payment is complete. Refresh the campaign before collecting another payment."
              : "This link expired. Close this window and create a new payment request.",
        },
        409,
      );
    }
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: request.amount_cents,
              product_data: {
                name: `CVOA campaign: ${request.title}`.slice(0, 250),
              },
            },
            quantity: 1,
          },
        ],
        metadata: { kind: "campaign", campaign_request_id: request.id },
        payment_intent_data: {
          metadata: { kind: "campaign", campaign_request_id: request.id },
        },
        success_url:
          "https://www.cvoa.one/campaign-payment?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://www.cvoa.one/campaign-payment?canceled=1",
      },
      { idempotencyKey: `cvoa-campaign-${request.id}` },
    );
    if (!session.url) throw new Error("Stripe did not return a payment link.");
    const saved = await service
      .from("campaign_checkout_requests")
      .update({
        session_id: session.id,
        url: session.url,
        status: "open",
        livemode: session.livemode,
        expires_at: new Date(session.expires_at * 1000).toISOString(),
      })
      .eq("id", request.id)
      .is("session_id", null)
      .select("id");
    if (saved.error) throw saved.error;
    if (!saved.data?.length) {
      const current = await service
        .from("campaign_checkout_requests")
        .select("session_id")
        .eq("id", request.id)
        .single();
      if (current.error || current.data.session_id !== session.id)
        throw new Error("Payment reservation changed.");
    }
    return response({
      url: session.url,
      session_id: session.id,
      livemode: session.livemode,
    });
  } catch {
    console.error("Campaign checkout could not be completed.");
    return response(
      { error: "Unable to complete this payment request. Please retry." },
      500,
    );
  }
});
