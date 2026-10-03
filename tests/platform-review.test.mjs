import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)

function moduleFrom(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const context = { exports: {}, Error, Response, console }
  vm.runInNewContext(js, context)
  return context.exports
}
const { readAllRows } = moduleFrom('src/lib/readAllRows.ts')
test('administrative reads include records beyond the default 1,000 row limit', async () => {
  const input = Array.from({ length: 1207 }, (_, id) => ({ id }))
  const result = await readAllRows(() => ({ range: async (start, end) => ({ data: input.slice(start, end + 1) }) }))
  assert.equal(result.length, 1207)
  assert.equal(result.at(-1).id, 1206)
})
test('a failed later page is surfaced instead of presenting a partial roster as complete', async () => {
  await assert.rejects(readAllRows(() => ({ range: async (start) => start ? { error: { message: 'access denied' } } : { data: Array(500).fill({}) } })), /access denied/)
})
test('empty administrative lists stop after one request', async () => {
  let requests = 0
  const result = await readAllRows(() => ({ range: async () => { requests++; return { data: [] } } }))
  assert.equal(result.length, 0); assert.equal(requests, 1)
})

function edgeFixture(file, options = {}) {
  const state = {
    env: { STRIPE_SECRET_KEY: 'test-only', SITE_URL: 'https://cvoa.one', SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only' },
    member: { id: 'member-1', membership_type: 'lifetime', post_id: null, stripe_subscription_id: 'sub-1' },
    caller: { role: 'national_commander', post_id: null }, user: { id: 'admin' }, calls: [], ...options,
  }
  let handler
  const query = (table) => {
    let operation = 'select', payload
    const q = {
      select() { return q }, eq() { return q },
      insert(data) { operation = 'insert'; payload = data; return q },
      update(data) { operation = 'update'; payload = data; return q },
      single() { return Promise.resolve(result()) },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
    }
    function result() {
      if (operation === 'select') return { data: table === 'profiles' ? state.caller : state.member }
      state.calls.push([table, operation, payload])
      return { error: operation === 'insert' ? state.paymentError ?? null : state.updateError ?? null }
    }
    return q
  }
  class Stripe {
    checkout = { sessions: {
      create: async (payload) => { state.calls.push(['checkout', payload]); return { id: 'session-1', url: 'https://checkout.stripe.com/test-only' } },
      expire: async (id) => { state.calls.push(['expire', id]) },
    } }
    subscriptions = { cancel: async (id) => { state.calls.push(['cancel', id]); if (state.stripeError) throw state.stripeError } }
  }
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, '')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  vm.runInNewContext(js, {
    createClient: () => ({ from: query, auth: { getUser: async () => ({ data: { user: state.user } }) } }),
    Stripe, Deno: { env: { get: (key) => state.env[key] }, serve: (fn) => { handler = fn } }, Response, Request, URL, console,
  })
  return { state, async invoke(body, headers = { Authorization: 'Bearer test-only' }, method = 'POST') {
    const response = await handler(new Request('https://example.test', { method, headers, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }))
    return { status: response.status, body: await response.json() }
  } }
}
test('displayed membership prices agree with Stripe checkout cents', () => {
  const { MEMBERSHIP_PRICES } = moduleFrom('src/lib/types.ts')
  assert.equal(MEMBERSHIP_PRICES.lifetime, 499.99)
  assert.equal(Math.round(MEMBERSHIP_PRICES.lifetime * 100), 49999)
  assert.equal(Math.round(MEMBERSHIP_PRICES.annual * 100), 4999)
})
const checkoutFile = 'supabase/functions/create-membership-checkout/index.ts'
const cancelFile = 'supabase/functions/cancel-membership-subscription/index.ts'
test('lifetime checkout sends exactly 49,999 cents to Stripe and ignores browser amounts and auto-renew', async () => {
  const f = edgeFixture(checkoutFile)
  assert.equal((await f.invoke({ member_id: 'member-1', membership_type: 'lifetime', amount: 1, auto_renew: true })).status, 200)
  const payload = f.state.calls.find(([name]) => name === 'checkout')[1]
  assert.equal(payload.mode, 'payment')
  assert.equal(payload.line_items[0].price_data.unit_amount, 49999)
  assert.equal(payload.line_items[0].price_data.currency, 'usd')
  assert.equal(f.state.calls.find(([name, operation]) => name === 'membership_payments' && operation === 'insert')[2].amount, 499.99)
})
test('annual auto-renew uses a yearly subscription for exactly 4,999 cents', async () => {
  const f = edgeFixture(checkoutFile, { member: { membership_type: 'annual', post_id: null } })
  assert.equal((await f.invoke({ member_id: 'member-1', membership_type: 'annual', auto_renew: true })).status, 200)
  const payload = f.state.calls.find(([name]) => name === 'checkout')[1]
  assert.equal(payload.mode, 'subscription'); assert.equal(payload.line_items[0].price_data.unit_amount, 4999)
  assert.equal(payload.line_items[0].price_data.recurring.interval, 'year')
})
test('checkout validates saved membership type before creating a Stripe session', async () => {
  const f = edgeFixture(checkoutFile)
  assert.equal((await f.invoke({ member_id: 'member-1', membership_type: 'annual' })).status, 409)
  assert.equal(f.state.calls.length, 0)
})
test('malformed and prototype-name membership types are rejected', async () => {
  const f = edgeFixture(checkoutFile)
  assert.equal((await f.invoke('{')).status, 400)
  assert.equal((await f.invoke({ member_id: 'member-1', membership_type: '__proto__' })).status, 400)
})
test('unrecorded checkouts are expired before a customer can pay', async () => {
  const f = edgeFixture(checkoutFile, { paymentError: { message: 'database unavailable' } })
  assert.equal((await f.invoke({ member_id: 'member-1', membership_type: 'lifetime' })).status, 500)
  assert.ok(f.state.calls.some(([name]) => name === 'expire'))
})
test('existing STRIPE_KEY configuration remains supported', async () => {
  const f = edgeFixture(checkoutFile, { env: { STRIPE_KEY: 'test-only', SITE_URL: 'https://cvoa.one' } })
  assert.equal((await f.invoke({ member_id: 'member-1', membership_type: 'lifetime' })).status, 200)
})
test('anonymous cancellation is rejected without Stripe or database writes', async () => {
  const f = edgeFixture(cancelFile)
  assert.equal((await f.invoke({ member_id: 'member-1' }, {})).status, 401)
  assert.equal(f.state.calls.length, 0)
})
test('ordinary members cannot cancel another membership subscription', async () => {
  const f = edgeFixture(cancelFile, { caller: { role: 'member', post_id: 'post-1' } })
  assert.equal((await f.invoke({ member_id: 'member-1' })).status, 403); assert.equal(f.state.calls.length, 0)
})
test('post officers cannot cancel unassigned or other-post subscriptions', async () => {
  for (const post_id of [null, 'post-2']) {
    const f = edgeFixture(cancelFile, { caller: { role: 'post_officer', post_id: 'post-1' }, member: { post_id, stripe_subscription_id: 'sub-1' } })
    assert.equal((await f.invoke({ member_id: 'member-1' })).status, 403); assert.equal(f.state.calls.length, 0)
  }
})
test('own-post officers can stop future charges without changing membership expiry', async () => {
  const f = edgeFixture(cancelFile, { caller: { role: 'post_officer', post_id: 'post-1' }, member: { post_id: 'post-1', stripe_subscription_id: 'sub-1' } })
  assert.equal((await f.invoke({ member_id: 'member-1' })).status, 200)
  assert.ok(f.state.calls.some(([name]) => name === 'cancel'))
  const patch = f.state.calls.find(([name, operation]) => name === 'members' && operation === 'update')[2]
  assert.deepEqual(Object.keys(patch).sort(), ['auto_renew', 'stripe_subscription_id'])
})
test('Stripe cancellation failure preserves auto-renew records for retry', async () => {
  const f = edgeFixture(cancelFile, { stripeError: { code: 'api_connection_error' } })
  assert.equal((await f.invoke({ member_id: 'member-1' })).status, 502)
  assert.equal(f.state.calls.some(([name]) => name === 'members'), false)
})
test('an already removed subscription can be reconciled safely', async () => {
  const f = edgeFixture(cancelFile, { stripeError: { code: 'resource_missing' } })
  assert.equal((await f.invoke({ member_id: 'member-1' })).status, 200)
})
test('database cancellation failures are surfaced for reconciliation', async () => {
  const f = edgeFixture(cancelFile, { updateError: { message: 'failed' } })
  assert.equal((await f.invoke({ member_id: 'member-1' })).status, 500)
})

function renderGuard(role, allowNational = true) {
  const js = ts.transpileModule(fs.readFileSync('src/components/layout/RoleGuard.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const context = { exports: {}, require: (name) => name === '@/context/AuthContext' ? { useAuth: () => ({ loading: false, isNational: role === 'national_commander', hasRole: (...roles) => roles.includes(role) }) } : require(name) }
  vm.runInNewContext(js, context)
  return renderToStaticMarkup(context.exports.RoleGuard({ roles: ['ethics_tribunal'], allowNational, children: 'CONFIDENTIAL_INBOX' }))
}
test('the confidential tribunal guard does not allow a National override', () => {
  assert.equal(renderGuard('national_commander', false).includes('CONFIDENTIAL_INBOX'), false)
  assert.equal(renderGuard('ethics_tribunal', false), 'CONFIDENTIAL_INBOX')
})
test('standard administrative guards still allow National access', () => {
  assert.equal(renderGuard('national_commander'), 'CONFIDENTIAL_INBOX')
  assert.equal(renderGuard('member', false).includes('CONFIDENTIAL_INBOX'), false)
})
