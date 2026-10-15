import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
const require = createRequire(import.meta.url);
test("next steps distinguish expiring annual terms, lifetime membership, staff review, and application replies", async () => {
  const file = "tests/.member-home-model.cjs";
  await build({
    entryPoints: ["src/pages/members/memberHomeModel.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: file,
  });
  try {
    const { nextSteps, companySessions } = require(process.cwd() + "/" + file);
    const member = {
      membership_type: "annual",
      membership_status: "active",
      expires_at: "2026-10-30",
    };
    assert.deepEqual(
      nextSteps(
        member,
        { status: "pending", has_document: true },
        [],
        "2026-10-15",
      ).map((t) => t.id),
      ["renew"],
    );
    assert.equal(
      nextSteps(
        { ...member, membership_type: "lifetime" },
        { status: "verified" },
        [],
        "2026-10-15",
      ).length,
      0,
    );
    assert.equal(
      nextSteps(
        { ...member, expires_at: "2027-01-01" },
        { status: "pending", has_document: false },
        [],
        "2026-10-15",
      )[0].id,
      "verification",
    );
    const application = {
      id: "application",
      city: "Terre Haute",
      state: "IN",
      updates: [
        { kind: "document_request", created_at: "2026-10-10" },
        { kind: "reply", created_at: "2026-10-12" },
      ],
    };
    assert.equal(
      nextSteps(
        { ...member, membership_type: "lifetime" },
        undefined,
        [application],
        "2026-10-15",
      ).length,
      0,
    );
    const sessions = [
      { id: "own", body_id: "a", scheduled_at: "2026-11-01", ended_at: null },
      { id: "other", body_id: "b", scheduled_at: "2026-11-01", ended_at: null },
      {
        id: "draft",
        body_id: "a",
        scheduled_at: "2026-10-01",
        ended_at: "2026-10-01",
        published_at: null,
        readable: false,
      },
    ];
    const result = companySessions(
      sessions,
      [
        { id: "a", post_id: "company" },
        { id: "b", post_id: "other-company" },
      ],
      "company",
    );
    assert.deepEqual(
      result.upcoming.map((s) => s.id),
      ["own"],
    );
    assert.equal(result.published.length, 0);
  } finally {
    fs.unlinkSync(file);
  }
});
test("member home stays personal across staff roles, uses member-safe links, and limits the membership-only view", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/member-home",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    __homeAuth: {
      profile: {
        id: "one",
        full_name: "First Member",
        role: "member",
        post_id: "company",
      },
      membershipOnly: false,
    },
    __homeCalls: [],
  });
  const file = "tests/.member-home-ui.cjs";
  await build({
    entryPoints: ["src/pages/members/MemberHome.tsx"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: file,
    jsx: "automatic",
    external: ["react", "react-dom", "react-dom/client", "react-router-dom"],
    plugins: [
      {
        name: "fixtures",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^@\/context\/AuthContext$|^@\/lib\/supabase$|^@\/components\/|^@\/pages\/posts\/model$/,
            },
            (a) => ({ path: a.path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            loader: "js",
            contents: a.path.includes("AuthContext")
              ? `export const useAuth=()=>globalThis.__homeAuth;`
              : a.path.endsWith("supabase")
                ? `
 const member=()=>({id:'membership',profile_id:globalThis.__homeAuth.profile.id,post_id:'company',full_name:globalThis.__homeAuth.profile.full_name,membership_type:'lifetime',membership_status:'active',dd214_review_status:'verified',created_at:'2026-01-01'});
 export const supabase={rpc:async(name)=>{globalThis.__homeCalls.push(name);return {data:name==='cvoa_public_posts'?[{id:'company',name:'Terre Haute',state:'IN'}]:name==='cvoa_member_verification'?[{id:'membership',status:'verified',has_document:true}]:name==='cvoa_my_membership_cards'?[member()]:name==='cvoa_congress_labels'?{profiles:[{id:'delegate',full_name:'Company Delegate'}]}:name==='uro_directory'?{bodies:[{id:'body',post_id:'company'}],sessions:[{id:'meeting',body_id:'body',title:'Company Meeting',scheduled_at:'2026-11-01',ended_at:null,readable:false}]}:[]}},from:(table)=>{const filters={};const query={select:()=>query,eq:(key,value)=>{filters[key]=value;return query},is:()=>query,order:()=>query,gte:()=>query,limit:()=>query,then:(ok,fail)=>{globalThis.__homeCalls.push([table,filters]);return Promise.resolve({data:table==='members'?[member()]:table==='community_service_events'?[{id:'event',title:'Community event',event_date:'2026-11-01'}]:[{id:'seat',post_id:'company',profile_id:'delegate',is_alternate:false,term_start:'2020-01-01',term_end:null}]}).then(ok,fail)}};return query}};`
                : a.path.endsWith("/model")
                  ? `export const postDisplayName=p=>p.name;`
                  : `import React from 'react';export const PageHeader=({title,action})=>React.createElement('header',null,title,action);export const MembershipCardVisual=({member})=>React.createElement('div',null,member.full_name);export const Modal=({children})=>React.createElement('div',null,children);export default ()=>React.createElement('p',null,'Private verification');`,
          }));
        },
      },
    ],
  });
  const React = await import("react"),
    { createRoot } = await import("react-dom/client"),
    { MemoryRouter } = await import("react-router-dom"),
    Component = require(process.cwd() + "/" + file).default,
    root = createRoot(document.getElementById("root"));
  async function render() {
    await React.act(async () =>
      root.render(
        React.createElement(MemoryRouter, null, React.createElement(Component)),
      ),
    );
  }
  try {
    for (const role of [
      "member",
      "post_commander",
      "state_commander",
      "delegate",
      "national_commander",
    ]) {
      globalThis.__homeAuth = {
        profile: {
          id: role,
          role,
          full_name: role === "member" ? "First Member" : "Next Person",
          post_id: "company",
        },
        membershipOnly: false,
      };
      await render();
      assert.match(document.body.textContent, /My Next Steps/);
      assert.match(document.body.textContent, /My Membership/);
      assert.match(document.body.textContent, /My Company/);
      assert.match(document.body.textContent, /Company Delegate/);
      assert.ok(document.querySelector('a[href="/shared-files"]'));
      assert.equal(document.querySelector('a[href^="/drive"]'), null);
      assert.ok(document.querySelector('a[href="/meetings?post=company"]'));
      assert.equal(
        document.querySelector('a[href="/meetings/session/meeting"]'),
        null,
      );
      assert.ok(document.querySelector('a[href="/file-complaint"]'));
      assert.equal(document.querySelector('a[href="/ethics-tribunal"]'), null);
    }
    assert.ok(
      globalThis.__homeCalls.some(
        (c) =>
          Array.isArray(c) &&
          c[0] === "members" &&
          c[1].profile_id === "member",
      ),
    );
    assert.ok(
      globalThis.__homeCalls.some(
        (c) =>
          Array.isArray(c) &&
          c[0] === "congress_delegates" &&
          c[1].post_id === "company",
      ),
    );
    assert.doesNotMatch(document.body.textContent, /First Member/);
    globalThis.__homeCalls = [];
    globalThis.__homeAuth = {
      profile: { id: "limited", role: "member" },
      membershipOnly: true,
    };
    await render();
    assert.doesNotMatch(
      document.body.textContent,
      /My Next Steps|My Company|Get Involved/,
    );
    assert.ok(document.querySelector('a[href="/congress"]'));
    assert.ok(document.querySelector('a[href="/file-complaint"]'));
    assert.deepEqual(globalThis.__homeCalls, ["cvoa_my_membership_cards"]);
  } finally {
    await React.act(async () => root.unmount());
    fs.unlinkSync(file);
    dom.window.close();
  }
});
