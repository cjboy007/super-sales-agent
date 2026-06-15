import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-assistant-query-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/assistant/query route", () => {
  it("answers ordinary questions through the local-first assistant router", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    createSalesRuntime().writeMemory({
      workspaceId: "demo-exporter",
      customerName: "Route Buyer",
      title: "Route Buyer sample preference",
      body: "Route Buyer wants sample packs shipped by DHL before any bulk quote.",
      tags: ["sample", "preference"],
      source: { type: "operator" },
      authority: "authoritative",
      confidence: 0.95,
    });
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/assistant/query?project=demo-exporter", {
      question: "What does Route Buyer want before a bulk quote?",
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      routing: {
        localFirst: true,
        usedLocal: true,
        usedWeb: false,
      },
      evidence: {
        local: [
          expect.objectContaining({
            sourceKind: "memory",
            title: "Route Buyer sample preference",
          }),
        ],
        web: [],
      },
    });
    expect(json.data.answer).toContain("Route Buyer");
    expect(JSON.stringify(json.data)).not.toContain("workspaceId");
  });

  it("rejects empty assistant questions", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/assistant/query?project=demo-exporter", {
      question: "   ",
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Question is required");
  });
});
