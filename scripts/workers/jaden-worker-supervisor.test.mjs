import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildSupervisorPlan,
  renderLaunchdPlist,
  renderPm2Ecosystem,
  renderSystemdUnit,
  runCli,
} from "./jaden-worker-supervisor.mjs";

test("supervisor plan exposes resident worker lifecycle, health, and restart commands", () => {
  const plan = buildSupervisorPlan({
    platform: "systemd",
    workspaceId: "farreach",
    workerId: "jaden-farreach-1",
    dataRoot: "/tmp/ssa-data",
    intervalMs: 5000,
    maxJobs: 5,
    maxAttempts: 3,
  });

  assert.equal(plan.serviceName, "ssa-jaden-farreach-1");
  assert.equal(plan.configFileName, "ssa-jaden-farreach-1.service");
  assert.match(plan.workerCommand.join(" "), /jaden-worker\.mjs --workspace farreach/);
  assert.match(plan.workerCommand.join(" "), /--worker-id jaden-farreach-1/);
  assert.equal(plan.restartPolicy, "always");
  assert.match(plan.commands.start, /systemctl --user start ssa-jaden-farreach-1/);
  assert.match(plan.commands.stop, /systemctl --user stop ssa-jaden-farreach-1/);
  assert.match(plan.commands.restart, /systemctl --user restart ssa-jaden-farreach-1/);
  assert.match(plan.commands.status, /systemctl --user status ssa-jaden-farreach-1/);
  assert.match(plan.commands.health, /jaden-worker\.mjs --status --worker-id jaden-farreach-1/);
});

test("renders launchd, systemd, and pm2 configs with auto restart and persistent runtime paths", () => {
  const options = {
    workspaceId: "hero-pumps",
    workerId: "jaden-hero-1",
    dataRoot: "/tmp/ssa-data",
    intervalMs: 7000,
    maxJobs: 8,
    maxAttempts: 4,
  };

  const launchd = renderLaunchdPlist({ ...options, platform: "launchd" });
  assert.match(launchd, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(launchd, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(launchd, /<key>SSA_DATA_ROOT<\/key>\s*<string>\/tmp\/ssa-data<\/string>/);
  assert.match(launchd, /<string>--workspace<\/string>\s*<string>hero-pumps<\/string>/);

  const systemd = renderSystemdUnit({ ...options, platform: "systemd" });
  assert.match(systemd, /Restart=always/);
  assert.match(systemd, /RestartSec=5/);
  assert.match(systemd, /Environment=SSA_DATA_ROOT=\/tmp\/ssa-data/);
  assert.match(systemd, /--max-attempts 4/);

  const pm2 = JSON.parse(renderPm2Ecosystem({ ...options, platform: "pm2" }));
  assert.equal(pm2.apps[0].name, "ssa-jaden-hero-1");
  assert.equal(pm2.apps[0].autorestart, true);
  assert.equal(pm2.apps[0].env.SSA_DATA_ROOT, "/tmp/ssa-data");
  assert.ok(pm2.apps[0].args.includes("--interval-ms 7000"));
});

test("supervisor CLI writes selected config and an operator command manifest", async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-worker-supervisor-test-"));
  try {
    await runCli([
      "generate",
      "--platform",
      "pm2",
      "--workspace",
      "farreach",
      "--worker-id",
      "jaden-farreach-1",
      "--data-root",
      "/tmp/ssa-data",
      "--output",
      outputDir,
    ]);

    const config = JSON.parse(fs.readFileSync(path.join(outputDir, "ecosystem.ssa-jaden-farreach-1.config.json"), "utf-8"));
    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, "ssa-jaden-farreach-1.supervisor.json"), "utf-8"));

    assert.equal(config.apps[0].name, "ssa-jaden-farreach-1");
    assert.equal(config.apps[0].autorestart, true);
    assert.match(manifest.commands.start, /pm2 start/);
    assert.match(manifest.commands.health, /--status --worker-id jaden-farreach-1/);
    assert.equal(manifest.restartPolicy, "always");
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test("supervisor CLI defaults generated files to SSA_DATA_ROOT outside the repo", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-worker-supervisor-data-"));
  const originalDataRoot = process.env.SSA_DATA_ROOT;
  try {
    process.env.SSA_DATA_ROOT = dataRoot;

    await runCli([
      "generate",
      "--platform",
      "systemd",
      "--workspace",
      "farreach",
      "--worker-id",
      "jaden-default-output",
      "--data-root",
      dataRoot,
    ]);

    const outputDir = path.join(dataRoot, "runtime", "supervisors");
    assert.ok(fs.existsSync(path.join(outputDir, "ssa-jaden-default-output.service")));
    assert.ok(fs.existsSync(path.join(outputDir, "ssa-jaden-default-output.supervisor.json")));
  } finally {
    if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
    else process.env.SSA_DATA_ROOT = originalDataRoot;
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
