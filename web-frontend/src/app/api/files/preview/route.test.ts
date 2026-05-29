import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
}));

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalPreviewFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_PREVIEW;

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  execFileSyncMock.mockReset();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-preview-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_PREVIEW;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalPreviewFlag === undefined) delete process.env.SSA_ENABLE_REAL_DOCUMENT_PREVIEW;
  else process.env.SSA_ENABLE_REAL_DOCUMENT_PREVIEW = originalPreviewFlag;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function requestFor(filePath: string, project = "demo-exporter"): NextRequest {
  return new NextRequest(`http://localhost/api/files/preview?path=${encodeURIComponent(filePath)}&project=${project}`);
}

function conversionCalls() {
  return execFileSyncMock.mock.calls.filter((call) => call[0] === "soffice");
}

describe("/api/files/preview route", () => {
  it("returns direct preview metadata for HTML without a side-effect gate", async () => {
    const htmlPath = path.join(tempRoot, "documents", "preview.html");
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, "<html>Preview</html>", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(htmlPath));
    const json = await response.json();

    expect(json).toMatchObject({
      previewAvailable: false,
      reason: "direct",
      inlineUrl: `/api/files?path=${encodeURIComponent(htmlPath)}`,
    });
    expect(conversionCalls()).toHaveLength(0);
  });

  it("blocks Office document conversion by default without running LibreOffice", async () => {
    const docPath = path.join(tempRoot, "documents", "quote.docx");
    fs.mkdirSync(path.dirname(docPath), { recursive: true });
    fs.writeFileSync(docPath, "docx-placeholder", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(docPath));
    const json = await response.json();

    expect(json).toMatchObject({
      previewAvailable: false,
      blocked: true,
      reason: "preview_conversion_blocked",
      sideEffect: {
        kind: "document.preview",
        workspaceId: "demo-exporter",
        status: "blocked",
        realExecutionEnabled: false,
      },
    });
    expect(json.sideEffect.reason).toContain("SSA_ENABLE_REAL_DOCUMENT_PREVIEW=true");
    expect(conversionCalls()).toHaveLength(0);
  });

  it("runs Office document conversion only when document preview is explicitly enabled", async () => {
    process.env.SSA_ENABLE_REAL_DOCUMENT_PREVIEW = "true";
    const docPath = path.join(tempRoot, "documents", "quote.docx");
    fs.mkdirSync(path.dirname(docPath), { recursive: true });
    fs.writeFileSync(docPath, "docx-placeholder", "utf-8");
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (_cmd !== "soffice") return "";
      const outdir = args[args.indexOf("--outdir") + 1];
      fs.writeFileSync(path.join(outdir, "quote.html"), "<html>Converted</html>", "utf-8");
      return "";
    });
    const { GET } = await import("./route");

    const response = await GET(requestFor(docPath));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(text).toContain("Converted");
    expect(conversionCalls()).toHaveLength(1);
  });
});
