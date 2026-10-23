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
async function endpoint({
  signedIn = true,
  allowed = false,
  secretValid = false,
} = {}) {
  let handler,
    sends = 0,
    queries = 0;
  const source = fs
    .readFileSync("supabase/functions/member-broadcasts/index.ts", "utf8")
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g, "");
  const compiled = await transform(source, { loader: "ts", format: "esm" });
  const client = {
    auth: {
      getUser: async () => ({
        error: signedIn ? null : { message: "invalid" },
        data: {
          user: signedIn
            ? { id: commander, email: "commander@example.test" }
            : null,
        },
      }),
    },
    rpc: async (name) => ({
      data: name === "cvoa_broadcast_verify_worker" ? secretValid : allowed,
      error: null,
    }),
    from: () => {
      queries++;
      throw new Error("Unexpected data read");
    },
  };
  const deno = {
    env: { get: () => "fixture-not-a-secret" },
    serve: (f) => {
      handler = f;
    },
  };
  new Function(
    "createClient",
    "nodemailer",
    "Buffer",
    "Deno",
    "MAX_TOTAL",
    "MEDIA",
    "prepareBroadcast",
    "signatureMatches",
    "validDraft",
    compiled.code,
  )(
    () => client,
    {
      createTransport: () => {
        sends++;
        throw new Error("Unexpected SMTP");
      },
    },
    Buffer,
    deno,
    mail.MAX_TOTAL,
    mail.MEDIA,
    mail.prepareBroadcast,
    mail.signatureMatches,
    mail.validDraft,
  );
  return {
    request: async (headers = {}, body = { action: "send", id: broadcast }) =>
      handler(
        new Request("https://example.test", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      ),
    counts: () => ({ sends, queries }),
  };
}
test("HTTP send endpoint rejects missing/invalid sessions and non-commanders before touching recipients or SMTP", async () => {
  const noToken = await endpoint();
  assert.equal((await noToken.request()).status, 401);
  assert.deepEqual(noToken.counts(), { sends: 0, queries: 0 });
  const invalid = await endpoint({ signedIn: false });
  assert.equal(
    (await invalid.request({ Authorization: "Bearer forged" })).status,
    401,
  );
  const staff = await endpoint({ allowed: false });
  assert.equal(
    (await staff.request({ Authorization: "Bearer fixture" })).status,
    403,
  );
  assert.deepEqual(staff.counts(), { sends: 0, queries: 0 });
  const worker = await endpoint();
  assert.equal(
    (await worker.request({ "x-broadcast-secret": "forged" })).status,
    401,
  );
  assert.deepEqual(worker.counts(), { sends: 0, queries: 0 });
  const origin = await endpoint({ allowed: true });
  assert.equal(
    (
      await origin.request({
        Origin: "https://attacker.test",
        Authorization: "Bearer fixture",
      })
    ).status,
    403,
  );
});
test("scoped broadcasts and authenticated RSVP isolation", async (t) => {
  const inPost = id(200),
    ohPost = id(201),
    officer = id(6),
    ohOfficer = id(7),
    extra = id(8),
    scoped = id(300);
  await db.exec(`create table public.posts(id uuid primary key,name text,state text);
 alter table profiles add column post_id uuid,add column state text;
 alter table members add column post_id uuid,add column state text,add column membership_type text default 'annual',add column membership_status text default 'active';
 create table public.access_appointments(profile_id uuid,scope_id text,role text,post_id uuid,state text,revoked_at timestamptz);
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function public.cvoa_access_scopes(p_user uuid) returns table(scope_id text,role text,post_id uuid,state text,title text,source text) language sql stable security definer set search_path='' as $$
 select 'primary',p.role,p.post_id,p.state,'','Account' from public.profiles p where p.id=p_user union all select a.scope_id,a.role,a.post_id,a.state,'','Appointment' from public.access_appointments a where a.profile_id=p_user and a.revoked_at is null $$;
 insert into posts values('${inPost}','Indiana Company','IN'),('${ohPost}','Ohio Company','OH');
 insert into profiles(id,role,post_id) values('${officer}','post_officer','${inPost}'),('${ohOfficer}','post_commander','${ohPost}'),('${extra}','member',null);
 update profiles set state='IN' where id='${state}';
 insert into access_appointments values('${extra}','appointment-1','post_officer','${inPost}',null,null);
 insert into auth.users values('${member}','in@example.test',now()),('${extra}','oh@example.test',now());
 insert into members(full_name,email,profile_id,post_id,state,membership_type) values('Indiana Member','in@example.test','${member}','${inPost}','IN','lifetime'),('Ohio Member','oh@example.test','${extra}','${ohPost}','IN','annual'),('Unaffiliated Indiana','unaffiliated@example.test',null,null,'IN','annual');
 update member_broadcast_deliveries set state='skipped' where state in ('pending','sending');update member_broadcasts set status='complete';`);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261023185138_scoped_broadcasts_rsvp.sql",
      "utf8",
    ),
  );
  let stateDraft, postDraft, nationalDraft;
  await t.test(
    "only actual appointments authorize a scope; forged other-state/Company workspace rejected",
    async () => {
      stateDraft = (
        await db.query(
          `select * from cvoa_broadcast_create('${state}','primary')`,
        )
      ).rows[0];
      postDraft = (
        await db.query(
          `select * from cvoa_broadcast_create('${officer}','primary')`,
        )
      ).rows[0];
      nationalDraft = (
        await db.query(
          `select * from cvoa_broadcast_create('${commander}','primary')`,
        )
      ).rows[0];
      assert.equal(stateDraft.scope_kind, "state");
      assert.equal(stateDraft.scope_state, "IN");
      assert.equal(postDraft.scope_post_id, inPost);
      await assert.rejects(
        db.query(`select cvoa_broadcast_create('${staff}','primary')`),
        /unavailable/,
      );
      await assert.rejects(
        db.query(`select cvoa_broadcast_create('${officer}','appointment-1')`),
        /unavailable/,
      );
      assert.equal(
        (await asUser(extra, "select cvoa_broadcast_context() c")).rows[0].c
          .scopes[0].post_id,
        inPost,
      );
      const can = async (user, b) =>
        (await asUser(user, `select cvoa_broadcast_access('${b.id}') ok`))
          .rows[0].ok;
      assert.equal(await can(ohOfficer, postDraft), false);
      assert.equal(await can(state, postDraft), true);
      assert.equal(await can(officer, stateDraft), false);
      assert.equal(await can(state, nationalDraft), false);
      assert.equal(await can(commander, postDraft), true);
    },
  );
  await t.test(
    "state audience follows Company state, includes unaffiliated local members, Company audience stays local",
    async () => {
      const emails = async (b) =>
        (
          await db.query(
            `select email from cvoa_broadcast_recipients('${b.id}') order by email`,
          )
        ).rows.map((x) => x.email);
      assert.deepEqual(await emails(stateDraft), [
        "in@example.test",
        "unaffiliated@example.test",
      ]);
      assert.deepEqual(await emails(postDraft), ["in@example.test"]);
      await db.exec(
        `update member_broadcasts set audience_type='lifetime' where id='${stateDraft.id}'`,
      );
      assert.deepEqual(await emails(stateDraft), ["in@example.test"]);
      await db.exec(
        `update member_broadcasts set audience_type=null,target_post_id='${ohPost}' where id='${stateDraft.id}'`,
      );
      assert.deepEqual(await emails(stateDraft), []); // Forged narrowing never widens state boundary.
      await db.exec(
        `update member_broadcasts set target_post_id=null where id='${stateDraft.id}'`,
      );
    },
  );
  await t.test(
    "media and delivery rows remain protected across scopes",
    async () => {
      await asUser(
        officer,
        `insert into storage.objects(bucket_id,name) values('member-broadcasts','${postDraft.id}/asset.png')`,
      );
      assert.equal(
        (
          await asUser(
            ohOfficer,
            `select * from storage.objects where name like '${postDraft.id}/%'`,
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        asUser(
          ohOfficer,
          `insert into storage.objects(bucket_id,name) values('member-broadcasts','${postDraft.id}/forged.png')`,
        ),
        /row-level security/,
      );
    },
  );
  await t.test(
    "send rejects foreign actor and past events; valid invite claims only scoped recipients",
    async () => {
      await db.exec(
        `update member_broadcasts set subject='Invitation',body='Join us',event=jsonb_build_object('title','Company gathering','starts_at',now()-interval '1 hour','location','Company Hall') where id='${postDraft.id}'`,
      );
      await assert.rejects(
        db.query(
          `select cvoa_broadcast_queue('${postDraft.id}','${ohOfficer}',1)`,
        ),
        /unavailable/,
      );
      await assert.rejects(
        db.query(
          `select cvoa_broadcast_queue('${postDraft.id}','${officer}',1)`,
        ),
        /future/,
      );
      await db.exec(
        `update member_broadcasts set event=jsonb_build_object('title','Company gathering','starts_at',now()+interval '1 day','location','Company Hall') where id='${postDraft.id}'`,
      );
      assert.equal(
        (
          await db.query(
            `select cvoa_broadcast_queue('${postDraft.id}','${officer}',1) n`,
          )
        ).rows[0].n,
        1,
      );
      const claimed = (await db.query("select cvoa_broadcast_claim() job"))
        .rows[0].job;
      assert.equal(claimed.delivery.email, "in@example.test");
      await db.exec(
        `update member_broadcast_deliveries set state='sent' where broadcast_id='${postDraft.id}'`,
      );
    },
  );
  await t.test(
    "only addressed verified member can RSVP; responses update in place and never leak other recipients",
    async () => {
      await assert.rejects(
        db.query(
          `select cvoa_broadcast_rsvp('${extra}','${postDraft.id}','yes')`,
        ),
        /unavailable/,
      );
      const r = (
        await db.query(
          `select cvoa_broadcast_rsvp('${member}','${postDraft.id}','yes') r`,
        )
      ).rows[0].r;
      assert.equal(r.response, "yes");
      assert.equal(r.event.title, "Company gathering");
      assert.equal(r.people, undefined);
      await db.query(
        `select cvoa_broadcast_rsvp('${member}','${postDraft.id}','no')`,
      );
      assert.equal(
        (await db.query(`select cvoa_broadcast_responses('${postDraft.id}') r`))
          .rows[0].r.counts.no,
        1,
      );
      await db.exec(
        `update auth.users set email_confirmed_at=null where id='${member}'`,
      );
      await assert.rejects(
        db.query(
          `select cvoa_broadcast_rsvp('${member}','${postDraft.id}','yes')`,
        ),
        /unavailable/,
      );
      await db.exec(
        `update auth.users set email_confirmed_at=now() where id='${member}'`,
      );
      await assert.rejects(
        asUser(
          member,
          `select cvoa_broadcast_rsvp('${member}','${postDraft.id}','yes')`,
        ),
        /permission denied/,
      );
    },
  );
  await t.test(
    "revoked appointments stop queued mail; affiliation changes remove pending recipient",
    async () => {
      const d = (
        await db.query(
          `select * from cvoa_broadcast_create('${extra}','appointment-1')`,
        )
      ).rows[0];
      await db.exec(
        `update member_broadcasts set subject='News',body='Local' where id='${d.id}'`,
      );
      await db.query(`select cvoa_broadcast_queue('${d.id}','${extra}',1)`);
      await db.exec(
        `update access_appointments set revoked_at=now() where profile_id='${extra}'`,
      );
      assert.equal(
        (await db.query("select cvoa_broadcast_claim() job")).rows[0].job,
        null,
      );
      await db.exec(
        `update access_appointments set revoked_at=null where profile_id='${extra}';update members set post_id='${ohPost}' where email='in@example.test'`,
      );
      assert.equal(
        (await db.query("select cvoa_broadcast_claim() job")).rows[0].job
          .skipped,
        true,
      );
    },
  );
  await t.test(
    "invitation mail carries scoped signature and safe authenticated RSVP link",
    () => {
      const m = mail.prepareBroadcast(
        {
          ...postDraft,
          event: {
            title: "Gathering <script>",
            starts_at: new Date(Date.now() + 86400000).toISOString(),
            location: "Company Hall",
          },
        },
        { email: "in@example.test", member_name: "Indiana Member" },
        "sender@example.test",
        [],
      );
      assert.match(
        m.html,
        new RegExp(`https://cvoa.one/broadcast-rsvp/${postDraft.id}`),
      );
      assert.match(m.html, /Company Leadership/);
      assert.match(m.html, /Gathering &lt;script&gt;/);
      assert.doesNotMatch(m.html, /National Command<br>/);
    },
  );
});
