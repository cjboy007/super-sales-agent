import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-operator-command-route-test-"));
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/operator-command route", () => {
  it("queues operator commands through the Sales Runtime", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/operator-command?project=demo-exporter", {
      page: "quotations",
      url: "/quotations",
      message: "Check the draft quotation queue and prepare the next review step.",
      context: {
        visibleRows: 3,
      },
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      status: "queued_for_local_runtime",
      sideEffects: "blocked",
    });
    expect(json.data.id).toMatch(/^cmd-/);
    expect(json.data.jobId).toMatch(/^operator.command-/);

    const command = JSON.parse(
      fs.readFileSync(path.join(tempRoot, "operator-commands", `${json.data.id}.json`), "utf-8")
    );
    expect(command).toMatchObject({
      id: json.data.id,
      jobId: json.data.jobId,
      workspaceId: "demo-exporter",
      sideEffects: "blocked",
    });

    const jobs = JSON.parse(fs.readFileSync(path.join(tempRoot, "runtime", "jobs.json"), "utf-8"));
    expect(jobs[0]).toMatchObject({
      id: json.data.jobId,
      workspaceId: "demo-exporter",
      workflow: "operator.command",
      status: "queued",
    });

    const events = JSON.parse(fs.readFileSync(path.join(tempRoot, "runtime", "events.json"), "utf-8"));
    expect(events[0]).toMatchObject({
      type: "operator.command.queued",
      workspaceId: "demo-exporter",
      payload: {
        commandId: json.data.id,
        jobId: json.data.jobId,
        sideEffects: "blocked",
      },
    });
  });

  it("rejects empty commands", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/operator-command", {
      page: "leads",
      message: "   ",
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Message is required");
  });
});
