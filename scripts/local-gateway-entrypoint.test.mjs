import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildGatewayEnv } from "./local-gateway-entrypoint.mjs";

test("buildGatewayEnv no longer generates activation-token files", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-gateway-auth-test-"));
  try {
    const env = buildGatewayEnv({
      dataRoot,
      appRoot: "/app",
      env: {},
    });

    assert.equal(env.SSA_DATA_ROOT, dataRoot);
    assert.equal(env.SSA_APP_ROOT, "/app");
    assert.equal(env.SSA_LOCAL_GATEWAY, "true");
    assert.equal(env.SSA_BETA_AUTH_REQUIRED, undefined);
    assert.equal(env.SSA_BETA_AUTH_TOKENS, undefined);
    assert.equal(fs.readdirSync(dataRoot).length, 0);
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
