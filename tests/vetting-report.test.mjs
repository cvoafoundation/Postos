import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(fs.readFileSync("src/lib/vetting.ts", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText;
const { vettingReport, validateScores } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
test("all five scores must be explicitly selected as whole values", () => {
  assert.equal(validateScores({}), false);
  assert.equal(
    validateScores({
      leadership: "7",
      communication: "8",
      professionalism: "9",
      reliability: "6",
      mission_alignment: "8",
    }),
    true,
  );
  assert.equal(
    validateScores({
      leadership: "7.5",
      communication: "8",
      professionalism: "9",
      reliability: "6",
      mission_alignment: "8",
    }),
    false,
  );
});
test("exports escape applicant/reviewer content, retain Unicode, and exclude private drafts", () => {
  const html = vettingReport(
    {
      id: "app",
      name: "<script>alert(1)</script>",
      state: "IN",
      city: "Terre Haute",
      email: "test@example.test",
      status: "vetting",
      motivation: "Veterans & community",
      dd214_review_status: "pending",
    },
    [
      {
        id: "review",
        reviewer_name: "<img src=x onerror=alert(1)>",
        created_at: "2026-10-04",
        recommendation: "needs_follow_up",
        leadership_score: 7,
        communication_score: 8,
        professionalism_score: 9,
        reliability_score: 6,
        mission_alignment_score: 8,
        notes: "Résumé — observed evidence",
        question_answers: { purpose: "<iframe></iframe>" },
      },
    ],
    { answers: { purpose: "SECRET PRIVATE DRAFT" }, submitted_at: null },
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<iframe>"));
  assert.ok(!html.includes("SECRET PRIVATE DRAFT"));
  assert.ok(html.includes("Résumé — observed evidence"));
  assert.ok(html.includes("review"));
  assert.ok(html.includes("7.6"));
});
