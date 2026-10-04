import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const national = id(1),
  stateIN = id(2),
  stateOH = id(3),
  officer = id(4),
  member = id(5),
  other = id(6),
  unassigned = id(7),
  postA = id(101),
  postB = id(102),
  memberA = id(201),
  memberB = id(202),
  application = id(301);
before(async () => {
  await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
 create type membership_type as enum('annual','lifetime');
 create table public.profiles(id uuid primary key,full_name text,email text,role text,post_id uuid,state text,title text);
 create table public.posts(id uuid primary key,name text,city text,state text,status text,health_status text);
 create table public.members(id uuid primary key,profile_id uuid,post_id uuid,full_name text,membership_type membership_type,membership_status text,expires_at date,joined_at date,auto_renew boolean,stripe_subscription_id text);
 create table public.post_applications(id uuid primary key default gen_random_uuid(),post_id uuid,name text,email text,city text,state text,status text default 'new_inquiry',created_at timestamptz default now());
 create table public.membership_payments(id uuid primary key default gen_random_uuid(),member_id uuid,post_id uuid,membership_type membership_type,amount numeric,status text,stripe_checkout_session_id text,stripe_payment_intent_id text,paid_at timestamptz,created_at timestamptz default now());
 create table public.founding_team_members(id uuid,profile_id uuid,post_id uuid,position text,verification_status text);
 create table public.uro_meetings(id uuid primary key,post_id uuid,title text,meeting_date date,status text);
 create table public.uro_action_items(id uuid,post_id uuid,meeting_id uuid,description text,due_date date,status text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create function public.is_national_role() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role in ('national_commander','national_staff'))$$;
 grant select,insert,update,delete on all tables in schema public,storage to authenticated;
 insert into public.posts values('${postA}','Indiana Post','Terre Haute','IN','active_post','green'),('${postB}','Ohio Post','Columbus','OH','active_post','yellow');
 insert into public.profiles values
 ('${national}','National','national@example.test','national_commander',null,null,null),
 ('${stateIN}','Indiana Commander','statein@example.test','state_commander',null,'IN',null),
 ('${stateOH}','Ohio Commander','stateoh@example.test','state_commander',null,'OH',null),
 ('${officer}','Post Officer','officer@example.test','post_officer','${postA}',null,null),
 ('${member}','Member A','member@example.test','member','${postA}',null,null),
 ('${other}','Member B','other@example.test','member','${postB}',null,null),
 ('${unassigned}','Unassigned State','unassigned@example.test','state_commander',null,null,null);
 insert into auth.users select id,email,now(),null from public.profiles;
 insert into public.members values('${memberA}','${member}','${postA}','Member A','annual','active','2027-01-01','2020-01-01',false,null),('${memberB}','${other}','${postB}','Member B','annual','active','2026-01-01','2021-01-01',false,null);
 insert into public.post_applications(id,email,city,state) values('${application}','member@example.test','Terre Haute','IN');
 insert into public.uro_meetings values('${id(401)}','${postA}','Indiana Minutes',current_date-1,'in_progress'),('${id(402)}','${postB}','Ohio Minutes',current_date-1,'in_progress');
 insert into public.uro_action_items values('${id(501)}','${postA}','${id(401)}','Indiana overdue task',current_date-1,'open'),('${id(502)}','${postB}','${id(402)}','Ohio overdue task',current_date-1,'open');
 `);
  await db.exec('alter table public.members enable row level security');
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261003190000_organization_workspaces.sql",
      "utf8",
    ),
  );
});
after(() => db.close());
async function as(user, fn, role = "authenticated") {
  await db.exec("begin");
  try {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",
      [user, role],
    );
    await db.exec(`set local role ${role}`);
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}
const rpc = async (sql, args = []) =>
  (await db.query(sql, args)).rows[0].result;
test("state commander sees only assigned-state posts and totals", async () =>
  as(stateIN, async () => {
    const r = await rpc("select public.cvoa_state_workspace() result");
    assert.equal(r.posts.length, 1);
    assert.equal(r.posts[0].id, postA);
    assert.equal(r.posts[0].active_members, 1);
  }));
test("unassigned state commander receives an actionable configuration error", async () =>
  as(unassigned, () =>
    assert.rejects(
      rpc("select public.cvoa_state_workspace() result"),
      /assign your state/,
    ),
  ));
test("ordinary members cannot call state oversight or staff queues", async () => {
  await as(member, () =>
    assert.rejects(
      rpc("select public.cvoa_state_workspace() result"),
      /access/,
    ),
  );
  await as(member, () =>
    assert.rejects(
      rpc("select public.cvoa_action_queue() result"),
      /Staff access/,
    ),
  );
});
test("post action queue includes own minutes/tasks and excludes another post", async () =>
  as(officer, async () => {
    const r = await rpc("select public.cvoa_action_queue() result");
    assert.ok(r.items.some((x) => x.title.includes("Indiana overdue")));
    assert.ok(r.items.some((x) => x.title.includes("Indiana Minutes")));
    assert.equal(
      r.items.some((x) => x.title.includes("Ohio")),
      false,
    );
  }));
test("National oversight contains both states", async () =>
  as(national, async () =>
    assert.equal(
      (await rpc("select public.cvoa_state_workspace() result")).posts.length,
      2,
    ),
  ));
test("member cannot request a change for another member", async () =>
  as(member, () =>
    assert.rejects(
      rpc("select public.cvoa_request_post_change($1,$2,$3) result", [
        memberB,
        postA,
        "Transfer",
      ]),
      /linked/,
    ),
  ));
test("transfer remains pending until National approval and then updates membership/profile atomically", async () => {
  await db.exec("begin");
  try {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",
      [member],
    );
    await db.exec("set local role authenticated");
    const request = await rpc(
      "select public.cvoa_request_post_change($1,$2,$3) result",
      [memberA, postB, "Moving to Ohio"],
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select post_id from members where id=$1", [memberA]))
        .rows[0].post_id,
      postA,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      national,
    ]);
    await db.exec("set local role authenticated");
    await rpc("select public.cvoa_review_post_change($1,true,$2) result", [
      request,
      "Approved relocation",
    ]);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select post_id from members where id=$1", [memberA]))
        .rows[0].post_id,
      postB,
    );
    assert.equal(
      (await db.query("select post_id from profiles where id=$1", [member]))
        .rows[0].post_id,
      postB,
    );
  } finally {
    await db.exec("rollback");
  }
});
test("post staff cannot approve affiliation requests", async () =>
  as(officer, () =>
    assert.rejects(
      rpc("select public.cvoa_review_post_change($1,true,$2) result", [
        id(999),
        "Approve",
      ]),
      /National approval/,
    ),
  ));
test("member sees own legacy application by verified Auth email and no other applications", async () =>
  as(member, async () => {
    const r = await rpc("select public.cvoa_my_applications() result");
    assert.equal(r.length, 1);
    assert.equal(r[0].id, application);
  }));
test("signed-in application insert cannot forge another applicant or email", async () =>
  as(member, async () => {
    const r = await db.query(
      "insert into post_applications(email,applicant_profile_id,state) values($1,$2,$3) returning email,applicant_profile_id",
      ["other@example.test", other, "IN"],
    );
    assert.equal(r.rows[0].applicant_profile_id, member);
    assert.equal(r.rows[0].email, "member@example.test");
  }));
test("member cannot read or post another applicant’s update", async () =>
  as(other, async () => {
    assert.equal(
      (
        await db.query(
          "select * from post_application_updates where application_id=$1",
          [application],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into post_application_updates(application_id,author_id,kind,message) values($1,$2,$3,$4)",
        [application, other, "reply", "My reply"],
      ),
      /row-level security/,
    );
  }));
test("applicant can post own replies but cannot impersonate National feedback", async () => {
  await as(member, async () => {
    await db.query(
      "insert into post_application_updates(application_id,author_id,kind,message) values($1,$2,$3,$4)",
      [application, member, "reply", "Requested information"],
    );
  });
  await as(member, () =>
    assert.rejects(
      db.query(
        "insert into post_application_updates(application_id,author_id,kind,message) values($1,$2,$3,$4)",
        [application, member, "feedback", "Approved"],
      ),
      /row-level security/,
    ),
  );
});
test("private application documents restrict reads to uploader and National", async () =>
  as(member, async () => {
    await db.query(
      "insert into storage.objects(bucket_id,name) values($1,$2)",
      ["cvoa-application-documents", `${member}/file`],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      other,
    ]);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      national,
    ]);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
  }));
test("post officer can create own campaign while state command is read-only", async () => {
  await as(officer, async () => {
    await db.query(
      "insert into fundraising_campaigns(post_id,title,goal_cents,owner_name,deadline) values($1,$2,10000,$3,current_date)",
      [postA, "Golf Scramble", "Officer"],
    );
  });
  await as(stateIN, () =>
    assert.rejects(
      db.query(
        "insert into fundraising_campaigns(post_id,title,goal_cents,owner_name,deadline) values($1,$2,10000,$3,current_date)",
        [postA, "Campaign", "State"],
      ),
      /row-level security/,
    ),
  );
});
test("campaign insert rejects another post and negative monetary amounts", async () => {
  await as(officer, () =>
    assert.rejects(
      db.query(
        "insert into fundraising_campaigns(post_id,title,goal_cents,owner_name,deadline) values($1,$2,10000,$3,current_date)",
        [postB, "Campaign", "Officer"],
      ),
      /row-level security/,
    ),
  );
  await as(officer, () =>
    assert.rejects(
      db.query(
        "insert into fundraising_campaigns(post_id,title,goal_cents,owner_name,deadline) values($1,$2,-1,$3,current_date)",
        [postA, "Campaign", "Officer"],
      ),
      /check constraint/,
    ),
  );
});
test("cross-post connected member record is denied", async () =>
  as(officer, () =>
    assert.rejects(
      rpc("select public.cvoa_member_record($1) result", [memberB]),
      /restricted/,
    ),
  ));
test("own-post connected record exposes account activation and recent payments", async () =>
  as(officer, async () => {
    const r = await rpc("select public.cvoa_member_record($1) result", [
      memberA,
    ]);
    assert.equal(r.account.email_confirmed, true);
    assert.equal(r.account.last_sign_in_at, null);
    assert.equal(r.post.name, "Indiana Post");
  }));
test("fulfillment adds renewal after existing expiry, preserves join date and ignores repeat webhook", async () => {
  await db.exec("begin");
  try {
    await db.query(
      "insert into membership_payments(member_id,membership_type,amount,status,stripe_checkout_session_id) values($1,'annual',49.99,'pending','session-test')",
      [memberA],
    );
    await db.query(
      "select set_config('request.jwt.claim.role','service_role',true)",
    );
    await db.exec("set local role service_role");
    const args = [
      "session-test",
      memberA,
      "annual",
      "pi-test",
      null,
      "2026-10-03T12:00:00Z",
    ];
    assert.equal(
      await rpc(
        "select public.cvoa_fulfill_membership($1,$2,$3,$4,$5,$6) result",
        args,
      ),
      true,
    );
    assert.equal(
      await rpc(
        "select public.cvoa_fulfill_membership($1,$2,$3,$4,$5,$6) result",
        args,
      ),
      false,
    );
    await db.exec("reset role");
    const m = (
      await db.query(
        "select expires_at::text,joined_at::text from members where id=$1",
        [memberA],
      )
    ).rows[0];
    assert.equal(m.expires_at, "2028-01-01");
    assert.equal(m.joined_at, "2020-01-01");
  } finally {
    await db.exec("rollback");
  }
});
test("lifetime fulfillment changes the existing member rather than creating another", async () => {
  await db.exec("begin");
  try {
    await db.query(
      "insert into membership_payments(member_id,membership_type,amount,status,stripe_checkout_session_id) values($1,'lifetime',499.99,'pending','lifetime-test')",
      [memberA],
    );
    await db.query(
      "select set_config('request.jwt.claim.role','service_role',true)",
    );
    await db.exec("set local role service_role");
    await rpc(
      "select public.cvoa_fulfill_membership($1,$2,$3,$4,$5,$6) result",
      [
        "lifetime-test",
        memberA,
        "lifetime",
        "pi-test",
        null,
        "2026-10-03T12:00:00Z",
      ],
    );
    await db.exec("reset role");
    const m = (await db.query("select * from members where id=$1", [memberA]))
      .rows[0];
    assert.equal(m.membership_type, "lifetime");
    assert.equal(m.expires_at, null);
    assert.equal(m.joined_at.toISOString().slice(0, 10), "2020-01-01");
    assert.equal(
      (await db.query("select count(*)::int n from members")).rows[0].n,
      2,
    );
  } finally {
    await db.exec("rollback");
  }
});
test("an authenticated member cannot invoke payment fulfillment", async () =>
  as(member, () =>
    assert.rejects(
      rpc("select public.cvoa_fulfill_membership($1,$2,$3,$4,$5,$6) result", [
        "x",
        memberA,
        "lifetime",
        null,
        null,
        "2026-10-03",
      ]),
      /permission denied/,
    ),
  ));

const source = fs
  .readFileSync("src/lib/workspaces.ts", "utf8")
  .replace(/^import.*$/gm, "");
const context = { exports: {}, Intl, Error };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
);
test("campaign money parser preserves cents and rejects excess precision and negative amounts", () => {
  assert.equal(context.exports.toCents("499.99"), 49999);
  assert.equal(context.exports.toCents("0.01"), 1);
  for (const invalid of ["-1", "1.001", "1e3", "0", "NaN"])
    assert.throws(() => context.exports.toCents(invalid));
});
test("lifetime and auto-renew members receive appropriate billing actions", () => {
  assert.equal(
    context.exports.membershipActions({
      membership_type: "lifetime",
      membership_status: "active",
      auto_renew: false,
    }).renew,
    false,
  );
  assert.equal(
    context.exports.membershipActions({
      membership_type: "annual",
      membership_status: "active",
      auto_renew: true,
    }).upgrade,
    false,
  );
  assert.equal(
    context.exports.membershipActions({
      membership_type: "annual",
      membership_status: "lapsed",
      auto_renew: false,
    }).renew,
    true,
  );
});

test('personal membership remains readable at large or across a staff appointment post',async()=>as(member,async()=>{
 await db.exec('reset role');await db.query('update members set post_id=null where id=$1',[memberA]);await db.exec('set local role authenticated');
 const r=await db.query('select id from members');assert.equal(r.rows.length,1);assert.equal(r.rows[0].id,memberA)
}))
test('state escalation stays within assigned state and reaches National',async()=>as(stateIN,async()=>{
 await db.query('insert into state_escalations(post_id,subject,message) values($1,$2,$3)',[postA,'Missing report','Please follow up'])
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[stateOH]);assert.equal((await db.query('select * from state_escalations')).rows.length,0)
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[national]);assert.equal((await db.query('select * from state_escalations')).rows.length,1)
}))
test('state cannot resolve its own escalation using National-only update',async()=>as(stateIN,async()=>{
 const r=await db.query('insert into state_escalations(post_id,subject,message) values($1,$2,$3) returning id',[postA,'Report','Follow up'])
 const updated=await db.query("update state_escalations set status='resolved',response='Self approval' where id=$1 returning id",[r.rows[0].id]);assert.equal(updated.rows.length,0)
}))
test('National attachments are readable only by the linked applicant and National',async()=>as(national,async()=>{
 const path=`${national}/form.pdf`;await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['cvoa-application-documents',path]);
 await db.query('insert into post_application_updates(application_id,author_id,kind,message,document_path) values($1,$2,$3,$4,$5)',[application,national,'document_request','Complete this form',path])
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[member]);assert.equal((await db.query('select * from storage.objects')).rows.length,1)
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);assert.equal((await db.query('select * from storage.objects')).rows.length,0)
}))
test('campaign completion requires results and preserves financial entry history',async()=>as(officer,async()=>{
 const r=await db.query('insert into fundraising_campaigns(post_id,title,goal_cents,owner_name,deadline) values($1,$2,10000,$3,current_date) returning id',[postA,'Golf','Officer']);const campaignId=r.rows[0].id
 await db.query('insert into fundraising_entries(campaign_id,entry_type,amount_cents,entry_date,description) values($1,$2,12345,current_date,$3)',[campaignId,'income','Received donation'])
 await db.query("update fundraising_campaigns set status='completed',results_note='Raised goal and reconciled expenses' where id=$1",[campaignId])
 assert.equal((await db.query('select amount_cents::int amount from fundraising_entries where campaign_id=$1',[campaignId])).rows[0].amount,12345)
 await assert.rejects(db.query('insert into fundraising_entries(campaign_id,entry_type,amount_cents,entry_date,description) values($1,$2,1,current_date,$3)',[campaignId,'income','Post-close entry']),/row-level security/)
}))
test('campaign owners cannot rewrite audit authorship',async()=>as(officer,async()=>{
 const r=await db.query('insert into fundraising_campaigns(post_id,title,goal_cents,owner_name,deadline) values($1,$2,10000,$3,current_date) returning id',[postA,'Golf','Officer']);
 await assert.rejects(db.query('update fundraising_campaigns set created_by=$1 where id=$2',[national,r.rows[0].id]),/permission denied/)
}))

test('checkout lease serializes creation and then returns the saved session',async()=>as(national,async()=>{
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.role','service_role',true)");await db.exec('set local role service_role');
 const first=await rpc('select public.cvoa_reserve_checkout($1) result',[memberA]);assert.ok(first.token);assert.equal(first.busy,false);
 assert.equal((await rpc('select public.cvoa_reserve_checkout($1) result',[memberA])).busy,true);
 await db.query('update membership_checkout_attempts set session_id=$1 where member_id=$2',['saved-session',memberA]);const resumed=await rpc('select public.cvoa_reserve_checkout($1) result',[memberA]);assert.equal(resumed.token,first.token);assert.equal(resumed.session_id,'saved-session')
}))
test('ordinary accounts cannot reserve Stripe checkout or forge a National escalation response',async()=>{
 await as(member,()=>assert.rejects(rpc('select public.cvoa_reserve_checkout($1) result',[memberA]),/permission denied/));
 await as(stateIN,()=>assert.rejects(db.query("insert into state_escalations(post_id,subject,message,status,response) values($1,'Issue','Help','resolved','National approved')",[postA]),/row-level security/))
})
