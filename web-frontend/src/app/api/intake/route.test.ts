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

  it("prunes stale intake sessions and upload folders", async () => {
    const sessionsDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "sessions");
    const uploadsDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "uploads");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });

    for (let index = 0; index < 32; index += 1) {
      const id = `intake-old-${String(index).padStart(2, "0")}`;
      const updatedAt = new Date(Date.UTC(2026, 0, index + 1)).toISOString();
      fs.writeFileSync(path.join(sessionsDir, `${id}.json`), JSON.stringify({
        id,
        project: "demo-exporter",
        status: "pending_review",
        createdAt: updatedAt,
        updatedAt,
        pastedText: "",
        uploads: [],
        messages: [],
        analysis: {
          source: "local",
          itemType: "Unclassified",
          destination: "intake/review",
          confidence: 0,
          relatedParty: "Unknown",
          summary: "",
          evidence: [],
          matches: [],
          actions: [],
        },
      }), "utf-8");
      fs.mkdirSync(path.join(uploadsDir, id), { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, id, "payload.txt"), "old", "utf-8");
    }
    fs.mkdirSync(path.join(uploadsDir, "orphan-upload"), { recursive: true });

    const { POST } = await import("./route");
    await POST(request("http://localhost/api/intake?project=demo-exporter", {
      message: "new intake",
    }));

    const sessions = fs.readdirSync(sessionsDir).filter((file) => file.endsWith(".json"));
    const uploads = fs.readdirSync(uploadsDir);
    expect(sessions).toHaveLength(25);
    expect(uploads).toHaveLength(24);
    expect(uploads).not.toContain("orphan-upload");
    for (const uploadId of uploads) {
      expect(sessions).toContain(`${uploadId}.json`);
    }
  });

  it("keeps intake sessions scoped to the active workspace", async () => {
    const { POST, GET } = await import("./route");

    await POST(request("http://localhost/api/intake?project=demo-exporter", {
      message: "Demo exporter RFQ",
    }));
    await POST(request("http://localhost/api/intake?project=farreach", {
      message: "Farreach RFQ",
    }));

    const demoResponse = await GET(new NextRequest("http://localhost/api/intake?project=demo-exporter"));
    const farreachResponse = await GET(new NextRequest("http://localhost/api/intake?project=farreach"));
    const demoJson = await demoResponse.json();
    const farreachJson = await farreachResponse.json();

    expect(demoJson.data).toHaveLength(1);
    expect(farreachJson.data).toHaveLength(1);
    expect(demoJson.data[0].project).toBe("demo-exporter");
    expect(farreachJson.data[0].project).toBe("farreach");
    expect(fs.existsSync(path.join(tempRoot, "intake"))).toBe(false);
  });
});
