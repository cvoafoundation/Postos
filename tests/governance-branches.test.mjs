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
  await db.exec(fs.readFileSync('supabase/migrations/20261004010000_governance_branches.sql', 'utf8'))
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${uid(5)}','judge1@example.test',now()),('${uid(6)}','judge2@example.test',now()),('${uid(7)}','judge3@example.test',now()); insert into auth.users(id,email,email_confirmed_at) values('${uid(8)}','judge4@example.test',now()),('${uid(9)}','judge5@example.test',now()); insert into public.profiles(id,full_name,email,role) values('${uid(8)}','Judge 4','judge4@example.test','ethics_tribunal'),('${uid(9)}','Judge 5','judge5@example.test','ethics_tribunal'),('${uid(5)}','Judge 1','judge1@example.test','ethics_tribunal'),('${uid(6)}','Judge 2','judge2@example.test','ethics_tribunal'),('${uid(7)}','Judge 3','judge3@example.test','ethics_tribunal');`
  )
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

test('ordinary members cannot certify their own legislative seats', () =>
  as(member, () =>
    assert.rejects(
      db.query(
        `select public.cvoa_certify_delegate('${member}',current_date,(current_date+interval '1 year')::date,'Election record',1,true)`
      ),
      /National certification/
    )
  ))
test('National records an election and member becomes a seated presiding delegate', () =>
  as(national, async () => {
    await db.query(
      `select public.cvoa_certify_delegate('${member}',current_date,(current_date+interval '1 year')::date,'Certified Combat roster and election',1,true)`
    )
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${member}',true)`)
    assert.equal(
      (await db.query('select public.cvoa_is_congress_presiding() as allowed')).rows[0].allowed,
      true
    )
  }))
test('National cannot bypass Congress to mark a draft passed', () =>
  as(national, async () => {
    await db.exec(
      `insert into public.resolutions(id,title,body,submitted_by) values('${uid(401)}','Test','Text','${national}')`
    )
    await assert.rejects(
      db.exec(`update public.resolutions set status='passed' where id='${uid(401)}'`),
      /Congress ballot procedure/
    )
  }))
test('filers cannot retrieve internal Tribunal notes but can track their complaint', () =>
  as(member, async () => {
    await db.exec(
      `insert into public.ethics_complaints(id,complainant_id,respondent_name,category,description) values('${uid(501)}','${member}','Respondent','other','Facts')`
    )
    assert.equal((await db.query('select * from public.ethics_complaints')).rows.length, 0)
    const cases = (await db.query('select public.cvoa_my_ethics_complaints() as cases')).rows[0].cases
    assert.equal(cases.length, 1)
    assert.equal('tribunal_notes' in cases[0], false)
  }))
test('a filer cannot impersonate another complainant or pre-write a decision', () =>
  as(member, async () => {
    await assert.rejects(
      db.exec(
        `insert into public.ethics_complaints(complainant_id,respondent_name,category,description,status,tribunal_notes) values('${national}','Person','other','Facts','resolved','Forged')`
      ),
      /row-level security/
    )
  }))
test('National cannot read or edit Tribunal case records', async () => {
  await db.exec(
    `insert into public.ethics_complaints(id,complainant_id,respondent_name,category,description,tribunal_notes) values('${uid(502)}','${member}','National','other','Facts','Sealed deliberation')`
  )
  await as(national, async () => {
    assert.equal((await db.query('select * from public.ethics_complaints')).rows.length, 0)
    await assert.rejects(db.query(`select public.cvoa_save_ethics_case('${uid(502)}','{}')`), /Non-recused/)
  })
})
test('recused judge loses case access and cannot approve the opinion', () =>
  as(uid(5), async () => {
    await db.query(`select public.cvoa_recuse_ethics('${uid(502)}','Personal conflict')`)
    assert.equal(
      (await db.query(`select * from public.ethics_complaints where id='${uid(502)}'`)).rows.length,
      0
    )
    await assert.rejects(db.query(`select public.cvoa_approve_ethics_opinion('${uid(502)}',2)`), /Non-recused/)
  }))
test('defense notice cannot use less than fourteen days', () =>
  as(uid(5), async () => {
    await assert.rejects(
      db.query(
        `select public.cvoa_save_ethics_case('${uid(502)}','{"record_version":1,"notice_text":"Charges","notice_served_at":"2026-01-01T00:00:00Z","response_due_at":"2026-01-07T00:00:00Z"}')`
      ),
      /14 days/
    )
  }))
test('a single judge cannot issue a sanction and a closed opinion is immutable', async () => {
  await db.exec('begin')
  try {
    await db.exec(
      `select set_config('request.jwt.claim.sub','${uid(5)}',true); set local role authenticated;`
    )
    await db.query(
      `select public.cvoa_save_ethics_case('${uid(502)}','{"record_version":1,"notice_text":"Charges and rights","notice_served_at":"2026-01-01T00:00:00Z","response_due_at":"2026-01-16T00:00:00Z","findings":"Proved facts","governing_provisions":"Article X","rationale":"Clear and convincing evidence","proposed_sanction":"Reprimand","clear_and_convincing":true}')`
    )
    await db.query(`select public.cvoa_approve_ethics_opinion('${uid(502)}',2)`)
    await db.exec('savepoint denied')
    await assert.rejects(
      db.query(`select public.cvoa_publish_ethics_opinion('${uid(502)}',2)`),
      /three independent/
    )
    await db.exec('rollback to savepoint denied')
    for (const judge of [uid(6), uid(7)]) {
      await db.exec(`select set_config('request.jwt.claim.sub','${judge}',true)`)
      await db.query(`select public.cvoa_approve_ethics_opinion('${uid(502)}',2)`)
    }
    await db.query(`select public.cvoa_publish_ethics_opinion('${uid(502)}',2)`)
    await assert.rejects(
      db.query(`select public.cvoa_save_ethics_case('${uid(502)}','{}')`),
      /opinion is preserved/
    )
  } finally {
    await db.exec('rollback')
  }
})

test('National cannot assign itself the Tribunal role through account administration', () =>
  as(national, () =>
    assert.rejects(
      db.exec(`update public.profiles set role='ethics_tribunal' where id='${national}'`),
      /Article X/
    )
  ))
async function withBallot(fn) {
  await db.exec('begin')
  try {
    await db.exec(
      `set local role authenticated;select set_config('request.jwt.claim.sub','${national}',true)`
    )
    await db.query(
      `select public.cvoa_certify_delegate('${member}',current_date,(current_date+interval '1 year')::date,'Certified election',1,true)`
    )
    await db.exec(
      `set local role postgres;insert into public.resolutions(id,title,body,submitted_by,post_id) values('${uid(403)}','Ballot','Text','${member}','${post}');select set_config('request.jwt.claim.sub','${member}',true);set local role authenticated`
    )
    await db.query(
      `select public.cvoa_open_congress_ballot('${uid(403)}',now()+interval '1 day','ordinary','Adopted joint operating rules and session record')`
    )
    await fn()
  } finally {
    await db.exec('rollback')
  }
}
test('formal vote requires own checked-in certified seat; National has no bypass', () =>
  withBallot(async () => {
    await db.exec('savepoint denied')
    await assert.rejects(
      db.exec(
        `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${uid(403)}','delegate_vote','${member}','${post}',true)`
      ),
      /checked-in/
    )
    await db.exec('rollback to savepoint denied')
    await db.query(`select public.cvoa_congress_check_in('${uid(403)}')`)
    await db.exec(
      `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${uid(403)}','delegate_vote','${member}','${post}',true)`
    )
    await db.exec(`select set_config('request.jwt.claim.sub','${national}',true);savepoint denied`)
    await assert.rejects(
      db.exec(
        `insert into public.resolution_votes(resolution_id,vote_type,voter_id,vote) values('${uid(403)}','delegate_vote','${national}',true)`
      ),
      /checked-in/
    )
    await db.exec('rollback to savepoint denied')
  }))
test('vote deadline is enforced and results cannot close early', () =>
  withBallot(async () => {
    await db.exec('savepoint denied')
    await assert.rejects(db.query(`select public.cvoa_close_congress_ballot('${uid(403)}')`), /deadline/)
    await db.exec('rollback to savepoint denied')
    await db.exec(
      `set local role postgres;update public.resolutions set voting_closes_at=now()-interval '1 second' where id='${uid(403)}';set local role authenticated;savepoint denied`
    )
    await assert.rejects(
      db.exec(
        `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${uid(403)}','delegate_vote','${member}','${post}',true)`
      ),
      /open ballot/
    )
    await db.exec('rollback to savepoint denied')
  }))
test('a ballot without chapter quorum records no decision instead of a rejection', () =>
  withBallot(async () => {
    await db.exec(
      `set local role postgres;update public.congress_ballots set closes_at=now()-interval '1 second' where resolution_id='${uid(403)}';set local role authenticated`
    )
    await db.query(`select public.cvoa_close_congress_ballot('${uid(403)}')`)
    assert.equal(
      (await db.query(`select result from public.congress_ballots where resolution_id='${uid(403)}'`)).rows[0]
        .result,
      'no_quorum'
    )
    assert.equal(
      (await db.query(`select status from public.resolutions where id='${uid(403)}'`)).rows[0].status,
      'discussion'
    )
  }))
test('an adopted ballot records actual votes and represented chapters', () =>
  withBallot(async () => {
    await db.query(`select public.cvoa_congress_check_in('${uid(403)}')`)
    await db.exec(
      `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${uid(403)}','delegate_vote','${member}','${post}',true)`
    )
    await db.exec(
      `set local role postgres;update public.congress_ballots set closes_at=now()-interval '1 second' where resolution_id='${uid(403)}';set local role authenticated`
    )
    await db.query(`select public.cvoa_close_congress_ballot('${uid(403)}')`)
    const record = (await db.query(`select * from public.congress_ballots where resolution_id='${uid(403)}'`))
      .rows[0]
    assert.equal(record.result, 'adopted_by_congress')
    assert.equal(record.yes_count, 1)
    assert.equal(record.present_chapters, 1)
  }))

test('stale opinion approvals and edits are rejected',()=>as(uid(5),async()=>{
 await db.query(`select public.cvoa_save_ethics_case('${uid(502)}','{"record_version":1,"findings":"Facts","governing_provisions":"Article X","rationale":"Reasons"}')`);
 await db.exec('savepoint stale');await assert.rejects(db.query(`select public.cvoa_approve_ethics_opinion('${uid(502)}',1)`),/Opinion changed/);await db.exec('rollback to savepoint stale');
 await assert.rejects(db.query(`select public.cvoa_save_ethics_case('${uid(502)}','{"record_version":1}')`),/reload before saving/);
}));
