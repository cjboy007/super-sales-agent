import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-inbox-select-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/inbox/[emailId]/select route", () => {
  it("selects a reply strategy through the runtime inbox module", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/email-001/select?project=farreach", {
      style: "steady",
    }), { params: { emailId: "email-001" } });
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      full_email: {
        subject: "Re: Quotation for DisplayPort & USB-C Cables - Price Revision Request",
        attachments: ["CE_Certificate_DP14.pdf", "RoHS_Test_Report.pdf", "Product_Datasheet_DP_USBC.pdf"],
      },
    });
    expect(json.full_email.body).toContain("Dear Hans");
    expect(json.full_email.body).toContain("Best regards");
  });

  it("keeps missing email and option errors compatible", async () => {
    const { POST } = await import("./route");

    const missingEmail = await POST(request("http://localhost/api/inbox/missing/select?project=farreach", {
      style: "steady",
    }), { params: { emailId: "missing" } });
    expect(missingEmail.status).toBe(404);
    expect(await missingEmail.json()).toEqual({ success: false, error: "Email not found" });

    const missingOption = await POST(request("http://localhost/api/inbox/email-001/select?project=farreach", {
      style: "not-a-style",
    }), { params: { emailId: "email-001" } });
    expect(missingOption.status).toBe(404);
    expect(await missingOption.json()).toEqual({ success: false, error: "Option not found" });
  });

  it("caches selected reply drafts by email and style", async () => {
    const { POST } = await import("./route");

    const first = await POST(request("http://localhost/api/inbox/email-001/select?project=farreach", {
      style: "steady",
    }), { params: { emailId: "email-001" } });
    const second = await POST(request("http://localhost/api/inbox/email-001/select?project=farreach", {
      style: "steady",
    }), { params: { emailId: "email-001" } });
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(firstJson.cache).toMatchObject({ hit: false });
    expect(secondJson.cache).toMatchObject({ hit: true });
    expect(secondJson.full_email).toEqual(firstJson.full_email);
  });
});
