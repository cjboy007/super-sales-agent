import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  memoryIndexDbPath,
  rebuildMemoryIndex,
  removeMemoryIndexRecord,
  searchMemoryIndex,
  upsertMemoryIndexRecord,
} from "./memory-index";
import { upsertFileManifestRecords } from "./file-manifest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-memory-index-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("memory-index", () => {
  it("upserts, searches, and removes local FTS records", () => {
    upsertMemoryIndexRecord({
      workspaceId: "demo-exporter",
      sourceKind: "document",
      sourceId: "doc-1",
      kind: "document",
      title: "599-030 HDMI technical drawing",
      body: "HDMI2CABLEGRIP35F model 5001-130A drawing 599-030",
      keywords: ["599-030", "5001-130A", "HDMI2CABLEGRIP35F"],
      path: "/tmp/599-030.pdf",
      metadata: { drawingNo: "599-030" },
    });

    expect(fs.existsSync(memoryIndexDbPath())).toBe(true);
    expect(searchMemoryIndex("demo-exporter", ["599-030"], 5)[0]).toMatchObject({
      kind: "document",
      title: "599-030 HDMI technical drawing",
      confidence: expect.any(Number),
    });

    removeMemoryIndexRecord("demo-exporter", "document", "doc-1");
    expect(searchMemoryIndex("demo-exporter", ["599-030"], 5)).toEqual([]);
  });

  it("rebuilds index entries from file manifest records", () => {
    const filePath = path.join(tempRoot, "companies", "demo-exporter", "quotations", "QT-20260601-001.pdf");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "%PDF quote", "utf-8");
    upsertFileManifestRecords("demo-exporter", [{
      id: "quote-1",
      kind: "quotation",
      documentNo: "QT-20260601-001",
      fileName: "QT-20260601-001.pdf",
      path: filePath,
      format: "pdf",
      customer: "Cable House",
      amount: "USD 1200",
      mainProducts: "USB-C cable",
      sourceAction: "quotation.generate",
      updatedAt: "2026-06-01T00:00:00.000Z",
    }]);

    const result = rebuildMemoryIndex("demo-exporter");
    const hits = searchMemoryIndex("demo-exporter", ["Cable", "House"], 5);

    expect(result.recordsIndexed).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({
      kind: "quotation",
      title: "QT-20260601-001",
    });
  });

  it("rebuilds index entries from intake uploads and product doc analysis", () => {
    const sessionsDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "sessions");
    const uploadDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "uploads", "intake-1");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });
    const uploadPath = path.join(uploadDir, "599-030.pdf");
    fs.writeFileSync(uploadPath, "%PDF test", "utf-8");
    fs.writeFileSync(path.join(sessionsDir, "intake-1.json"), JSON.stringify({
      id: "intake-1",
      project: "demo-exporter",
      updatedAt: "2026-06-01T00:00:00.000Z",
      uploads: [{
        id: "file-1",
        name: "599-030.pdf",
        type: "application/pdf",
        size: 9,
        path: uploadPath,
        processing: { status: "completed", kind: "product_doc" },
      }],
      analysis: {
        productDoc: {
          productName: "HDMI2CABLEGRIP35F",
          modelNo: "5001-130A",
          drawingNo: "599-030",
          packagingSpec: "BJ0599-0002",
          uploadPath,
        },
      },
    }, null, 2), "utf-8");

    const result = rebuildMemoryIndex("demo-exporter");
    const hits = searchMemoryIndex("demo-exporter", ["5001-130A"], 5);

    expect(result.recordsIndexed).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({
      kind: "document",
      title: "599-030",
    });
  });
});
