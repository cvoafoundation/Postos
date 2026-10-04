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
  await db.exec(fs.readFileSync('supabase/migrations/20261004150000_application_pipeline.sql', 'utf8'))
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

const app = uid(801)
async function seed(status = 'new_inquiry', ready = false) {
  await db.exec('reset role')
  await db.exec(
    `insert into public.post_applications(id,name,email,city,state,status,applicant_profile_id,dd214_storage_path,dd214_review_status) values('${app}','Candidate','member@example.test','Terre Haute','IN','${status}','${member}','test.pdf','${ready ? 'verified' : 'pending'}');`
  )
  if (ready)
    await db.exec(`insert into public.vetting_interviews(application_id,scheduled_at,interviewer_id,notes,completed_at) values('${app}',now()-interval '1 day','${national}','Interview findings',now());
  insert into public.vetting_scorecards(application_id,scored_by,leadership_score,communication_score,professionalism_score,reliability_score,mission_alignment_score) values('${app}','${national}',7,8,9,8,7);
  insert into public.application_signoffs(application_id,profile_id) values('${app}','${national}');`)
  await db.exec('set local role authenticated')
}
async function move(expected, next) {
  return db.query(
    `select public.cvoa_move_application('${app}',$1::public.post_status,$2::public.post_status,'Recorded next steps') as data`,
    [expected, next]
  )
}
async function recoverFailure(fn, pattern) {
  await db.exec('savepoint blocked')
  await assert.rejects(fn(), pattern)
  await db.exec('rollback to savepoint blocked')
}
test('only National can read pipeline evidence or move applicants', () =>
  as(member, async () => {
    await seed()
    await recoverFailure(() => db.query('select public.cvoa_application_pipeline()'), /National pipeline/)
    await recoverFailure(() => move('new_inquiry', 'application_submitted'), /National transition/)
  }))
test('public intake cannot forge approved stages, linked posts or verified documents', () =>
  as(member, async () => {
    await recoverFailure(
      () =>
        db.exec(
          `insert into public.post_applications(name,email,state,status) values('Fake','member@example.test','IN','approved')`
        ),
      /unreviewed inquiry/
    )
    await recoverFailure(
      () =>
        db.exec(
          `insert into public.post_applications(name,email,state,dd214_review_status) values('Fake','member@example.test','IN','verified')`
        ),
      /unreviewed inquiry/
    )
  }))
test('direct National writes cannot bypass the guided status transition', () =>
  as(national, async () => {
    await seed()
    await recoverFailure(
      () => db.exec(`update public.post_applications set status='approved' where id='${app}'`),
      /guided application transition/
    )
    assert.equal(
      (await db.query(`select status from public.post_applications where id='${app}'`)).rows[0].status,
      'new_inquiry'
    )
  }))
test('normal intake advances one stage and creates applicant-visible next steps', () =>
  as(national, async () => {
    await seed()
    await move('new_inquiry', 'application_submitted')
    assert.equal(
      (await db.query(`select status from public.post_applications where id='${app}'`)).rows[0].status,
      'application_submitted'
    )
    assert.equal(
      (
        await db.query(
          `select count(*) from public.post_application_stage_events where application_id='${app}'`
        )
      ).rows[0].count,
      1
    )
    await db.exec(`select set_config('request.jwt.claim.sub','${member}',true)`)
    const tracked = (await db.query('select public.cvoa_my_applications() as data')).rows[0].data
    assert.equal(tracked[0].updates[0].kind, 'feedback')
    assert.match(tracked[0].updates[0].message, /Recorded next steps/)
    assert.equal('assigned_reviewer_id' in tracked[0], false)
  }))
test('stage skipping and stale stage retries are rejected', () =>
  as(national, async () => {
    await seed()
    await recoverFailure(() => move('new_inquiry', 'approved'), /one stage/)
    await move('new_inquiry', 'application_submitted')
    await recoverFailure(() => move('new_inquiry', 'application_submitted'), /Application changed/)
  }))
test('interview stages require verified documents and recorded completion', () =>
  as(national, async () => {
    await seed('application_submitted')
    await recoverFailure(() => move('application_submitted', 'interview_scheduled'), /verify the DD214/)
    await db.exec(`update public.post_applications set dd214_review_status='verified' where id='${app}'`)
    await recoverFailure(() => move('application_submitted', 'interview_scheduled'), /Schedule the interview/)
    await db.query(
      `select public.cvoa_record_application_interview('${app}',null,now()-interval '1 day','${national}','Planned questions',false)`
    )
    await move('application_submitted', 'interview_scheduled')
    await recoverFailure(() => move('interview_scheduled', 'vetting'), /completed interview/)
    const interview = (
      await db.query(`select id from public.vetting_interviews where application_id='${app}'`)
    ).rows[0].id
    await db.query(
      `select public.cvoa_record_application_interview('${app}',$1,now()-interval '1 day','${national}','Actual findings',true)`,
      [interview]
    )
    await move('interview_scheduled', 'vetting')
  }))
test('future or undocumented interviews cannot be marked completed', () =>
  as(national, async () => {
    await seed('application_submitted')
    await recoverFailure(
      () =>
        db.query(
          `select public.cvoa_record_application_interview('${app}',null,now()+interval '1 day','${national}','Notes',true)`
        ),
      /past date and written notes/
    )
    await recoverFailure(
      () =>
        db.query(
          `select public.cvoa_record_application_interview('${app}',null,now()-interval '1 day','${national}','',true)`
        ),
      /past date and written notes/
    )
  }))
test('approval requires full scorecards and all current National sign-offs', () =>
  as(national, async () => {
    await seed('vetting', true)
    await db.exec('reset role')
    await db.exec(`insert into auth.users(id,email) values('${uid(8)}','second@example.test'); insert into public.profiles(id,full_name,email,role) values('${uid(8)}','Second reviewer','second@example.test','national_staff');
  insert into public.application_signoffs(application_id,profile_id) values('${app}','${officer}'); set local role authenticated;`)
    await recoverFailure(() => move('vetting', 'approved'), /Every current National/)
    await db.exec(
      `reset role; insert into public.application_signoffs(application_id,profile_id) values('${app}','${uid(8)}'); set local role authenticated;`
    )
    await db.exec(
      `delete from public.vetting_scorecards where application_id='${app}'; insert into public.vetting_scorecards(application_id,leadership_score) values('${app}',5);`
    )
    await recoverFailure(() => move('vetting', 'approved'), /five scorecard/)
    await db.exec(
      `update public.vetting_scorecards set communication_score=5,professionalism_score=5,reliability_score=5,mission_alignment_score=5 where application_id='${app}'`
    )
    await move('vetting', 'approved')
  }))
test('forming post creation is atomic and stale double-clicks cannot create duplicates', () =>
  as(national, async () => {
    await seed('approved', true)
    const result = (await move('approved', 'founding_team_building')).rows[0].data
    assert.ok(result.post_id)
    assert.equal(
      (await db.query(`select count(*) from public.posts where id=$1`, [result.post_id])).rows[0].count,
      1
    )
    assert.equal(
      (
        await db.query(
          `select count(*) from public.founding_team_members where post_id=$1 and position='commander'`,
          [result.post_id]
        )
      ).rows[0].count,
      1
    )
    await recoverFailure(() => move('approved', 'founding_team_building'), /Application changed/)
    assert.equal(
      (await db.query(`select count(*) from public.posts where status='founding_team_building'`)).rows[0]
        .count,
      1
    )
  }))
test('a failing commander-record insert rolls back the post and status together', () =>
  as(national, async () => {
    await seed('approved', true)
    await db.exec(
      `reset role; create function public.test_block_commander() returns trigger language plpgsql as $$begin raise exception 'Simulated insertion failure'; end$$; create trigger test_block_commander before insert on public.founding_team_members for each row execute function public.test_block_commander(); set local role authenticated;`
    )
    await recoverFailure(() => move('approved', 'founding_team_building'), /Simulated insertion failure/)
    assert.equal(
      (await db.query(`select post_id,status from public.post_applications where id='${app}'`)).rows[0]
        .post_id,
      null
    )
    assert.equal(
      (await db.query(`select status from public.post_applications where id='${app}'`)).rows[0].status,
      'approved'
    )
    assert.equal(
      (await db.query(`select count(*) from public.posts where status='founding_team_building'`)).rows[0]
        .count,
      0
    )
  }))
test('handoff assignments are role-checked and versioned against stale edits', () =>
  as(national, async () => {
    await seed()
    await recoverFailure(
      () =>
        db.query(
          `select public.cvoa_save_application_handoff('${app}',1,'${member}','Call applicant',current_date)`
        ),
      /National reviewer/
    )
    await db.query(
      `select public.cvoa_save_application_handoff('${app}',1,'${national}','Call applicant',current_date)`
    )
    await recoverFailure(
      () =>
        db.query(
          `select public.cvoa_save_application_handoff('${app}',1,'${national}','Overwrite',current_date)`
        ),
      /Application changed/
    )
    assert.equal(
      (await db.query(`select next_action from public.post_applications where id='${app}'`)).rows[0]
        .next_action,
      'Call applicant'
    )
  }))
test('linked application launch stages follow the post workspace', () =>
  as(national, async () => {
    await seed('approved', true)
    const postId = (await move('approved', 'founding_team_building')).rows[0].data.post_id
    await recoverFailure(() => move('founding_team_building', 'charter_ready'), /linked post workspace/)
    await db.query(`update public.posts set status='charter_ready' where id=$1`, [postId])
    assert.equal(
      (await db.query(`select status from public.post_applications where id='${app}'`)).rows[0].status,
      'charter_ready'
    )
  }))

test('pipeline summaries return record evidence without treating stage labels as completion', () =>
  as(national, async () => {
    await seed('vetting')
    const data = (await db.query('select public.cvoa_application_pipeline() as data')).rows[0].data
    assert.equal(data.applications.length, 1)
    assert.equal(data.reviewers.length, 1)
    const e = data.applications[0].evidence
    assert.equal(e.complete_scorecards, 0)
    assert.equal(e.completed_interviews, 0)
    assert.equal(e.score, null)
    assert.deepEqual(e.signed_reviewers, [])
    assert.equal(e.founding_team_ready, false)
  }))
test('document replacement resets verification and requires current-document re-signing while preserving history', () =>
  as(national, async () => {
    await seed('vetting', true)
    const path = `${national}/applications/${app}/new-document.pdf`
    await db.exec(
      `reset role; insert into storage.objects(bucket_id,name) values('dd214-uploads','${path}'); set local role authenticated;`
    )
    await db.query(`select public.cvoa_replace_application_document('${app}',1,$1)`, [path])
    await recoverFailure(() => move('vetting', 'approved'), /verify the DD214/)
    await db.exec(`update public.post_applications set dd214_review_status='verified' where id='${app}'`)
    await recoverFailure(() => move('vetting', 'approved'), /Every current National/)
    const before = (await db.query('select public.cvoa_application_pipeline() as data')).rows[0].data
    assert.deepEqual(before.applications[0].evidence.signed_reviewers, [])
    await db.query(`select public.cvoa_sign_application('${app}')`)
    await move('vetting', 'approved')
    const history = (
      await db.query(
        `select document_path from public.post_application_signoff_events where application_id='${app}' order by recorded_at,id`
      )
    ).rows.map((r) => r.document_path)
    assert.ok(history.includes('test.pdf'))
    assert.ok(history.includes(path))
  }))
test('unowned, nonexistent and stale document replacements fail without changing application evidence', () =>
  as(national, async () => {
    await seed('vetting', true)
    await recoverFailure(
      () =>
        db.query(
          `select public.cvoa_replace_application_document('${app}',1,'${member}/applications/${app}/missing.pdf')`
        ),
      /Upload this application document/
    )
    await recoverFailure(
      () =>
        db.query(
          `select public.cvoa_replace_application_document('${app}',99,'${national}/applications/${app}/missing.pdf')`
        ),
      /Application changed/
    )
    assert.equal(
      (await db.query(`select dd214_storage_path from public.post_applications where id='${app}'`)).rows[0]
        .dd214_storage_path,
      'test.pdf'
    )
  }))

test('applicant tracking excludes staff handoff fields and raw intake records', () =>
  as(national, async () => {
    await seed()
    await db.query(
      `select public.cvoa_save_application_handoff('${app}',1,'${national}','Internal follow-up',current_date)`
    )
    await db.exec(`select set_config('request.jwt.claim.sub','${member}',true)`)
    assert.equal((await db.query('select * from public.post_applications')).rows.length, 0)
    const data = (await db.query('select public.cvoa_my_applications() as data')).rows[0].data
    assert.equal(data.length, 1)
    assert.equal('next_action' in data[0], false)
  }))
test('direct sign-offs cannot precede current-document verification', () =>
  as(national, async () => {
    await seed('vetting')
    await recoverFailure(
      () =>
        db.exec(
          `insert into public.application_signoffs(application_id,profile_id) values('${app}','${national}')`
        ),
      /Verify the current DD214/
    )
  }))
