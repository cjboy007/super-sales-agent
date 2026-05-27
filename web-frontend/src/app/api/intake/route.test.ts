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
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-intake-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
  fs.writeFileSync(
    path.join(tempRoot, "config.json"),
    JSON.stringify({
      openrouterApiKey: Buffer.from("should-not-be-used", "utf-8").toString("base64"),
      defaultModel: "openai/gpt-4o-mini",
    }),
    "utf-8"
  );
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

describe("/api/intake route", () => {
  it("uses the runtime LLM adapter and does not call OpenRouter directly", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/intake?project=demo-exporter", {
      message: "This is a customer RFQ. Match it locally and hold for approval.",
      pastedText: "buyer@example.com asks for a quotation for 100 pumps.",
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      project: "demo-exporter",
      status: "pending_review",
      analysis: {
        source: "local",
        itemType: "Quotation",
        destination: "quotations",
      },
    });
    expect(json.data.messages.at(-1)).toMatchObject({
      role: "assistant",
    });
    expect(json.data.messages.at(-1).content).toContain("I reviewed the local intake signals");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
