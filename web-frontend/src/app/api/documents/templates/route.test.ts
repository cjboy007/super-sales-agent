import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-doc-templates-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function uploadRequest(files: File[], project = "demo-exporter") {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  return new NextRequest(`http://localhost/api/documents/templates?project=${project}`, {
    method: "POST",
    body: form,
  });
}

describe("/api/documents/templates route", () => {
  it("stores 3-5 PI/CI/PL reference files and returns a template draft", async () => {
    const files = [
      new File(["pi"], "PI-approved.pdf", { type: "application/pdf" }),
      new File(["ci"], "CI-approved.pdf", { type: "application/pdf" }),
      new File(["pl"], "PL-approved.pdf", { type: "application/pdf" }),
    ];
    const { POST } = await import("./route");

    const response = await POST(uploadRequest(files));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      sampleCount: 3,
      templateDraft: {
        status: "ready_for_confirmation",
        documentTypes: ["PI", "CI", "PL"],
      },
    });
    const savedDir = path.join(tempRoot, "companies", "demo-exporter", "documents", "template-samples");
    expect(fs.readdirSync(savedDir).filter((file) => file.endsWith(".pdf"))).toHaveLength(3);
  });
});
