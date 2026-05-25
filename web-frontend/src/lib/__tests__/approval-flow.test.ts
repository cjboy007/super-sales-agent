import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PATCH, POST, GET } from "../../app/api/approvals/route";
import { deleteApprovalRequest } from "../db";
import {
  clearSideEffectLog,
  requestSideEffect,
  resetConfig,
} from "../../../../ssa-runtime/index";

describe("approval flow", () => {
  beforeEach(() => {
    process.env.SSA_MODE = "test";
    resetConfig();
    clearSideEffectLog();
  });

  afterEach(() => {
    process.env.SSA_MODE = "test";
    resetConfig();
    clearSideEffectLog();
  });

  it("creates, updates, reads, and gates an approval record", async () => {
    const id = `APV-${randomUUID()}`;

    try {
      const createRes = await POST(
        new Request("http://localhost/api/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            dealId: "deal-001",
            account: "Acme Industrial",
            title: "Approve customer-facing quote",
            triggerType: "manual",
            value: "USD 42,000",
            risk: "medium",
            due: "2026-05-23T12:00:00.000Z",
            recommendation: "Approve and send after review",
            guardrail: "Operator must confirm before send",
          }),
        })
      );
      const created = await createRes.json();
      expect(createRes.status).toBe(201);
      expect(created.success).toBe(true);
      expect(created.data.id).toBe(id);
      expect(created.data.status).toBe("pending");

      const getRes = await GET(new Request(`http://localhost/api/approvals?id=${id}`));
      const fetched = await getRes.json();
      expect(fetched.success).toBe(true);
      expect(fetched.data).toHaveLength(1);
      expect(fetched.data[0].id).toBe(id);

      const patchRes = await PATCH(
        new Request("http://localhost/api/approvals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            status: "approved",
            decisionBy: "Wilson",
            decisionNote: "Approved for customer send",
          }),
        })
      );
      const patched = await patchRes.json();
      expect(patchRes.status).toBe(200);
      expect(patched.data.status).toBe("approved");

      process.env.SSA_MODE = "production";
      resetConfig();

      const gate = requestSideEffect({
        type: "email_send",
        target: "buyer@example.com",
        payload: { subject: "Quote approval" },
        approvalId: id,
        requestedBy: "test-suite",
      });
      expect(gate.blocked).toBe(false);
      expect(gate.reason).toContain("Approved");
    } finally {
      deleteApprovalRequest(id);
    }
  });
});
