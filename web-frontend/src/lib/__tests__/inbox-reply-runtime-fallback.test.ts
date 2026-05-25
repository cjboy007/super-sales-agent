import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/inbox/[emailId]/reply/route";
import { resetConfig } from "../../../../ssa-runtime/index";

describe("inbox reply runtime fallback", () => {
  beforeEach(() => {
    process.env.SSA_MODE = "test";
    process.env.SSA_LLM_MOCK = "true";
    resetConfig();
    vi.restoreAllMocks();
  });

  it("generates a reply draft through SSA runtime when Farreach is unavailable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const request = new Request("http://localhost/api/inbox/email-123/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "buyer@example.com",
        subject: "Need quote for USB-C cables",
        body: "Please quote 5000 pcs USB-C cables with lead time.",
        language: "en",
      }),
    });

    const response = await POST(request, { params: { emailId: "email-123" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.fallback).toBe(true);
    expect(payload.source).toBe("ssa-runtime-mock");
    expect(payload.draft.uid).toBe("email-123");
    expect(payload.draft.options).toHaveLength(3);
    expect(payload.draft.options[0].full_email).toContain("quotation");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
