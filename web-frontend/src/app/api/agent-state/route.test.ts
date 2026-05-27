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
    fs.mkdirSync(path.join(tempRoot, "runtime"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "runtime", "jobs.json"),
      JSON.stringify([
        {
          id: "job-1",
          workspaceId: "demo-exporter",
          workflow: "email.reply",
          status: "queued",
          createdAt: new Date().toISOString(),
        },
        {
          id: "job-2",
          workspaceId: "demo-exporter",
          workflow: "quotation.prepare",
          status: "completed",
          createdAt: new Date().toISOString(),
        },
      ]),
      "utf-8"
    );

    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/agent-state?project=demo-exporter&limit=20"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Inbox Agent",
        role: "Email triage and drafts",
        activeTasks: 1,
      }),
      expect.objectContaining({
        name: "Docs Agent",
        role: "Quotations and trade documents",
        tasksCompletedToday: 1,
      }),
    ]));
    expect(typeof json.data.updatedAt).toBe("string");
  });
});
