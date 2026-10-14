import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
test("the export button is hidden from non-NCC accounts and the reviewed CSV is downloadable", async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: "http://localhost/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const file = "tests/.ncc-export-ui.cjs";
  let blob,
    filename = "";
  const originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (value) => {
    blob = value;
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {
    filename = this.download;
  };
  await build({
    entryPoints: ["src/components/access/MembershipListExport.tsx"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: file,
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
            loader: "js",
            contents: `export const useAuth=()=>({session:{user:{id:globalThis.__NCC_USER||'staff'}},selectedScope:'primary'});export const supabase={rpc:async(name,args)=>{if(name==='cvoa_membership_export_access')return {data:{allowed:globalThis.__NCC_USER==='commander',can_manage:true},error:null};if(name==='cvoa_membership_list')return {data:{generated_at:'2026-10-14T13:30:00Z',rows:[{id:'1',name:'Test Member',address:'1 Main St',membership_class:'Combat Member',votes_entitled:1,voting_entitlement:'Membership referendum'}]},error:null};return {data:[],error:null}}};`,
          }));
        },
      },
    ],
  });
  const React = await import("react"),
    { createRoot } = await import("react-dom/client");
  const Component = createRequire(import.meta.url)(
      process.cwd() + "/" + file,
    ).default,
    root = createRoot(document.getElementById("root"));
  const settle = () =>
    React.act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  try {
    await React.act(async () => root.render(React.createElement(Component)));
    await settle();
    assert.equal(document.querySelector("button"), null);
    globalThis.__NCC_USER = "commander";
    await React.act(async () => root.render(React.createElement(Component)));
    await settle();
    const button = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Export membership list"),
    );
    assert.ok(button);
    await React.act(async () => button.click());
    await settle();
    assert.ok(document.body.textContent.includes("NCC only"));
    const textarea = [...document.querySelectorAll("textarea")].find((e) =>
      e.placeholder.includes("referendum"),
    );
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLTextAreaElement.prototype,
        "value",
      ).set.call(textarea, "Written inspection request review");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const download = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Download membership list CSV"),
    );
    assert.equal(download.disabled, false);
    await React.act(async () => download.click());
    await settle();
    assert.ok(filename.endsWith(".csv"));
    assert.ok((await blob.text()).includes("Number of votes entitled"));
    globalThis.__NCC_USER = "other-staff";
    await React.act(async () => root.render(React.createElement(Component)));
    await settle();
    assert.equal(document.querySelector("button"), null);
    assert.equal(document.querySelector('[role="dialog"]'), null);
  } finally {
    await React.act(async () => root.unmount());
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    delete globalThis.__NCC_USER;
    dom.window.close();
    fs.unlinkSync(file);
  }
});
