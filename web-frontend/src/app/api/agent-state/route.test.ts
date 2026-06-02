import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-agent-state-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("/api/agent-state route", () => {
  it("returns runtime-derived agent summaries for the operator dashboard", async () => {
    const { createRuntimeTaskQueue } = await import("@/lib/runtime");
    const createdAt = new Date().toISOString();
    const queue = createRuntimeTaskQueue();
    queue.enqueue({
      id: "job-1",
      workspaceId: "demo-exporter",
      workflow: "email.reply",
      status: "queued",
      input: {},
      steps: [],
      createdAt,
      updatedAt: createdAt,
    });
    queue.enqueue({
      id: "job-2",
      workspaceId: "demo-exporter",
      workflow: "quotation.prepare",
      status: "completed",
      input: {},
      steps: [],
      createdAt,
      updatedAt: createdAt,
    });
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/agent-state?project=demo-exporter&limit=20"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "outreach-drafts",
        name: "Outreach Drafts",
        role: "Inbox triage and cold-email drafts",
        activeTasks: 1,
      }),
      expect.objectContaining({
        id: "quote-docs",
        name: "Quotes and Ship Docs",
        role: "Quotations, PI export, and CI/PL follow-up files",
        tasksCompletedToday: 1,
      }),
      expect.objectContaining({
        id: "jaden-runtime",
        name: "Jaden Runtime",
        activeTasks: 1,
        tasksCompletedToday: 1,
      }),
    ]));
    expect(json.data.agents).toHaveLength(6);
    expect(typeof json.data.updatedAt).toBe("string");
  });

  it("shows Jaden-planned operator command jobs as background progress", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    createSalesRuntime().createOperatorCommand({
      workspaceId: "demo-exporter",
      page: "quotations",
      message: "Prepare quotation documents and draft the customer follow-up email.",
      context: { customer: "Demo Buyer" },
    });
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/agent-state?project=demo-exporter&limit=20"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "outreach-drafts",
        name: "Outreach Drafts",
        activeTasks: 1,
      }),
      expect.objectContaining({
        id: "quote-docs",
        name: "Quotes and Ship Docs",
        activeTasks: 1,
      }),
      expect.objectContaining({
        id: "jaden-runtime",
        name: "Jaden Runtime",
        activeTasks: 2,
      }),
    ]));
    expect(json.data.agents).toHaveLength(6);
  });
});
