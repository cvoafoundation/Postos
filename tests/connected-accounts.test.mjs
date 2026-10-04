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
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261004190000_connected_accounts.sql",
      "utf8",
    ),
  );
  await db.exec(fs.readFileSync('supabase/migrations/20261004203000_state_post_operations.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${uid(5)}','state@example.test',now()),('${uid(6)}','delegate@example.test',now()),('${uid(7)}','tribunal@example.test',now()),('${uid(8)}','national-staff@example.test',now());
  insert into public.profiles(id,full_name,email,role,state,post_id) values('${uid(5)}','State','state@example.test','state_commander','IN',null),('${uid(6)}','Delegate','delegate@example.test','delegate',null,'${post}'),('${uid(7)}','Tribunal','tribunal@example.test','ethics_tribunal',null,null),('${uid(8)}','National Staff','national-staff@example.test','national_staff',null,null);
  insert into public.congress_delegates(profile_id,post_id) values('${uid(6)}','${post}');
  insert into public.members(id,post_id,full_name,email,membership_status) values('${uid(202)}','${otherPost}','Other state member','other@example.test','active');
  insert into public.uro_meetings(post_id,title,meeting_date) values('${post}','Indiana operations',current_date),('${otherPost}','Ohio operations',current_date);
  insert into public.resolutions(id,title,body,submitted_by,status,vote_type) values('${uid(501)}','Open ballot','Reviewed legislative text','${national}','voting','delegate_vote');
  insert into public.resolution_member_preferences(resolution_id,post_id,member_profile_id,preference) values('${uid(501)}','${post}','${member}',true);
  insert into public.ethics_complaints(complainant_id,respondent_name,category,description) values('${member}','Private complaint','other','Confidential example');`);
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
const stateCommander = uid(5),
  delegate = uid(6),
  tribunal = uid(7),
  nationalStaff = uid(8),
  otherMember = uid(202),
  ballot = uid(501);
const rpc = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.data;
const record = (profileId = null, memberId = null) =>
  rpc("select public.cvoa_person_record($1,$2) data", [profileId, memberId]);
test("National directory connects every membership and preserves account-only people", () =>
  as(national, async () => {
    const d = await rpc("select public.cvoa_accounts_directory() data");
    assert.equal(
      d.accounts.find((a) => a.profile.id === member).memberships[0].id,
      memberRow,
    );
    assert.equal(
      d.accounts.find((a) => a.profile.id === national).memberships.length,
      0,
    );
    assert.equal(d.counts.unlinked, 1);
  }));
test("account directory denies state, post, member and Tribunal callers", async () => {
  for (const user of [stateCommander, officer, member, tribunal])
    await as(user, () =>
      failure(
        () => rpc("select public.cvoa_accounts_directory() data"),
        /National/,
      ),
    );
});
test("state commander reads only assigned-state operational posts, members and minutes", () =>
  as(stateCommander, async () => {
    assert.deepEqual(
      (await db.query("select id from public.posts")).rows.map((x) => x.id),
      [post],
    );
    assert.deepEqual(
      (await db.query("select id from public.members")).rows.map((x) => x.id),
      [memberRow],
    );
    assert.equal(
      (await db.query("select title from public.uro_meetings")).rows[0].title,
      "Indiana operations",
    );
    assert.equal((await record(null, memberRow)).memberships.length, 1);
    await failure(() => record(null, otherMember), /restricted/);
  }));
test("state oversight cannot edit member or post records", () =>
  as(stateCommander, async () => {
    await db.exec(
      `update public.members set full_name='Hijacked' where id='${memberRow}'`,
    );
    assert.equal(
      (await db.query("select full_name from public.members")).rows[0]
        .full_name,
      "Member",
    );
    await db.exec(`update public.posts set name='Hijacked' where id='${post}'`);
    assert.equal(
      (await db.query("select name from public.posts")).rows[0].name,
      "Post A",
    );
  }));
test("post officer cannot read another post member or operational record", () =>
  as(officer, async () => {
    assert.equal(
      (await db.query("select * from public.members")).rows.length,
      1,
    );
    await failure(() => record(null, otherMember), /restricted/);
    assert.equal((await db.query("select * from public.posts")).rows.length, 1);
  }));
test("designated delegate reads their post operations without a confidential membership roster", () =>
  as(delegate, async () => {
    assert.equal(
      (await db.query("select * from public.uro_meetings")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.members")).rows.length,
      0,
    );
    assert.equal((await db.query("select * from public.posts")).rows.length, 1);
    const summary = await rpc("select public.cvoa_state_voting($1,$2) data", [
      ballot,
      "IN",
    ]);
    assert.equal(summary.posts[0].support, 1);
    assert.equal(JSON.stringify(summary).includes(member), false);
    await failure(
      () => rpc("select public.cvoa_state_voting($1,$2) data", [ballot, "OH"]),
      /designation/,
    );
  }));
test("role=delegate without a designation cannot vote or obtain state tallies", () =>
  as(guest, async () => {
    await db.exec("set local role postgres");
    await db.exec(
      `update public.profiles set role='delegate',post_id='${post}' where id='${guest}'`,
    );
    await db.exec("set local role authenticated");
    await failure(
      () =>
        db.exec(
          `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${ballot}','delegate_vote','${guest}','${post}',true)`,
        ),
      /row-level/,
    );
    await failure(
      () => rpc("select public.cvoa_state_voting($1,$2) data", [ballot, "IN"]),
      /designation/,
    );
  }));
test("primary designated delegate can cast and correct their own open formal vote", () =>
  as(delegate, async () => {
    await db.exec(
      `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${ballot}','delegate_vote','${delegate}','${post}',true)`,
    );
    await db.exec(
      `update public.resolution_votes set vote=false where voter_id='${delegate}'`,
    );
    assert.equal(
      (await db.query("select vote from public.resolution_votes")).rows[0].vote,
      false,
    );
  }));
test("expired delegates lose ballot and state voting authority", () =>
  as(delegate, async () => {
    await db.exec("set local role postgres");
    await db.exec(
      `update public.congress_delegates set term_end=current_date-1 where profile_id='${delegate}'`,
    );
    await db.exec("set local role authenticated");
    await failure(
      () =>
        db.exec(
          `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${ballot}','delegate_vote','${delegate}','${post}',true)`,
        ),
      /row-level/,
    );
    await failure(
      () => rpc("select public.cvoa_state_voting($1,$2) data", [ballot, "IN"]),
      /designation/,
    );
  }));
test("alternate designation does not confer the primary delegate ballot", () =>
  as(delegate, async () => {
    await db.exec("set local role postgres");
    await db.exec(
      `update public.congress_delegates set is_alternate=true where profile_id='${delegate}'`,
    );
    await db.exec("set local role authenticated");
    await failure(
      () =>
        db.exec(
          `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${ballot}','delegate_vote','${delegate}','${post}',true)`,
        ),
      /row-level/,
    );
  }));
test("closed ballots deny vote insertion and correction", () =>
  as(delegate, async () => {
    await db.exec(
      `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${ballot}','delegate_vote','${delegate}','${post}',true)`,
    );
    await db.exec("set local role postgres");
    await db.exec(
      `update public.resolutions set status='passed' where id='${ballot}'`,
    );
    await db.exec("set local role authenticated");
    await failure(
      () =>
        db.exec(
          `update public.resolution_votes set vote=false where voter_id='${delegate}'`,
        ),
      /row-level/,
    );
  }));
test("National staff retain global operational visibility while ethics case records stay private", () =>
  as(nationalStaff, async () => {
    assert.equal((await db.query("select * from public.posts")).rows.length, 2);
    assert.equal(
      (await db.query("select * from public.members")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("select * from public.ethics_complaints")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.resolution_member_preferences"))
        .rows.length,
      0,
    );
  }));
test("existing Tribunal case visibility is preserved", () =>
  as(tribunal, async () => {
    assert.equal(
      (await db.query("select * from public.ethics_complaints")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.members")).rows.length,
      0,
    );
  }));
async function updateAccount(target, version, overrides = {}) {
  const profile = (await record(target)).profile;
  const x = {
    role: profile.role,
    post: profile.post_id,
    state: profile.state,
    title: profile.title ?? "",
    test: profile.is_test_account,
    suspended: profile.access_suspended,
    reason: "Reviewed appointment",
    ...overrides,
  };
  return db.query(
    "select public.cvoa_update_account($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      target,
      version,
      x.role,
      x.post,
      x.state,
      x.title,
      x.test,
      x.suspended,
      x.reason,
    ],
  );
}
test("reviewed account edits persist with actor, reason and version", () =>
  as(national, async () => {
    await updateAccount(guest, 0, {
      role: "state_commander",
      state: "IN",
      test: true,
    });
    const r = await record(guest);
    assert.equal(r.profile.role, "state_commander");
    assert.equal(r.profile.access_version, 1);
    assert.equal(r.profile.is_test_account, true);
    assert.equal(r.history[0].actor_name, "National");
    assert.equal(r.history[0].reason, "Reviewed appointment");
    await failure(() => updateAccount(guest, 0, { title: "stale" }), /changed/);
  }));
test("direct profile writes cannot bypass reviewed access administration", () =>
  as(national, async () => {
    await failure(
      () =>
        db.exec(
          `update public.profiles set role='national_staff' where id='${guest}'`,
        ),
      /reviewed/,
    );
  }));
test("National cannot grant themselves authority or assign Tribunal permissions through this workspace", () =>
  as(national, async () => {
    await failure(
      () => updateAccount(national, 0, { title: "Self changed" }),
      /Another National/,
    );
    await failure(
      () => updateAccount(guest, 0, { role: "ethics_tribunal" }),
      /Tribunal/,
    );
  }));
test("missing operational jurisdiction and null reasons are rejected", () =>
  as(national, async () => {
    await failure(
      () => updateAccount(guest, 0, { role: "state_commander", state: null }),
      /state code/,
    );
    await failure(
      () => updateAccount(guest, 0, { role: "post_officer", post: null }),
      /responsible post/,
    );
    await failure(() => updateAccount(guest, 0, { reason: null }), /reason/);
    await failure(
      () =>
        db.query("select public.cvoa_add_appointment($1,$2,$3,$4,$5,$6)", [
          guest,
          "state_commander",
          null,
          null,
          "",
          "Reviewed appointment",
        ]),
      /check constraint/,
    );
  }));
test("multiple scoped appointments coexist and switch without modifying membership affiliation", () =>
  as(national, async () => {
    const scope = await rpc(
      "select public.cvoa_add_appointment($1,$2,$3,$4,$5,$6) data",
      [
        member,
        "post_officer",
        otherPost,
        null,
        "Quartermaster",
        "Council appointment",
      ],
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${member}',true)`,
    );
    await db.query("select public.cvoa_select_workspace($1)", [scope]);
    assert.equal(
      (await db.query("select public.current_post_id() id")).rows[0].id,
      otherPost,
    );
    assert.equal(
      (await db.query("select post_id from public.members")).rows[0].post_id,
      post,
    );
    assert.equal(
      (
        await db.query("select public.cvoa_can_manage_post($1) allowed", [
          otherPost,
        ])
      ).rows[0].allowed,
      true,
    );
    await failure(
      () => db.query("select public.cvoa_select_workspace($1)", [uid(999)]),
      /not assigned/,
    );
  }));
test("revoked workspace selections fall back and access is removed", () =>
  as(national, async () => {
    const scope = await rpc(
      "select public.cvoa_add_appointment($1,$2,$3,$4,$5,$6) data",
      [member, "post_officer", otherPost, null, "", "Council appointment"],
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${member}',true)`,
    );
    await db.query("select public.cvoa_select_workspace($1)", [scope]);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${national}',true)`,
    );
    await db.query("select public.cvoa_revoke_appointment($1,$2)", [
      scope,
      "Term ended by council",
    ]);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${member}',true)`,
    );
    assert.equal(
      (await db.query("select public.current_post_id() id")).rows[0].id,
      post,
    );
    assert.equal(
      (
        await db.query("select public.cvoa_can_manage_post($1) allowed", [
          otherPost,
        ])
      ).rows[0].allowed,
      false,
    );
  }));
test("suspension denies existing sessions while preserving the membership", () =>
  as(national, async () => {
    await updateAccount(member, 0, { suspended: true });
    await db.exec(
      `select set_config('request.jwt.claim.sub','${member}',true)`,
    );
    assert.equal(
      (await db.query("select * from public.members")).rows.length,
      0,
    );
    assert.equal(
      (await rpc("select public.cvoa_my_access() data")).suspended,
      true,
    );
    await db.exec("set local role postgres");
    assert.equal(
      (
        await db.query(
          `select membership_status from public.members where id='${memberRow}'`,
        )
      ).rows[0].membership_status,
      "active",
    );
  }));
test("service authorization denies suspended or wrong-post actors and permits additional appointments", () =>
  as(national, async () => {
    await db.query("select public.cvoa_add_appointment($1,$2,$3,$4,$5,$6)", [
      member,
      "post_officer",
      otherPost,
      null,
      "",
      "Council appointment",
    ]);
    await db.exec("set local role service_role");
    assert.equal(
      await rpc("select public.cvoa_service_authorized($1,$2,$3) data", [
        member,
        otherPost,
        "manage_post",
      ]),
      true,
    );
    assert.equal(
      await rpc("select public.cvoa_service_authorized($1,$2,$3) data", [
        officer,
        otherPost,
        "manage_post",
      ]),
      false,
    );
    await db.exec("set local role postgres");
    await db.exec(
      `update public.profiles set access_suspended=true where id='${member}'`,
    );
    await db.exec("set local role service_role");
    assert.equal(
      await rpc("select public.cvoa_service_authorized($1,$2,$3) data", [
        member,
        otherPost,
        "manage_post",
      ]),
      false,
    );
  }));
test("ordinary callers cannot invoke service authorization or write audit/appointment tables", () =>
  as(member, async () => {
    await failure(
      () =>
        db.query("select public.cvoa_service_authorized($1,$2,$3)", [
          national,
          post,
          "national",
        ]),
      /permission denied/,
    );
    for (const table of [
      "access_appointments",
      "access_audit",
      "access_workspace_selection",
    ])
      await failure(
        () => db.query(`select * from public.${table}`),
        /permission denied/,
      );
    await failure(
      () => db.query("select * from public.cvoa_access_scopes($1)", [national]),
      /permission denied/,
    );
  }));
test("unlinked member repair requires a unique verified identity and retains roles", () =>
  as(national, async () => {
    await db.exec("set local role postgres");
    await db.exec(
      `update public.members set profile_id=null where id='${memberRow}'`,
    );
    await db.exec("set local role authenticated");
    await db.query("select public.cvoa_link_account($1,$2,$3)", [
      memberRow,
      member,
      "Verified identity review",
    ]);
    assert.equal((await record(member)).profile.role, "member");
    assert.equal((await record(member)).memberships[0].id, memberRow);
    await failure(
      () =>
        db.query("select public.cvoa_link_account($1,$2,$3)", [
          memberRow,
          member,
          "Retry same record",
        ]),
      /already linked/,
    );
  }));
test("conflicting or mismatched membership identities cannot be linked", () =>
  as(national, async () => {
    await failure(
      () =>
        db.query("select public.cvoa_link_account($1,$2,$3)", [
          otherMember,
          guest,
          "Identity review",
        ]),
      /verified matching/,
    );
    await db.exec("set local role postgres");
    await db.exec(
      `update public.members set profile_id=null where id='${memberRow}';insert into public.members(full_name,email)values('Duplicate','member@example.test')`,
    );
    await db.exec("set local role authenticated");
    await failure(
      () =>
        db.query("select public.cvoa_link_account($1,$2,$3)", [
          memberRow,
          member,
          "Identity review",
        ]),
      /Conflicting/,
    );
  }));
test("public directory exposes only directory fields and never confidential operations", () =>
  as(
    null,
    async () => {
      assert.equal(
        (await db.query("select * from public.posts")).rows.length,
        0,
      );
      const rows = (await db.query("select * from public.cvoa_public_posts()"))
        .rows;
      assert.equal(rows.length, 2);
      assert.deepEqual(Object.keys(rows[0]).sort(), [
        "city",
        "id",
        "name",
        "state",
        "status",
      ]);
    },
    "anon",
  ));
test("meeting attachments obey state and post boundaries", () =>
  as(national, async () => {
    await db.exec("set local role postgres");
    await db.exec(
      `alter table storage.objects enable row level security;grant select,insert on storage.objects to authenticated;insert into storage.objects(bucket_id,name)values('meeting-records','${post}/minutes.pdf'),('meeting-records','${otherPost}/minutes.pdf')`,
    );
    await db.exec("set local role authenticated");
    for (const viewer of [officer, stateCommander, delegate]) {
      await db.exec(
        `select set_config('request.jwt.claim.sub','${viewer}',true)`,
      );
      assert.equal(
        (
          await db.query(
            "select * from storage.objects where bucket_id='meeting-records'",
          )
        ).rows.length,
        1,
      );
    }
    await db.exec(
      `select set_config('request.jwt.claim.sub','${member}',true)`,
    );
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='meeting-records'",
        )
      ).rows.length,
      0,
    );
  }));
test("server-paged directory searches scoped appointments and separates explicitly marked tests", () =>
  as(national, async () => {
    await updateAccount(guest, 0, { test: true });
    const ordinary = await rpc(
      "select public.cvoa_accounts_directory($1,$2,$3,$4) data",
      ["", "all", 0, 2],
    );
    assert.equal(ordinary.accounts.length, 2);
    assert.equal(ordinary.total, 7);
    assert.equal(ordinary.counts.test, 1);
    const tests = await rpc(
      "select public.cvoa_accounts_directory($1,$2,$3,$4) data",
      ["", "test", 0, 25],
    );
    assert.equal(tests.accounts[0].profile.id, guest);
    const state = await rpc(
      "select public.cvoa_accounts_directory($1,$2,$3,$4) data",
      ["state commander", "all", 0, 25],
    );
    assert.equal(state.accounts[0].profile.id, stateCommander);
    const missing = await rpc(
      "select public.cvoa_accounts_directory($1,$2,$3,$4) data",
      ["other state", "unlinked", 0, 25],
    );
    assert.equal(missing.unlinked_members[0].id, otherMember);
  }));
test("post oversight queries compile against the real campaign and meeting schema", () =>
  as(delegate, async () => {
    await db.query(
      "select name,state,city,status from public.posts where id=$1",
      [post],
    );
    await db.query(
      "select id,title,meeting_date,status from public.uro_meetings where post_id=$1 order by meeting_date desc limit 10",
      [post],
    );
    await db.query(
      "select id,description,due_date from public.uro_action_items where post_id=$1 and status=$2 order by due_date limit 20",
      [post, "open"],
    );
    await db.query(
      "select id,title,status from public.fundraising_campaigns where post_id=$1 order by created_at desc limit 10",
      [post],
    );
  }));
test("individual ballots outside a delegate state stay unreadable while public decided totals remain available", () =>
  as(delegate, async () => {
    await db.exec("set local role postgres");
    await db.exec(
      `insert into public.resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${ballot}','delegate_vote','${officer}','${otherPost}',false)`,
    );
    await db.exec("set local role authenticated");
    assert.equal(
      (await db.query("select * from public.resolution_votes")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.cvoa_vote_totals($1)", [ballot]))
        .rows[0].oppose,
      1,
    );
  }));
test("member preferences cannot be attributed to another post and resolution sponsors cannot change voting authority", () =>
  as(member, async () => {
    await failure(
      () =>
        db.exec(
          `insert into public.resolution_member_preferences(resolution_id,post_id,member_profile_id,preference)values('${ballot}','${otherPost}','${member}',true)`,
        ),
      /row-level/,
    );
    await db.exec(
      `insert into public.resolutions(id,title,body,submitted_by,status)values('${uid(502)}','Member proposal','Legislative text','${member}','under_review')`,
    );
    await failure(
      () =>
        db.exec(
          `update public.resolutions set status='passed' where id='${uid(502)}'`,
        ),
      /Congress procedure/,
    );
    await failure(
      () =>
        db.exec(
          `insert into public.resolutions(title,body,submitted_by,status)values('Spoof','Text','${national}','under_review')`,
        ),
      /row-level/,
    );
  }));

 test("verified linked active guests advance to member without changing their link", () => as(guest, async () => {
 await db.exec(`reset role; insert into public.members(id,post_id,profile_id,full_name,email,membership_status) values('${uid(299)}','${post}','${guest}','Guest','guest@example.test','active'); set local role authenticated;`);
 await db.exec('select public.link_member_profile()');
 const result = await db.query(`select role,post_id from public.profiles where id='${guest}'`);
 assert.equal(result.rows[0].role,'member');
 assert.equal(result.rows[0].post_id,post);
 }));

test('state overview includes support and activity counts only for assigned posts', () => as(uid(5), async () => {
 const result = await db.query('select public.cvoa_state_workspace() as workspace');
 const posts = result.rows[0].workspace.posts;
 assert.equal(posts.length, 1);
 assert.equal(posts[0].id, post);
 for (const key of ['overdue_actions','draft_meetings','active_campaigns','support_requests']) assert.equal(typeof posts[0][key], 'number');
}));
