import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const uid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const national = uid(1),
  officer = uid(2),
  member = uid(3),
  guest = uid(4),
  post = uid(101),
  otherPost = uid(102),
  memberRow = uid(201),
  application = uid(301)
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;`)
  let schema = fs
    .readFileSync('supabase/schema.sql', 'utf8')
    .replace('create extension if not exists "uuid-ossp";', '')
    .replace("'guest_applicant'\n);", "'guest_applicant', 'ethics_tribunal'\n);")
  await db.exec(schema)
  await db.exec(`alter table public.profiles add column title text;`)
  await db.exec(`grant select,insert,update,delete on all tables in schema public to anon,authenticated,service_role; grant usage on all sequences in schema public to anon,authenticated,service_role;
 insert into auth.users(id,email,email_confirmed_at) values('${national}','national@example.test',now()),('${officer}','officer@example.test',now()),('${member}','member@example.test',now()),('${guest}','guest@example.test',now());
 insert into public.posts(id,name,state,status) values('${post}','Post A','IN','active_post'),('${otherPost}','Post B','OH','active_post');
 insert into public.profiles(id,full_name,email,role,post_id) values('${national}','National','national@example.test','national_commander',null),('${officer}','Officer','officer@example.test','post_commander','${post}'),('${member}','Member','member@example.test','member','${post}'),('${guest}','Guest','guest@example.test','guest_applicant',null);
 insert into public.members(id,post_id,profile_id,full_name,email,membership_status) values('${memberRow}','${post}','${member}','Member','member@example.test','active');
 insert into public.post_role_applications(id,member_id,post_id,requested_role) values('${application}','${memberRow}','${post}','post_officer');
 create policy members_select_own on public.members for select using(profile_id=auth.uid());`)
  await db.exec(fs.readFileSync('supabase/migrations/20261003185000_live_permission_hardening.sql', 'utf8'))
  // Compile the entire coordinated release against the full public schema.
  await db.exec(fs.readFileSync('supabase/migrations/20261003190000_organization_workspaces.sql', 'utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/20261004140000_national_dashboard.sql', 'utf8'))
})
after(() => db.close())
async function as(user, fn, role = 'authenticated') {
  await db.exec('begin')
  try {
    await db.exec(
      `set local role ${role}; select set_config('request.jwt.claim.sub','${user ?? ''}',true),set_config('request.jwt.claim.role','${role}',true)`
    )
    await fn()
  } finally {
    await db.exec('rollback')
  }
}

async function dashboard() {
  return (await db.query('select public.cvoa_national_dashboard() as data')).rows[0].data
}
test('dashboard rejects non-National accounts and anonymous callers', async () => {
  for (const user of [officer, member, guest, null]) {
    await as(user, () => assert.rejects(dashboard(), /National dashboard access/))
  }
  await as(null, () => assert.rejects(dashboard(), /permission denied/), 'anon')
})
test('empty financial sources return zero, not null or invented income', () =>
  as(national, async () => {
    const { metrics, posts, activity } = await dashboard()
    assert.equal(metrics.totalMembers, 1)
    assert.equal(metrics.activePosts, 2)
    assert.equal(metrics.thisMonthReceipts, 0)
    assert.equal(metrics.collectedSponsorships, 0)
    assert.equal(posts.length, 2)
    assert.deepEqual(activity, [])
  }))
test('National totals and map include more than 1000 rows', () =>
  as(national, async () => {
    await db.exec('reset role')
    await db.exec(`insert into public.posts(name,state,status) select 'Forming '||n,'IN','charter_ready' from generate_series(1,1101) n;
  insert into public.members(full_name,email,membership_status) select 'Member '||n,'bulk'||n||'@example.test','active' from generate_series(1,1101) n;
  set local role authenticated;`)
    const { metrics, posts } = await dashboard()
    assert.equal(metrics.totalMembers, 1102)
    assert.equal(metrics.charterReady, 1101)
    assert.equal(metrics.developingPosts, 1101)
    assert.equal(posts.length, 1103)
  }))
test('promised sponsorships and actual collected receipts remain separate', () =>
  as(national, async () => {
    await db.exec('reset role')
    await db.exec(`insert into public.sponsors(id,company,stage,sponsorship_value) values('${uid(601)}','Committed Sponsor','won',5000);
  insert into public.sponsor_payments(sponsor_id,amount,payment_date) values('${uid(601)}',125.50,(now() at time zone 'America/New_York')::date);
  insert into public.sponsor_payments(donor_name,amount,payment_date) values('Donor',25,(now() at time zone 'America/New_York')::date),('Future',999,(now() at time zone 'America/New_York')::date+30);
  insert into public.membership_payments(membership_type,amount,status,paid_at) values('lifetime',499.99,'paid',now()),('annual',50,'pending',now()),('annual',50,'failed',now());
  set local role authenticated;`)
    const { metrics } = await dashboard()
    assert.equal(metrics.committedSponsorships, 5000)
    assert.equal(metrics.collectedSponsorships, 125.5)
    assert.equal(metrics.thisMonthReceipts, 650.49)
  }))
test('dues near month boundaries use Eastern Time and count only paid receipts', () =>
  as(national, async () => {
    await db.exec('reset role')
    await db.exec(`insert into public.membership_payments(membership_type,amount,status,paid_at)
  values('annual',10,'paid',date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York'),
  ('annual',20,'paid',(date_trunc('month',now() at time zone 'America/New_York') at time zone 'America/New_York')-interval '1 second');
  set local role authenticated;`)
    const { metrics } = await dashboard()
    assert.equal(metrics.thisMonthReceipts, 10)
    assert.equal(metrics.lastMonthReceipts, 20)
  }))
test('legacy records and future published meetings do not satisfy published-minutes requirements', () =>
  as(national, async () => {
    await db.exec('reset role')
    await db.exec(`insert into public.meeting_records(post_id,title,meeting_date,minutes_text) values('${post}','Legacy',current_date,'Minutes');
  insert into public.uro_meetings(post_id,title,meeting_date,status) values('${post}','Future',current_date+30,'published'),('${otherPost}','Recent',current_date-1,'published');
  set local role authenticated;`)
    assert.equal((await dashboard()).metrics.overdueOnMinutes, 1)
    const queue = (await db.query('select public.cvoa_action_queue() as data')).rows[0].data
    assert.equal(queue.items.filter((i) => i.kind === 'minutes').length, 1)
    assert.match(queue.items.find((i) => i.kind === 'minutes').path, /\/meetings\?post=/)
  }))
test('unfinished past minutes count once per post and link to their meeting', () =>
  as(national, async () => {
    await db.exec('reset role')
    await db.exec(`insert into public.uro_meetings(id,post_id,title,meeting_date,status) values('${uid(701)}','${post}','Draft 1',current_date-1,'in_progress'),('${uid(702)}','${post}','Draft 2',current_date-2,'in_progress'),('${uid(703)}','${otherPost}','Future draft',current_date+2,'in_progress');
  insert into public.uro_meetings(post_id,title,meeting_date,status) values('${post}','Recent',current_date-1,'published'),('${otherPost}','Recent',current_date-1,'published');
  set local role authenticated;`)
    assert.equal((await dashboard()).metrics.overdueOnMinutes, 1)
    const queue = (await db.query('select public.cvoa_action_queue() as data')).rows[0].data
    const items = queue.items.filter((i) => i.kind === 'minutes')
    assert.equal(items.length, 2)
    assert.ok(items.every((i) => i.path.startsWith('/meetings/uro/')))
  }))
test('shared minutes helper remains scoped to a post officer', () =>
  as(officer, async () => {
    const rows = (await db.query('select * from public.cvoa_posts_needing_minutes()')).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].post_id, post)
    const queue = (await db.query('select public.cvoa_action_queue() as data')).rows[0].data
    assert.ok(queue.items.filter((i) => i.kind === 'minutes').every((i) => i.path.includes(post)))
  }))
