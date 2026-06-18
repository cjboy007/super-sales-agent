import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
let tempRoot = "";

function postToken(token: string): NextRequest {
  return new NextRequest("http://localhost/api/beta-access/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-access-verify-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
    { token: "valid-beta-pass", name: "Farreach trial", workspaces: ["farreach"] },
  ]);
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/beta-access/verify route", () => {
  it("accepts a configured beta access pass and returns its workspace assignment", async () => {
    const { POST } = await import("./route");

    const response = await POST(postToken("valid-beta-pass"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      data: {
        access: "granted",
        workspaces: ["farreach"],
        defaultWorkspace: "farreach",
        wildcard: false,
      },
    });
  });

  it("rejects an invalid pass with a product-facing message only", async () => {
    const { POST } = await import("./route");

    const response = await POST(postToken("wrong-pass"));
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(401);
    expect(json).toEqual({
      success: false,
      error: "Access pass is invalid.",
    });
    expect(serialized).not.toContain("valid-beta-pass");
    expect(serialized).not.toContain("Farreach trial");
    expect(serialized).not.toContain("workspace");
    expect(serialized).not.toContain("SSA_BETA_AUTH");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("dataRoot");
  });

  it("stops accepting a shared invite pass after its redemption limit is reached", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "shared-invite-pass", name: "Farreach invite", workspaces: ["farreach"], maxRedemptions: 5 },
    ]);
    const { POST } = await import("./route");

    const accepted = [];
    for (let index = 0; index < 5; index += 1) {
      accepted.push(await POST(postToken("shared-invite-pass")));
    }
    const rejected = await POST(postToken("shared-invite-pass"));
    const rejectedJson = await rejected.json();
    const redemptionLog = fs.readFileSync(path.join(tempRoot, "security", "beta-auth-redemptions.json"), "utf-8");

    expect(accepted.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(rejected.status).toBe(401);
    expect(rejectedJson).toEqual({
      success: false,
      error: "Access pass is invalid.",
    });
    expect(redemptionLog).not.toContain("shared-invite-pass");
    expect(redemptionLog).toContain("\"count\": 5");
  });
});
