import { describe, expect, it } from "vitest";
import { createJadenPlan } from "./jaden-planner";

describe("Jaden Planner", () => {
  it("converts one operator command into a bounded typed sales plan", () => {
    const plan = createJadenPlan({
      workspaceId: "demo-exporter",
      commandId: "cmd-123",
      page: "quotations",
      url: "/quotations",
      message: "Research this RFQ, prepare quotation documents, draft a follow-up email, import the lead, plan follow-up, check payment, and notify Feishu.",
      context: {
        customer: "Acme Buyer",
        visibleRows: 7,
      },
    });

    expect(plan.source).toBe("jaden-planner");
    expect(plan.jobs.length).toBeGreaterThan(0);
    expect(plan.jobs.length).toBeLessThanOrEqual(5);
    expect(plan.jobs.map((job) => job.workflow)).toEqual([
      "quotation.prepare",
      "email.reply",
      "lead.import",
      "follow_up.plan",
    ]);
    expect(plan.jobs[0]).toMatchObject({
      workspaceId: "demo-exporter",
      input: {
        commandId: "cmd-123",
        planner: "jaden-planner",
        originWorkflow: "operator.command",
        page: "quotations",
        url: "/quotations",
      },
    });
  });

  it("keeps generic commands inside a single operator.command coordination job", () => {
    const plan = createJadenPlan({
      workspaceId: "farreach",
      commandId: "cmd-general",
      page: "cockpit",
      message: "Summarize what changed and recommend the next safe step.",
      context: {},
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]).toMatchObject({
      workflow: "operator.command",
      workspaceId: "farreach",
      input: {
        commandId: "cmd-general",
        planner: "jaden-planner",
        message: "Summarize what changed and recommend the next safe step.",
      },
    });
  });
});
