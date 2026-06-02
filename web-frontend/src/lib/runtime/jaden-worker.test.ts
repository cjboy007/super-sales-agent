import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { runJadenWorkerTick } from "./jaden-worker";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalRealEmail = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-jaden-worker-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalRealEmail === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalRealEmail;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("Jaden Worker", () => {
  it("claims and runs queued workflow jobs through the existing approval gate", async () => {
    const runtime = createSalesRuntime();
    const job = runtime.workflows.enqueue("farreach", "email.reply", {
      message: "Draft a quotation follow-up for buyer@example.com",
      email: "buyer@example.com",
    });

    const result = await runJadenWorkerTick({
      runtime,
      workerId: "worker-test",
      maxJobs: 1,
      now: new Date("2026-05-30T08:00:00.000Z"),
    });

    expect(result).toMatchObject({
      workerId: "worker-test",
      claimed: 1,
      completed: 1,
      failed: 0,
      processedJobIds: [job.id],
    });
    expect(runtime.workflows.getJob(job.id)).toMatchObject({
      status: "completed",
      attempts: 1,
      claimedBy: undefined,
      leaseUntil: undefined,
    });
    expect(runtime.listSideEffects(10)[0]).toMatchObject({
      kind: "email.send",
      workspaceId: "farreach",
      status: "blocked",
      realExecutionEnabled: false,
    });
    expect(runtime.snapshot().events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "jaden.worker.job.claimed",
      "workflow.completed",
      "jaden.worker.job.completed",
    ]));
  });

  it("fails jobs without infinite retries after max attempts is reached", async () => {
    const runtime = createSalesRuntime();
    const runSpy = vi.spyOn(runtime.workflows, "run").mockRejectedValue(new Error("LLM unavailable"));
    const job = runtime.workflows.enqueue("demo-exporter", "quotation.prepare", {
      message: "Prepare quotation package",
    });

    const first = await runJadenWorkerTick({
      runtime,
      workerId: "worker-test",
      maxJobs: 1,
      maxAttempts: 2,
      now: new Date("2026-05-30T08:00:00.000Z"),
    });
    const second = await runJadenWorkerTick({
      runtime,
      workerId: "worker-test",
      maxJobs: 1,
      maxAttempts: 2,
      now: new Date("2026-05-30T08:10:00.000Z"),
    });
    const third = await runJadenWorkerTick({
      runtime,
      workerId: "worker-test",
      maxJobs: 1,
      maxAttempts: 2,
      now: new Date("2026-05-30T08:20:00.000Z"),
    });

    expect(first).toMatchObject({ claimed: 1, failed: 1, retried: 1 });
    expect(second).toMatchObject({ claimed: 1, failed: 1, exhausted: 1 });
    expect(third).toMatchObject({ claimed: 0, completed: 0, failed: 0 });
    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(runtime.workflows.getJob(job.id)).toMatchObject({
      status: "failed",
      attempts: 2,
      error: "Jaden worker exhausted 2 attempts: LLM unavailable",
    });
  });

  it("runs company-intel jobs and writes a local customer dossier", async () => {
    const runtime = createSalesRuntime();
    const queued = runtime.queueCompanyIntel({
      workspaceId: "demo-exporter",
      lead: {
        companyName: "Acme HVAC",
        country: "Germany",
        industry: "HVAC distributor",
        contact: "Ada Buyer",
        email: "ada@acme-hvac.example",
        homepage: "https://acme-hvac.example",
        category: "Tier1 Buyer",
        reason: "Imports HVAC parts and has a verified contact",
        confidence: "88%",
        score: "Hot",
      },
      source: "test",
    });

    const result = await runJadenWorkerTick({
      runtime,
      workerId: "worker-test",
      maxJobs: 1,
      now: new Date("2026-05-30T08:00:00.000Z"),
    });

    const intel = runtime.getCompanyIntel({
      workspaceId: "demo-exporter",
      lead: {
        companyName: "Acme HVAC",
        email: "ada@acme-hvac.example",
        homepage: "https://acme-hvac.example",
      },
    });

    expect(result).toMatchObject({
      claimed: 1,
      completed: 1,
      processedJobIds: [queued.jobId],
    });
    expect(intel.status).toBe("ready");
    expect(intel.dossier).toMatchObject({
      company: {
        name: "Acme HVAC",
        domain: "acme-hvac.example",
      },
      rating: "Hot",
      skill: "company-intel",
    });
    expect(fs.existsSync(intel.paths.json)).toBe(true);
    expect(fs.existsSync(intel.paths.markdown)).toBe(true);
    expect(runtime.snapshot().events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "company_intel.completed",
      "workflow.completed",
    ]));
  });
});
