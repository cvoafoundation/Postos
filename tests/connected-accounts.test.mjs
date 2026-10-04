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
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to authenticated; alter table storage.objects enable row level security;`);
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
  await db.exec(fs.readFileSync('supabase/migrations/20261004210000_membership_transfers.sql', 'utf8'));
  await db.exec(`insert into public.drive_folders(id,name,shared_with_posts,created_by) values('${uid(9701)}','Legacy resources',true,'${national}'); insert into public.drive_files(id,folder_id,name,storage_path,uploaded_by) values('${uid(9702)}','${uid(9701)}','Legacy file','legacy/resource.pdf','${national}'); insert into storage.objects(bucket_id,name) values('ncc-drive','legacy/resource.pdf');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261004220000_document_workspaces.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261004230000_uro_governance.sql', 'utf8'));
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

test('health source records remain scoped for National, state and local staff', async () => {
  const ids = [uid(901), uid(902)];
  await db.exec(`insert into public.community_service_events(id,post_id,title,event_date) values('${ids[0]}','${post}','Indiana service',current_date),('${ids[1]}','${otherPost}','Ohio service',current_date);`);
  try {
    for (const [actor, expected] of [[national, ids], [stateCommander, [ids[0]]], [officer, [ids[0]]]]) {
      await as(actor, async () => {
        assert.deepEqual((await db.query('select id from public.community_service_events order by id')).rows.map(r => r.id), expected);
      });
    }
  } finally {
    await db.exec(`delete from public.community_service_events where id in ('${ids[0]}','${ids[1]}')`);
  }
});

const become = actor => db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
test('incoming commander approval updates affiliation; source commander and state oversight cannot decide', () => as(national, async () => {
  await become(member);
  const request = (await db.query("select public.cvoa_request_post_change($1,$2,'Moving to Ohio') id", [memberRow,otherPost])).rows[0].id;
  await become(officer);
  await failure(() => db.query("select public.cvoa_review_post_change($1,true,'Approved')", [request]), /Receiving post commander/);
  await become(stateCommander);
  const stateRows = (await db.query('select public.cvoa_transfer_requests() data')).rows[0].data;
  assert.equal(stateRows.length,1); assert.equal(stateRows[0].can_review,false);
  await failure(() => db.query("select public.cvoa_review_post_change($1,true,'Approved')", [request]), /Receiving post commander/);
  await become(national);
  await db.query("select public.cvoa_add_appointment($1,'post_commander',$2,null,'Commander','Approved assignment')", [officer,otherPost]);
  await become(officer);
  const incoming = (await db.query('select public.cvoa_transfer_requests() data')).rows[0].data[0];
  assert.equal(incoming.can_review,true);
  await db.query("select public.cvoa_review_post_change($1,true,'Welcome to the post')", [request]);
  await become(national);
  assert.equal((await db.query('select post_id from public.members where id=$1',[memberRow])).rows[0].post_id,otherPost);
  assert.equal((await db.query('select post_id from public.profiles where id=$1',[member])).rows[0].post_id,otherPost);
  assert.equal((await db.query('select status,source_post_id from public.membership_change_requests where id=$1',[request])).rows[0].source_post_id,post);
}));
test('members withdraw only their own pending requests and can request again', () => as(member, async () => {
  const req=(await db.query("select public.cvoa_request_post_change($1,$2,'Relocating') id",[memberRow,otherPost])).rows[0].id;
  await become(guest);
  await failure(() => db.query('select public.cvoa_withdraw_post_change($1)',[req]), /Only your pending/);
  assert.deepEqual((await db.query('select public.cvoa_transfer_requests() data')).rows[0].data,[]);
  await become(member);
  await db.query('select public.cvoa_withdraw_post_change($1)',[req]);
  assert.equal((await db.query('select status from public.membership_change_requests where id=$1',[req])).rows[0].status,'withdrawn');
  await failure(() => db.query('select public.cvoa_withdraw_post_change($1)',[req]),/Only your pending/);
  await db.query("select public.cvoa_request_post_change($1,$2,'New request')",[memberRow,otherPost]);
}));
test('at-large requests require National and transfer approval preserves staff authority', () => as(national, async () => {
  const staffMember=uid(204);
  await db.query("insert into public.members(id,profile_id,post_id,full_name,email,membership_status) values($1,$2,$3,'Staff member','staff-transfer@example.test','active')",[staffMember,officer,post]);
  await become(officer);
  const req=(await db.query("select public.cvoa_request_post_change($1,null,'Joining at large') id",[staffMember])).rows[0].id;
  await failure(() => db.query("select public.cvoa_review_post_change($1,true,'Self-approved')",[req]),/Receiving post commander/);
  await become(national);
  assert.equal((await db.query('select public.cvoa_transfer_requests() data')).rows[0].data[0].staff_access,true);
  await db.query("select public.cvoa_review_post_change($1,true,'Approved; staff appointment remains')",[req]);
  assert.equal((await db.query('select post_id from public.members where id=$1',[staffMember])).rows[0].post_id,null);
  const account=(await db.query('select role,post_id from public.profiles where id=$1',[officer])).rows[0];
  assert.equal(account.role,'post_commander'); assert.equal(account.post_id,post);
}));
test('suspended users cannot submit, withdraw or review transfers', () => as(national, async () => {
  await become(member);
  const req=(await db.query("select public.cvoa_request_post_change($1,$2,'Moving') id",[memberRow,otherPost])).rows[0].id;
  await become(national);
  await updateAccount(member, 0, { suspended: true });
  await become(member);
  await failure(() => db.query('select public.cvoa_withdraw_post_change($1)',[req]),/Active account/);
  await failure(() => db.query("select public.cvoa_request_post_change($1,null,'Leaving')",[memberRow]),/Active account/);
}));
test('post officer access does not confer commander approval authority', () => as(national, async () => {
  await become(member);
  const req=(await db.query("select public.cvoa_request_post_change($1,$2,'Moving') id",[memberRow,otherPost])).rows[0].id;
  await become(national);
  await db.query("select public.cvoa_add_appointment($1,'post_officer',$2,null,'Officer','Approved assignment')",[officer,otherPost]);
  await become(officer);
  assert.equal((await db.query('select public.cvoa_transfer_requests() data')).rows[0].data[0].can_review,false);
  await failure(() => db.query("select public.cvoa_review_post_change($1,true,'Approved')",[req]),/Receiving post commander/);
}));
test('approvals reject stale source affiliations and inactive target posts', () => as(national, async () => {
  await become(member);
  const req=(await db.query("select public.cvoa_request_post_change($1,$2,'Moving') id",[memberRow,otherPost])).rows[0].id;
  await become(national);
  await db.query('update public.members set post_id=null where id=$1',[memberRow]);
  await failure(() => db.query("select public.cvoa_review_post_change($1,true,'Approved')",[req]),/affiliation changed/);
  await db.query('update public.members set post_id=$1 where id=$2',[post,memberRow]);
  await db.query("update public.posts set status='charter_ready' where id=$1",[otherPost]);
  await failure(() => db.query("select public.cvoa_review_post_change($1,true,'Approved')",[req]),/no longer active/);
}));
test('state and post staff cannot read requests wholly outside their jurisdiction', async () => {
  const foreignMember=uid(205);
  await db.query("insert into public.members(id,profile_id,post_id,full_name,email,membership_status) values($1,$2,$3,'Foreign member','foreign-transfer@example.test','active')",[foreignMember,guest,otherPost]);
  try {
    await as(guest,async () => {
      await db.query("select public.cvoa_request_post_change($1,null,'At-large request')",[foreignMember]);
      await become(stateCommander);
      assert.deepEqual((await db.query('select public.cvoa_transfer_requests() data')).rows[0].data,[]);
      assert.equal((await db.query('select id from public.membership_change_requests')).rows.length,0);
      await become(officer);
      assert.deepEqual((await db.query('select public.cvoa_transfer_requests() data')).rows[0].data,[]);
      await become(national);
      assert.equal((await db.query('select public.cvoa_transfer_requests() data')).rows[0].data.length,1);
    });
  } finally { await db.query('delete from public.members where id=$1',[foreignMember]); }
});

// Execute drive permissions as actual authenticated database roles.
async function driveDirectory(){return rpc('select public.cvoa_drive_directory() data')}
async function driveCreate(w,kind='document',parent=null){return rpc('select public.cvoa_drive_create($1,$2,$3,$4,$5::jsonb) data',[w,parent,kind,'Test document',kind==='document'?JSON.stringify({type:'doc',content:[{type:'paragraph'}]}):null])}
async function actor(user){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user])}
async function driveSave(id,version=1){return rpc("select public.cvoa_drive_save($1,$2,$3::jsonb) data",[id,version,JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Updated'}]}]})])}
test('Drive directory scopes National, state and post access without granting members staff access',()=>as(national,async()=>{
 const all=(await driveDirectory()).workspaces;assert.equal(all.length,5);
 await actor(stateCommander);const state=(await driveDirectory()).workspaces;assert.equal(state.length,2);assert.ok(state.every(w=>w.state==='IN'));assert.equal(state.find(w=>w.kind==='post').level,1);
 await actor(officer);const local=await driveDirectory();assert.equal(local.workspaces.length,1);assert.equal(local.workspaces[0].post_id,post);
 await actor(member);assert.deepEqual(await driveDirectory(),{workspaces:[],recipients:[]});
 await actor(tribunal);assert.deepEqual((await driveDirectory()).workspaces,[]);
}));
test('Drive native revisions reject stale saves and restore without deleting history',()=>as(national,async()=>{
 const ws=(await driveDirectory()).workspaces.find(w=>w.kind==='national').id;const id=await driveCreate(ws);
 assert.equal(await driveSave(id),2);await failure(()=>driveSave(id),/changed|version|another/i);
 const revisions=(await db.query('select * from public.cvoa_drive_revisions where item_id=$1 order by version',[id])).rows;assert.equal(revisions.length,2);
 assert.equal(await rpc('select public.cvoa_drive_restore_revision($1,$2,2) data',[id,revisions[0].id]),3);
 assert.equal((await db.query('select count(*)::int n from public.cvoa_drive_revisions where item_id=$1',[id])).rows[0].n,3);
 await failure(()=>db.query("update public.cvoa_drive_revisions set version=99 where item_id=$1",[id]),/permission denied/);
}));
test('Drive state oversight can read posts but cannot edit their documents',()=>as(national,async()=>{
 const ws=(await driveDirectory()).workspaces.find(w=>w.post_id===post).id;const id=await driveCreate(ws);
 await actor(stateCommander);assert.equal((await db.query('select id from public.cvoa_drive_items where id=$1',[id])).rows.length,1);
 await failure(()=>driveSave(id),/editing permission/);await failure(()=>driveCreate(ws),/authority/);
 await actor(member);assert.equal((await db.query('select id from public.cvoa_drive_items where id=$1',[id])).rows.length,0);
}));
test('Drive sharing inherits folder rights, permits collaborative creation and prevents resharing',()=>as(national,async()=>{
 const ws=(await driveDirectory()).workspaces;const source=ws.find(w=>w.kind==='national').id,target=ws.find(w=>w.post_id===post).id;
 const folder=await driveCreate(source,'folder'),doc=await driveCreate(source,'document',folder);
 const share=await rpc("select public.cvoa_drive_share($1,$2,'edit') data",[folder,target]);
 await actor(officer);assert.equal(await rpc('select public.cvoa_drive_item_level($1) data',[doc]),3);assert.equal(await driveSave(doc),2);
 const child=await driveCreate(source,'document',folder);assert.ok(child);
 await failure(()=>driveCreate(source),/authority/);await failure(()=>rpc("select public.cvoa_drive_share($1,$2,'view') data",[doc,target]),/Only owning/);
 await failure(()=>rpc("select public.cvoa_drive_manage($1,'trash') data",[doc]),/Owning workspace/);
 await actor(national);await rpc('select public.cvoa_drive_revoke_share($1) data',[share]);await actor(officer);
 assert.equal((await db.query('select id from public.cvoa_drive_items where id=$1',[doc])).rows.length,0);
}));
test('Drive comment-only sharing cannot edit, impersonate comments or retain revoked access',()=>as(national,async()=>{
 const ws=(await driveDirectory()).workspaces,source=ws.find(w=>w.kind==='national').id,target=ws.find(w=>w.post_id===post).id;
 const doc=await driveCreate(source);const share=await rpc("select public.cvoa_drive_share($1,$2,'comment') data",[doc,target]);
 await actor(officer);await db.query('insert into public.cvoa_drive_comments(item_id,author_id,body) values($1,$2,$3)',[doc,officer,'Review feedback']);
 await failure(()=>driveSave(doc),/editing permission/);
 await failure(()=>db.query('insert into public.cvoa_drive_comments(item_id,author_id,body) values($1,$2,$3)',[doc,national,'Impersonation']),/row-level security/);
 await actor(national);await rpc('select public.cvoa_drive_revoke_share($1) data',[share]);await actor(officer);
 assert.equal((await db.query('select * from public.cvoa_drive_comments where item_id=$1',[doc])).rows.length,0);
}));
test('Drive trash blocks shared descendants and prevents circular folder moves',()=>as(national,async()=>{
 const ws=(await driveDirectory()).workspaces,source=ws.find(w=>w.kind==='national').id,target=ws.find(w=>w.post_id===post).id;
 const folder=await driveCreate(source,'folder'),child=await driveCreate(source,'folder',folder),doc=await driveCreate(source,'document',child);
 await failure(()=>rpc("select public.cvoa_drive_manage($1,'move',null,$2) data",[folder,child]),/inside itself/);
 await rpc("select public.cvoa_drive_share($1,$2,'edit') data",[folder,target]);await rpc("select public.cvoa_drive_manage($1,'trash') data",[folder]);
 await actor(officer);assert.equal(await rpc('select public.cvoa_drive_item_level($1) data',[doc]),0);await failure(()=>driveCreate(source,'document',child),/authority|folder/);
 await actor(national);assert.deepEqual(await rpc('select public.cvoa_drive_live_ids($1) data',[[doc]]),[]);
 await rpc("select public.cvoa_drive_manage($1,'restore') data",[folder]);assert.deepEqual(await rpc('select public.cvoa_drive_live_ids($1) data',[[doc]]),[doc]);
}));
test('Drive versioned blob uploads enforce workspace and folder authority',()=>as(national,async()=>{
 const ws=(await driveDirectory()).workspaces,source=ws.find(w=>w.kind==='national').id,target=ws.find(w=>w.post_id===post).id;
 const folder=await driveCreate(source,'folder');await rpc("select public.cvoa_drive_share($1,$2,'edit') data",[folder,target]);
 await actor(officer);const id=uid(9801),path=`${source}/${id}/${folder}/version/file.pdf`;
 assert.equal(await rpc('select public.cvoa_drive_storage_write($1) data',[path]),true);
 assert.equal(await rpc('select public.cvoa_drive_storage_write($1) data',[`${source}/${uid(9802)}/root/version/file.pdf`]),false);
 await db.query("insert into storage.objects(bucket_id,name) values('ncc-drive',$1)",[path]);
 await rpc("select public.cvoa_drive_create($1,$2,'file','File',null,$3,'application/pdf',42,$4) data",[source,folder,path,id]);
 assert.equal(await rpc('select public.cvoa_drive_storage_read($1) data',[path]),true);
 // No storage update/delete policy: original versions remain recoverable.
 assert.equal((await db.query("delete from storage.objects where name=$1 returning id",[path])).rows.length,0);
 await actor(national);await rpc("select public.cvoa_drive_manage($1,'trash') data",[folder]);await actor(officer);
 assert.equal(await rpc('select public.cvoa_drive_storage_read($1) data',[path]),false);
}));

test('Drive imports existing files and revocation closes legacy blob access',()=>as(national,async()=>{
 const file=(await db.query('select * from public.cvoa_drive_items where id=$1',[uid(9702)])).rows[0];assert.equal(file.storage_path,'legacy/resource.pdf');
 const share=(await db.query('select id from public.cvoa_drive_shares where item_id=$1',[uid(9701)])).rows[0].id;
 await actor(member);assert.equal(await rpc('select public.cvoa_drive_storage_read($1) data',['legacy/resource.pdf']),true);
 assert.equal((await db.query("select * from storage.objects where name='legacy/resource.pdf'")).rows.length,1);
 await actor(national);await rpc('select public.cvoa_drive_revoke_share($1) data',[share]);await actor(member);
 assert.equal((await db.query("select * from storage.objects where name='legacy/resource.pdf'")).rows.length,0);
}));
test('Drive approval is enforced by the database and suspended users lose document access',()=>as(national,async()=>{
 const ws=(await driveDirectory()).workspaces.find(w=>w.kind==='national').id,id=await driveCreate(ws);
 await failure(()=>rpc("select public.cvoa_drive_save($1,null,'{}'::jsonb) data",[id]),/changed/);
 await failure(()=>rpc("select public.cvoa_drive_save($1,1,'{}'::jsonb) data",[id]),/valid document/);
 await rpc("select public.cvoa_drive_save($1,1,$2::jsonb,'approved') data",[id,JSON.stringify({type:'doc'})]);
 await failure(()=>rpc("select public.cvoa_drive_save($1,2,$2::jsonb,'approved') data",[id,JSON.stringify({type:'doc'})]),/Reopen/);
 await updateAccount(nationalStaff,0,{suspended:true});await actor(nationalStaff);
 assert.equal((await db.query('select * from public.cvoa_drive_items')).rows.length,0);
 await failure(()=>driveDirectory(),/Active account/);
}));

const uroRules={version:'URO-2026.10-present-v1',denominator:'eligible_present',speaking_seconds:120,configured:true,remote_authorized:false,notice_hours:24,notice_authority:'Fixture governing notice provision',voting_authority:'Fixture voting body provision',recusal_counts_quorum:true};
async function uroSetup(jurisdiction='national',extra={}){
 const b=await rpc('select public.uro_body_setup(null,$1::jsonb) data',[JSON.stringify({name:'Test governing body',jurisdiction,state:jurisdiction==='state'?'IN':null,post_id:jurisdiction==='post'?post:null,chair_id:national,secretary_id:officer,members:[],...extra,rules:{...(extra.rules||uroRules),configured:false}})]);
 const candidates=(await db.query('select * from public.uro_candidates($1)',[b])).rows;
 const members=candidates.filter(c=>[national,officer,member].includes(c.profile_id)).map(c=>({...c,voting:true}));
 await rpc('select public.uro_body_setup($1,$2::jsonb) data',[b,JSON.stringify({name:'Test governing body',rules:uroRules,chair_id:national,secretary_id:officer,members,...extra})]);
 const s=await rpc('select public.uro_create($1,$2::jsonb) data',[b,JSON.stringify({title:'URO test meeting',type:'regular',scheduled_at:new Date().toISOString()})]);return {b,s};
}
async function uroState(s){return rpc('select public.uro_state($1) data',[s])}
async function uroCommand(s,action,data={}){const state=await uroState(s);return rpc('select public.uro_command($1,$2,$3::jsonb,$4) data',[s,action,JSON.stringify(data),state.session.version])}
async function uroStart(s){const state=await uroState(s);for(const p of state.participants)await uroCommand(s,'attendance',{id:p.id,presence:'present'});await uroCommand(s,'start');const a=await uroCommand(s,'agenda',{title:'Prepared decision',classification:'decision',readiness:'ready_for_decision',late_reason:'Urgent fixture business'});await uroCommand(s,'open_item',{id:a});return a}
async function uroMotion(s,kind='main',context={}){const id=await uroCommand(s,'propose',{kind,text:'Exact decision text',context});await actor(officer);await uroCommand(s,'second',{id});await actor(national);await uroCommand(s,'introduce',{id});await uroCommand(s,'stage',{state:'final_question'});await uroCommand(s,'open_vote',{id,method:'digital'});return id}
test('URO complete majority vote includes abstentions and preserves original decision text',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);const id=await uroMotion(s);
 await uroCommand(s,'vote',{id,choice:'yes'});await actor(officer);await uroCommand(s,'vote',{id,choice:'yes'});await actor(member);await uroCommand(s,'vote',{id,choice:'abstain'});await actor(national);await uroCommand(s,'close_vote',{id});
 const state=await uroState(s),p=state.proposals.find(p=>p.id===id);assert.equal(p.status,'adopted');assert.equal(p.result.denominator,3);assert.equal(p.result.required,2);assert.equal(p.result.abstain,1);assert.equal(state.decisions[0].text,'Exact decision text');
 await failure(()=>db.query("update public.uro_decisions set text='Forged' where id=$1",[state.decisions[0].id]),/permission denied/);
}));
test('URO exact two thirds passes and missing votes remain in denominator',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);const id=await uroMotion(s,'close_debate');await uroCommand(s,'vote',{id,choice:'yes'});await actor(officer);await uroCommand(s,'vote',{id,choice:'yes'});await actor(national);await uroCommand(s,'close_vote',{id,opportunity_confirmed:true});const p=(await uroState(s)).proposals[0];assert.equal(p.status,'adopted');assert.equal(p.result.required,2);assert.equal(p.result.not_cast,1);
}));
test('URO a majority of votes cast is insufficient without majority present',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);const id=await uroMotion(s);await uroCommand(s,'vote',{id,choice:'yes'});await actor(national);await uroCommand(s,'close_vote',{id,opportunity_confirmed:true});assert.equal((await uroState(s)).proposals[0].status,'defeated');
}));
test('URO state and post oversight remains scoped and does not grant a vote',()=>as(national,async()=>{
 const {s,b}=await uroSetup('post');await actor(uid(5));assert.equal((await uroState(s)).body.id,b);await failure(()=>uroCommand(s,'propose',{kind:'main',text:'Unauthorized'}),/Voting member/);await failure(()=>uroCommand(s,'start'),/Assigned Chair/);await actor(guest);await failure(()=>uroState(s),/Meeting access/);
}));
test('URO private notes and secret ballots are not exposed to National observers',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);await actor(officer);await uroCommand(s,'note',{body:'Secretary confidential working note'});await actor(national);assert.equal((await uroState(s)).notes.length,0);await failure(()=>db.query('select * from public.uro_private_notes'),/permission denied/);
 const id=await uroCommand(s,'propose',{kind:'main',text:'Secret choice'});await actor(officer);await uroCommand(s,'second',{id});await actor(national);await uroCommand(s,'introduce',{id});await uroCommand(s,'stage',{state:'final_question'});await uroCommand(s,'open_vote',{id,method:'secret'});await actor(member);await uroCommand(s,'vote',{id,choice:'no'});await actor(national);const state=await uroState(s);assert.equal(state.my_ballots.length,0);assert.equal(state.roll_calls.length,0);assert.ok(!JSON.stringify(state.events).includes('"choice"'));await failure(()=>db.query('select * from public.uro_ballots'),/permission denied/);
}));
test('URO freezes electorate, detects stale writes and blocks uncertified publication',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);const id=await uroMotion(s),state=await uroState(s);await failure(()=>uroCommand(s,'attendance',{id:state.participants[0].id,presence:'left'}),/open vote/);await failure(()=>rpc('select public.uro_command($1,$2,$3::jsonb,1) data',[s,'vote',JSON.stringify({id,choice:'yes'})]),/changed/);await failure(()=>uroCommand(s,'publish_record'),/Certify/);
}));
test('URO quorum loss blocks binding business and guests do not count',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroCommand(s,'guest',{name:'Visiting observer'});const state=await uroState(s);await uroCommand(s,'attendance',{id:state.participants.find(p=>p.profile_id===national).id,presence:'present'});await uroCommand(s,'attendance',{id:state.participants.find(p=>p.guest).id,presence:'present'});await uroCommand(s,'start');assert.equal((await uroState(s)).quorum.present,1);await failure(()=>uroCommand(s,'propose',{kind:'main',text:'No quorum'}),/quorum/);
}));
test('URO certification, publication and correction remain distinct and author enforced',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);await uroCommand(s,'adjourn',{action_review_confirmed:true});await failure(()=>uroCommand(s,'certify'),/Secretary/);await actor(officer);await uroCommand(s,'certify');await uroCommand(s,'correct_record',{target:'Attendance spelling',previous:'Old',new:'Correct name',reason:'Verified spelling',authority:'Secretary factual correction'});const state=await uroState(s);assert.equal(state.session.minutes_state,'certified');assert.equal(state.session.published_at,null);assert.match(state.session.minutes,/CORRECTION ADDENDA/);assert.equal(state.corrections.length,1);await uroCommand(s,'publish_record');assert.ok((await uroState(s)).session.published_at);
}));
test('URO email notice jobs are authorized, idempotent and hidden from ordinary readers',()=>as(national,async()=>{
 const {s}=await uroSetup();const job=await rpc('select public.uro_prepare_notice($1) data',[s]);assert.equal(await rpc('select public.uro_prepare_notice($1) data',[s]),job);await failure(()=>db.query('select email from public.uro_notice_deliveries'),/permission denied/);await failure(()=>rpc('select public.uro_finish_notice($1) data',[job]),/permission denied/);await actor(member);await failure(()=>rpc('select public.uro_prepare_notice($1) data',[s]),/Assigned Chair or Secretary/);
}));
test('URO amendments require germaneness and default to majority rather than two thirds',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);const parent=await uroCommand(s,'propose',{kind:'main',text:'Original proposal'}),id=await uroCommand(s,'propose',{kind:'amendment',parent_id:parent,text:'Amended exact text'});await failure(()=>uroCommand(s,'introduce',{id}),/germane/);await uroCommand(s,'introduce',{id,germaneness_reason:'Directly adjusts the pending proposal'});assert.equal((await uroState(s)).proposals.find(p=>p.id===id).threshold,'majority');await failure(()=>uroCommand(s,'propose',{kind:'amendment',parent_id:id,text:'Nested amendment'}),/One amendment/);
}));
test('URO Chair challenge asks to sustain and requires two thirds NO to reverse',()=>as(national,async()=>{
 const {s}=await uroSetup();await uroStart(s);await actor(member);const challenge=await uroCommand(s,'challenge',{kind:'point_of_procedure',body:'Procedure objection'});await actor(national);await uroCommand(s,'rule',{id:challenge,ruling:'Chair finding'});await actor(member);const id=await uroCommand(s,'propose',{kind:'chair_challenge',text:'Challenge existing ruling',context:{challenge_id:challenge}});await actor(officer);await uroCommand(s,'second',{id});await actor(national);await uroCommand(s,'introduce',{id});await uroCommand(s,'open_vote',{id,method:'digital'});await uroCommand(s,'vote',{id,choice:'no'});await actor(officer);await uroCommand(s,'vote',{id,choice:'no'});await actor(member);await uroCommand(s,'vote',{id,choice:'abstain'});await actor(national);await uroCommand(s,'close_vote',{id});const state=await uroState(s);assert.equal(state.challenges[0].disposition,'overturned');assert.equal(state.proposals[0].current_text,'Shall the ruling of the Chair be sustained?');
}));
test('URO missing recusal authority blocks affected votes and archived facts cannot be edited',()=>as(national,async()=>{
 const {s}=await uroSetup('national',{rules:{...uroRules,recusal_counts_quorum:null}});await uroStart(s);await actor(member);await uroCommand(s,'recuse',{reason:'Declared conflict'});await actor(national);assert.equal((await uroState(s)).quorum.recusal_rule_missing,true);await failure(()=>uroCommand(s,'propose',{kind:'main',text:'Conflicted vote'}),/quorum/);await uroCommand(s,'adjourn',{action_review_confirmed:true});await actor(officer);await uroCommand(s,'certify');await failure(()=>uroCommand(s,'agenda',{title:'Silent changed record',classification:'discussion'}),/Archived/);
}));
test('URO unfinished business carries forward and appears in staff queue',()=>as(national,async()=>{
 const {s,b}=await uroSetup('post');const agenda=await uroStart(s);await uroCommand(s,'action',{title:'Complete assignment',owner_id:officer,due_date:'2020-01-01'});await uroCommand(s,'adjourn',{action_review_confirmed:true});const queue=await rpc('select public.cvoa_action_queue() data');assert.ok(queue.items.some(i=>i.path===`/meetings/session/${s}`));const next=await rpc('select public.uro_create($1,$2::jsonb) data',[b,JSON.stringify({title:'Follow up',type:'regular',scheduled_at:'2030-01-01T00:00:00Z'})]);assert.ok((await uroState(next)).agenda.some(a=>a.source_agenda_id===agenda));
}));
test('URO delivery completion records actual accepted recipients without duplicating notice events',()=>as(national,async()=>{
 const {s}=await uroSetup(),job=await rpc('select public.uro_prepare_notice($1) data',[s]);
 await db.exec("set local role service_role; select set_config('request.jwt.claim.role','service_role',true)");
 await db.query("update public.uro_notice_deliveries set state='sent',sent_at=now() where job_id=$1",[job]);const result=await rpc('select public.uro_finish_notice($1) data',[job]);assert.equal(result.sent,3);assert.equal(result.incomplete,0);await rpc('select public.uro_finish_notice($1) data',[job]);
 await db.exec("set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true)");
 const state=await uroState(s);assert.equal(state.notices.length,1);assert.equal(state.events.filter(e=>e.action==='NoticeDeliveryRecorded').length,1);await uroCommand(s,'agenda',{title:'Updated packet',classification:'discussion'});assert.notEqual(await rpc('select public.uro_prepare_notice($1) data',[s]),job);
}));
