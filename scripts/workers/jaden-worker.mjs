#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const WEB_ROOT = path.join(REPO_ROOT, "web-frontend");

function parseArgs(argv) {
  const options = {
    once: false,
    maxJobs: undefined,
    maxAttempts: undefined,
    intervalMs: 5000,
    workerId: undefined,
    workspaceId: "farreach",
    syncInbox: true,
    inboxLimit: undefined,
    status: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--once") options.once = true;
    else if (arg === "--max-jobs" && next) {
      options.maxJobs = Number(next);
      index += 1;
    } else if (arg === "--max-attempts" && next) {
      options.maxAttempts = Number(next);
      index += 1;
    } else if (arg === "--interval-ms" && next) {
      options.intervalMs = Number(next);
      index += 1;
    } else if (arg === "--worker-id" && next) {
      options.workerId = next;
      index += 1;
    } else if ((arg === "--workspace" || arg === "-w") && next) {
      options.workspaceId = next;
      index += 1;
    } else if (arg === "--no-inbox-sync") {
      options.syncInbox = false;
    } else if (arg === "--inbox-limit" && next) {
      options.inboxLimit = Number(next);
      index += 1;
    } else if (arg === "--status") {
      options.status = true;
    }
  }

  return options;
}

function loadRuntime() {
  const requireFromWeb = createRequire(path.join(WEB_ROOT, "scripts", "jaden-worker.cjs"));
  const createJiti = requireFromWeb("jiti");
  const jiti = createJiti(path.join(WEB_ROOT, "scripts", "jaden-worker.cjs"), {
    interopDefault: true,
    alias: {
      "@": path.join(WEB_ROOT, "src"),
    },
  });
  return jiti(path.join(WEB_ROOT, "src", "lib", "runtime", "jaden-worker.ts"));
}

function loadWorkerHealth() {
  const requireFromWeb = createRequire(path.join(WEB_ROOT, "scripts", "jaden-worker.cjs"));
  const createJiti = requireFromWeb("jiti");
  const jiti = createJiti(path.join(WEB_ROOT, "scripts", "jaden-worker.cjs"), {
    interopDefault: true,
    alias: {
      "@": path.join(WEB_ROOT, "src"),
    },
  });
  return jiti(path.join(WEB_ROOT, "src", "lib", "runtime", "worker-health.ts"));
}

async function syncInboxScan({ workspaceId, limit, now }) {
  const { runInboxMonitor } = await import("./inbox-monitor.mjs");
  const result = await runInboxMonitor({
    workspace: workspaceId,
    dataRoot: process.env.SSA_DATA_ROOT,
    sourceMode: process.env.SSA_INBOX_SOURCE || "local",
    pageSize: limit,
    now,
  });
  return {
    messageCount: result.newCount || 0,
    crmActivities: result.activitiesWritten || result.newCount || 0,
    orderActivities: result.orderActivitiesWritten || 0,
    customersUpdated: result.customersUpserted || 0,
    lifecycleStatuses: 0,
    realExecutionEnabled: result.sourceMode === "himalaya",
  };
}

function printResult(result) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...result })}\n`);
}

export async function runCli(argv = process.argv.slice(2)) {
  if (!fs.existsSync(path.join(WEB_ROOT, "node_modules", "jiti"))) {
    throw new Error("Missing web-frontend dependencies. Run npm install in web-frontend before starting jaden-worker.");
  }

  const options = parseArgs(argv);
  const { runJadenWorkerTick } = loadRuntime();
  const workerHealth = loadWorkerHealth();

  if (options.status) {
    const selected = options.workerId ? workerHealth.readWorkerStatus(options.workerId) : null;
    const summary = workerHealth.summarizeWorkerHealth(selected ? [selected] : undefined);
    printResult(summary);
    return;
  }

  let stopping = false;
  const markStopped = (workerId = options.workerId) => {
    stopping = true;
    const current = workerId ? workerHealth.readWorkerStatus(workerId) : null;
    if (current) {
      workerHealth.recordWorkerStatus({
        ...current,
        status: "stopped",
        lastHeartbeatAt: new Date().toISOString(),
        alerts: current.alerts || [],
      });
    }
  };
  process.once("SIGTERM", () => markStopped());
  process.once("SIGINT", () => markStopped());

  do {
    const result = await runJadenWorkerTick({
      workerId: options.workerId,
      workspaceId: options.workspaceId,
      syncInbox: options.syncInbox,
      syncInboxWith: options.syncInbox ? syncInboxScan : undefined,
      inboxLimit: options.inboxLimit,
      maxJobs: options.maxJobs,
      maxAttempts: options.maxAttempts,
    });
    printResult(result);

    if (options.once) {
      markStopped(result.workerId);
      break;
    }
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(options.intervalMs) ? Math.max(1000, options.intervalMs) : 5000));
  } while (!stopping);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
