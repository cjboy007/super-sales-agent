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
      queuedTasks: 2,
    });
    expect(json.data.plan).toMatchObject({
      source: "jaden-planner",
      jobs: [
        { title: "Quote or PI preparation" },
        { title: "Email follow-up" },
      ],
    });
    expect(json.data).not.toHaveProperty("id");
    expect(json.data).not.toHaveProperty("jobId");
    expect(json.data).not.toHaveProperty("jobIds");
    expect(JSON.stringify(json.data)).not.toContain("cmd-");
    expect(JSON.stringify(json.data)).not.toContain("workflow");

    const commandDir = path.join(tempRoot, "companies", "demo-exporter", "operator-commands");
    const commandFiles = fs.readdirSync(commandDir).filter((name) => name.endsWith(".json"));
    expect(commandFiles).toHaveLength(1);
    const command = JSON.parse(fs.readFileSync(path.join(commandDir, commandFiles[0]), "utf-8"));
    expect(command).toMatchObject({
      id: expect.stringMatching(/^cmd-/),
      workspaceId: "demo-exporter",
      sideEffects: "blocked",
    });
    expect(command.jobId).toMatch(/^quotation.prepare-/);
    expect(command.jobIds).toHaveLength(2);

    const { createRuntimeTaskQueue } = await import("@/lib/runtime");
    const jobs = createRuntimeTaskQueue().list(10);
    expect(jobs.map((job) => job.id)).toEqual(expect.arrayContaining(command.jobIds));
    expect(jobs.find((job) => job.id === command.jobId)).toMatchObject({
      workspaceId: "demo-exporter",
      workflow: "quotation.prepare",
      status: "queued",
    });
    expect(jobs.map((job) => job.workflow)).toEqual(expect.arrayContaining(["quotation.prepare", "email.reply"]));

    const events = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "events", "events.json"), "utf-8"));
    expect(events[0]).toMatchObject({
      type: "operator.command.queued",
      workspaceId: "demo-exporter",
      payload: {
        commandId: command.id,
        jobId: command.jobId,
        jobIds: command.jobIds,
        planSource: "jaden-planner",
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
