import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  fs.readFileSync("src/lib/postHealth.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { computePostHealth } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const date = (days) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const inputs = {
  post: { created_at: date(300), charter_date: date(300) },
  foundingTeam: [],
  sponsors: [],
  meetingDates: [],
  recruits: [],
  members: [],
  hasDelegate: false,
  delegateVotesCast: 0,
  governanceSignatures: [],
  annualReview: null,
  communityServiceEvents: [],
  financialTransactions: [],
};
test("recent published minutes improve the meeting signal and composite", () => {
  const before = computePostHealth(inputs);
  const after = computePostHealth({ ...inputs, meetingDates: [date(1)] });
  assert.equal(
    after.dimensions.find((d) => d.key === "meetings").status,
    "green",
  );
  assert.ok(after.score > before.score);
});
test("future meeting dates cannot make an overdue post look compliant", () => {
  const result = computePostHealth({
    ...inputs,
    meetingDates: [date(70), date(-30)],
  });
  assert.equal(
    result.dimensions.find((d) => d.key === "meetings").status,
    "red",
  );
});
test("calculating health preserves the caller’s meeting records", () => {
  const meetingDates = [date(1), date(70)];
  const original = [...meetingDates];
  computePostHealth({ ...inputs, meetingDates });
  assert.deepEqual(meetingDates, original);
});
const evidence = {
  current_officers: [],
  sponsor_receipts: [],
  eligible_votes: 0,
  votes_cast: 0,
  has_delegate: true,
};
test("won sponsor pledges do not become received money in the health score", () => {
  const result = computePostHealth({
    ...inputs,
    evidence,
    sponsors: [{ stage: "won", sponsorship_value: 9999 }],
  });
  assert.equal(
    result.dimensions.find((d) => d.key === "sponsors").status,
    "neutral",
  );
});
test("actual receipts aggregate by sponsor and exclude pledges from concentration", () => {
  const result = computePostHealth({
    ...inputs,
    evidence: {
      ...evidence,
      sponsor_receipts: [
        { sponsor_id: "a", amount: 40 },
        { sponsor_id: "a", amount: 10 },
        { sponsor_id: "b", amount: 50 },
      ],
    },
  });
  assert.equal(
    result.dimensions.find((d) => d.key === "sponsors").status,
    "green",
  );
  assert.match(
    result.dimensions.find((d) => d.key === "sponsors").detail,
    /50%.*100 received/,
  );
});
test("name-only governance signatures cannot satisfy a linked current officer identity", () => {
  const current = [
    { name: "Same name", position: "commander", profile_id: "current" },
  ];
  const result = computePostHealth({
    ...inputs,
    evidence: { ...evidence, current_officers: current },
    governanceSignatures: [
      {
        signer_name: "Same name",
        profile_id: "old",
        form_type: "conflict_of_interest",
        signed_at: date(1),
      },
      {
        signer_name: "Same name",
        profile_id: "old",
        form_type: "officer_acknowledgment",
        signed_at: date(1),
      },
    ],
  });
  assert.equal(
    result.dimensions.find((d) => d.key === "governance").status,
    "red",
  );
});
test("an incomplete annual checklist with a completion timestamp remains incomplete", () => {
  const result = computePostHealth({
    ...inputs,
    annualReview: {
      review_year: new Date().getFullYear(),
      completed_at: date(1),
      bylaws_reviewed: true,
      financial_audit_complete: false,
      officer_roster_current: true,
      required_filings_current: true,
      reviewed_by: "actor",
      notes: "Drive evidence",
    },
  });
  assert.equal(
    result.dimensions.find((d) => d.key === "annual_review").status,
    "yellow",
  );
});
test("missing financial records require attention and do not count as observed financial evidence", () => {
  const result = computePostHealth({ ...inputs, evidence });
  assert.equal(
    result.dimensions.find((d) => d.key === "financial").status,
    "yellow",
  );
  assert.ok(result.coverage < 100);
});
test("future financial entries and community events cannot improve current operational health", () => {
  const result = computePostHealth({
    ...inputs,
    financialTransactions: [
      { transaction_type: "income", amount: 500, transaction_date: date(-5) },
    ],
    communityServiceEvents: [{ event_date: date(-5) }],
  });
  assert.equal(
    result.dimensions.find((d) => d.key === "financial").status,
    "yellow",
  );
  assert.equal(
    result.dimensions.find((d) => d.key === "community_service").status,
    "red",
  );
});
test("current Congress participation uses eligible recent ballots, with no voting opportunities neutral", () => {
  assert.equal(
    computePostHealth({ ...inputs, evidence }).dimensions.find(
      (d) => d.key === "congress",
    ).status,
    "neutral",
  );
  assert.equal(
    computePostHealth({
      ...inputs,
      evidence: { ...evidence, eligible_votes: 3, votes_cast: 1 },
    }).dimensions.find((d) => d.key === "congress").status,
    "yellow",
  );
});
test("a critical financial deficit stays red even when other recorded indicators are green", () => {
  const officers = [
    "commander",
    "vice_commander",
    "adjutant",
    "quartermaster",
    "sergeant_at_arms",
  ].map((position, i) => ({
    name: `Officer ${i}`,
    position,
    profile_id: `officer${i}`,
  }));
  const signatures = officers.flatMap((o) =>
    ["conflict_of_interest", "officer_acknowledgment"].map((form_type) => ({
      profile_id: o.profile_id,
      signer_name: o.name,
      form_type,
      signed_at: date(1),
    })),
  );
  const result = computePostHealth({
    ...inputs,
    evidence: {
      ...evidence,
      current_officers: officers,
      eligible_votes: 1,
      votes_cast: 1,
    },
    members: Array.from({ length: 25 }, () => ({
      membership_status: "active",
      joined_at: date(5),
    })),
    meetingDates: [date(1)],
    governanceSignatures: signatures,
    communityServiceEvents: [{ event_date: date(1) }],
    annualReview: {
      review_year: new Date().getFullYear(),
      bylaws_reviewed: true,
      financial_audit_complete: true,
      officer_roster_current: true,
      required_filings_current: true,
      completed_at: date(1),
      reviewed_by: "reviewer",
      notes: "Evidence packet",
    },
    financialTransactions: [
      { transaction_type: "expense", amount: 100, transaction_date: date(1) },
    ],
  });
  assert.ok(result.score >= 75);
  assert.equal(result.overall, "red");
  assert.ok(result.critical.includes("Financial Records"));
});
test('National settings change operational thresholds and required staffing without changing source records',()=>{
 const policy={required_positions:['commander'],membership_green:2,membership_yellow:1,critical_keys:[]};const result=computePostHealth({...inputs,evidence:{...evidence,current_officers:[{position:'commander',profile_id:'commander'}],policy},members:[{membership_status:'active'},{membership_status:'active'}]});assert.equal(result.dimensions.find(d=>d.key==='officers').status,'green');assert.equal(result.dimensions.find(d=>d.key==='membership').status,'green')
})
