import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { createRequire } from "node:module";
const db = new PGlite(),
  id = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
before(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema operations_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,role text,post_id uuid,access_suspended boolean default false);
 create function operations_private.active(p_user uuid) returns boolean language sql security definer as $$select exists(select 1 from public.profiles where id=p_user and not access_suspended)$$;
 create function public.cvoa_access_enabled() returns boolean language sql as $$select operations_private.active(auth.uid())$$;
 create function public.cvoa_current_scope() returns table(role text) language sql as $$select role from public.profiles where id=auth.uid()$$;
 create function public.cvoa_action_queue() returns jsonb language plpgsql as $$begin if (select role from public.profiles where id=auth.uid())='member' then raise exception 'Staff required';end if;return '{"total":1,"items":[{"id":"launch-task:test","title":"Finish launch task","due_date":"2026-10-15","kind":"task","path":"/post-development?post=test"}]}'::jsonb;end$$;
 create table sponsors(id uuid,post_id uuid,company text,stage text,meeting_start timestamptz,updated_at timestamptz,agreement_end_date date);
 alter table sponsors enable row level security;
 create policy scoped_sponsors on sponsors for select to authenticated using(post_id=(select post_id from public.profiles where id=auth.uid()) or (select role from public.profiles where id=auth.uid())='national_staff');
 create table uro_sessions(id uuid,title text,scheduled_at timestamptz,ended_at timestamptz);
 create table uro_actions(id uuid,meeting_id uuid,title text,due_date date,owner_id uuid,status text);
 alter table uro_sessions enable row level security;alter table uro_actions enable row level security;
 grant usage on schema public,auth,operations_private to authenticated;
 grant select on profiles,sponsors,uro_sessions,uro_actions to authenticated;
 insert into profiles values('${id(1)}','post_commander','${id(101)}',false),('${id(2)}','member','${id(102)}',false),('${id(3)}','national_staff',null,false);
 insert into sponsors values('${id(10)}','${id(101)}','Local IN sponsor','proposal_sent',null,now()-interval '8 days',null),('${id(11)}','${id(102)}','Private OH sponsor','meeting_scheduled',now()+interval '3 days',now(),null);
 `);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261013230000_operations_module_connections.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261013230949_operations_followup_wording.sql",
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
test("connected work respects sponsor RLS and preserves source links", async () => {
  const result = (await as(1, "select ops_module_queue() data")).rows[0].data;
  assert.ok(result.items.some((i) => i.title.includes("Local IN sponsor")));
  assert.equal(
    result.items.some((i) => i.title.includes("Private OH sponsor")),
    false,
  );
  const launch = result.items.find((i) => i.id === "launch-task:test");
  assert.equal(launch.module, "Company launch");
  assert.equal(launch.path, "/post-development?post=test");
});
test("ordinary members use connected work without staff privilege", async () => {
  const result = (await as(2, "select ops_module_queue() data")).rows[0].data;
  assert.equal(
    result.items.some((i) => i.id === "launch-task:test"),
    false,
  );
  assert.ok(result.items.some((i) => i.title.includes("Private OH sponsor")));
});
test("AI limits are enforced per account and reject suspended accounts", async () => {
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await as(1, "select ops_ai_reserve() allowed")).rows[0].allowed,
      true,
    );
  assert.equal(
    (await as(1, "select ops_ai_reserve() allowed")).rows[0].allowed,
    false,
  );
  assert.equal(
    (await as(2, "select ops_ai_reserve() allowed")).rows[0].allowed,
    true,
  );
  await db.exec(
    `update operations_private.ai_usage set minute_start=now()-interval '2 minutes',minute_count=0,day_count=50 where user_id='${id(1)}'`,
  );
  assert.equal(
    (await as(1, "select ops_ai_reserve() allowed")).rows[0].allowed,
    false,
  );
  await db.exec(
    `update profiles set access_suspended=true where id='${id(3)}'`,
  );
  await assert.rejects(as(3, "select ops_ai_reserve()"));
  await assert.rejects(as(3, "select ops_module_queue()"));
});
test("AI context uses caller-scoped queries, excludes direct messages, and validates source routes", async () => {
  const file = "/tmp/cvoa-assistant-core.cjs";
  await build({
    entryPoints: ["supabase/functions/cvoa-assistant/core.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: file,
  });
  const core = createRequire(import.meta.url)(file);
  assert.throws(() => core.validateInput({ question: "x".repeat(2001) }));
  assert.throws(() =>
    core.validateInput({ question: "Hi", channel_id: "wrong" }),
  );
  assert.equal(core.modulePath("https://evil.example"), false);
  assert.equal(core.modulePath("/sponsors?sponsor=test"), true);
  const filters = [];
  class Query {
    constructor(table) {
      this.table = table;
    }
    select() {
      return this;
    }
    eq(k, v) {
      filters.push([this.table, k, v]);
      return this;
    }
    in() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    single() {
      return Promise.resolve({
        data: { id: id(10), name: "Private chat", scope: "direct" },
        error: null,
      });
    }
    then(resolve) {
      return Promise.resolve({ data: [], error: null }).then(resolve);
    }
  }
  const client = {
    rpc: async () => ({
      data: {
        total: 1,
        items: [
          {
            title: "Source",
            path: "/meetings/session/test",
            module: "Meetings",
          },
        ],
      },
      error: null,
    }),
    from: (t) => new Query(t),
  };
  const c = await core.buildContext(client, id(1), null);
  assert.equal(c.sources[0].path, "/meetings/session/test");
  assert.ok(
    filters.some(
      (x) => x[0] === "ops_tasks" && x[1] === "owner_id" && x[2] === id(1),
    ),
  );
  await assert.rejects(
    core.buildContext(client, id(1), id(10)),
    /Private messages/,
  );
  fs.unlinkSync(file);
});
test("connected items disappear when the source no longer requires follow-up", async () => {
  await db.exec(
    `update sponsors set stage='active',agreement_end_date=null where id='${id(10)}'`,
  );
  const result = (await as(1, "select ops_module_queue() data")).rows[0].data;
  assert.equal(
    result.items.some((i) => i.id === "sponsor-followup:" + id(10)),
    false,
  );
});
test("assistant endpoint verifies the actor, handles missing configuration, and returns source-backed answers", async () => {
  const file = "/tmp/cvoa-assistant-handler.cjs";
  await build({
    entryPoints: ["supabase/functions/cvoa-assistant/index.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: file,
    plugins: [
      {
        name: "client",
        setup(b) {
          b.onResolve({ filter: /^https:\/\/esm.sh\/.*supabase/ }, () => ({
            path: "client",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const createClient=(...args)=>globalThis.__assistantClient(...args)",
            loader: "js",
          }));
        },
      },
    ],
  });
  let handler,
    key = null,
    requested = [],
    authChecks = 0,
    allowed = true;
  const client = {
    auth: {
      getUser: async (token) => {
        authChecks++;
        assert.equal(token, "valid-token");
        return { data: { user: { id: id(1) } }, error: null };
      },
    },
    rpc: async (name) => ({
      data: ["ops_ai_reserve", "ops_access_enabled"].includes(name)
        ? allowed
        : {
            total: 1,
            items: [
              {
                title: "Source record",
                path: "/meetings/session/test",
                module: "Meetings",
              },
            ],
          },
      error: null,
    }),
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      in() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return Promise.resolve({ data: [], error: null });
      },
    }),
  };
  globalThis.__assistantClient = (url, anon, options) => {
    assert.equal(options.global.headers.Authorization, "Bearer valid-token");
    return client;
  };
  globalThis.Deno = {
    env: {
      get: (name) => {
        requested.push(name);
        return name === "ANTHROPIC_API_KEY"
          ? key
          : name === "SUPABASE_URL"
            ? "https://test.supabase.co"
            : "test-public-key";
      },
    },
    serve: (fn) => {
      handler = fn;
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    const body = JSON.parse(options.body);
    assert.ok(body.system.includes("read-only"));
    assert.ok(body.messages[0].content.includes("Source record"));
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: "Review your meeting record [S1]." }],
        stop_reason: "end_turn",
      }),
    );
  };
  try {
    createRequire(import.meta.url)(file);
    assert.equal(
      (
        await handler(
          new Request("https://test/function", { method: "POST", body: "{}" }),
        )
      ).status,
      401,
    );
    const request = () =>
      new Request("https://test/function", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
        body: JSON.stringify({ question: "What needs attention?" }),
      });
    assert.equal((await handler(request())).status, 503);
    key = "test-secret";
    const response = await handler(request());
    assert.equal(response.status, 200);
    const answer = await response.json();
    assert.equal(answer.sources[0].path, "/meetings/session/test");
    allowed = false;
    assert.equal((await handler(request())).status, 403);
    assert.equal(authChecks, 3);
    assert.equal(requested.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
    delete globalThis.__assistantClient;
    fs.unlinkSync(file);
  }
});

test("National rollout blocks module and AI access for non-National accounts", async () => {
  await db.exec(`alter table profiles add column deleted_at timestamptz;
 create function public.cvoa_access_scopes(p_user uuid) returns table(role text) language sql as $$select role from public.profiles where id=p_user$$;
 update profiles set access_suspended=false where role='national_staff';`);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261014002629_operations_national_only.sql",
      "utf8",
    ),
  );
  assert.equal(
    (await as(3, "select ops_access_enabled() allowed")).rows[0].allowed,
    true,
  );
  assert.ok(
    (await as(3, "select ops_module_queue() data")).rows[0].data.items.length,
  );
  for (const actor of [1, 2]) {
    assert.equal(
      (await as(actor, "select ops_access_enabled() allowed")).rows[0].allowed,
      false,
    );
    await assert.rejects(as(actor, "select ops_module_queue()"));
    await assert.rejects(as(actor, "select ops_ai_reserve()"));
  }
});
