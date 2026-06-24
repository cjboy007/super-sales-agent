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

function request(url: string, body: Record<string, unknown>, method = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
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
      queuedTasks: 1,
    });
    expect(json.data.plan).toMatchObject({
      source: "jaden-planner",
      jobs: [
        { title: "Operator request" },
      ],
    });
    expect(json.data.validatedPlan).toMatchObject({
      workflows: ["operator.command"],
      rejectedWorkflows: ["email.reply", "quotation.prepare"],
      needsHumanReview: true,
      warnings: expect.arrayContaining([
        "No known target was supplied; action workflows were held as an operator-only task.",
      ]),
    });
    expect(json.data).not.toHaveProperty("id");
    expect(json.data).not.toHaveProperty("jobId");
    expect(json.data).not.toHaveProperty("jobIds");
    expect(json.data.commandThreadId).toMatch(/^thread-cmd-/);
    expect(JSON.stringify(json.data.plan.jobs)).not.toContain("quotation.prepare-");

    const commandDir = path.join(tempRoot, "companies", "demo-exporter", "operator-commands");
    const commandFiles = fs.readdirSync(commandDir).filter((name) => name.endsWith(".json"));
    expect(commandFiles).toHaveLength(1);
    const command = JSON.parse(fs.readFileSync(path.join(commandDir, commandFiles[0]), "utf-8"));
    expect(command).toMatchObject({
      id: expect.stringMatching(/^cmd-/),
      workspaceId: "demo-exporter",
      sideEffects: "blocked",
    });
    expect(command.jobId).toMatch(/^operator.command-/);
    expect(command.jobIds).toHaveLength(1);
    expect(command.validatedPlan.validation.acceptedWorkflows).toEqual(["operator.command"]);
    expect(command.validatedPlan.validation.rejectedWorkflows).toEqual(["email.reply", "quotation.prepare"]);

    const { createRuntimeTaskQueue } = await import("@/lib/runtime");
    const jobs = createRuntimeTaskQueue().list(10);
    expect(jobs.map((job) => job.id)).toEqual(expect.arrayContaining(command.jobIds));
    expect(jobs.find((job) => job.id === command.jobId)).toMatchObject({
      workspaceId: "demo-exporter",
      workflow: "operator.command",
      status: "queued",
    });
    expect(jobs.map((job) => job.workflow)).toEqual(["operator.command"]);

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

  it("returns safe public task-thread summaries without raw command or job ids", async () => {
    const { POST } = await import("./route");
    const { GET } = await import("./threads/route");

    const created = await POST(request("http://localhost/api/operator-command?project=demo-exporter", {
      page: "battle-station",
      surface: "battle-station",
      mode: "global_command",
      message: "Prepare quote review and draft the next follow-up.",
      target: { type: "customer", id: "acme", label: "ACME" },
      context: { selectedDealId: "deal-1" },
    }));
    const createdJson = await created.json();
    const threadId = createdJson.data.commandThreadId;

    const response = await GET(request(
      `http://localhost/api/operator-command/threads?project=demo-exporter&threadId=${encodeURIComponent(threadId)}`,
      {},
      "GET"
    ));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.threads).toHaveLength(1);
    expect(json.data.threads[0]).toMatchObject({
      id: threadId,
      surface: "battle-station",
      mode: "global_command",
      target: { type: "customer", id: "acme", label: "ACME" },
      status: "needs_review",
      plan: {
        intent: expect.any(String),
        confidence: expect.any(Number),
        needsHumanReview: true,
      },
      queuedTasks: expect.arrayContaining([
        expect.objectContaining({
          title: expect.any(String),
          status: "queued",
        }),
      ]),
      warnings: expect.arrayContaining([
        expect.stringContaining("approval gates"),
      ]),
    });
    expect(json.data.threads[0]).not.toHaveProperty("commandId");
    expect(JSON.stringify(json.data)).not.toContain('"commandId"');
    expect(JSON.stringify(json.data)).not.toContain("quotation.prepare-");
    expect(JSON.stringify(json.data)).not.toContain("Prepare quote review and draft the next follow-up.");
  });

  it("does not resolve task-thread ids outside the workspace thread directory", async () => {
    const { GET } = await import("./threads/route");
    const outsidePath = path.join(tempRoot, "companies", "demo-exporter", "operator-commands", "escape.json");
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
    fs.writeFileSync(outsidePath, JSON.stringify({
      id: "escape",
      workspaceId: "demo-exporter",
      commandId: "cmd-escape",
      createdAt: new Date().toISOString(),
      envelope: {
        surface: "battle-station",
        mode: "global_command",
        target: { type: "none" },
      },
      plan: {
        source: "jaden-planner",
        intent: "escape",
        confidence: 1,
        needsHumanReview: false,
        validation: {
          acceptedWorkflows: [],
          rejectedWorkflows: [],
          acceptedTools: [],
          rejectedTools: [],
          acceptedSideEffectKinds: [],
          rejectedSideEffectKinds: [],
          warnings: [],
        },
      },
      memory: {
        durableSalesMemory: "confirmed_business_facts_only",
        rawChatToDurableMemory: false,
      },
      items: [],
    }));

    const response = await GET(request(
      "http://localhost/api/operator-command/threads?project=demo-exporter&threadId=../escape",
      {},
      "GET"
    ));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.threads).toEqual([]);
  });
});
