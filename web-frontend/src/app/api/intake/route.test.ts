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

function pdfFileWithSize(name: string, size: number): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x25, 0x50, 0x44, 0x46]);
  return new File([bytes], name, { type: "application/pdf" });
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

  it("queues product doc reader processing on product spec intake records", async () => {
    vi.doMock("@/lib/runtime/product-doc-reader", () => ({
      maybeAnalyzeProductDocUpload: vi.fn(async () => {
        throw new Error("product-doc-reader should not run synchronously during intake save");
      }),
    }));
    const { POST } = await import("./route");
    const file = new File(["%PDF test"], "599-028 technical drawing.pdf", { type: "application/pdf" });
    const form = new FormData();
    form.append("message", "Please read this technical drawing.");
    form.append("files", file);

    const response = await POST(new NextRequest("http://localhost/api/intake?project=demo-exporter", {
      method: "POST",
      body: form,
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.uploads[0].processing).toMatchObject({
      status: "queued",
      kind: "product_doc",
    });
    expect(json.data.analysis.productDoc).toBeUndefined();
  });

  it("accepts product PDFs up to 50MB and records queued processing state", async () => {
    vi.doMock("@/lib/runtime/product-doc-reader", () => ({
      maybeAnalyzeProductDocUpload: vi.fn(async () => {
        throw new Error("product-doc-reader should not run synchronously during intake save");
      }),
    }));
    const { POST } = await import("./route");
    const file = pdfFileWithSize("599-030 technical drawing.pdf", 50 * 1024 * 1024);
    const form = new FormData();
    form.append("message", "Please read this technical drawing.");
    form.append("files", file);

    const response = await POST(new NextRequest("http://localhost/api/intake?project=demo-exporter", {
      method: "POST",
      body: form,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.uploads[0].processing).toMatchObject({
      status: "queued",
      kind: "product_doc",
    });
    expect(json.data.analysis.productDoc).toBeUndefined();

    const { createRuntimeTaskQueue } = await import("@/lib/runtime/task-queue");
    expect(createRuntimeTaskQueue().list(10)[0]).toMatchObject({
      workspaceId: "demo-exporter",
      workflow: "intake.product_doc.process",
      status: "queued",
      input: {
        intakeId: json.data.id,
        uploadId: json.data.uploads[0].id,
      },
    });
  });

  it("rejects files over 50MB with a clear file-specific message", async () => {
    const { POST } = await import("./route");
    const file = pdfFileWithSize("huge-catalog.pdf", 50 * 1024 * 1024 + 1);
    const form = new FormData();
    form.append("files", file);

    const response = await POST(new NextRequest("http://localhost/api/intake?project=demo-exporter", {
      method: "POST",
      body: form,
    }));
    const json = await response.json();

    expect(response.status).toBe(413);
    expect(json.error).toContain("huge-catalog.pdf");
    expect(json.error).toContain("50MB");
  });

  it("rejects total upload payloads over 150MB", async () => {
    const { POST } = await import("./route");
    const form = new FormData();
    for (let index = 0; index < 4; index += 1) {
      form.append("files", pdfFileWithSize(`catalog-${index}.pdf`, 40 * 1024 * 1024));
    }

    const response = await POST(new NextRequest("http://localhost/api/intake?project=demo-exporter", {
      method: "POST",
      body: form,
    }));
    const json = await response.json();

    expect(response.status).toBe(413);
    expect(json.error).toContain("150MB");
    expect(json.error).toContain("160MB");
  });
});
