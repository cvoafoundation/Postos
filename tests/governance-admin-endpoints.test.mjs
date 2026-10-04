import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function fixture(endpoint, { targetRole = 'ethics_tribunal', targetError = null, profileError = null, mailConfigured = true } = {}) {
  const source = fs.readFileSync(`supabase/functions/${endpoint}/index.ts`, 'utf8').replace(/^import .*$/gm, '')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const calls = []; let handler
  const client = {
    from() {
      let id, deleting = false
      const query = {
        select() { return query }, eq(_field, value) { id = value; return query },
        delete() { deleting = true; calls.push('profile-delete'); return query },
        single: async () => id === 'caller' ? { data: { role: 'national_commander' } } : { data: targetError ? null : { role: targetRole }, error: targetError },
        then(resolve, reject) { return Promise.resolve({ error: deleting ? profileError : null }).then(resolve, reject) },
      }
      return query
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'caller' } } }),
      admin: {
        generateLink: async () => { calls.push('generate'); throw new Error('Unexpected account creation') },
        deleteUser: async () => { calls.push('auth-delete'); return { error: null } },
      },
    },
  }
  vm.runInNewContext(js, {
    createClient: () => client, nodemailer: { createTransport() { calls.push('mail'); throw new Error('Unexpected mail') } },
    Deno: { env: { get: key => key.startsWith('WORKSPACE_') ? (mailConfigured ? 'test' : undefined) : 'https://example.test' }, serve: fn => { handler = fn } },
    Request, Response, console,
  })
  return { calls, async invoke(body) {
    return handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body) }))
  } }
}
test('National cannot invite a Tribunal member through the privileged endpoint', async () => {
  const f = fixture('invite-user')
  assert.equal((await f.invoke({ role: 'ethics_tribunal', email: 'judge@example.test' })).status, 403)
  assert.deepEqual(f.calls, [])
})
test('unconfigured staff mail fails before creating an account or exposing an invitation', async () => {
  const f = fixture('invite-user', { mailConfigured: false })
  assert.equal((await f.invoke({ role: 'national_staff', email: 'staff@example.test' })).status, 503)
  assert.deepEqual(f.calls, [])
})
test('National cannot delete a Tribunal member through the privileged endpoint', async () => {
  const f = fixture('delete-user')
  assert.equal((await f.invoke({ user_id: 'judge' })).status, 403)
  assert.deepEqual(f.calls, [])
})
test('unverified target accounts cannot be deleted', async () => {
  const f = fixture('delete-user', { targetError: { message: 'unavailable' } })
  assert.equal((await f.invoke({ user_id: 'target' })).status, 400)
  assert.deepEqual(f.calls, [])
})
test('blocked profile deletion cannot proceed to login deletion', async () => {
  const f = fixture('delete-user', { targetRole: 'member', profileError: { message: 'blocked' } })
  assert.equal((await f.invoke({ user_id: 'target' })).status, 409)
  assert.deepEqual(f.calls, ['profile-delete'])
})
