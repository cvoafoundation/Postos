import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { transform } from "esbuild";
const db = new PGlite();
const id = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const commander = id(1),
  staff = id(2),
  state = id(3),
  member = id(4),
  testUser = id(5),
  broadcast = id(100);
let mail;
before(async () => {
  const js = await transform(
    fs.readFileSync("supabase/functions/member-broadcasts/mail.ts", "utf8"),
    { loader: "ts", format: "esm" },
  );
  mail = await import(
    "data:text/javascript;base64," + Buffer.from(js.code).toString("base64")
  );
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;create schema membership_private;create schema vault;create schema cron;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,role text,deleted_at timestamptz,access_suspended boolean default false,is_test_account boolean default false);
 create table public.members(id uuid primary key default gen_random_uuid(),full_name text,email text,profile_id uuid,created_at timestamptz default now(),deleted_at timestamptz);
 create table membership_private.account_limits(profile_id uuid primary key,enabled boolean default false);
 create function membership_private.is_limited(uuid) returns boolean language sql stable as $$select exists(select 1 from membership_private.account_limits where profile_id=$1 and enabled)$$;
 create function public.cvoa_membership_only() returns boolean language sql stable security definer as $$select membership_private.is_limited(auth.uid())$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to authenticated;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create function vault.create_secret(text,text) returns uuid language plpgsql as $$begin insert into vault.decrypted_secrets values($2,$1);return gen_random_uuid();end$$;
 create function cron.schedule(text,text,text) returns integer language sql as $$select 1$$;
 insert into profiles(id,role) values('${commander}','national_commander'),('${staff}','national_staff'),('${state}','state_commander'),('${member}','member'),('${testUser}','member');
 update profiles set is_test_account=true where id='${testUser}';
 insert into members(full_name,email,profile_id) values('Member One',' PERSON@example.test ','${member}'),('Duplicate','person@example.test',null),('No login','nologin@example.test',null),('Test','test@example.test','${testUser}'),('Bad','invalid',null),('Removed','removed@example.test',null);
 update members set deleted_at=now() where email='removed@example.test';`);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261016220746_member_broadcasts.sql",
      "utf8",
    ),
  );
  await db.exec(
    `insert into member_broadcasts(id,owner_id,subject,body) values('${broadcast}','${commander}','News','Hello');`,
  );
});
after(() => db.close());
async function asUser(user, sql) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
test("only active National Commander can read broadcasts; National staff, state and members are denied", async () => {
  for (const u of [staff, state, member]) {
    assert.equal(
      (await asUser(u, "select cvoa_broadcast_commander() ok")).rows[0].ok,
      false,
    );
    assert.equal(
      (await asUser(u, "select * from member_broadcasts")).rows.length,
      0,
    );
  }
  assert.equal(
    (await asUser(commander, "select * from member_broadcasts")).rows.length,
    1,
  );
  await assert.rejects(
    asUser(commander, `update member_broadcasts set subject='forged'`),
    /permission denied/,
  );
  await assert.rejects(
    asUser(member, "select * from cvoa_broadcast_audience()"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(
      commander,
      `select cvoa_broadcast_queue('${broadcast}','${commander}',1)`,
    ),
    /permission denied/,
  );
  await db.exec(
    `update profiles set access_suspended=true where id='${commander}'`,
  );
  assert.equal(
    (await asUser(commander, "select * from member_broadcasts")).rows.length,
    0,
  );
  await db.exec(
    `update profiles set access_suspended=false where id='${commander}'`,
  );
});
test("audience is complete, deduplicated, includes unlinked members and excludes invalid, removed, test records", async () => {
  const a = await db.query(
    "select * from cvoa_broadcast_audience() order by email",
  );
  assert.deepEqual(
    a.rows.map((x) => x.email),
    ["nologin@example.test", "person@example.test"],
  );
  assert.equal(
    (await db.query("select cvoa_broadcast_audience_count() n")).rows[0].n,
    2,
  );
});
test("queue enforces permission and revision; repeated send is idempotent", async () => {
  await assert.rejects(
    db.query(`select cvoa_broadcast_queue('${broadcast}','${staff}',1)`),
    /National Commander/,
  );
  await assert.rejects(
    db.query(`select cvoa_broadcast_queue('${broadcast}','${commander}',99)`),
    /Draft changed/,
  );
  assert.equal(
    (
      await db.query(
        `select cvoa_broadcast_queue('${broadcast}','${commander}',1) n`,
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await db.query(
        `select cvoa_broadcast_queue('${broadcast}','${commander}',1) n`,
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (await db.query("select count(*) n from member_broadcast_deliveries"))
      .rows[0].n,
    2,
  );
});
test("worker never claims same recipient twice; interrupted sends become uncertain; manual retry excludes sent/uncertain", async () => {
  const a = (await db.query("select cvoa_broadcast_claim() job")).rows[0].job;
  const b = (await db.query("select cvoa_broadcast_claim() job")).rows[0].job;
  assert.notEqual(a.delivery.id, b.delivery.id);
  assert.equal(
    (await db.query("select cvoa_broadcast_claim() job")).rows[0].job,
    null,
  );
  await db.exec(
    `update member_broadcast_deliveries set claimed_at=now()-interval '11 minutes' where id='${a.delivery.id}';update member_broadcast_deliveries set state='failed' where id='${b.delivery.id}';`,
  );
  await db.query("select cvoa_broadcast_claim()");
  assert.equal(
    (
      await db.query(
        `select state from member_broadcast_deliveries where id='${a.delivery.id}'`,
      )
    ).rows[0].state,
    "uncertain",
  );
  assert.equal(
    (
      await db.query(
        `select cvoa_broadcast_retry('${broadcast}','${commander}') n`,
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        `select state from member_broadcast_deliveries where id='${a.delivery.id}'`,
      )
    ).rows[0].state,
    "uncertain",
  );
  // Revoking the commander's access stops future deliveries.
  await db.exec(`update profiles set role='member' where id='${commander}'`);
  assert.equal(
    (await db.query("select cvoa_broadcast_claim() job")).rows[0].job,
    null,
  );
  await db.exec(
    `update profiles set role='national_commander' where id='${commander}'`,
  );
});
test("private media can only be uploaded to own draft; cannot overwrite files", async () => {
  const draft = id(101);
  await db.exec(
    `insert into member_broadcasts(id,owner_id) values('${draft}','${commander}');`,
  );
  await asUser(
    commander,
    `insert into storage.objects(bucket_id,name) values('member-broadcasts','${draft}/one.png')`,
  );
  await assert.rejects(
    asUser(
      member,
      `insert into storage.objects(bucket_id,name) values('member-broadcasts','${draft}/two.png')`,
    ),
    /row-level security/,
  );
  await assert.rejects(
    asUser(
      commander,
      `insert into storage.objects(bucket_id,name) values('member-broadcasts','${broadcast}/three.png')`,
    ),
    /row-level security/,
  );
  assert.equal(
    (await asUser(member, "select * from storage.objects")).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select public from storage.buckets where id='member-broadcasts'",
      )
    ).rows[0].public,
    false,
  );
});
test("mail is personalized, HTML-escaped, individual and attachment-only (no external file fetches)", () => {
  const result = mail.prepareBroadcast(
    {
      id: broadcast,
      subject: "News",
      body: "Hello {{first_name}}\n\n<script>alert(1)</script> & goodbye",
    },
    { email: "one@example.test", member_name: "Jane Member" },
    "sender@example.test",
    [{ filename: "photo.png", contentType: "image/png", cid: "photo" }],
  );
  assert.equal(result.to.address, "one@example.test");
  assert.equal(result.bcc, undefined);
  assert.match(result.text, /Hello Jane/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.match(result.html, /cid:photo/);
  assert.equal(result.disableFileAccess, true);
  assert.equal(result.disableUrlAccess, true);
  assert.equal(mail.validDraft("Subject\r\nBcc: everyone", "x"), false);
  assert.equal(
    mail.signatureMatches(new TextEncoder().encode("<svg>"), "image/png"),
    false,
  );
  assert.equal(
    mail.signatureMatches(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    ),
    true,
  );
});
async function endpoint({signedIn=true,allowed=false,secretValid=false}={}) {
 let handler,sends=0,queries=0;
 const source=fs.readFileSync('supabase/functions/member-broadcasts/index.ts','utf8').replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g,'');
 const compiled=await transform(source,{loader:'ts',format:'esm'});
 const client={auth:{getUser:async()=>({error:signedIn?null:{message:'invalid'},data:{user:signedIn?{id:commander,email:'commander@example.test'}:null}})},rpc:async(name)=>({data:name==='cvoa_broadcast_verify_worker'?secretValid:allowed,error:null}),from:()=>{queries++;throw new Error('Unexpected data read');}};
 const deno={env:{get:()=> 'fixture-not-a-secret'},serve:f=>{handler=f;}};
 new Function('createClient','nodemailer','Buffer','Deno','MAX_TOTAL','MEDIA','prepareBroadcast','signatureMatches','validDraft',compiled.code)(()=>client,{createTransport:()=>{sends++;throw new Error('Unexpected SMTP');}},Buffer,deno,mail.MAX_TOTAL,mail.MEDIA,mail.prepareBroadcast,mail.signatureMatches,mail.validDraft);
 return {request:async(headers={},body={action:'send',id:broadcast})=>handler(new Request('https://example.test',{method:'POST',headers,body:JSON.stringify(body)})),counts:()=>({sends,queries})};
}
test('HTTP send endpoint rejects missing/invalid sessions and non-commanders before touching recipients or SMTP',async()=>{
 const noToken=await endpoint();assert.equal((await noToken.request()).status,401);assert.deepEqual(noToken.counts(),{sends:0,queries:0});
 const invalid=await endpoint({signedIn:false});assert.equal((await invalid.request({Authorization:'Bearer forged'})).status,401);
 const staff=await endpoint({allowed:false});assert.equal((await staff.request({Authorization:'Bearer fixture'})).status,403);assert.deepEqual(staff.counts(),{sends:0,queries:0});
 const worker=await endpoint();assert.equal((await worker.request({'x-broadcast-secret':'forged'})).status,401);assert.deepEqual(worker.counts(),{sends:0,queries:0});
 const origin=await endpoint({allowed:true});assert.equal((await origin.request({Origin:'https://attacker.test',Authorization:'Bearer fixture'})).status,403);
});
