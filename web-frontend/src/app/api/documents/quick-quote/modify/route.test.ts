import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuickQuoteDefaults } from "@/lib/quick-quote";

const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-quick-quote-modify-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
});

afterEach(() => {
  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/documents/quick-quote/modify?project=demo-exporter", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/documents/quick-quote/modify route", () => {
  it("applies a natural-language margin update and returns the updated quote", async () => {
    const quote = createQuickQuoteDefaults();
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

    const response = await POST(request({ quote, message: "把利润率改成35%，备注写valid for 7 days" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      source: "local",
      updatedQuote: {
        lines: [expect.objectContaining({ marginPercent: 35 })],
        notes: "valid for 7 days",
      },
    });
    expect(json.reply).toContain("35");
    expect(JSON.stringify(json)).not.toContain("provider");
    expect(json).not.toHaveProperty("provider");
  });

  it("rejects missing quick quote data", async () => {
    const { POST } = await import("./route");

    const response = await POST(request({ message: "change price" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ success: false, error: "Missing quick quote data or modification request" });
  });
});
