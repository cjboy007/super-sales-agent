import { exec } from "child_process";
import { promisify } from "util";
import { resolvePath } from "./ssa-paths";
const execAsync = promisify(exec);

const SCRIPT = resolvePath("web-frontend", "scripts", "update-intelligence-data.js");

const CRON_INTERVAL = 60 * 60 * 1000; // 1 hour

let lastRun: Date | null = null;
let running = false;

export async function runIntelligenceUpdate(): Promise<{ success: boolean; error?: string }> {
  if (running) return { success: false, error: "already running" };
  running = true;
  try {
    await execAsync(`node ${SCRIPT}`, { timeout: 120000 });
    lastRun = new Date();
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[scheduler] Intelligence update failed:", msg);
    return { success: false, error: msg };
  } finally {
    running = false;
  }
}

export function getLastRun(): Date | null {
  return lastRun;
}

export function startScheduler(): void {
  console.log("[scheduler] Starting intelligence data scheduler (every 1 hour)");
  setInterval(() => {
    runIntelligenceUpdate().catch(() => {});
  }, CRON_INTERVAL);
}

// Start on import (server-side only)
if (typeof window === "undefined") {
  startScheduler();
}
