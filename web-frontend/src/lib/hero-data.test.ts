import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalDataReadFlag = process.env.SSA_ENABLE_REAL_DATA_READ;
const originalHeroDataApi = process.env.HERO_DATA_API_URL;

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-hero-data-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.HERO_DATA_API_URL = "http://hero-data.test";
  delete process.env.SSA_ENABLE_REAL_DATA_READ;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalDataReadFlag === undefined) delete process.env.SSA_ENABLE_REAL_DATA_READ;
  else process.env.SSA_ENABLE_REAL_DATA_READ = originalDataReadFlag;

  if (originalHeroDataApi === undefined) delete process.env.HERO_DATA_API_URL;
  else process.env.HERO_DATA_API_URL = originalHeroDataApi;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("hero-data adapter", () => {
  it("blocks Hero data API reads by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { getLeads, isDataApiAvailable } = await import("./hero-data");

    await expect(getLeads()).resolves.toEqual([]);
    await expect(isDataApiAvailable()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    const decisions = JSON.parse(
      fs.readFileSync(path.join(tempRoot, "companies", "hero-pumps", "approvals", "side-effect-decisions.json"), "utf-8")
    );
    expect(decisions[0]).toMatchObject({
      kind: "data.read",
      workspaceId: "hero-pumps",
      status: "blocked",
    });
  });

  it("allows Hero data API reads only when explicitly enabled", async () => {
    process.env.SSA_ENABLE_REAL_DATA_READ = "true";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ company: "Remote Pumps", email: "remote@example.com" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { getLeads } = await import("./hero-data");

    await expect(getLeads()).resolves.toEqual([{ company: "Remote Pumps", email: "remote@example.com" }]);
    expect(fetchMock).toHaveBeenCalledWith("http://hero-data.test/leads", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });
});
