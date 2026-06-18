import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { listFileManifest } from "./file-manifest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-document-synthesis-test-"));
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

function writeIntakeWithUploads() {
  const workspaceId = "demo-exporter";
  const intakeId = "intake-synthesis-001";
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

describe("document synthesis", () => {
  it("generates one markdown synthesis from a multi-file intake and registers it", async () => {
    const input = writeIntakeWithUploads();
    const runtime = createSalesRuntime();

    const result = await runtime.synthesizeIntake({
      ...input,
      instruction: "Create a concise customer handoff.",
    });

    expect(result.success).toBe(true);
    expect(result.filesRead).toBe(2);
    expect(result.outputPath).toContain(path.join(tempRoot, "companies", input.workspaceId, "documents", "syntheses"));
    expect(fs.existsSync(result.outputPath)).toBe(true);
    const markdown = fs.readFileSync(result.outputPath, "utf-8");
    expect(markdown).toContain("rfq.txt");
    expect(markdown).toContain("Buyer asks for 500 HDMI 2.1 cables");
    expect(markdown).toContain("notes.csv");
    expect(markdown).toContain("USB-C cable,300");

    expect(listFileManifest(input.workspaceId)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "other",
        fileName: path.basename(result.outputPath),
        sourceAction: "document.synthesize",
      }),
    ]));
  });
});
