import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalImapFlag = process.env.SSA_ENABLE_REAL_IMAP;
const originalBridgeFlag = process.env.SSA_ENABLE_FARREACH_BRIDGE;
const originalFarreachUrl = process.env.SSA_FARREACH_URL;

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-inbox-detail-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_IMAP;
  delete process.env.SSA_ENABLE_FARREACH_BRIDGE;
  delete process.env.SSA_FARREACH_URL;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalImapFlag === undefined) delete process.env.SSA_ENABLE_REAL_IMAP;
  else process.env.SSA_ENABLE_REAL_IMAP = originalImapFlag;

  if (originalBridgeFlag === undefined) delete process.env.SSA_ENABLE_FARREACH_BRIDGE;
  else process.env.SSA_ENABLE_FARREACH_BRIDGE = originalBridgeFlag;

  if (originalFarreachUrl === undefined) delete process.env.SSA_FARREACH_URL;
  else process.env.SSA_FARREACH_URL = originalFarreachUrl;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string): NextRequest {
  return new NextRequest(url);
}

function expectNoInternalActionFields(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("sideEffect");
  expect(serialized).not.toContain("workspaceId");
  expect(serialized).not.toContain("realExecutionEnabled");
  expect(serialized).not.toContain("payload");
  expect(serialized).not.toContain("idempotencyKey");
  expect(serialized).not.toContain("/Users/");
  expect(serialized).not.toContain(".ssa");
}

describe("/api/inbox/[emailId] route", () => {
  it("serves local inbox detail from Sales Memory", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/inbox/email-001?project=farreach"), {
      params: Promise.resolve({ emailId: "email-001" }),
    });
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      data: {
        id: "email-001",
        from_email: "hans.mueller@techkabel.de",
      },
    });
    expect(json.sideEffect).toBeUndefined();
    expect(json.action).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("audits and blocks Farreach detail bridge fetches by default", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/inbox/email-001?project=farreach"), {
      params: Promise.resolve({ emailId: "email-001" }),
    });
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.action).toMatchObject({
      title: "Mailbox sync",
      status: "blocked",
      blocked: true,
    });
    expectNoInternalActionFields(json);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the detail bridge only when IMAP side effects are explicitly enabled", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_IMAP = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        email: {
          id: "bridge-email-1",
          uid: 1,
          from_email: "buyer@example.com",
          from_name: "Buyer",
          subject: "Bridge inquiry",
          body_text: "Can you quote this?",
          received_at: "2026-05-26T00:00:00.000Z",
          status: "pending_decision",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/inbox/bridge-email-1?project=farreach"), {
      params: Promise.resolve({ emailId: "bridge-email-1" }),
    });
    const json = await response.json();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("http://farreach.test/api/v1/inbox/bridge-email-1");
    expect(json).toMatchObject({
      success: true,
      data: { id: "bridge-email-1" },
      action: {
        title: "Mailbox sync",
        status: "allowed",
        blocked: false,
      },
    });
    expectNoInternalActionFields(json);
  });
});
