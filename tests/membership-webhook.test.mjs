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
      if (name === 'cvoa_enqueue_welcome_email') state.queued = true;
      if (name === 'cvoa_claim_welcome_email') return { data: state.sent ? 'sent' : state.queued ? 'claimed' : 'none', error: state.rpcError };
      if (name === 'cvoa_finish_welcome_email') state.sent = args.p_success;
      return { data: state.applied, error: state.rpcError };
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        update: () => q,
        single: async () => ({ data: state.member ?? null }),
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
    Deno: { env: { get: key => state.emailConfigured && ['WORKSPACE_EMAIL', 'WORKSPACE_APP_PASSWORD'].includes(key) ? 'test@example.test' : undefined }, serve: (fn) => (handler = fn) },
    Stripe,
    createClient: () => database,
    Response,
    Date,
    console: { warn() {}, error() {} },
    welcomeAttachments: async () => [{ filename: 'CVOA_Welcome_Letter.pdf' }, { filename: 'CVOA_ONE_Getting_Started_Guide.pdf' }],
    nodemailer: { createTransport: () => ({ sendMail: async mail => { if (mail.attachments && state.smtpFailure) throw new Error('SMTP failed'); state.calls.push(['mail', mail]); }, close() {} }) },
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
  assert.equal(f.state.calls.filter(([name]) => name === 'cvoa_fulfill_membership').length, 1);
  assert.ok(!f.state.calls.some(([name]) => name === 'mail'));
});
test('first membership receives both PDFs and a replay does not resend them', async () => {
  const f = fixture({ emailConfigured: true, member: { full_name: 'Test Member', email: 'member@example.test', joined_at: null } });
  assert.equal((await f.invoke()).status, 200);
  assert.ok(f.state.sent);
  const packets = () => f.state.calls.filter(([name, mail]) => name === 'mail' && mail.attachments);
  assert.equal(packets().length, 1);
  assert.equal(packets()[0][1].attachments.length, 2);
  f.state.applied = false; f.state.member.joined_at = '2026-10-08';
  assert.equal((await f.invoke()).status, 200);
  assert.equal(packets().length, 1);
});
test('welcome failure remains retryable after payment has been fulfilled', async () => {
  const f = fixture({ emailConfigured: true, smtpFailure: true, member: { full_name: 'Test Member', email: 'member@example.test', joined_at: null } });
  assert.equal((await f.invoke()).status, 500);
  assert.equal(f.state.sent, false);
  f.state.smtpFailure = false; f.state.applied = false; f.state.member.joined_at = '2026-10-08';
  assert.equal((await f.invoke()).status, 200);
  assert.equal(f.state.sent, true);
});
test('renewals do not enqueue another welcome packet', async () => {
  const f = fixture({ emailConfigured: true, member: { full_name: 'Test Member', email: 'member@example.test', joined_at: '2026-01-01' } });
  f.event.data.object.metadata.action = 'renew';
  assert.equal((await f.invoke()).status, 200);
  assert.ok(!f.state.calls.some(([name]) => name === 'cvoa_enqueue_welcome_email'));
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
