import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { createRequire } from "node:module";
const db = new PGlite(),
  id = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
before(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,full_name text,title text,role text,access_suspended boolean default false,deleted_at timestamptz,is_test_account boolean default false);
 create table members(id uuid primary key,full_name text,address text,membership_status text,deleted_at timestamptz,updated_at timestamptz,profile_id uuid,email text,phone text,dd214_storage_path text,stripe_subscription_id text);
 grant usage on schema public,auth to authenticated;
 insert into profiles(id,full_name,role) values('${id(1)}','Commander','national_commander'),('${id(2)}','NCC candidate','national_staff'),('${id(3)}','Other National staff','national_staff'),('${id(4)}','State','state_commander'),('${id(5)}','Company','post_commander'),('${id(6)}','Member','member');
 insert into members(id,full_name,address,membership_status,updated_at,email,phone,dd214_storage_path,stripe_subscription_id) values('${id(101)}','Zoe Member','10 Main St, Apt 2\nCity IN 47801','active',now(),'private@example.org','secret-phone','secret-DD214','secret-stripe'),('${id(102)}','Alice Member',null,'active',now(),'secret-email',null,null,null),('${id(103)}','Lapsed Member','Other address','lapsed',now(),null,null,null,null),('${id(104)}','Removed Member','Removed address','active',now(),null,null,null,null);
 update members set deleted_at=now() where id='${id(104)}';`);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261014133554_ncc_membership_list_export.sql",
      "utf8",
    ),
  );
});
after(() => db.close());
async function as(n, sql) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
test("only the Commander and explicitly designated NCC staff may obtain the list", async () => {
  assert.equal(
    (await as(1, "select cvoa_membership_export_access() data")).rows[0].data
      .allowed,
    true,
  );
  for (const n of [2, 3, 4, 5, 6]) {
    assert.equal(
      (await as(n, "select cvoa_membership_export_access() data")).rows[0].data
        .allowed,
      false,
    );
    await assert.rejects(as(n, "select cvoa_membership_list()"));
  }
  await as(1, `select cvoa_set_ncc_export_designation('${id(2)}',true)`);
  assert.equal(
    (await as(2, "select cvoa_membership_export_access() data")).rows[0].data
      .allowed,
    true,
  );
  assert.equal(
    (await as(2, "select cvoa_membership_export_access() data")).rows[0].data
      .can_manage,
    false,
  );
  await assert.rejects(
    as(2, `select cvoa_set_ncc_export_designation('${id(3)}',true)`),
  );
  await assert.rejects(
    as(1, `select cvoa_set_ncc_export_designation('${id(6)}',true)`),
  );
  await assert.rejects(
    as(2, "select * from membership_private.ncc_export_designations"),
  );
});
test("the list returns only limited fields, keeps unknown entitlements null, and respects scope", async () => {
  const active = (await as(2, "select cvoa_membership_list() data")).rows[0]
    .data;
  assert.equal(active.rows.length, 2);
  assert.equal(active.rows[0].name, "Alice Member");
  assert.equal(active.rows[0].votes_entitled, null);
  assert.equal(active.rows[0].membership_class, null);
  assert.deepEqual(
    Object.keys(active.rows[0]).sort(),
    [
      "id",
      "name",
      "address",
      "membership_class",
      "votes_entitled",
      "voting_entitlement",
    ].sort(),
  );
  const all = (
    await as(
      1,
      "select cvoa_membership_list(false,'Written request review') data",
    )
  ).rows[0].data;
  assert.equal(all.rows.length, 3);
  const serialized = JSON.stringify(all);
  for (const secret of [
    "private@example.org",
    "secret-phone",
    "secret-DD214",
    "secret-stripe",
    "secret-email",
  ])
    assert.equal(serialized.includes(secret), false);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from membership_private.list_audit where action='membership_list_generated'",
      )
    ).rows[0].n,
    1,
  );
});
test("NCC may record reviewed details, including zero votes, with a private audit trail", async () => {
  await as(
    2,
    `select cvoa_save_membership_list_details('${id(102)}','Correct mailing address','Associate Member',0,'No vote on this referendum','Reviewed governing record')`,
  );
  const row = (
    await as(2, "select cvoa_membership_list() data")
  ).rows[0].data.rows.find((r) => r.id === id(102));
  assert.equal(row.votes_entitled, 0);
  assert.equal(row.membership_class, "Associate Member");
  assert.equal(row.address, "Correct mailing address");
  await assert.rejects(
    as(
      3,
      `select cvoa_save_membership_list_details('${id(102)}','bad','bad',1,'','not authorized')`,
    ),
  );
  await assert.rejects(
    as(
      2,
      `select cvoa_save_membership_list_details('${id(102)}','a','b',-1,'','bad count')`,
    ),
  );
  const audit = (
    await db.query(
      "select details from membership_private.list_audit where action='membership_list_corrected'",
    )
  ).rows[0].details;
  assert.equal(audit.before.address, null);
  assert.equal(audit.after.votes, 0);
});
test("suspension, revocation, and a changed role immediately revoke export access", async () => {
  await db.exec(
    `update profiles set access_suspended=true where id='${id(2)}'`,
  );
  await assert.rejects(as(2, "select cvoa_membership_list()"));
  await db.exec(
    `update profiles set access_suspended=false,role='member' where id='${id(2)}'`,
  );
  await assert.rejects(as(2, "select cvoa_membership_list()"));
  await db.exec(
    `update profiles set role='national_staff' where id='${id(2)}'`,
  );
  await as(1, `select cvoa_set_ncc_export_designation('${id(2)}',false)`);
  await assert.rejects(as(2, "select cvoa_membership_list()"));
});
test("exports over 1,000 members are not truncated", async () => {
  await db.exec(
    "insert into members(id,full_name,membership_status) select gen_random_uuid(),'Bulk '||g,'active' from generate_series(1,1100) g",
  );
  const result = (await as(1, "select cvoa_membership_list() data")).rows[0]
    .data;
  assert.equal(result.rows.length, 1102);
});
test("CSV exports exactly the production columns and neutralizes spreadsheet formulas", async () => {
  const file = "/tmp/membership-list-export.cjs";
  await build({
    entryPoints: ["src/lib/membershipListExport.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: file,
  });
  const util = createRequire(import.meta.url)(file);
  const csv = util.membershipListCsv([
    {
      id: "private-id",
      name: '=HYPERLINK("evil")',
      address: '1 Main St\nApt "B"',
      membership_class: "Member",
      votes_entitled: 0,
      voting_entitlement: "Referendum only",
      email: "should-not-export",
      phone: "also-private",
    },
  ]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('Apt ""B""'));
  assert.ok(csv.includes('"0"'));
  assert.equal(csv.includes("private-id"), false);
  assert.equal(csv.includes("should-not-export"), false);
  assert.equal(csv.includes("also-private"), false);
  assert.equal(
    util.missingListFields({
      name: "A",
      address: "A",
      membership_class: "A",
      votes_entitled: 0,
    }).length,
    0,
  );
  assert.ok(
    util
      .membershipListFilename("2026-10-14T00:00:00Z", true, true)
      .includes("REVIEW-REQUIRED"),
  );
  fs.unlinkSync(file);
});
