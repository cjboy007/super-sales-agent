/**
 * Customer-facing send safety checks.
 *
 * SMTP/Farreach send paths must stop at the SSA side-effect gate in local test
 * mode. They must not fall back to a fake "sent" response.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postEmailSend } from "../../app/api/emails/send/route";
import { POST as postInboxSend } from "../../app/api/inbox/[emailId]/send/route";
import { gateCustomerEmailSend } from "../customer-side-effects";
import {
  clearSideEffectLog,
  getSideEffectLog,
  resetConfig,
} from "../../../../ssa-runtime/index";

describe("customer-facing email side-effect gate", () => {
  beforeEach(() => {
    process.env.SSA_MODE = "test";
    resetConfig();
    clearSideEffectLog();
    vi.restoreAllMocks();
  });

  it("does not store the full draft body in the side-effect log", () => {
    const decision = gateCustomerEmailSend({
      to: "buyer@example.com",
      subject: "Quote",
      body: "Confidential draft body that must not be logged verbatim.",
      route: "test:email-send",
    });

    expect(decision.gate.blocked).toBe(true);
    expect(decision.gate.request.payload).toEqual({
      subject: "Quote",
      html: false,
      bodyLength: 57,
    });
    expect(JSON.stringify(getSideEffectLog())).not.toContain("Confidential draft body");
  });

  it("blocks /api/inbox/[emailId]/send before Farreach can be called", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = new Request("http://localhost/api/inbox/email-123/send", {
      method: "POST",
      body: JSON.stringify({
        to: "buyer@example.com",
        subject: "Quote",
        body: "Draft content",
      }),
    });

    const response = await postInboxSend(request, { params: { emailId: "email-123" } });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(payload.blocked).toBe(true);
    expect(payload.dryRun).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks /api/emails/send before SMTP execution", async () => {
    const request = new Request("http://localhost/api/emails/send", {
      method: "POST",
      body: JSON.stringify({
        to: "buyer@example.com",
        subject: "Quote",
        body: "Draft content",
      }),
    });

    const response = await postEmailSend(request as never);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(payload.blocked).toBe(true);
    expect(payload.dryRun).toBe(true);
    expect(payload.message).toContain("not sent");
  });
});
