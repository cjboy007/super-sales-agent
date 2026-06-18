import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureGatewayAuth, buildGatewayEnv } from "./local-gateway-entrypoint.mjs";

test("ensureGatewayAuth generates a local gateway token file when no token source exists", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-gateway-auth-test-"));
  try {
    const result = ensureGatewayAuth({
      dataRoot,
      env: {},
      now: () => new Date("2026-06-15T00:00:00.000Z"),
      randomToken: () => "generated-local-token",
    });

    assert.equal(result.generated, true);
    assert.equal(result.tokens[0].token, "generated-local-token");
    assert.equal(result.tokens[0].name, "local-gateway");
    assert.deepEqual(result.tokens[0].workspaces, ["*"]);
    assert.equal(
      fs.readFileSync(path.join(dataRoot, "security", "beta-auth.json"), "utf-8"),
      JSON.stringify({ tokens: result.tokens }, null, 2)
    );
    assert.equal((fs.statSync(path.join(dataRoot, "security", "beta-auth.json")).mode & 0o777), 0o600);
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("buildGatewayEnv projects file tokens into the server environment for API and page auth", () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-gateway-env-test-"));
  try {
    fs.mkdirSync(path.join(dataRoot, "security"), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, "security", "beta-auth.json"), JSON.stringify({
      tokens: [
        { name: "existing", token: "existing-token", workspaces: ["farreach"], createdAt: "2026-06-15T00:00:00.000Z" },
      ],
    }), "utf-8");

    const env = buildGatewayEnv({
      dataRoot,
      appRoot: "/app",
      env: { PORT: "4000" },
    });

    assert.equal(env.SSA_DATA_ROOT, dataRoot);
    assert.equal(env.SSA_APP_ROOT, "/app");
    assert.equal(env.SSA_LOCAL_GATEWAY, "true");
    assert.equal(env.SSA_BETA_AUTH_REQUIRED, "true");
    assert.equal(env.PORT, "4000");
    assert.deepEqual(JSON.parse(env.SSA_BETA_AUTH_TOKENS), [
      { name: "existing", token: "existing-token", workspaces: ["farreach"], createdAt: "2026-06-15T00:00:00.000Z" },
    ]);
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
