import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-file-manifest-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("runtime file manifest", () => {
  it("upserts files and lists the latest valid records first", async () => {
    const { listFileManifest, upsertFileManifestRecords } = await import("./file-manifest");
    const quotePath = path.join(tempRoot, "companies", "demo-exporter", "quotations", "QT-20260601-001.pdf");
    const piPath = path.join(tempRoot, "companies", "demo-exporter", "documents", "PI-20260601-001.html");
    fs.mkdirSync(path.dirname(quotePath), { recursive: true });
    fs.mkdirSync(path.dirname(piPath), { recursive: true });
    fs.writeFileSync(quotePath, "quote", "utf-8");
    fs.writeFileSync(piPath, "pi", "utf-8");

    upsertFileManifestRecords("demo-exporter", [
      {
        id: "QT-20260601-001:pdf",
        kind: "quotation",
        documentNo: "QT-20260601-001",
        fileName: "QT-20260601-001.pdf",
        path: quotePath,
        format: "pdf",
        customer: "Local Buyer",
        amount: "USD 125.00",
        mainProducts: "USB-C cable",
        sourceAction: "quotation.generate",
        updatedAt: "2026-06-01T09:00:00.000Z",
      },
      {
        id: "PI-20260601-001:html",
        kind: "PI",
        documentNo: "PI-20260601-001",
        fileName: "PI-20260601-001.html",
        path: piPath,
        format: "html",
        customer: "Local Buyer",
        amount: "USD 125.00",
        mainProducts: "USB-C cable",
        sourceAction: "quick-quote.export",
        updatedAt: "2026-06-01T10:00:00.000Z",
      },
    ]);

    expect(listFileManifest("demo-exporter").map((item) => item.documentNo)).toEqual([
      "PI-20260601-001",
      "QT-20260601-001",
    ]);
  });

  it("hides stale records whose local file no longer exists", async () => {
    const { listFileManifest, upsertFileManifestRecords } = await import("./file-manifest");
    upsertFileManifestRecords("demo-exporter", [
      {
        id: "missing",
        kind: "quotation",
        documentNo: "QT-missing",
        fileName: "missing.pdf",
        path: path.join(tempRoot, "missing.pdf"),
        format: "pdf",
        customer: "Missing",
        amount: "USD 0.00",
        mainProducts: "—",
        sourceAction: "test",
        updatedAt: "2026-06-01T10:00:00.000Z",
      },
    ]);

    expect(listFileManifest("demo-exporter")).toEqual([]);
  });
});
