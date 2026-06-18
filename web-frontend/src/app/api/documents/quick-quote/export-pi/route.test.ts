import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuickQuoteDefaults } from "@/lib/quick-quote";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-quick-quote-export-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/documents/quick-quote/export-pi?project=demo-exporter", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/documents/quick-quote/export-pi route", () => {
  it("exports a quick quote PI package and returns archived files", async () => {
    const quote = createQuickQuoteDefaults();
    quote.quoteNo = "QT-20260601-001";
    quote.customer = "Local Buyer";
    quote.lines[0] = {
      id: "line-1",
      description: "USB-C Cable",
      specification: "2m / black",
      quantity: 500,
      unitCost: 0.82,
      supplier: "Shenzhen Cable Factory",
      marginPercent: 30,
    };
    const { POST } = await import("./route");

    const response = await POST(request({ quote }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        piNo: "PI-20260601-001",
        customer: "Local Buyer",
        git: { committed: true },
        archive: {
          status: "archived",
          fileCount: 3,
        },
      },
    });
    const packageDir = path.join(
      tempRoot,
      "companies",
      "demo-exporter",
      "customers",
      "Local_Buyer",
      "quotes",
      "PI-20260601-001"
    );
    expect(fs.existsSync(path.join(packageDir, "PI-20260601-001.html"))).toBe(true);
    expect(fs.existsSync(path.join(packageDir, "price-cost.json"))).toBe(true);

    const serialized = JSON.stringify(json.data);
    expect(json.data).not.toHaveProperty("workspaceId");
    expect(json.data).not.toHaveProperty("customerDir");
    expect(json.data).not.toHaveProperty("packageDir");
    expect(serialized).not.toContain("path");
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("workflow");
  });
});
