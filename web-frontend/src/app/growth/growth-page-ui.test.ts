import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/app/growth/page.tsx"), "utf8");
const navSource = readFileSync(join(process.cwd(), "src/components/ui/app-nav.ts"), "utf8");

describe("Autonomous Growth control center page", () => {
  it("renders the five required operation panels instead of a landing page", () => {
    expect(pageSource).toContain("Autonomous Growth");
    expect(pageSource).toContain("Automation Mode");
    expect(pageSource).toContain("HITL Policy Matrix");
    expect(pageSource).toContain("Review Queue");
    expect(pageSource).toContain("Autonomous Prospecting Preview");
    expect(pageSource).toContain("Decision Learning");
    expect(pageSource).not.toContain("hero section");
    expect(pageSource).not.toContain("Start your journey");
  });

  it("shows autopilot as visible but unavailable", () => {
    expect(pageSource).toContain("autopilot");
    expect(pageSource).toMatch(/not ready|disabled/i);
    expect(pageSource).toContain("allowed={false}");
  });

  it("surfaces high-risk policy defaults directly in the UI", () => {
    expect(pageSource).toContain("payment.bank");
    expect(pageSource).toContain("blocked");
    expect(pageSource).toContain("email.send");
    expect(pageSource).toContain("review");
  });

  it("renders Phase 8 dry-run prospecting operations without implying real outbound", () => {
    expect(pageSource).toContain("Prospecting Runs");
    expect(pageSource).toContain("Candidate Packets");
    expect(pageSource).toContain("Evidence / Confidence");
    expect(pageSource).toContain("ICP Score");
    expect(pageSource).toContain("Opening Angle");
    expect(pageSource).toContain("Risk Flags");
    expect(pageSource).toContain("Next Step");
    expect(pageSource).toContain("no outbound sent");
    expect(pageSource).toContain("draft-only");
    expect(pageSource).toContain("autopilot still not ready");
    expect(pageSource).not.toContain("real outbound enabled");
    expect(pageSource).not.toContain("email sent");
  });

  it("renders Phase 9 product fit and quotation draft operations as draft-only", () => {
    expect(pageSource).toContain("Product Fit Recommendations");
    expect(pageSource).toContain("Quotation Drafts");
    expect(pageSource).toContain("Draft Lines");
    expect(pageSource).toContain("Cost / Price / Margin References");
    expect(pageSource).toContain("Assumptions");
    expect(pageSource).toContain("Missing Info Checklist");
    expect(pageSource).toContain("Evidence References");
    expect(pageSource).toContain("Recommended Human Edits");
    expect(pageSource).toContain("draft-only");
    expect(pageSource).toContain("not sent");
    expect(pageSource).toContain("officialQuote false");
    expect(pageSource).toContain("piGenerated false");
    expect(pageSource).toContain("documentGenerated false");
    expect(pageSource).toContain("no document generated");
    expect(pageSource).toContain("autopilot still not ready");
    expect(pageSource).not.toContain("formal quote generated");
    expect(pageSource).not.toContain("PI generated");
    expect(pageSource).not.toContain("document generated successfully");
  });

  it("renders Phase 10 outbound approval pipeline without implying execution", () => {
    expect(pageSource).toContain("Outbound Approval Pipeline");
    expect(pageSource).toContain("Approval Requests");
    expect(pageSource).toContain("Target Customer");
    expect(pageSource).toContain("Recipient");
    expect(pageSource).toContain("Content Summary");
    expect(pageSource).toContain("Evidence");
    expect(pageSource).toContain("Risk Flags");
    expect(pageSource).toContain("Expected Action");
    expect(pageSource).toContain("Idempotency Key");
    expect(pageSource).toContain("Failure / Retry Strategy");
    expect(pageSource).toContain("Side-effect Gate Status");
    expect(pageSource).toContain("approval required");
    expect(pageSource).toContain("not executed");
    expect(pageSource).toContain("not sent");
    expect(pageSource).toContain("crm not written");
    expect(pageSource).toContain("no document generated");
    expect(pageSource).toContain("officialQuote false");
    expect(pageSource).toContain("piGenerated false");
    expect(pageSource).toContain("autopilot still not ready");
    expect(pageSource).not.toContain("email sent");
    expect(pageSource).not.toContain("CRM updated");
    expect(pageSource).not.toContain("formal quote generated");
  });

  it("uses the beta-aware API client and does not expose internal implementation data", () => {
    expect(pageSource).toContain("useProject");
    expect(pageSource).toContain("apiFetch(\"/api/growth/control-center\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/prospecting\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/prospecting/dry-run\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/quotation-drafts\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/quotation-drafts/draft\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/outbound-approvals\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/outbound-approvals/request\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/decision-learning\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/decision-learning/record\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/scheduler\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/scheduler/run\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/metrics\"");
    expect(pageSource).not.toContain("fetch(\"/api/growth/control-center");
    expect(pageSource).not.toContain("fetch(\"/api/growth/prospecting");
    expect(pageSource).not.toContain("fetch(\"/api/growth/quotation-drafts");
    expect(pageSource).not.toContain("fetch(\"/api/growth/outbound-approvals");
    expect(pageSource).not.toContain("fetch(\"/api/growth/decision-learning");
    expect(pageSource).not.toContain("fetch(\"/api/growth/scheduler");
    expect(pageSource).not.toContain("fetch(\"/api/growth/metrics");
    expect(pageSource).not.toContain("SSA_DATA_ROOT");
    expect(pageSource).not.toContain("/Users/");
    expect(pageSource).not.toContain("payload");
    expect(pageSource).not.toContain("secret");
  });

  it("renders Phase 11 decision learning as auditable memory without policy auto-approval", () => {
    expect(pageSource).toContain("Decision Learning");
    expect(pageSource).toContain("Decision Memory");
    expect(pageSource).toContain("Human Decision");
    expect(pageSource).toContain("Human Edits");
    expect(pageSource).toContain("Rejection Reason");
    expect(pageSource).toContain("Policy Suggestion");
    expect(pageSource).toContain("Scope");
    expect(pageSource).toContain("Rollback Note");
    expect(pageSource).toContain("High-risk Guardrail");
    expect(pageSource).toContain("No Auto-Approval");
    expect(pageSource).toContain("read-only until reviewed");
    expect(pageSource).toContain("no auto-approval");
    expect(pageSource).toContain("high-risk still review");
    expect(pageSource).toContain("side-effect gate still required");
    expect(pageSource).toContain("autopilot still not ready");
    expect(pageSource).not.toContain("policy auto-approved");
    expect(pageSource).not.toContain("autopilot enabled");
  });

  it("renders Phase 12 scheduler and metrics without implying a real outbound pilot", () => {
    expect(pageSource).toContain("Autonomous Scheduler");
    expect(pageSource).toContain("Growth Metrics");
    expect(pageSource).toContain("Scheduled Runs");
    expect(pageSource).toContain("Failed / Retryable Work");
    expect(pageSource).toContain("Candidate Count");
    expect(pageSource).toContain("Evidence Coverage");
    expect(pageSource).toContain("ICP Distribution");
    expect(pageSource).toContain("Human Edit Rate");
    expect(pageSource).toContain("Approve / Reject Rate");
    expect(pageSource).toContain("Failure Reasons");
    expect(pageSource).toContain("Misjudgment Reasons");
    expect(pageSource).toContain("Reply Rate Placeholder");
    expect(pageSource).toContain("dry-run only");
    expect(pageSource).toContain("draft-only");
    expect(pageSource).toContain("not executed");
    expect(pageSource).toContain("no outbound sent");
    expect(pageSource).toContain("side-effect gate still required");
    expect(pageSource).toContain("autopilot still not ready");
    expect(pageSource).not.toContain("real outbound pilot started");
    expect(pageSource).not.toContain("email sent");
    expect(pageSource).not.toContain("CRM updated");
    expect(pageSource).not.toContain("PI generated");
    expect(pageSource).not.toContain("autopilot enabled");
  });

  it("adds a compact global navigation entry for growth operations", () => {
    expect(navSource).toContain("Growth");
    expect(navSource).toContain("增长");
    expect(navSource).toContain("/growth");
  });
});
