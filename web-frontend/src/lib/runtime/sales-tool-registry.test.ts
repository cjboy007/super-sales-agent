import { describe, expect, it } from "vitest";
import { getSalesTool, listSalesTools, listSideEffectSalesTools } from "./sales-tool-registry";

describe("sales tool registry", () => {
  it("declares the first reusable sales tools with schemas and runtime boundaries", () => {
    const tools = listSalesTools();

    expect(tools.map((tool) => tool.id)).toEqual(expect.arrayContaining([
      "ingest.inbound_email",
      "crm.update_customer",
      "memory.search_customer",
      "email.draft_reply",
      "email.request_send",
      "document.generate_quotation_pi",
      "document.request_generation",
      "company_intel.queue",
      "follow_up.create_plan",
      "order.record_milestone",
    ]));
    expect(tools.every((tool) =>
      tool.name &&
      tool.description &&
      tool.inputSchema.type === "object" &&
      tool.outputSchema.type === "object" &&
      tool.requiredPermissions.length > 0 &&
      tool.idempotencyStrategy &&
      tool.failureRetryBehavior
    )).toBe(true);
  });

  it("requires approval metadata for every real side-effect tool", () => {
    const sideEffectTools = listSideEffectSalesTools();

    expect(sideEffectTools.length).toBeGreaterThanOrEqual(6);
    expect(sideEffectTools.every((tool) =>
      tool.sideEffectKind &&
      tool.approvalRequired === true &&
      tool.approvalRequirement === "operator_approval_required" &&
      tool.failureRetryBehavior.includes("side-effect decision")
    )).toBe(true);
    expect(getSalesTool("email.request_send")).toMatchObject({
      sideEffectKind: "email.send",
      approvalRequired: true,
    });
    expect(getSalesTool("document.generate_quotation_pi")).toMatchObject({
      sideEffectKind: "document.generate",
      approvalRequired: true,
    });
    expect(getSalesTool("order.record_milestone")).toMatchObject({
      sideEffectKind: "payment.write",
      approvalRequired: true,
    });
  });
});
