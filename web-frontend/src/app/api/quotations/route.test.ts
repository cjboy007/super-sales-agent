import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-quotations-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("/api/quotations route", () => {
  it("returns quotation file references without exposing filesystem paths", async () => {
    const quoteDir = path.join(tempRoot, "companies", "farreach", "quotations");
    fs.mkdirSync(quoteDir, { recursive: true });
    fs.writeFileSync(path.join(quoteDir, "QT-20260609-Beta-Buyer.pdf"), "%PDF", "utf-8");
    fs.writeFileSync(path.join(quoteDir, "QT-20260609-Beta-Buyer.xlsx"), "sheet", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/quotations?project=farreach&search=Beta-Buyer"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.quotations).toHaveLength(1);
    expect(json.quotations[0]).not.toHaveProperty("filePath");
    expect(json.quotations[0].files).toEqual([
      expect.objectContaining({
        format: "pdf",
        fileName: "QT-20260609-Beta-Buyer.pdf",
        downloadUrl: expect.stringContaining("/api/files?"),
      }),
      expect.objectContaining({
        format: "excel",
        fileName: "QT-20260609-Beta-Buyer.xlsx",
        downloadUrl: expect.stringContaining("/api/files?"),
      }),
    ]);
    expect(JSON.stringify(json)).not.toContain(tempRoot);
    expect(JSON.stringify(json)).not.toContain("path");
  });
});
