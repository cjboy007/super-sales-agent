import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = path.join(REPO_ROOT, "web-frontend");
const vitestBin = path.join(WEB_ROOT, "node_modules", ".bin", "vitest");
const targetedArgs = process.argv.slice(2);
const workerTests = [
  path.join(REPO_ROOT, "scripts", "workers", "jaden-worker.test.mjs"),
  path.join(REPO_ROOT, "scripts", "workers", "jaden-worker-supervisor.test.mjs"),
  path.join(REPO_ROOT, "scripts", "workers", "inbox-monitor.test.mjs"),
  path.join(REPO_ROOT, "scripts", "legacy-outbound-approval.test.mjs"),
  path.join(REPO_ROOT, "scripts", "local-gateway-entrypoint.test.mjs"),
  path.join(REPO_ROOT, "scripts", "prepare-next-standalone.test.mjs"),
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(vitestBin, ["run", ...targetedArgs], WEB_ROOT);

if (targetedArgs.length === 0) {
  run(process.execPath, ["--test", ...workerTests], REPO_ROOT);
}
