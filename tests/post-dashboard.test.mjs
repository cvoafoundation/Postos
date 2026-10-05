import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  fs.readFileSync("src/pages/posts/model.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { dashboardActions, postDisplayName } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const snapshot = {
  post: {
    id: "post",
    name: "Test (Forming)",
    status: "active_post",
    archived_at: null,
  },
  plan: null,
  tasks: [],
  meetings: [],
  members: { expiring: 0 },
  finance: { last_entry: "2026-10-01" },
};
test("the post name never supplies a stale lifecycle badge", () => {
  assert.equal(postDisplayName(snapshot.post), "Test");
  assert.equal(
    postDisplayName({ ...snapshot.post, name: "Test (FORMING)" }),
    "Test",
  );
});
test("post actions prioritize approvals, overdue assigned work, and renewals", () => {
  const data = {
    ...snapshot,
    plan: { stage: "opening_review" },
    members: { expiring: 2 },
    tasks: [
      {
        id: "late",
        title: "Late task",
        owner: "Commander",
        due_date: "2026-10-01",
        path: "/source",
      },
    ],
  };
  const actions = dashboardActions(data, undefined, "2026-10-05");
  assert.equal(actions[0].id, "approval");
  assert.equal(actions[1].id, "late");
  assert.equal(actions[1].path, "/source");
  assert.ok(actions.some((a) => a.id === "renewals"));
});
test("completed unpublished meetings prompt publication and archived posts produce no current operations queue", () => {
  const data = {
    ...snapshot,
    meetings: [
      {
        status: "completed",
        published_at: null,
        title: "Completed meeting",
        path: "/meeting",
      },
    ],
  };
  assert.ok(dashboardActions(data).some((a) => a.id === "minutes"));
  assert.deepEqual(
    dashboardActions({
      ...data,
      post: { ...data.post, archived_at: "2026-10-05" },
    }),
    [],
  );
});
