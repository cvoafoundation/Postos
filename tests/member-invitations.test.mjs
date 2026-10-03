import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync('supabase/functions/invite-member/index.ts', 'utf8').replace(/^import .*$/gm, '')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText

function fixture(overrides = {}) {
  const state = {
    member: { id: 'member-1', email: 'member@example.com', full_name: '<Member>', post_id: 'post-1', profile_id: null },
    caller: { id: 'admin' }, callerProfile: { role: 'national_commander', post_id: null },
    env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', SITE_URL: 'https://cvoa.one', WORKSPACE_EMAIL: 'sender@example.com', WORKSPACE_APP_PASSWORD: 'abcd efgh ijkl mnop' },
    calls: [], profile: null, ...overrides,
  }
  let handler
  const db = (table) => {
    let operation = 'select', payload
    const query = {
      select() { return query }, eq() { return query },
      insert(data) { operation = 'insert'; payload = data; return query },
      update(data) { operation = 'update'; payload = data; return query },
      single() { return Promise.resolve(result()) }, maybeSingle() { return Promise.resolve(result()) },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
    }
    function result() {
      if (operation === 'insert') { state.calls.push(['profile-insert', payload]); return { error: state.profileError ?? null } }
      if (operation === 'update') { state.calls.push(['member-link', payload]); state.member.profile_id = payload.profile_id; return { error: state.linkError ?? null } }
      if (table === 'members') return { data: state.member }
      if (table === 'profiles') return { data: state.profileReads++ === 0 ? state.callerProfile : state.profile }
    }
    return query
  }
  state.profileReads = 0
  const client = {
    from: db,
    auth: {
      getUser: async () => ({ data: { user: state.caller } }),
      admin: {
        getUserById: async () => ({ data: { user: { id: 'user-1', email: state.userEmail ?? state.member.email, email_confirmed_at: state.confirmed ? '2026-01-01' : null } } }),
        generateLink: async (options) => { state.calls.push(['generate', options]); return { data: { user: { id: 'user-1' }, properties: { action_link: 'https://example.supabase.co/auth/v1/verify?token=SECRET' } } } },
        createUser: async (options) => { state.calls.push(['create', options]); return { data: { user: { id: 'user-1' } } } },
      },
    },
  }
  const context = {
    createClient: () => client,
    nodemailer: { createTransport(options) { state.calls.push(['transport', options]); return { async sendMail(mail) { state.calls.push(['mail', mail]); if (state.smtpError) throw state.smtpError } } } },
    Deno: { env: { get: (key) => state.env[key] }, serve: (fn) => { handler = fn } },
    crypto: globalThis.crypto, Response, Request, URL, console: { error() {}, warn() {} },
  }
  vm.runInNewContext(js, context)
  return { state, async invoke(body = { member_id: 'member-1', method: 'email' }, headers = { Authorization: 'Bearer test' }) {
    const response = await handler(new Request('https://example.test', { method: 'POST', headers, body: JSON.stringify(body) }))
    return { status: response.status, body: await response.json() }
  } }
}

test('email setup links target password page and membership is linked before send', async () => {
  const f = fixture(); const result = await f.invoke()
  assert.equal(result.status, 200)
  assert.equal(f.state.calls.find(([name]) => name === 'generate')[1].options.redirectTo, 'https://cvoa.one/set-password')
  assert.ok(f.state.calls.findIndex(([name]) => name === 'member-link') < f.state.calls.findIndex(([name]) => name === 'mail'))
  assert.match(f.state.calls.find(([name]) => name === 'mail')[1].html, /&lt;Member&gt;/)
  assert.equal(f.state.calls.find(([name]) => name === 'transport')[1].auth.pass, 'abcdefghijklmnop')
})
test('missing mail secrets fail before creating an auth user', async () => {
  const f = fixture({ env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', SITE_URL: 'https://cvoa.one', WORKSPACE_EMAIL: 'sender@example.com' } })
  const result = await f.invoke(); assert.equal(result.status, 503); assert.equal(f.state.calls.length, 0)
})
test('Google authentication failure reports actionable error and keeps linkage for retry', async () => {
  const f = fixture({ smtpError: { code: 'EAUTH', responseCode: 535 } }); const result = await f.invoke()
  assert.equal(result.status, 502); assert.equal(result.body.account_created, true)
  assert.match(result.body.error, /new Google App Password/); assert.equal(f.state.member.profile_id, 'user-1')
})
test('linked unconfirmed accounts can receive another invitation without overwriting profile', async () => {
  const f = fixture({ profile: { id: 'user-1' } }); f.state.member.profile_id = 'user-1'
  assert.equal((await f.invoke()).status, 200)
  assert.equal(f.state.calls.find(([name]) => name === 'generate')[1].type, 'invite')
  assert.ok(!f.state.calls.some(([name]) => name === 'profile-insert'))
})
test('linked confirmed accounts receive recovery link', async () => {
  const f = fixture({ confirmed: true, profile: { id: 'user-1' } }); f.state.member.profile_id = 'user-1'
  assert.equal((await f.invoke()).status, 200)
  assert.equal(f.state.calls.find(([name]) => name === 'generate')[1].type, 'recovery')
})
test('roster email mismatch does not send to another identity', async () => {
  const f = fixture({ userEmail: 'different@example.com' }); f.state.member.profile_id = 'user-1'
  assert.equal((await f.invoke()).status, 409); assert.equal(f.state.calls.length, 0)
})
test('anonymous requests are rejected', async () => {
  const f = fixture(); assert.equal((await f.invoke(undefined, {})).status, 401); assert.equal(f.state.calls.length, 0)
})
test('plain member cannot invite', async () => {
  const f = fixture({ callerProfile: { role: 'member' } }); assert.equal((await f.invoke()).status, 403)
})
test('post officer cannot invite unassigned or other-post members', async () => {
  for (const postId of [null, 'post-2']) {
    const f = fixture({ callerProfile: { role: 'post_officer', post_id: postId } })
    assert.equal((await f.invoke()).status, 403); assert.equal(f.state.calls.length, 0)
  }
})
test('database linkage failure prevents delivery', async () => {
  const f = fixture({ linkError: { message: 'database unavailable' } })
  assert.equal((await f.invoke()).status, 500); assert.ok(!f.state.calls.some(([name]) => name === 'mail'))
})
test('manual creation uses strong random password and sends no email', async () => {
  const f = fixture(); const result = await f.invoke({ member_id: 'member-1', method: 'manual' })
  assert.equal(result.status, 200); assert.match(result.body.temp_password, /^Cvoa![0-9a-f]{32}$/)
  assert.ok(!f.state.calls.some(([name]) => name === 'mail'))
})
test('manual creation cannot reset a linked account', async () => {
  const f = fixture(); f.state.member.profile_id = 'user-1'
  assert.equal((await f.invoke({ member_id: 'member-1', method: 'manual' })).status, 409)
  assert.equal(f.state.calls.length, 0)
})
test('function response errors expose the server message', async () => {
  const source = fs.readFileSync('src/lib/functionErrors.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const context = { exports: {}, Response }; vm.runInNewContext(code, context)
  const response = new Response(JSON.stringify({ error: 'Google rejected credentials' }), { status: 502 })
  assert.equal(await context.exports.getFunctionError({ context: response, message: 'non-2xx' }), 'Google rejected credentials')
  assert.equal(response.bodyUsed, false)
})
