import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { runJadenWorkerTick } from "./jaden-worker";
import { readWorkerStatus, recordWorkerStatus } from "./worker-health";

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
  vi.unstubAllGlobals();
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
      syncInbox: false,
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
      syncInbox: false,
      now: new Date("2026-05-30T08:00:00.000Z"),
    });
    const second = await runJadenWorkerTick({
      runtime,
      workerId: "worker-test",
      maxJobs: 1,
      maxAttempts: 2,
      syncInbox: false,
      now: new Date("2026-05-30T08:10:00.000Z"),
    });
    const third = await runJadenWorkerTick({
      runtime,
      workerId: "worker-test",
      maxJobs: 1,
      maxAttempts: 2,
      syncInbox: false,
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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "<html><head><title>Acme HVAC Official</title></head><body>HVAC distributor</body></html>",
      { status: 200, headers: { "content-type": "text/html" } }
    )));
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
      syncInbox: false,
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
      channel_audit: expect.arrayContaining([
        expect.objectContaining({ channel: "lead_pool", status: "used" }),
        expect.objectContaining({ channel: "official_website", status: "used" }),
        expect.objectContaining({ channel: "public_search", status: "not_configured" }),
        expect.objectContaining({ channel: "linkedin_public", status: "not_configured" }),
        expect.objectContaining({ channel: "registry_financial", status: "not_configured" }),
        expect.objectContaining({ channel: "hunter_email_verification", status: "not_configured" }),
        expect.objectContaining({ channel: "apollo_contact_discovery", status: "not_configured" }),
        expect.objectContaining({ channel: "mx_dns" }),
        expect.objectContaining({ channel: "crm_handoff", status: "not_configured" }),
      ]),
      rating: "Hot",
      skill: "company-intel",
    });
    expect(intel.markdown).toContain("## Channel Audit");
    expect(intel.markdown).toContain("linkedin_public");
    expect(intel.markdown).toContain("not_configured");
    expect(intel.markdown).toContain("Acme HVAC Official");
    expect(intel.dossier?.channel_audit.find((item) => item.channel === "mx_dns")?.status).not.toBe("not_configured");
    expect(fs.existsSync(intel.paths.json)).toBe(true);
    expect(fs.existsSync(intel.paths.markdown)).toBe(true);
    expect(runtime.snapshot().events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "company_intel.completed",
      "workflow.completed",
    ]));
  });

  it("syncs inbox activity into customers before processing queued jobs", async () => {
    const runtime = createSalesRuntime();

    const result = await runJadenWorkerTick({
      runtime,
      workerId: "worker-test",
      maxJobs: 1,
      syncInbox: true,
      inboxLimit: 5,
      now: new Date("2026-05-30T08:00:00.000Z"),
    });

    expect(result.inboxSynced).toBeGreaterThan(0);
    expect(result.crmActivities).toBeGreaterThan(0);
    expect(result.orderActivities).toBeGreaterThan(0);
    const directory = (await import("./customers")).buildCustomerDirectory(runtime, "farreach", {
      search: "TechKabel",
      page: 1,
      pageSize: 5,
    });
    expect(directory.customers[0]).toMatchObject({
      companyName: "Techkabel",
      status: "Active Customer",
    });
    expect(directory.customers[0].contacts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          email: "hans.mueller@techkabel.de",
        }),
    ]));
    expect(directory.customers[0].interactions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "Email",
          summary: expect.stringContaining("Quotation for DisplayPort"),
        }),
    ]));
    expect(runtime.snapshot().events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "customer.crm.inbox_synced",
      "jaden.worker.inbox.synced",
    ]));
    expect(runtime.snapshot().events.find((event) => event.type === "jaden.worker.inbox.synced")?.payload).toEqual(expect.objectContaining({
      crmActivities: expect.any(Number),
      orderActivities: expect.any(Number),
      customersUpdated: expect.any(Number),
    }));
  });

  it("writes a worker health snapshot with queue backlog, last result, and alert state", async () => {
    const runtime = createSalesRuntime();
    runtime.workflows.enqueue("farreach", "email.reply", {
      message: "Draft a quote follow-up",
      email: "buyer@example.com",
    });
    runtime.workflows.enqueue("farreach", "quotation.prepare", {
      message: "Prepare a PI package",
      customer: "Buyer Co",
    });

    const result = await runJadenWorkerTick({
      runtime,
      workerId: "health-worker",
      maxJobs: 1,
      syncInbox: false,
      now: new Date("2026-06-08T08:00:00.000Z"),
    });
    const health = readWorkerStatus("health-worker");

    expect(result.completed).toBe(1);
    expect(health).toMatchObject({
      workerId: "health-worker",
      workspaceId: "farreach",
      status: "running",
      lastResult: expect.objectContaining({
        completed: 1,
        claimed: 1,
      }),
      queue: expect.objectContaining({
        queued: 1,
        completed: 1,
        failed: 0,
      }),
    });
    expect(health?.alerts).toEqual([]);
    expect(new Date(health?.lastHeartbeatAt || "").toString()).not.toBe("Invalid Date");
  });

  it("keeps the last business activity visible across later idle heartbeats", async () => {
    const runtime = createSalesRuntime();
    runtime.workflows.enqueue("farreach", "email.reply", {
      message: "Draft a quote follow-up",
      email: "buyer@example.com",
    });

    await runJadenWorkerTick({
      runtime,
      workerId: "activity-worker",
      maxJobs: 1,
      syncInbox: false,
      now: new Date("2026-06-08T08:00:00.000Z"),
    });
    await runJadenWorkerTick({
      runtime,
      workerId: "activity-worker",
      maxJobs: 1,
      syncInbox: false,
      now: new Date("2026-06-08T08:05:00.000Z"),
    });
    const health = readWorkerStatus("activity-worker");

    expect(health).toMatchObject({
      lastHeartbeatAt: "2026-06-08T08:05:00.000Z",
      lastActivityAt: "2026-06-08T08:00:00.000Z",
      lastActivitySummary: "Completed 1 queued task.",
      lastResult: expect.objectContaining({
        completed: 0,
        claimed: 0,
      }),
    });
  });

  it("does not move the last business activity time when a worker is marked stopped", async () => {
    const runtime = createSalesRuntime();
    runtime.workflows.enqueue("farreach", "email.reply", {
      message: "Draft a quote follow-up",
      email: "buyer@example.com",
    });

    await runJadenWorkerTick({
      runtime,
      workerId: "stopped-activity-worker",
      maxJobs: 1,
      syncInbox: false,
      now: new Date("2026-06-08T08:00:00.000Z"),
    });
    const running = readWorkerStatus("stopped-activity-worker");
    expect(running?.lastActivityAt).toBe("2026-06-08T08:00:00.000Z");

    recordWorkerStatus({
      ...running!,
      status: "stopped",
      lastHeartbeatAt: "2026-06-08T08:10:00.000Z",
    });

    expect(readWorkerStatus("stopped-activity-worker")).toMatchObject({
      status: "stopped",
      lastHeartbeatAt: "2026-06-08T08:10:00.000Z",
      lastActivityAt: "2026-06-08T08:00:00.000Z",
      lastActivitySummary: "Completed 1 queued task.",
    });
  });

  it("records customer lifecycle status changes during worker health ticks even without new inbox mail", async () => {
    const runtime = createSalesRuntime();
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    fs.mkdirSync(path.join(projectRoot, "customers"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "customers", "accounts.json"), JSON.stringify([
      {
        id: "worker-lifecycle.example",
        companyName: "Worker Lifecycle Buyer",
        country: "USA",
        website: "https://worker-lifecycle.example",
        domain: "worker-lifecycle.example",
        industry: "Cable distributor",
        status: "Prospect",
        sources: [
          {
            type: "lead",
            companyName: "Worker Lifecycle Buyer",
            contact: "Will",
            role: "Buyer",
            email: "will@worker-lifecycle.example",
            website: "https://worker-lifecycle.example",
            country: "USA",
            industry: "Cable distributor",
            category: "Tier2 Partner",
            reason: "Imported customer",
            confidence: "78%",
            importedAt: "2026-06-08T08:00:00.000Z",
          },
        ],
        intelligence: { status: "queued", queuedAt: "2026-06-08T08:00:00.000Z" },
        createdAt: "2026-06-08T08:00:00.000Z",
        updatedAt: "2026-06-08T08:00:00.000Z",
      },
    ], null, 2), "utf-8");
    fs.mkdirSync(path.join(projectRoot, "documents", "pi-records"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "documents", "pi-records", "PI-WORKER-LIFECYCLE.json"), JSON.stringify({
      piNo: "PI-WORKER-LIFECYCLE",
      customer: "Worker Lifecycle Buyer",
      date: "2026-06-08",
      amount: "USD 8800.00",
      productSummary: "USB-C cable program",
      paymentStatus: "paid",
      fulfillmentStatus: "preparing",
      updatedAt: "2026-06-08T09:00:00.000Z",
      source: "documents.generate",
      data: {},
    }, null, 2), "utf-8");

    const first = await runJadenWorkerTick({
      runtime,
      workerId: "lifecycle-worker",
      maxJobs: 1,
      syncInbox: false,
      now: new Date("2026-06-08T10:00:00.000Z"),
    });
    const second = await runJadenWorkerTick({
      runtime,
      workerId: "lifecycle-worker",
      maxJobs: 1,
      syncInbox: false,
      now: new Date("2026-06-08T10:05:00.000Z"),
    });
    const health = readWorkerStatus("lifecycle-worker");
    const activities = JSON.parse(fs.readFileSync(path.join(projectRoot, "customers", "activity.json"), "utf-8"));

    expect(first).toMatchObject({
      claimed: 0,
      lifecycleStatuses: 1,
    });
    expect(second).toMatchObject({
      lifecycleStatuses: 0,
    });
    expect(health?.lastResult).toMatchObject({
      lifecycleStatuses: 0,
    });
    expect(activities.filter((item: { kind: string }) => item.kind === "lifecycle_status")).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      kind: "lifecycle_status",
      customerId: "worker-lifecycle.example",
      summary: expect.stringContaining("Automatic status changed to Active Customer"),
      status: "Active Customer",
      metadata: expect.objectContaining({
        ruleId: "active.order",
        automatic: true,
      }),
    });
    expect(JSON.stringify(activities)).not.toContain("PI-WORKER-LIFECYCLE");
  });

  it("reclaims expired work after a restart without duplicating side-effect approval records", async () => {
    const firstRuntime = createSalesRuntime();
    const job = firstRuntime.workflows.enqueue("farreach", "email.reply", {
      message: "Draft a quotation follow-up for buyer@example.com",
      email: "buyer@example.com",
    });
    const claimed = firstRuntime.workflows.claimNext("crashed-worker", {
      leaseMs: 1000,
      now: new Date("2026-06-08T08:00:00.000Z"),
    });
    expect(claimed).toMatchObject({
      id: job.id,
      status: "running",
      attempts: 1,
      claimedBy: "crashed-worker",
    });
    const firstDecision = firstRuntime.requestSideEffect({
      kind: "email.send",
      workspaceId: "farreach",
      summary: "Workflow email.reply: crash after side-effect approval request",
      payload: {
        workflow: "email.reply",
        input: job.input,
        jobId: job.id,
      },
      idempotencyKey: `farreach:email.reply:${job.id}`,
    });

    const restartedRuntime = createSalesRuntime();
    const result = await runJadenWorkerTick({
      runtime: restartedRuntime,
      workerId: "restarted-worker",
      maxJobs: 1,
      syncInbox: false,
      now: new Date("2026-06-08T08:02:00.000Z"),
    });
    const decisions = restartedRuntime.listSideEffects(10).filter((decision) =>
      decision.kind === "email.send" &&
      decision.payload.idempotencyKey === `farreach:email.reply:${job.id}`
    );

    expect(result).toMatchObject({
      workerId: "restarted-worker",
      claimed: 1,
      completed: 1,
      failed: 0,
      processedJobIds: [job.id],
    });
    expect(restartedRuntime.workflows.getJob(job.id)).toMatchObject({
      status: "completed",
      attempts: 2,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      id: firstDecision.id,
      status: "blocked",
      realExecutionEnabled: false,
    });
  });
});
