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

function printResult(result) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...result })}\n`);
}

export async function runCli(argv = process.argv.slice(2)) {
  if (!fs.existsSync(path.join(WEB_ROOT, "node_modules", "jiti"))) {
    throw new Error("Missing web-frontend dependencies. Run npm install in web-frontend before starting jaden-worker.");
  }

  const options = parseArgs(argv);
  const { runJadenWorkerTick } = loadRuntime();

  do {
    const result = await runJadenWorkerTick({
      workerId: options.workerId,
      maxJobs: options.maxJobs,
      maxAttempts: options.maxAttempts,
    });
    printResult(result);

    if (options.once) break;
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(options.intervalMs) ? Math.max(1000, options.intervalMs) : 5000));
  } while (true);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
