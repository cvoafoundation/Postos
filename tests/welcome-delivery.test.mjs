import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('welcome delivery grants, leases, failure retry and completion execute in PostgreSQL', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.members(id uuid primary key);
      insert into public.members values ('00000000-0000-0000-0000-000000000001');`)
    await db.exec(fs.readFileSync('supabase/migrations/20261008132330_membership_welcome_delivery.sql', 'utf8'))
    const member = '00000000-0000-0000-0000-000000000001'
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from public.member_welcome_emails'), /permission denied/)
    await assert.rejects(db.query('select public.cvoa_enqueue_welcome_email($1,$2)', [member, 'checkout-1']), /permission denied/)
    await db.exec('set role service_role')
    await db.query('select public.cvoa_enqueue_welcome_email($1,$2)', [member, 'checkout-1'])
    await db.query('select public.cvoa_enqueue_welcome_email($1,$2)', [member, 'checkout-1'])
    const claim = async session => (await db.query('select public.cvoa_claim_welcome_email($1,$2) as state', [member, session])).rows[0].state
    assert.equal(await claim('checkout-2'), 'none')
    assert.equal(await claim('checkout-1'), 'claimed')
    assert.equal(await claim('checkout-1'), 'busy')
    await db.query('select public.cvoa_finish_welcome_email($1,$2,false)', [member, 'checkout-1'])
    assert.equal(await claim('checkout-1'), 'claimed')
    await db.query('select public.cvoa_finish_welcome_email($1,$2,true)', [member, 'checkout-1'])
    assert.equal(await claim('checkout-1'), 'sent')
    const rows = (await db.query('select * from public.member_welcome_emails')).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].attempts, 2)
    assert.ok(rows[0].sent_at)
  } finally { await db.close() }
})
