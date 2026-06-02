import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-cleanup-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("workspace cleanup", () => {
  it("removes expired temp and preview files without touching customer archives", async () => {
    const { cleanupWorkspace } = await import("./workspace-cleanup");
    const oldNow = new Date("2026-06-01T12:00:00.000Z");
    const tempFile = path.join(tempRoot, "companies", "demo-exporter", "tmp", "old.json");
    const previewFile = path.join(tempRoot, "companies", "demo-exporter", ".jadenos", "previews", "old.html");
    const customerFile = path.join(tempRoot, "companies", "demo-exporter", "customers", "Local_Buyer", "quotes", "PI-1", "PI-1.html");
    for (const filePath of [tempFile, previewFile, customerFile]) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "data", "utf-8");
      fs.utimesSync(filePath, new Date("2026-05-01T00:00:00.000Z"), new Date("2026-05-01T00:00:00.000Z"));
    }

    const result = cleanupWorkspace("demo-exporter", { now: oldNow, maxAgeDays: 7 });

    expect(result.removed).toEqual(expect.arrayContaining([tempFile, previewFile]));
    expect(fs.existsSync(tempFile)).toBe(false);
    expect(fs.existsSync(previewFile)).toBe(false);
    expect(fs.existsSync(customerFile)).toBe(true);
  });
});
