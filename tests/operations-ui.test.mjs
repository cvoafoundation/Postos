import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
const stub = `
const user='10000000-0000-0000-0000-000000000001',channel='20000000-0000-0000-0000-000000000001';
export const useAuth=()=>({session:{user:{id:globalThis.__OPS_UI_ACCOUNT || user}},selectedScope:'primary'});
const people=[{id:user,full_name:'Test Commander'},{id:'10000000-0000-0000-0000-000000000002',full_name:'Test Member'}];
const channels=[{id:channel,name:'general',description:'Test conversation',scope:'national',state:null,post_id:null,private:false,read_only:false,archived:false,unread:0,can_write:true,can_manage:true}];
const rows={ops_messages:[{id:'30000000-0000-0000-0000-000000000001',channel_id:channel,author_id:people[1].id,author_name:'Test Member',parent_id:null,body:'Ready for coordination',attachments:[],mentions:[],pinned:false,deleted_at:null,created_at:new Date().toISOString(),edited_at:null}],ops_tasks:[],ops_activity:[],ops_reports:[],ops_presence:[],ops_reactions:[]};
class Query {constructor(table){this.table=table;this.filters=[];this.op='select'}select(){return this}eq(k,v){this.filters.push(r=>r[k]===v);return this}is(k,v){return this.eq(k,v)}gte(){return this}lt(){return this}in(k,v){this.filters.push(r=>v.includes(r[k]));return this}contains(k,v){this.filters.push(r=>v.every(x=>r[k].includes(x)));return this}textSearch(k,v){this.filters.push(r=>r.body.includes(v));return this}order(){return this}limit(){return this}single(){this.one=true;return this}insert(p){this.op='insert';this.payload=p;return this}upsert(p){this.op='upsert';this.payload=p;return this}update(p){this.op='update';this.payload=p;return this}delete(){this.op='delete';return this}then(resolve,reject){let selected=(rows[this.table]||[]).filter(r=>this.filters.every(f=>f(r)));if(this.op==='insert'){const r={id:crypto.randomUUID(),author_id:user,author_name:'Test Commander',parent_id:null,attachments:[],mentions:[],pinned:false,deleted_at:null,created_at:new Date().toISOString(),...this.payload};rows[this.table].push(r);selected=[r]}if(this.op==='update')selected.forEach(r=>Object.assign(r,this.payload));if(this.op==='delete')rows[this.table]=(rows[this.table]||[]).filter(r=>!selected.includes(r));return Promise.resolve({data:this.one?selected[0]:selected,error:null}).then(resolve,reject)}}
const realtime={on(){return this},subscribe(){return this}};
export const supabase={from:t=>new Query(t),channel:()=>({...realtime}),removeChannel:async()=>{},storage:{from:()=>({upload:async()=>({error:null})})},rpc:async(name,args)=>{let data=null;if(name==='ops_channel_list')data=channels;if(name==='ops_workspaces')data=[{scope:'national',state:null,post_id:null,label:'National Command',can_manage:true}];if(name==='ops_channel_people')data=people;if(name==='ops_thread_counts')data=rows.ops_messages.filter(m=>m.parent_id).map(m=>({parent_id:m.parent_id,replies:1}));if(name==='ops_summary')data=[];return {data,error:null}}};
`;
test("Operations UI sends messages, opens threads, creates actions, and shows the SOP", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost/", pretendToBeVisual: true },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  const outfile = path.resolve("tests/.operations-ui.cjs");
  await build({
    entryPoints: ["src/pages/operations/Operations.tsx"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    jsx: "automatic",
    external: ["react", "react-dom", "react-dom/client"],
    plugins: [
      {
        name: "fixtures",
        setup(b) {
          b.onResolve(
            { filter: /^@\/context\/AuthContext$|^@\/lib\/supabase$/ },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: stub,
            loader: "js",
          }));
        },
      },
    ],
  });
  const React = await import("react"),
    { createRoot } = await import("react-dom/client"),
    { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url),
    Operations = require(outfile).default;
  const root = createRoot(document.getElementById("root"));
  const settle = async () => {
    await React.act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  const click = async (b) => {
    assert.ok(b, "Control exists");
    await React.act(async () => {
      b.click();
    });
    await settle();
  };
  const fill = async (el, value) => {
    assert.ok(el, "Input exists");
    await React.act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        el.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new window.Event("input", { bubbles: true }));
      el.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  };
  try {
    await React.act(async () => {
      root.render(React.createElement(Operations));
    });
    await settle();
    assert.ok(document.body.textContent.includes("Ready for coordination"));
    await fill(
      document.querySelector('textarea[aria-label="Message #general"]'),
      "A new operational update",
    );
    await click(document.querySelector('button[aria-label="Send message"]'));
    assert.ok(document.body.textContent.includes("A new operational update"));
    await click(button("Reply in thread"));
    assert.ok(document.querySelector('textarea[aria-label="Reply in thread"]'));
    await fill(
      document.querySelector('textarea[aria-label="Reply in thread"]'),
      "Thread follow-up",
    );
    const sends = document.querySelectorAll(
      'button[aria-label="Send message"]',
    );
    await click(sends[sends.length - 1]);
    assert.ok(document.body.textContent.includes("Thread follow-up"));
    await click(document.querySelector('button[aria-label="Close thread"]'));
    await click(button("Actions"));
    await click(button("New action"));
    const dialog = document.querySelector('[role="dialog"]');
    const fields = dialog.querySelectorAll("input,textarea");
    await fill(fields[0], "Contact the partner");
    await fill(fields[1], "Complete the introduction");
    await fill(fields[2], "Confirmed meeting");
    await click(
      [...dialog.querySelectorAll("button")].find(
        (b) => b.textContent === "Save",
      ),
    );
    assert.ok(document.body.textContent.includes("Contact the partner"));
    await click(button("SOP"));
    assert.ok(document.body.textContent.includes("CVOA operating framework"));
    await click(button("Messages"));
    await fill(
      document.querySelector('textarea[aria-label="Message #general"]'),
      "Account-sensitive draft",
    );
    globalThis.__OPS_UI_ACCOUNT = "10000000-0000-0000-0000-000000000002";
    await React.act(async () => {
      root.render(React.createElement(Operations));
    });
    await settle();
    assert.equal(
      document.querySelector('textarea[aria-label="Message #general"]').value,
      "",
    );
    assert.equal(document.querySelector('[role="alert"]'), null);
  } finally {
    await React.act(async () => root.unmount());
    fs.unlinkSync(outfile);
    delete require.cache[outfile];
    delete globalThis.__OPS_UI_ACCOUNT;
    dom.window.close();
  }
});
