import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite(),
  uid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
let channels = {},
  message,
  dm,
  task;
before(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,full_name text,role text,post_id uuid,state text,access_suspended boolean default false,deleted_at timestamptz);
 create table public.posts(id uuid primary key,name text,state text);
 create table public.appointments(profile_id uuid,role text,post_id uuid,state text);
 create function public.cvoa_access_scopes(p_user uuid) returns table(scope_id text,role text,post_id uuid,state text,title text,source text) language sql security definer as $$select 'primary',role,post_id,state,''::text,''::text from public.profiles where id=p_user union all select 'extra',role,post_id,state,'','' from public.appointments where profile_id=p_user$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to authenticated;grant select,insert on storage.objects to authenticated;
 insert into public.posts values('${uid(101)}','Indiana A','IN'),('${uid(102)}','Ohio B','OH');
 insert into public.profiles(id,full_name,role,post_id,state) values('${uid(1)}','National','national_commander',null,null),('${uid(2)}','State IN','state_commander',null,'IN'),('${uid(3)}','Officer IN','post_commander','${uid(101)}','IN'),('${uid(4)}','Member IN','member','${uid(101)}','IN'),('${uid(5)}','Member OH','member','${uid(102)}','OH'),('${uid(6)}','Pending','guest_applicant',null,null);`);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261013220149_operations_workspace.sql",
      "utf8",
    ),
  );
});
after(() => db.close());
async function as(n, sql) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
async function channel(n, name, scope, state = null, post = null) {
  return (
    await as(
      n,
      `select public.ops_create_channel('${name}','Test','${scope}',${state ? `'${state}'` : "null"},${post ? `'${uid(post)}'` : "null"}) id`,
    )
  ).rows[0].id;
}
test("leaders create only their authorized workspaces", async () => {
  channels.in = await channel(2, "indiana", "state", "IN");
  channels.oh = await channel(1, "ohio", "state", "OH");
  channels.post = await channel(3, "post-a", "post", null, 101);
  await assert.rejects(channel(2, "foreign", "post", null, 102));
  await assert.rejects(channel(3, "state-command", "state", "IN"));
  await assert.rejects(channel(4, "member-channel", "national"));
});
test("state and post access stay inside their assigned geography", async () => {
  assert.equal(
    (await as(2, `select * from public.ops_channels where id='${channels.oh}'`))
      .rows.length,
    0,
  );
  assert.equal(
    (
      await as(
        4,
        `select * from public.ops_channels where id='${channels.post}'`,
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await as(
        5,
        `select * from public.ops_channels where id='${channels.post}'`,
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await as(1, `select * from public.ops_channels where id='${channels.oh}'`))
      .rows.length,
    1,
  );
  await assert.rejects(as(6, "select public.ops_bootstrap()"));
});
test("messages, threads, mentions, and attachment paths enforce channel membership", async () => {
  message = (
    await as(
      4,
      `insert into public.ops_messages(channel_id,body,mentions) values('${channels.post}','Hello',array['${uid(3)}'::uuid]) returning id`,
    )
  ).rows[0].id;
  await as(
    3,
    `insert into public.ops_messages(channel_id,parent_id,body) values('${channels.post}','${message}','Reply')`,
  );
  await assert.rejects(
    as(
      5,
      `insert into public.ops_messages(channel_id,body) values('${channels.post}','Intrusion')`,
    ),
  );
  await assert.rejects(
    as(
      4,
      `insert into public.ops_messages(channel_id,body,mentions) values('${channels.post}','Wrong mention',array['${uid(5)}'::uuid])`,
    ),
  );
  await assert.rejects(
    as(
      1,
      `insert into public.ops_messages(channel_id,parent_id,body) values('${channels.oh}','${message}','Wrong thread')`,
    ),
  );
  await assert.rejects(
    as(
      4,
      `insert into public.ops_messages(channel_id,body,attachments) values('${channels.post}','Forged file','[{"path":"${channels.post}/${uid(3)}/file.pdf"}]')`,
    ),
  );
});
test("private direct messages exclude oversight accounts", async () => {
  dm = (await as(4, `select public.ops_open_dm('${uid(5)}') id`)).rows[0].id;
  await as(
    4,
    `insert into public.ops_messages(channel_id,body) values('${dm}','Private conversation')`,
  );
  assert.equal(
    (await as(1, `select * from public.ops_messages where channel_id='${dm}'`))
      .rows.length,
    0,
  );
  assert.equal(
    (await as(5, `select * from public.ops_messages where channel_id='${dm}'`))
      .rows.length,
    1,
  );
  assert.equal(
    (await as(5, `select public.ops_open_dm('${uid(4)}') id`)).rows[0].id,
    dm,
  );
});
test("another author cannot edit; history is preserved privately", async () => {
  await assert.rejects(
    as(3, `update public.ops_messages set body='Forged' where id='${message}'`),
  );
  await as(
    4,
    `update public.ops_messages set body='Edited' where id='${message}'`,
  );
  assert.equal(
    (
      await db.query(
        `select previous_body from operations_private.message_history where message_id='${message}'`,
      )
    ).rows[0].previous_body,
    "Hello",
  );
  await assert.rejects(
    as(4, "select * from operations_private.message_history"),
  );
});
test("actions require an eligible owner and prevent cross-channel linking", async () => {
  task = (
    await as(
      4,
      `insert into public.ops_tasks(channel_id,title,owner_id,due_date,source_message_id) values('${channels.post}','Follow through','${uid(3)}',current_date+7,'${message}') returning id`,
    )
  ).rows[0].id;
  await assert.rejects(
    as(
      4,
      `insert into public.ops_tasks(channel_id,title,owner_id,due_date) values('${channels.post}','Wrong owner','${uid(5)}',current_date+7)`,
    ),
  );
  assert.equal(
    (
      await as(
        5,
        `update public.ops_tasks set status='complete' where id='${task}' returning id`,
      )
    ).rows.length,
    0,
  );
  await as(
    3,
    `update public.ops_tasks set status='complete' where id='${task}'`,
  );
});
test("reports update the current member only; activity follow-up is atomic", async () => {
  await as(
    4,
    `select public.ops_submit_report('${channels.post}',current_date,'Done','Next','')`,
  );
  await as(
    4,
    `select public.ops_submit_report('${channels.post}',current_date,'Revised','Next','Help')`,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.ops_reports")).rows[0]
      .n,
    1,
  );
  const data = {
    activity_date: "2026-10-13",
    activity_type: "Engagement",
    topic: "Partner",
    takeaway: "New introduction",
    follow_up: "true",
    follow_up_owner: uid(3),
    follow_up_due: "2026-10-20",
    follow_up_action: "Call",
  };
  await as(
    4,
    `select public.ops_log_activity('${channels.post}','${JSON.stringify(data)}')`,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.ops_activity where follow_up_task_id is not null",
      )
    ).rows[0].n,
    1,
  );
  data.follow_up_owner = uid(5);
  await assert.rejects(
    as(
      4,
      `select public.ops_log_activity('${channels.post}','${JSON.stringify(data)}')`,
    ),
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.ops_activity")).rows[0]
      .n,
    1,
  );
});
test("read marks and presence cannot impersonate another member", async () => {
  await as(4, `select public.ops_mark_read('${channels.post}')`);
  await assert.rejects(
    as(
      4,
      `insert into public.ops_presence(channel_id,user_id) values('${channels.post}','${uid(3)}')`,
    ),
  );
  await as(
    4,
    `insert into public.ops_presence(channel_id) values('${channels.post}')`,
  );
  await db.exec(
    `update public.profiles set access_suspended=true where id='${uid(4)}'`,
  );
  assert.equal(
    (
      await as(
        4,
        `select * from public.ops_messages where channel_id='${channels.post}'`,
      )
    ).rows.length,
    0,
  );
});
test("read-only announcements, private leadership channels, and archived conversations enforce write rules", async () => {
  await db.exec(
    `update public.profiles set access_suspended=false where id='${uid(4)}'`,
  );
  const announcement = (
    await db.query(
      "select id from public.ops_channels where name='announcements'",
    )
  ).rows[0].id;
  await assert.rejects(
    as(
      4,
      `insert into public.ops_messages(channel_id,body) values('${announcement}','Unauthorized announcement')`,
    ),
  );
  await as(
    1,
    `insert into public.ops_messages(channel_id,body) values('${announcement}','Approved announcement')`,
  );
  const privateChannel = (
    await as(
      1,
      `select public.ops_create_channel('restricted','Staff work','post',null,'${uid(101)}',true,true,array['${uid(3)}'::uuid]) id`,
    )
  ).rows[0].id;
  assert.equal(
    (
      await as(
        4,
        `select * from public.ops_channels where id='${privateChannel}'`,
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await as(
        1,
        `select * from public.ops_channels where id='${privateChannel}'`,
      )
    ).rows.length,
    1,
  );
  await as(3, `select public.ops_archive_channel('${channels.post}',true)`);
  await assert.rejects(
    as(
      4,
      `insert into public.ops_messages(channel_id,body) values('${channels.post}','Archived post')`,
    ),
  );
  await as(3, `select public.ops_archive_channel('${channels.post}',false)`);
});
test("file reads inherit channel access and cannot be granted by knowing a path", async () => {
  const path = `${channels.post}/${uid(4)}/test.pdf`;
  assert.equal(
    (await as(4, `select public.ops_file_access('${path}') allowed`)).rows[0]
      .allowed,
    true,
  );
  assert.equal(
    (await as(5, `select public.ops_file_access('${path}') allowed`)).rows[0]
      .allowed,
    false,
  );
  assert.equal(
    (await as(3, `select public.ops_file_access('${path}',true) allowed`))
      .rows[0].allowed,
    false,
  );
});
test("leadership can moderate without impersonating an author or losing the original record", async () => {
  await as(
    1,
    `update public.ops_messages set deleted_at=now() where id='${message}'`,
  );
  const row = (
    await db.query(
      `select author_id,body from public.ops_messages where id='${message}'`,
    )
  ).rows[0];
  assert.equal(row.author_id, uid(4));
  assert.equal(row.body, "[Message removed]");
  assert.ok(
    (
      await db.query(
        `select previous_body from operations_private.message_history where message_id='${message}'`,
      )
    ).rows.some((r) => r.previous_body === "Edited"),
  );
  await assert.rejects(
    as(
      4,
      `update public.ops_messages set deleted_at=null,body='Restore moderated post' where id='${message}'`,
    ),
  );
});
