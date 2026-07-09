import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-local-storage-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string) {
  return new NextRequest(url);
}

describe("/api/local-storage route", () => {
  it("returns storage summary/listing through the gateway without activation tokens", async () => {
    const filePath = path.join(tempRoot, "companies", "farreach", "documents", "syntheses", "summary.md");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "local synthesis", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/local-storage?project=farreach&path=documents/syntheses"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.summary.workspaceId).toBe("farreach");
    expect(json.data.summary.dataRoot).toBe(tempRoot);
    expect(json.data.listing.entries[0]).toMatchObject({
      name: "summary.md",
      kind: "file",
      downloadUrl: expect.stringContaining("/api/files?"),
    });
    expect(JSON.stringify(json.data.listing)).not.toContain(filePath);
    expect(JSON.stringify(json.data.listing)).not.toContain(tempRoot);
  });
});
