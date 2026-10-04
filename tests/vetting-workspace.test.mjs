import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const uid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const national = uid(1),
  officer = uid(2),
  member = uid(3),
  guest = uid(4),
  post = uid(101),
  otherPost = uid(102),
  memberRow = uid(201),
  application = uid(301);
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
 grant usage on schema public,auth,storage to anon,authenticated,service_role;`);
  let schema = fs
    .readFileSync("supabase/schema.sql", "utf8")
    .replace('create extension if not exists "uuid-ossp";', "")
    .replace(
      "'guest_applicant'\n);",
      "'guest_applicant', 'ethics_tribunal'\n);",
    );
  await db.exec(schema);
  await db.exec(`alter table public.profiles add column title text;`);
  await db.exec(`grant select,insert,update,delete on all tables in schema public to anon,authenticated,service_role; grant usage on all sequences in schema public to anon,authenticated,service_role;
 insert into auth.users(id,email,email_confirmed_at) values('${national}','national@example.test',now()),('${officer}','officer@example.test',now()),('${member}','member@example.test',now()),('${guest}','guest@example.test',now());
 insert into public.posts(id,name,state,status) values('${post}','Post A','IN','active_post'),('${otherPost}','Post B','OH','active_post');
 insert into public.profiles(id,full_name,email,role,post_id) values('${national}','National','national@example.test','national_commander',null),('${officer}','Officer','officer@example.test','post_commander','${post}'),('${member}','Member','member@example.test','member','${post}'),('${guest}','Guest','guest@example.test','guest_applicant',null);
 insert into public.members(id,post_id,profile_id,full_name,email,membership_status) values('${memberRow}','${post}','${member}','Member','member@example.test','active');
 insert into public.post_role_applications(id,member_id,post_id,requested_role) values('${application}','${memberRow}','${post}','post_officer');
 create policy members_select_own on public.members for select using(profile_id=auth.uid());`);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261003185000_live_permission_hardening.sql",
      "utf8",
    ),
  );
  // Compile the entire coordinated release against the full public schema.
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261003190000_organization_workspaces.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261004150000_application_pipeline.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261004170000_vetting_workspace.sql",
      "utf8",
    ),
  );
});
after(() => db.close());
async function as(user, fn, role = "authenticated") {
  await db.exec("begin");
  try {
    await db.exec(
      `set local role ${role}; select set_config('request.jwt.claim.sub','${user ?? ""}',true),set_config('request.jwt.claim.role','${role}',true)`,
    );
    await fn();
  } finally {
    await db.exec("rollback");
  }
}

const app = uid(801),
  review = uid(901);
const scores = {
  leadership: 7,
  communication: 8,
  professionalism: 9,
  reliability: 6,
  mission_alignment: 8,
};
const answers = Object.fromEntries(
  [
    "purpose",
    "eligibility",
    "region",
    "petitioners",
    "officers",
    "leadership",
    "commitment",
    "first90",
    "resources",
    "accountability",
  ].map((k) => [k, `Evidence for ${k}`]),
);
async function seed() {
  await db.exec("reset role");
  await db.exec(
    `insert into public.post_applications(id,name,email,state,status,applicant_profile_id) values('${app}','Candidate','member@example.test','IN','vetting','${member}')`,
  );
  await db.exec("set local role authenticated");
}
async function claims(user) {
  await db.query(`select set_config('request.jwt.claim.sub',$1,true)`, [user]);
}
async function failure(fn, pattern) {
  await db.exec("savepoint expected");
  await assert.rejects(fn(), pattern);
  await db.exec("rollback to savepoint expected");
}
async function save(overrides = {}) {
  const x = {
    id: review,
    scores,
    notes: "Observed evidence",
    answers: { leadership: "Interview response" },
    recommendation: "needs_follow_up",
    tasks: "Reviewer: schedule follow-up Friday",
    ...overrides,
  };
  return (
    await db.query(
      "select public.cvoa_save_vetting_scorecard($1,$2,$3,$4,$5,$6,$7) as data",
      [x.id, app, x.scores, x.notes, x.answers, x.recommendation, x.tasks],
    )
  ).rows[0].data;
}
async function request() {
  await db.query("select public.cvoa_request_vetting_questionnaire($1)", [app]);
}
async function qsave(version, content, submit) {
  return (
    await db.query(
      "select public.cvoa_save_vetting_questionnaire($1,$2,$3,$4) as data",
      [app, version, content, submit],
    )
  ).rows[0].data;
}
async function qread() {
  return (
    await db.query("select public.cvoa_vetting_questionnaire($1) as data", [
      app,
    ])
  ).rows[0].data;
}
test("saved scorecard persists all scores, reviewer attribution, findings and history", () =>
  as(national, async () => {
    await seed();
    const r = await save();
    assert.equal(r.scored_by, national);
    assert.equal(r.communication_score, 8);
    assert.equal(r.notes, "Observed evidence");
    const history = (
      await db.query("select public.cvoa_vetting_record($1) as data", [app])
    ).rows[0].data;
    assert.equal(history.scorecards.length, 1);
    assert.equal(history.scorecards[0].reviewer_name, "National");
    assert.equal(
      history.scorecards[0].question_answers.leadership,
      "Interview response",
    );
  }));
test("lost-response retries return the same review without duplication", () =>
  as(national, async () => {
    await seed();
    const first = await save(),
      again = await save();
    assert.equal(first.id, again.id);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.vetting_scorecards",
        )
      ).rows[0].n,
      1,
    );
    await failure(() => save({ notes: "Different notes" }), /already saved/);
  }));
test("blank, fractional, invalid and incomplete scores fail without saving", () =>
  as(national, async () => {
    await seed();
    for (const bad of [
      { ...scores, leadership: null },
      { ...scores, leadership: 0 },
      { ...scores, leadership: 11 },
      { ...scores, leadership: 7.5 },
      { leadership: 5 },
      { ...scores, leadership: "7" },
    ])
      await failure(() => save({ scores: bad }), /all five scores/);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.vetting_scorecards",
        )
      ).rows[0].n,
      0,
    );
  }));
test("non-National cannot save/read scorecards or request questionnaires", () =>
  as(member, async () => {
    await seed();
    await failure(() => save(), /National vetting/);
    await failure(
      () => db.query("select public.cvoa_vetting_record($1)", [app]),
      /National vetting/,
    );
    await failure(() => request(), /National questionnaire/);
  }));
test("direct scorecard inserts cannot bypass attributed RPC", () =>
  as(national, async () => {
    await seed();
    await failure(
      () =>
        db.query(
          `insert into public.vetting_scorecards(application_id,scored_by) values($1,$2)`,
          [app, member],
        ),
      /permission denied/,
    );
  }));
test("scorecard data limits and recommendation are validated", () =>
  as(national, async () => {
    await seed();
    await failure(() => save({ answers: { unknown: "forged" } }), /Invalid/);
    await failure(() => save({ notes: "x".repeat(5001) }), /oversized/);
    await failure(
      () => save({ recommendation: "charter_approved" }),
      /recommendation/,
    );
  }));
test("scorecard recommendation does not approve or advance applicant", () =>
  as(national, async () => {
    await seed();
    await save({ recommendation: "ready_for_council" });
    assert.equal(
      (
        await db.query(
          "select status from public.post_applications where id=$1",
          [app],
        )
      ).rows[0].status,
      "vetting",
    );
  }));
test("questionnaire request is retry-safe and records one portal update", () =>
  as(national, async () => {
    await seed();
    await request();
    await request();
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.post_application_updates where application_id=$1",
          [app],
        )
      ).rows[0].n,
      1,
    );
  }));
test("applicant draft persists but remains private from National until submission", () =>
  as(national, async () => {
    await seed();
    await request();
    await claims(member);
    const q = await qsave(1, { purpose: "Private draft" }, false);
    assert.equal(q.workflow_version, 2);
    assert.equal((await qread()).answers.purpose, "Private draft");
    await claims(national);
    assert.deepEqual((await qread()).answers, {});
    assert.equal((await qread()).submitted_at, null);
  }));
test("full applicant submission is visible to National, retained and attributed", () =>
  as(national, async () => {
    await seed();
    await request();
    await claims(member);
    await qsave(1, answers, true);
    await claims(national);
    assert.deepEqual((await qread()).answers, answers);
    assert.ok((await qread()).submitted_at);
    await db.exec("reset role");
    const submission = (
      await db.query(
        "select * from public.post_application_questionnaire_submissions",
      )
    ).rows[0];
    assert.equal(submission.submitted_by, member);
    assert.deepEqual(submission.answers, answers);
  }));
test("incomplete submission and oversized responses fail without destroying draft", () =>
  as(national, async () => {
    await seed();
    await request();
    await claims(member);
    await qsave(1, { purpose: "Draft" }, false);
    await failure(() => qsave(2, { purpose: "Incomplete" }, true), /all ten/);
    await failure(() => qsave(2, { purpose: "x".repeat(2001) }, false), /2000/);
    assert.equal((await qread()).answers.purpose, "Draft");
  }));
test("stale versions reject instead of overwriting concurrent questionnaire changes", () =>
  as(national, async () => {
    await seed();
    await request();
    await claims(member);
    await qsave(1, { purpose: "First tab" }, false);
    await failure(() => qsave(1, { purpose: "Second tab" }, false), /changed/);
    assert.equal((await qread()).answers.purpose, "First tab");
  }));
test("later private edits do not overwrite the last submitted version seen by National", () =>
  as(national, async () => {
    await seed();
    await request();
    await claims(member);
    await qsave(1, answers, true);
    await qsave(2, { ...answers, purpose: "Private revision" }, false);
    await claims(national);
    assert.equal((await qread()).answers.purpose, answers.purpose);
  }));
test("other applicants and post staff cannot read or answer another questionnaire", () =>
  as(national, async () => {
    await seed();
    await request();
    for (const who of [guest, officer]) {
      await claims(who);
      await failure(() => qread(), /access required/);
      await failure(() => qsave(1, answers, true), /Only the applicant/);
    }
    await claims(national);
    await failure(() => qsave(1, answers, true), /Only the applicant/);
  }));
test("questionnaire tables cannot be read directly by authenticated clients", () =>
  as(national, async () => {
    await seed();
    await request();
    await failure(
      () => db.query("select * from public.post_application_questionnaires"),
      /permission denied/,
    );
    await failure(
      () =>
        db.query(
          "select * from public.post_application_questionnaire_submissions",
        ),
      /permission denied/,
    );
  }));
test("archived vetting reports stay at the National-only Drive root and retries reuse the file", () =>
  as(national, async () => {
    await seed();
    const id = uid(991),
      path = `root/vetting-reports/${national}/${app}/${id}.html`;
    await db.exec("reset role");
    await db.query(
      "insert into storage.objects(bucket_id,name) values('ncc-drive',$1)",
      [path],
    );
    await db.exec("set local role authenticated");
    await db.query("select public.cvoa_archive_vetting_report($1,$2,$3,100)", [
      id,
      app,
      path,
    ]);
    await db.query("select public.cvoa_archive_vetting_report($1,$2,$3,100)", [
      id,
      app,
      path,
    ]);
    const file = (
      await db.query("select * from public.drive_files where id=$1", [id])
    ).rows[0];
    assert.equal(file.folder_id, null);
    assert.equal(file.uploaded_by, national);
    await claims(officer);
    assert.equal(
      (await db.query("select * from public.drive_files where id=$1", [id]))
        .rows.length,
      0,
    );
    await failure(
      () =>
        db.query("select public.cvoa_archive_vetting_report($1,$2,$3,100)", [
          id,
          app,
          path,
        ]),
      /National/,
    );
  }));
test("archive rejects missing uploads, other reviewers paths and shared-folder paths", () =>
  as(national, async () => {
    await seed();
    const id = uid(992);
    for (const path of [
      `root/vetting-reports/${national}/${app}/${id}.html`,
      `root/vetting-reports/${member}/${app}/${id}.html`,
      `shared/report.html`,
    ])
      await failure(
        () =>
          db.query("select public.cvoa_archive_vetting_report($1,$2,$3,100)", [
            id,
            app,
            path,
          ]),
        /Upload|Invalid/,
      );
  }));
