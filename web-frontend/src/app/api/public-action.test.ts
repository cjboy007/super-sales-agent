import { describe, expect, it } from "vitest";
import { publicActionView, withPublicAction } from "./public-action";
import type { SideEffectDecision } from "@/lib/runtime";

describe("public action responses", () => {
  it("hides raw environment flags from product-facing action reasons", () => {
    const decision: SideEffectDecision = {
      id: "email-send-1",
      kind: "email.send",
      workspaceId: "farreach",
      status: "blocked",
      reason: "Real execution blocked by default. Set SSA_ENABLE_REAL_EMAIL_SEND=true to allow this side effect.",
      realExecutionEnabled: false,
      createdAt: "2026-06-09T00:00:00.000Z",
      payload: {
        summary: "Send customer follow-up.",
        idempotencyKey: "internal-key",
      },
    };

    const view = publicActionView(decision);

    expect(view.reason).toContain("explicit approval");
    expect(view.reason).not.toContain("SSA_ENABLE_REAL");
    expect(view.reason).not.toContain("side effect");
  });

  it("keeps background-check queue counts out of public CRM sync summaries", () => {
    const publicResult = withPublicAction({
      success: true,
      crm: {
        workspaceId: "farreach",
        received: 1,
        newActivities: 2,
        orderActivities: 1,
        customersUpserted: 1,
        companyIntelQueued: 3,
        lifecycleStatuses: 1,
      },
    });

    expect(publicResult.crm).toEqual({
      received: 1,
      timelineActivities: 2,
      orderActivities: 1,
      customersUpdated: 1,
      lifecycleUpdates: 1,
    });
    expect(JSON.stringify(publicResult)).not.toContain("companyIntelQueued");
    expect(JSON.stringify(publicResult)).not.toContain("backgroundChecksQueued");
    expect(JSON.stringify(publicResult)).not.toContain("workspaceId");
  });
});
