import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@14.21.0";
import { memberBillingCustomer } from "../_shared/memberBilling.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return reply(405, { error: "Use POST to open billing." });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return reply(401, { error: "Please sign in again." });
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user)
      return reply(401, { error: "Please sign in again." });
    const profile = await db
      .from("profiles")
      .select("id,full_name,access_suspended,deleted_at")
      .eq("id", auth.data.user.id)
      .single();
    if (
      profile.error ||
      !profile.data ||
      profile.data.access_suspended ||
      profile.data.deleted_at
    )
      return reply(403, { error: "An active account is required." });
    const memberships = await db
      .from("members")
      .select("id")
      .eq("profile_id", auth.data.user.id)
      .is("deleted_at", null)
      .limit(1);
    if (memberships.error) throw memberships.error;
    if (!memberships.data?.length)
      return reply(409, {
        error:
          "Link your membership before opening billing. Contact National for assistance.",
      });
    const secret =
      Deno.env.get("STRIPE_SECRET_KEY") ?? Deno.env.get("STRIPE_KEY");
    if (!secret)
      return reply(503, {
        error: "Billing is not configured. Contact National for assistance.",
      });
    const stripe = new Stripe(secret, { apiVersion: "2023-10-16" });
    // No member/customer IDs or redirect URLs are accepted from the browser.
    const customer = await memberBillingCustomer(
      db,
      stripe,
      auth.data.user.id,
      auth.data.user.email,
      profile.data.full_name,
    );
    const customerRecord = await stripe.customers.retrieve(customer);
    if (
      customerRecord.deleted ||
      (customerRecord.metadata?.cvoa_profile_id &&
        customerRecord.metadata.cvoa_profile_id !== auth.data.user.id)
    )
      return reply(409, {
        error:
          "Your billing account needs staff assistance before it can be opened.",
      });
    const configurations = await stripe.billingPortal.configurations.list({
      limit: 100,
    });
    let configuration = configurations.data.find(
      (c) => c.active && c.metadata?.cvoa_settings === "v1",
    );
    if (!configuration)
      configuration = await stripe.billingPortal.configurations.create(
        {
          business_profile: { headline: "Manage your CVOA billing" },
          features: {
            customer_update: {
              enabled: true,
              allowed_updates: ["address", "name", "phone"],
            },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
          },
          metadata: { cvoa_settings: "v1" },
        },
        { idempotencyKey: "cvoa-settings-billing-portal-v1" },
      );
    const session = await stripe.billingPortal.sessions.create({
      customer,
      configuration: configuration.id,
      return_url: "https://cvoa.one/settings?billing=returned",
    });
    return reply(200, { url: session.url });
  } catch (error) {
    console.error(
      "Member billing portal failed",
      (error as { type?: string }).type ?? "request_failed",
    );
    return reply(502, {
      error:
        "Could not open secure billing. No payment was taken. Please retry or contact National.",
    });
  }
});
