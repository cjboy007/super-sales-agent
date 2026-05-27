import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-files-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function requestFor(filePath: string, download = false): NextRequest {
  return new NextRequest(`http://localhost/api/files?path=${encodeURIComponent(filePath)}${download ? "&download=true" : ""}`);
}

describe("/api/files route", () => {
  it("serves files through the runtime file adapter whitelist", async () => {
    const filePath = path.join(tempRoot, "documents", "quote.txt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "local quote", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(filePath));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    expect(await response.text()).toBe("local quote");
  });

  it("rejects files outside the runtime file adapter whitelist", async () => {
    const outsidePath = path.join(os.tmpdir(), "outside-ssa-file.txt");
    fs.writeFileSync(outsidePath, "outside", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(outsidePath));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain("Access denied");
    fs.rmSync(outsidePath, { force: true });
  });
});
