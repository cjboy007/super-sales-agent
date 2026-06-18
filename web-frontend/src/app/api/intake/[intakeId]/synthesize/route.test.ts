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
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-intake-synthesis-route-test-"));
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

function writeIntakeSession() {
  const workspaceId = "demo-exporter";
  const intakeId = "intake-route-synthesis-001";
  const uploadDir = path.join(tempRoot, "companies", workspaceId, "intake", "uploads", intakeId);
  const sessionDir = path.join(tempRoot, "companies", workspaceId, "intake", "sessions");
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const rfqPath = path.join(uploadDir, "rfq.txt");
  const notesPath = path.join(uploadDir, "notes.csv");
  fs.writeFileSync(rfqPath, "Buyer asks for 500 HDMI 2.1 cables with CE certificate.", "utf-8");
  fs.writeFileSync(notesPath, "item,qty\nUSB-C cable,300\nDisplayPort cable,200", "utf-8");

  fs.writeFileSync(path.join(sessionDir, `${intakeId}.json`), JSON.stringify({
    id: intakeId,
    project: workspaceId,
    status: "pending_review",
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    pastedText: "Please combine these files into one customer handoff summary.",
    uploads: [
      {
        id: "file-rfq",
        name: "rfq.txt",
        type: "text/plain",
        size: fs.statSync(rfqPath).size,
        path: rfqPath,
        storedAt: "2026-06-15T00:00:00.000Z",
        processing: { status: "saved", kind: "unknown", updatedAt: "2026-06-15T00:00:00.000Z" },
      },
      {
        id: "file-notes",
        name: "notes.csv",
        type: "text/csv",
        size: fs.statSync(notesPath).size,
        path: notesPath,
        storedAt: "2026-06-15T00:00:00.000Z",
        processing: { status: "saved", kind: "lead_list", updatedAt: "2026-06-15T00:00:00.000Z" },
      },
    ],
    messages: [],
    analysis: {
      source: "local",
      itemType: "Quotation",
      destination: "quotations",
      confidence: 82,
      relatedParty: "Cable Buyer",
      summary: "SSA reads this as a quotation bundle.",
      evidence: ["2 uploaded file(s)", "type signal: Quotation"],
      matches: [],
      actions: [],
    },
  }, null, 2), "utf-8");

  return { workspaceId, intakeId };
}

describe("/api/intake/[intakeId]/synthesize route", () => {
  it("returns a public synthesis receipt with a download URL", async () => {
    const { workspaceId, intakeId } = writeIntakeSession();
    const { POST } = await import("./route");

    const response = await POST(new NextRequest(`http://localhost/api/intake/${intakeId}/synthesize?project=${workspaceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "Create a concise customer handoff." }),
    }), {
      params: { intakeId },
    });
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      intakeId,
      filesRead: 2,
      filesSkipped: 0,
      fileName: expect.stringMatching(/^SYN-\d{8}-[A-Z0-9]+-.+\.md$/),
      downloadUrl: expect.stringContaining("/api/files?"),
    });
    expect(json.data.summary).toContain("rfq.txt");
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("~/.ssa");
    expect(serialized).not.toContain(".ssa");
    expect(json.data).not.toHaveProperty("outputPath");
  });
});
