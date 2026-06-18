import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve("scripts", "configure-beta-access.mjs");

test("configure-beta-access creates server-side beta token config under SSA_DATA_ROOT", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-access-script-test-"));
  try {
    const output = execFileSync("node", [
      scriptPath,
      "create",
      "--name",
      "farreach-beta",
      "--workspaces",
      "farreach,hero-pumps",
      "--token",
      "test-token",
    ], {
      env: { ...process.env, SSA_DATA_ROOT: tempRoot },
      encoding: "utf-8",
    });
    const json = JSON.parse(output);
    const filePath = path.join(tempRoot, "security", "beta-auth.json");
    const saved = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    assert.equal(json.file, filePath);
    assert.equal(json.token, "test-token");
    assert.deepEqual(saved.tokens[0], {
      name: "farreach-beta",
      token: "test-token",
      workspaces: ["farreach", "hero-pumps"],
      createdAt: saved.tokens[0].createdAt,
    });

    const statusOutput = execFileSync("node", [scriptPath, "status"], {
      env: { ...process.env, SSA_DATA_ROOT: tempRoot },
      encoding: "utf-8",
    });
    const status = JSON.parse(statusOutput);
    assert.equal(status.configured, true);
    assert.deepEqual(status.tokens[0].workspaces, ["farreach", "hero-pumps"]);
    assert.equal(JSON.stringify(status).includes("test-token"), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("configure-beta-access refuses wildcard workspace tokens unless explicitly allowed", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-access-wildcard-test-"));
  try {
    assert.throws(
      () => execFileSync("node", [
        scriptPath,
        "create",
        "--name",
        "unsafe-shared-alpha",
        "--workspaces",
        "*",
        "--token",
        "admin-token",
      ], {
        env: { ...process.env, SSA_DATA_ROOT: tempRoot },
        encoding: "utf-8",
        stdio: "pipe",
      }),
      /Wildcard workspace access requires --allow-wildcard/
    );

    const output = execFileSync("node", [
      scriptPath,
      "create",
      "--name",
      "ops-admin",
      "--workspaces",
      "*",
      "--token",
      "admin-token",
      "--allow-wildcard",
    ], {
      env: { ...process.env, SSA_DATA_ROOT: tempRoot },
      encoding: "utf-8",
    });
    const json = JSON.parse(output);

    assert.deepEqual(json.workspaces, ["*"]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("configure-beta-access can create a reusable invite pass with a redemption limit", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-access-invite-test-"));
  try {
    const output = execFileSync("node", [
      scriptPath,
      "create",
      "--name",
      "farreach-invite",
      "--workspaces",
      "farreach",
      "--token",
      "shared-invite-pass",
      "--max-redemptions",
      "5",
    ], {
      env: { ...process.env, SSA_DATA_ROOT: tempRoot },
      encoding: "utf-8",
    });
    const json = JSON.parse(output);
    const filePath = path.join(tempRoot, "security", "beta-auth.json");
    const saved = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    assert.equal(json.maxRedemptions, 5);
    assert.equal(saved.tokens[0].maxRedemptions, 5);

    const statusOutput = execFileSync("node", [scriptPath, "status"], {
      env: { ...process.env, SSA_DATA_ROOT: tempRoot },
      encoding: "utf-8",
    });
    const status = JSON.parse(statusOutput);
    assert.equal(status.tokens[0].maxRedemptions, 5);
    assert.equal(JSON.stringify(status).includes("shared-invite-pass"), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
