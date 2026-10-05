import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code = ts
  .transpileModule(
    fs
      .readFileSync(
        "supabase/functions/create-campaign-checkout/index.ts",
        "utf8",
      )
      .replace(/^import .*\n/gm, ""),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  .outputText.replace(/export \{\};?\s*$/, "");
const id = "10000000-0000-0000-0000-000000009950",
  slug = "10000000-0000-0000-0000-000000009951";
function server({
  published = true,
  saved = true,
  paid = false,
  amount = 2500,
  kind = "campaign",
  currency = "usd",
  key = true,
} = {}) {
  let handler;
  const calls = [],
    sessions = [];
  const session = {
    id: "cs_test_campaign",
    url: "https://checkout.stripe.com/example",
    status: paid ? "complete" : "open",
    payment_status: paid ? "paid" : "unpaid",
    amount_total: amount,
    currency,
    payment_intent: "pi_test_campaign",
    metadata: { kind, campaign_request_id: id },
    livemode: false,
    expires_at: 1893456000,
  };
  const Deno = {
    serve: (f) => (handler = f),
    env: {
      get: (n) =>
        n === "STRIPE_SECRET_KEY"
          ? key
            ? "fake-key"
            : undefined
          : n === "STRIPE_KEY"
            ? undefined
            : n,
    },
  };
  const Stripe = function () {
    return {
      checkout: {
        sessions: {
          create: async (args, options) => {
            sessions.push({ args, options });
            return session;
          },
          retrieve: async () => {
            calls.push("stripe.retrieve");
            return session;
          },
        },
      },
      paymentIntents: {
        retrieve: async () => ({ latest_charge: { amount_refunded: 500 } }),
      },
    };
  };
  const createClient = () => ({
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "cvoa_campaign_request")
        return published
          ? {
              data: {
                id,
                campaign_id: "campaign-id",
                title: "Public Fund",
                amount_cents: args.p_cents,
                status: "draft",
                session_id: null,
              },
              error: null,
            }
          : {
              data: null,
              error: { message: "This campaign is not accepting donations." },
            };
      return { data: true, error: null };
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        neq: () => Promise.resolve({ error: null }),
        update: () => q,
        single: async () => ({
          data: saved ? { id, session_id: session.id, status: "open" } : null,
          error: saved ? null : { message: "Missing" },
        }),
        then: (resolve) => resolve({ data: [{ id }], error: null }),
      };
      return q;
    },
  });
  new Function("Deno", "Stripe", "createClient", code)(
    Deno,
    Stripe,
    createClient,
  );
  return {
    calls,
    sessions,
    request: (body) =>
      handler(
        new Request("https://edge.example.test", {
          method: "POST",
          headers: {
            Origin: "https://www.cvoa.one",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      ),
  };
}
const body = { action: "create", slug, request_id: id, amount: 25 };
test("Campaign checkout rejects unpublished campaigns before creating a Stripe session", async () => {
  const s = server({ published: false });
  assert.equal((await s.request(body)).status, 403);
  assert.equal(s.sessions.length, 0);
});
test("Campaign donations use reserved cents, separate metadata and stable idempotency", async () => {
  const s = server();
  assert.equal((await s.request(body)).status, 200);
  const { args, options } = s.sessions[0];
  assert.equal(args.line_items[0].price_data.unit_amount, 2500);
  assert.equal(args.metadata.kind, "campaign");
  assert.equal(args.metadata.campaign_request_id, id);
  assert.equal(options.idempotencyKey, `cvoa-campaign-${id}`);
  assert.match(args.success_url, /campaign-payment/);
});
test("Campaign receipts look up stored sessions before Stripe and do not credit unpaid sessions", async () => {
  const missing = server({ saved: false });
  assert.equal(
    (
      await missing.request({
        action: "status",
        session_id: "cs_test_campaign",
      })
    ).status,
    404,
  );
  assert.equal(missing.calls.includes("stripe.retrieve"), false);
  const unpaid = server();
  assert.equal(
    (await unpaid.request({ action: "status", session_id: "cs_test_campaign" }))
      .status,
    200,
  );
  assert.equal(
    unpaid.calls.some((c) => c.name === "cvoa_campaign_fulfill"),
    false,
  );
});
test("Campaign fulfillment uses Stripe amounts and refunds and rejects unrelated session metadata", async () => {
  const unrelated = server({ paid: true, kind: "sponsorship" });
  assert.equal(
    (
      await unrelated.request({
        action: "status",
        session_id: "cs_test_campaign",
      })
    ).status,
    404,
  );
  const s = server({ paid: true, amount: 4999 });
  assert.equal(
    (await s.request({ action: "status", session_id: "cs_test_campaign" }))
      .status,
    200,
  );
  const receipt = s.calls.find((c) => c.name === "cvoa_campaign_fulfill");
  assert.equal(receipt.args.p_amount, 4999);
  assert.equal(receipt.args.p_intent, "pi_test_campaign");
  assert.equal(
    s.calls.find((c) => c.name === "cvoa_campaign_refund").args
      .p_refunded_cents,
    500,
  );
});
test("Campaign checkout rejects bad amounts and reports missing Stripe configuration", async () => {
  for (const amount of [0, -1, 1.001, 1000000]) {
    const s = server();
    assert.equal((await s.request({ ...body, amount })).status, 400);
    assert.equal(s.sessions.length, 0);
  }
  assert.equal((await server({ key: false }).request(body)).status, 503);
});
const model = ts.transpileModule(
  fs.readFileSync("src/pages/development/model.ts", "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const { nextActions } = await import(
  `data:text/javascript;base64,${Buffer.from(model).toString("base64")}`
);
test("Launch next actions prioritize location approval and required tasks and stay concise", () => {
  const p = {
    plan: {
      stage: "location_review",
      owner_name: "Lead",
      target_date: "2030-01-01",
      services: "Community",
      help_needed: "",
    },
    pending_locations: 1,
    funding: { budget_cents: 10000, remaining_cents: 5000 },
  };
  const actions = nextActions(
    p,
    [
      {
        label: "Opening check",
        required: true,
        complete: false,
        owner_name: "Officer",
      },
    ],
    [],
  );
  assert.match(actions[0], /National: review/);
  assert.match(actions[1], /Opening check/);
  assert.equal(actions.length, 3);
});
