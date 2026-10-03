import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function fixture(options = {}) {
  const state = { calls: [], rpcError: null, applied: true, ...options };
  let handler;
  const event = {
    id: "event-test",
    created: 1791030000,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "checkout-test",
        payment_status: "paid",
        currency: "usd",
        amount_total: 49999,
        mode: "payment",
        metadata: { member_id: "member-test", membership_type: "lifetime" },
        payment_intent: "pi-test",
      },
    },
    ...options.event,
  };
  class Stripe {
    webhooks = {
      constructEventAsync: async () => {
        if (state.signatureError) throw new Error("invalid");
        return event;
      },
    };
  }
  const database = {
    rpc: async (name, args) => {
      state.calls.push([name, args]);
      return { data: state.applied, error: state.rpcError };
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        update: () => q,
        single: async () => ({ data: null }),
        then: (resolve) => resolve({ error: state.updateError }),
      };
      return q;
    },
  };
  const js = ts.transpileModule(
    fs
      .readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8")
      .replace(/^import.*$/gm, ""),
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(js, {
    Deno: { env: { get: () => undefined }, serve: (fn) => (handler = fn) },
    Stripe,
    createClient: () => database,
    Response,
    Date,
    console: { warn() {}, error() {} },
    nodemailer: {},
  });
  return {
    state,
    event,
    invoke: () =>
      handler(
        new Request("https://example.test", {
          method: "POST",
          body: "test",
          headers: { "stripe-signature": "test" },
        }),
      ),
  };
}
test("webhook requires Stripe signature verification before touching membership", async () => {
  const f = fixture({ signatureError: true });
  assert.equal((await f.invoke()).status, 400);
  assert.equal(f.state.calls.length, 0);
});
test("unpaid checkout never activates a membership", async () => {
  const f = fixture();
  f.event.data.object.payment_status = "unpaid";
  assert.equal((await f.invoke()).status, 200);
  assert.equal(f.state.calls.length, 0);
});
test("webhook verifies actual USD cents before lifetime fulfillment", async () => {
  const f = fixture();
  f.event.data.object.amount_total = 1;
  assert.equal((await f.invoke()).status, 500);
  assert.equal(f.state.calls.length, 0);
});
test("paid checkout delegates to atomic membership fulfillment with the existing member id", async () => {
  const f = fixture();
  assert.equal((await f.invoke()).status, 200);
  assert.equal(f.state.calls[0][0], "cvoa_fulfill_membership");
  assert.equal(f.state.calls[0][1].p_member, "member-test");
  assert.equal(f.state.calls[0][1].p_type, "lifetime");
});
test("critical persistence failure returns a retryable webhook response", async () => {
  const f = fixture({ rpcError: { message: "database failure" } });
  assert.equal((await f.invoke()).status, 500);
});
test("replayed fulfilled checkout is acknowledged without sending another notification", async () => {
  const f = fixture({ applied: false });
  assert.equal((await f.invoke()).status, 200);
  assert.equal(f.state.calls.length, 1);
});
test("annual subscription invoice uses its paid-through period and persists idempotently", async () => {
  const f = fixture({
    event: {
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "invoice-test",
          billing_reason: "subscription_cycle",
          subscription: "sub-test",
          currency: "usd",
          amount_paid: 4999,
          lines: { data: [{ period: { end: 1822566000 } }] },
        },
      },
    },
  });
  assert.equal((await f.invoke()).status, 200);
  assert.equal(f.state.calls[0][0], "cvoa_renew_subscription");
  assert.equal(f.state.calls[0][1].p_invoice, "invoice-test");
});
