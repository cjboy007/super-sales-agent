import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "./jaden-worker.mjs";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const WEB_ROOT = path.join(REPO_ROOT, "web-frontend");

function loadRuntimeModule() {
  const requireFromWeb = createRequire(path.join(WEB_ROOT, "scripts", "jaden-worker-test.cjs"));
  const createJiti = requireFromWeb("jiti");
  const jiti = createJiti(path.join(WEB_ROOT, "scripts", "jaden-worker-test.cjs"), {
    interopDefault: true,
    alias: {
      "@": path.join(WEB_ROOT, "src"),
    },
  });
  return jiti(path.join(WEB_ROOT, "src", "lib", "runtime", "sales-runtime.ts"));
}

test("jaden-worker CLI runs one tick against SSA_DATA_ROOT without a web request", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-jaden-worker-cli-test-"));
  const originalDataRoot = process.env.SSA_DATA_ROOT;
  const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
  const writes = [];
  const originalWrite = process.stdout.write;

  try {
    process.env.SSA_DATA_ROOT = dataRoot;
    process.env.SSA_LLM_PROVIDER = "mock";
    process.stdout.write = function patchedWrite(chunk, ...args) {
      writes.push(String(chunk));
      return true;
    };

    await runCli(["--once", "--worker-id", "cli-test-worker", "--max-jobs", "1", "--no-inbox-sync"]);

    const output = writes.join("");
    assert.match(output, /"workerId":"cli-test-worker"/);
    assert.match(output, /"claimed":0/);
  } finally {
    process.stdout.write = originalWrite;

    if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
    else process.env.SSA_DATA_ROOT = originalDataRoot;

    if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
    else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("jaden-worker CLI prints one-shot runs as stopped so they do not satisfy resident health", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-jaden-worker-status-test-"));
  const originalDataRoot = process.env.SSA_DATA_ROOT;
  const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
  const writes = [];
  const originalWrite = process.stdout.write;

  try {
    process.env.SSA_DATA_ROOT = dataRoot;
    process.env.SSA_LLM_PROVIDER = "mock";
    process.stdout.write = function patchedWrite(chunk, ...args) {
      writes.push(String(chunk));
      return originalWrite.call(this, chunk, ...args);
    };

    await runCli(["--once", "--worker-id", "cli-health-worker", "--max-jobs", "1", "--no-inbox-sync"]);
    writes.length = 0;

    await runCli(["--status", "--worker-id", "cli-health-worker"]);

    const output = writes.join("");
    assert.match(output, /"status":"down"/);
    assert.match(output, /"status":"stopped"/);
    assert.match(output, /"workerId":"cli-health-worker"/);
    assert.match(output, /"queued":0/);
  } finally {
    process.stdout.write = originalWrite;

    if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
    else process.env.SSA_DATA_ROOT = originalDataRoot;

    if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
    else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("jaden-worker CLI processes persisted work and reports the completed job after restart-style status check", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-jaden-worker-resident-smoke-"));
  const originalDataRoot = process.env.SSA_DATA_ROOT;
  const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
  const writes = [];
  const originalWrite = process.stdout.write;

  try {
    process.env.SSA_DATA_ROOT = dataRoot;
    process.env.SSA_LLM_PROVIDER = "mock";
    process.stdout.write = function patchedWrite(chunk, ...args) {
      writes.push(String(chunk));
      return originalWrite.call(this, chunk, ...args);
    };

    const runtimeModule = loadRuntimeModule();
    const runtime = runtimeModule.createSalesRuntime();
    const job = runtime.workflows.enqueue("farreach", "email.reply", {
      message: "Draft a resident worker smoke follow-up",
      email: "smoke@example.com",
    });

    await runCli(["--once", "--worker-id", "cli-resident-worker", "--max-jobs", "1", "--no-inbox-sync"]);
    writes.length = 0;
    await runCli(["--status", "--worker-id", "cli-resident-worker"]);

    const output = writes.join("");
    const status = JSON.parse(output.trim().split("\n").pop());
    assert.equal(status.status, "down");
    assert.equal(status.latest.workerId, "cli-resident-worker");
    assert.equal(status.latest.status, "stopped");
    assert.equal(status.latest.lastResult.completed, 1);
    assert.deepEqual(status.latest.lastResult.processedJobIds, [job.id]);
    assert.equal(runtime.workflows.getJob(job.id).status, "completed");
    const sideEffects = runtime.listSideEffects(10).filter((decision) => decision.kind === "email.send");
    assert.equal(sideEffects.length, 1);
    assert.equal(sideEffects[0].status, "blocked");
  } finally {
    process.stdout.write = originalWrite;

    if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
    else process.env.SSA_DATA_ROOT = originalDataRoot;

    if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
    else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("jaden-worker CLI syncs local mailbox scan input into customer activity and health", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-jaden-worker-mailbox-scan-"));
  const originalDataRoot = process.env.SSA_DATA_ROOT;
  const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
  const originalInboxSource = process.env.SSA_INBOX_SOURCE;
  const writes = [];
  const originalWrite = process.stdout.write;

  try {
    process.env.SSA_DATA_ROOT = dataRoot;
    process.env.SSA_LLM_PROVIDER = "mock";
    process.env.SSA_INBOX_SOURCE = "local";
    process.stdout.write = function patchedWrite(chunk, ...args) {
      writes.push(String(chunk));
      return originalWrite.call(this, chunk, ...args);
    };

    const inboxPath = path.join(dataRoot, "companies", "farreach", "inbox", "incoming.json");
    fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
    fs.writeFileSync(inboxPath, JSON.stringify([
      {
        id: "cli-mail-001",
        from_email: "mina@cli-buyer.example",
        from_name: "Mina Buyer",
        subject: "Payment received and shipment booked for PI-CLI-001",
        received_at: "2026-06-09T06:00:00.000Z",
        body_text: "Payment received for PI-CLI-001. HDMI cable order USD 6400.00 has shipped by DHL.",
        importance: "high"
      }
    ], null, 2), "utf-8");

    await runCli([
      "--once",
      "--workspace",
      "farreach",
      "--worker-id",
      "cli-mailbox-worker",
      "--max-jobs",
      "1",
      "--inbox-limit",
      "10",
    ]);

    const workerHealth = loadRuntimeModule().createSalesRuntime();
    assert.equal(workerHealth.getWorkspace("farreach").id, "farreach");
    const statusFile = path.join(dataRoot, "runtime", "workers", "cli-mailbox-worker.json");
    const persistedWorker = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
    assert.equal(persistedWorker.workerId, "cli-mailbox-worker");
    assert.equal(persistedWorker.lastResult.inboxSynced, 1);
    assert.equal(persistedWorker.lastResult.crmActivities, 1);
    assert.equal(persistedWorker.lastResult.orderActivities, 1);
    assert.equal(persistedWorker.lastResult.customersUpdated, 1);

    const activities = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "customers", "activity.json"), "utf-8"));
    assert.equal(activities.filter((item) => item.kind === "email_received").length, 1);
    assert.equal(activities.filter((item) => item.kind === "order_status").length, 1);
    assert.match(JSON.stringify(activities), /cli-buyer\.example/i);
    assert.match(JSON.stringify(activities), /Payment received/i);

    writes.length = 0;
    await runCli(["--status", "--worker-id", "cli-mailbox-worker"]);
    const status = JSON.parse(writes.join("").trim().split("\n").pop());
    assert.equal(status.latest.workerId, "cli-mailbox-worker");
    assert.equal(status.latest.lastResult.inboxSynced, 1);
    assert.equal(status.latest.lastResult.crmActivities, 1);
    assert.equal(status.latest.lastResult.orderActivities, 1);
    assert.match(status.activity.lastActivitySummary, /mailbox message/);
    assert.match(status.activity.lastActivitySummary, /customer timeline item/);
    assert.match(status.activity.lastActivitySummary, /order milestone/);
  } finally {
    process.stdout.write = originalWrite;

    if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
    else process.env.SSA_DATA_ROOT = originalDataRoot;

    if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
    else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

    if (originalInboxSource === undefined) delete process.env.SSA_INBOX_SOURCE;
    else process.env.SSA_INBOX_SOURCE = originalInboxSource;

    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("resident jaden-worker processes local mailbox backlog across multiple ticks with inbox limit", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-jaden-worker-mailbox-backlog-"));
  const originalDataRoot = process.env.SSA_DATA_ROOT;
  const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
  const originalInboxSource = process.env.SSA_INBOX_SOURCE;
  const originalSetTimeout = globalThis.setTimeout;
  const originalSigintListeners = process.listeners("SIGINT");
  const originalSigtermListeners = process.listeners("SIGTERM");
  const writes = [];
  const originalWrite = process.stdout.write;

  try {
    process.env.SSA_DATA_ROOT = dataRoot;
    process.env.SSA_LLM_PROVIDER = "mock";
    process.env.SSA_INBOX_SOURCE = "local";
    process.stdout.write = function patchedWrite(chunk, ...args) {
      writes.push(String(chunk));
      return true;
    };

    const inboxPath = path.join(dataRoot, "companies", "farreach", "inbox", "incoming.json");
    fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
    fs.writeFileSync(inboxPath, JSON.stringify([
      {
        id: "resident-mail-001",
        from_email: "ops@resident-backlog.example",
        from_name: "Mina Ops",
        subject: "Payment received for PI-RESIDENT-001",
        received_at: "2026-06-09T06:00:00.000Z",
        body_text: "Payment received for PI-RESIDENT-001. USB-C cable order USD 2400.00 is preparing.",
        importance: "high"
      },
      {
        id: "resident-mail-002",
        from_email: "ops@resident-backlog.example",
        from_name: "Mina Ops",
        subject: "Shipment booked for PI-RESIDENT-002",
        received_at: "2026-06-09T06:05:00.000Z",
        body_text: "Shipment booked for PI-RESIDENT-002. HDMI cable order USD 3600.00 has shipped by DHL.",
        importance: "high"
      }
    ], null, 2), "utf-8");

    let sleeps = 0;
    globalThis.setTimeout = (callback, _delay, ...args) => {
      sleeps += 1;
      if (sleeps >= 2) process.emit("SIGINT", "SIGINT");
      callback(...args);
      return { unref() {} };
    };

    await runCli([
      "--workspace",
      "farreach",
      "--worker-id",
      "cli-mailbox-resident-worker",
      "--max-jobs",
      "1",
      "--inbox-limit",
      "1",
    ]);

    const results = writes
      .join("")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((line) => line.workerId === "cli-mailbox-resident-worker");
    assert.equal(results.length, 2);
    assert.equal(results[0].inboxSynced, 1);
    assert.equal(results[1].inboxSynced, 1);

    const status = JSON.parse(fs.readFileSync(path.join(dataRoot, "runtime", "workers", "cli-mailbox-resident-worker.json"), "utf-8"));
    assert.equal(status.status, "stopped");
    assert.equal(status.lastResult.inboxSynced, 1);
    assert.match(status.lastActivitySummary, /mailbox message/);

    const state = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "inbox", "monitor-state.json"), "utf-8"));
    assert.deepEqual(Object.keys(state.seen).sort(), ["resident-mail-001", "resident-mail-002"]);

    const activities = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "customers", "activity.json"), "utf-8"));
    assert.equal(activities.filter((item) => item.kind === "email_received").length, 2);
    assert.equal(activities.filter((item) => item.kind === "order_status").length, 2);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    process.stdout.write = originalWrite;
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    for (const listener of originalSigintListeners) process.on("SIGINT", listener);
    for (const listener of originalSigtermListeners) process.on("SIGTERM", listener);

    if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
    else process.env.SSA_DATA_ROOT = originalDataRoot;

    if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
    else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

    if (originalInboxSource === undefined) delete process.env.SSA_INBOX_SOURCE;
    else process.env.SSA_INBOX_SOURCE = originalInboxSource;

    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("jaden-worker CLI signal handler records the configured worker as stopped", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-jaden-worker-signal-test-"));
  const originalDataRoot = process.env.SSA_DATA_ROOT;
  const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
  const originalSetTimeout = globalThis.setTimeout;
  const originalSigintListeners = process.listeners("SIGINT");
  const originalSigtermListeners = process.listeners("SIGTERM");
  const writes = [];
  const originalWrite = process.stdout.write;

  try {
    process.env.SSA_DATA_ROOT = dataRoot;
    process.env.SSA_LLM_PROVIDER = "mock";
    process.stdout.write = function patchedWrite(chunk, ...args) {
      writes.push(String(chunk));
      return originalWrite.call(this, chunk, ...args);
    };
    globalThis.setTimeout = (callback, _delay, ...args) => {
      process.emit("SIGINT", "SIGINT");
      callback(...args);
      return { unref() {} };
    };

    await runCli(["--worker-id", "cli-signal-worker", "--max-jobs", "1", "--no-inbox-sync"]);
    writes.length = 0;

    await runCli(["--status", "--worker-id", "cli-signal-worker"]);

    const status = JSON.parse(writes.join("").trim().split("\n").pop());
    assert.equal(status.status, "down");
    assert.equal(status.latest.workerId, "cli-signal-worker");
    assert.equal(status.latest.status, "stopped");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    process.stdout.write = originalWrite;
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    for (const listener of originalSigintListeners) process.on("SIGINT", listener);
    for (const listener of originalSigtermListeners) process.on("SIGTERM", listener);

    if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
    else process.env.SSA_DATA_ROOT = originalDataRoot;

    if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
    else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
