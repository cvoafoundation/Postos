import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const actor = '00000000-0000-4000-8000-000000000001'
const outsider = '00000000-0000-4000-8000-000000000002'
const member = '00000000-0000-4000-8000-000000000003'
const account = '00000000-0000-4000-8000-000000000004'

test('approval and mail delivery survive retries while preserving scope and account linkage', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
        deleted_at timestamptz, banned_until timestamptz, created_at timestamptz default clock_timestamp());
      create table public.profiles(id uuid primary key, full_name text, email text, role text, post_id uuid,
        deleted_at timestamptz, access_suspended boolean not null default false);
      create table public.members(id uuid primary key, post_id uuid, deleted_at timestamptz,
        dd214_storage_path text, dd214_review_status text, dd214_reviewed_by uuid, dd214_reviewed_at timestamptz,
        email text, full_name text, profile_id uuid, membership_status text, expires_at date);
      create function public.cvoa_service_authorized(uuid,uuid,text) returns boolean language sql as
        $$select $1='${actor}' and $3='manage_post'$$;
      create function public.cvoa_access_enabled() returns boolean language sql as $$select true$$;
      create function public.cvoa_membership_only() returns boolean language sql as $$select false$$;
      create function public.cvoa_can_manage_post(uuid) returns boolean language sql as
        $$select current_setting('test.can_manage',true)='yes'$$;
      grant select on public.members to authenticated;
      insert into public.members(id,dd214_storage_path,dd214_review_status,email,full_name,membership_status)
      values('${member}','original.pdf','pending','example@example.org','Example Member','active');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261108234305_dd214_approval_email.sql', import.meta.url), 'utf8'))

    const single = async (sql, values = []) => (await db.query(sql, values)).rows[0]
    const prepare = async (who, path = null, prior = null) =>
      (await single('select cvoa_prepare_dd214_approval_mail($1,$2,$3,$4) job', [who, member, path, prior])).job
    const finish = async (attempt, sent) =>
      (await single('select cvoa_finish_dd214_approval_mail($1,$2,$3) ok', [member, attempt, sent])).ok

    assert.equal((await prepare(outsider, 'original.pdf', 'pending')).status, 'forbidden')
    assert.equal((await prepare(actor, 'old.pdf', 'pending')).status, 'stale')
    assert.equal((await prepare(actor)).status, 'no_notice')

    const first = await prepare(actor, 'original.pdf', 'pending')
    assert.equal(first.status, 'claimed')
    assert.equal(first.account, 'setup_new')
    assert.equal(first.membership_current, true)
    assert.equal((await prepare(actor, 'original.pdf', 'pending')).status, 'sending')
    assert.equal((await single('select dd214_review_status from public.members')).dd214_review_status, 'verified')

    await db.query('insert into auth.users(id,email) values($1,$2)', [account, 'example@example.org'])
    const link = async (attempt) => (await single('select cvoa_link_dd214_approval_account($1,$2,$3) ok', [member, attempt, account])).ok
    assert.equal(await link(outsider), false)
    assert.equal(await link(first.attempt), true)
    assert.equal(await finish(first.attempt, false), true)

    const retry = await prepare(actor)
    assert.equal(retry.account, 'setup_linked')
    assert.notEqual(retry.attempt, first.attempt)
    assert.equal(await finish(first.attempt, true), false)
    assert.equal(await finish(retry.attempt, true), true)
    assert.equal((await prepare(actor)).status, 'sent')

    await db.exec('set role authenticated')
    assert.equal((await single('select count(member_id)::integer n from public.membership_verification_emails')).n, 0)
    await assert.rejects(db.query('select cvoa_prepare_dd214_approval_mail($1,$2,null,null)', [actor, member]), /permission denied/)
    await db.exec("set test.can_manage = 'yes'")
    assert.equal((await single('select status from public.membership_verification_emails')).status, 'sent')
    await assert.rejects(db.query('select attempt from public.membership_verification_emails'), /permission denied/)
    await db.exec('reset role')

    await db.exec("update public.members set dd214_review_status='pending', dd214_storage_path='replacement.pdf', dd214_reviewed_at=null, membership_status='pending_payment'")
    assert.equal((await prepare(actor)).status, 'no_notice')
    const replacement = await prepare(actor, 'replacement.pdf', 'pending')
    assert.equal(replacement.status, 'claimed')
    assert.equal(replacement.membership_current, false)
    assert.equal(replacement.membership_status, 'pending_payment')
  } finally {
    await db.close()
  }
})
