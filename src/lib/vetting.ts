import type { PostApplication } from "./types";

export const VETTING_QUESTIONS = [
  {
    id: "purpose",
    title: "Why do you want to open a CVOA post?",
    hint: "Describe the local need, who you intend to serve, and how the post supports CVOA’s mission.",
  },
  {
    id: "eligibility",
    title:
      "What is your current CVOA membership and service-verification status?",
    hint: "Describe what has been verified and what is outstanding. Use the secure document upload for service records; do not paste service numbers or SSNs here.",
  },
  {
    id: "region",
    title: "Where will the post operate, and why is it viable there?",
    hint: "Identify the city/county/region, nearby veteran organizations, and how you will work with them.",
  },
  {
    id: "petitioners",
    title: "How will you assemble ten Combat Members in good standing?",
    hint: "Appendix I requires at least ten for a charter petition. Explain your current progress and recruitment plan; starting this review does not require claiming a completed petition.",
  },
  {
    id: "officers",
    title:
      "Who can serve as Commander, Vice Commander, Quartermaster, and Adjutant?",
    hint: "These are the four named officer positions in Appendix I. Describe their experience, commitment, and vacancies. The post launch workspace tracks appointments and any additional operational positions.",
  },
  {
    id: "leadership",
    title: "Tell us about leading a team through a difficult situation.",
    hint: "What did you do, what was the result, and what would you change?",
  },
  {
    id: "commitment",
    title:
      "What time can you reliably commit, and who covers when you are unavailable?",
    hint: "Give a realistic weekly commitment, competing responsibilities, and a continuity plan.",
  },
  {
    id: "first90",
    title: "What will your first 90 days accomplish?",
    hint: "Name concrete activities, owners, dates, and measurable results. A facility is not a substitute for an operating plan.",
  },
  {
    id: "resources",
    title: "How will you fund and responsibly operate the post?",
    hint: "Describe a realistic budget, fundraising, recordkeeping, financial controls, and a meeting location. Identify gaps without making unsupported commitments.",
  },
  {
    id: "accountability",
    title: "How will you handle conflict, misconduct, and accountability?",
    hint: "Explain how you will follow CVOA’s Bylaws and Code of Conduct, maintain minutes/records, and escalate concerns through the proper governing bodies.",
  },
] as const;
export const VETTING_CATEGORIES = [
  {
    key: "leadership",
    label: "Leadership",
    hint: "Uses concrete examples, delegates responsibly, and develops a team.",
  },
  {
    key: "communication",
    label: "Communication",
    hint: "Explains plans clearly, listens, and follows through on contact.",
  },
  {
    key: "professionalism",
    label: "Professionalism",
    hint: "Demonstrates judgment, respect, ethical conduct, and accountability.",
  },
  {
    key: "reliability",
    label: "Reliability",
    hint: "Has realistic time commitments, consistent follow-through, and a continuity plan.",
  },
  {
    key: "mission_alignment",
    label: "Mission alignment",
    hint: "Connects local plans to CVOA’s mission, membership, and governance.",
  },
] as const;
export type Answers = Record<string, string>;
export interface Questionnaire {
  application_id: string;
  answers: Answers;
  workflow_version: number;
  requested_at: string;
  submitted_at: string | null;
  updated_at: string;
}
export interface SavedReview {
  id: string;
  scored_by: string | null;
  reviewer_name: string | null;
  leadership_score: number | null;
  communication_score: number | null;
  professionalism_score: number | null;
  reliability_score: number | null;
  mission_alignment_score: number | null;
  notes: string | null;
  question_answers: Answers;
  follow_up_tasks: string | null;
  recommendation: string;
  created_at: string;
}
export const RECOMMENDATIONS: Record<string, string> = {
  not_recorded: "Not recorded (legacy review)",
  needs_follow_up: "Needs follow-up",
  ready_for_council: "Ready for Council review",
  not_recommended: "Not recommended at this time",
};
export function scoreAverage(r: SavedReview) {
  const values = VETTING_CATEGORIES.map((c) => r[`${c.key}_score`]).filter(
    (v): v is number => typeof v === "number",
  );
  return values.length
    ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
    : "Not scored";
}
export function validateScores(scores: Record<string, string>) {
  return VETTING_CATEGORIES.every((c) =>
    /^([1-9]|10)$/.test(scores[c.key] ?? ""),
  );
}
export function escapeReport(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function vettingReport(
  a: PostApplication,
  reviews: SavedReview[],
  questionnaire: Questionnaire | null,
): string {
  const e = escapeReport;
  const responses = (answers: Answers) =>
    VETTING_QUESTIONS.map(
      (q) =>
        `<h4>${e(q.title)}</h4><p>${e(answers[q.id] || "No response recorded.")}</p>`,
    ).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CVOA Vetting Report — ${e(a.name)}</title><style>body{font:14px Arial,sans-serif;color:#111;max-width:900px;margin:40px auto;padding:20px}h1,h2{border-bottom:1px solid #aaa;padding-bottom:8px}p{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px;border:1px solid #ccc}article{margin:30px 0}h4{margin-bottom:4px}@media print{body{margin:0}h2,h4{break-after:avoid}tr{break-inside:avoid}}</style></head><body><h1>CVOA · Post Applicant Vetting Report</h1><p>Confidential — National review. Share only with authorized reviewers.</p><h2>${e(a.name)}</h2><p>${e(a.city)}, ${e(a.state)}\n${e(a.email)}\nApplication: ${e(a.id)}\nStage: ${e(a.status.replaceAll("_", " "))}\nExported: ${e(new Date().toISOString())}</p><p>Scores and recommendations support review. They do not approve a charter, verify membership/service, or grant an appointment.</p><h2>Original application</h2><p>Motivation: ${e(a.motivation || "Not recorded")}\nLeadership: ${e(a.leadership_experience || "Not recorded")}\nVeteran network: ${e(a.existing_veteran_network || "Not recorded")}\nEstimated membership: ${e(a.estimated_membership_potential ?? "Not recorded")}\nDD214 review: ${e(a.dd214_review_status)}</p><h2>Applicant questionnaire</h2><p>${questionnaire?.submitted_at ? `Submitted ${e(questionnaire.submitted_at)}` : questionnaire ? "Draft — not submitted by the applicant." : "Not requested."}</p>${questionnaire?.submitted_at ? responses(questionnaire.answers) : "<p>Unsubmitted applicant drafts are excluded from this report.</p>"}<h2>Saved scorecards (${reviews.length})</h2>${reviews.map((r) => `<article><h3>${e(r.reviewer_name || "Reviewer not recorded")} · ${e(r.created_at)}</h3><p>Review ID: ${e(r.id)}\nRecommendation: ${e(RECOMMENDATIONS[r.recommendation] || r.recommendation)}\nAverage: ${e(scoreAverage(r))}/10</p><table><tr><th>Category</th><th>Score</th></tr>${VETTING_CATEGORIES.map((c) => `<tr><td>${e(c.label)}</td><td>${e(r[`${c.key}_score`] ?? "Not scored")}</td></tr>`).join("")}</table><h4>Reviewer notes</h4><p>${e(r.notes || "None recorded.")}</p><h4>Follow-up tasks</h4><p>${e(r.follow_up_tasks || "None recorded.")}</p><h3>Interview responses recorded by reviewer</h3>${responses(r.question_answers || {})}</article>`).join("") || "<p>No saved scorecards.</p>"}</body></html>`;
}
