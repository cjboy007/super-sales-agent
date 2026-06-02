import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuickQuoteDefaults, type QuickQuoteData } from "../quick-quote";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

function quoteData(): QuickQuoteData {
  const quote = createQuickQuoteDefaults();
  quote.quoteNo = "QT-20260601-001";
  quote.date = "2026-06-01";
  quote.validUntil = "2026-06-15";
  quote.customer = "Local Buyer";
  quote.contact = "Ada";
  quote.email = "ada@local.example";
  quote.country = "USA";
  quote.lines = [
    {
      id: "line-1",
      description: "USB-C Cable",
      specification: "2m / black",
      quantity: 500,
      unitCost: 0.82,
      supplier: "Shenzhen Cable Factory",
      marginPercent: 30,
    },
  ];
  return quote;
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-quick-quote-export-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("quick quote PI package export", () => {
  it("creates an English PI package under the customer folder and commits versions with git", async () => {
    const { exportQuickQuotePiPackage } = await import("./quick-quote-export");
    const first = exportQuickQuotePiPackage("demo-exporter", quoteData());

    expect(first).toMatchObject({
      success: true,
      piNo: "PI-20260601-001",
      customer: "Local Buyer",
      git: { committed: true },
    });
    expect(first.packageDir).toContain(path.join("companies", "demo-exporter", "customers", "Local_Buyer", "quotes", "PI-20260601-001"));

    const piHtml = fs.readFileSync(path.join(first.packageDir, "PI-20260601-001.html"), "utf-8");
    expect(piHtml).toContain("PROFORMA INVOICE");
    expect(piHtml).toContain("Bill To");
    expect(piHtml).toContain("Grand Total");
    expect(piHtml).not.toMatch(/报价|客户|产品金额|总金额|成本|供应商/);

    const costInfo = JSON.parse(fs.readFileSync(path.join(first.packageDir, "price-cost.json"), "utf-8"));
    expect(costInfo.lines[0]).toMatchObject({
      description: "USB-C Cable",
      unitCost: 0.82,
      supplier: "Shenzhen Cable Factory",
    });
    expect(fs.readFileSync(path.join(first.packageDir, "product-materials-index.md"), "utf-8")).toContain("USB-C Cable");
    const priceMemory = JSON.parse(
      fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "pricing", "price-memory.json"), "utf-8")
    );
    expect(priceMemory[0]).toMatchObject({
      customer: "Local Buyer",
      product: "USB-C Cable",
      unitPrice: 1.07,
      unitCost: 0.82,
      supplier: "Shenzhen Cable Factory",
      piNo: "PI-20260601-001",
      source: "quick-quote.export",
    });

    const quote = quoteData();
    quote.lines[0].marginPercent = 40;
    const second = exportQuickQuotePiPackage("demo-exporter", quote);
    expect(second.git.committed).toBe(true);

    const log = execFileSync("git", ["-C", first.customerDir, "log", "--oneline"], { encoding: "utf-8" });
    expect(log.trim().split("\n")).toHaveLength(2);
    const status = execFileSync("git", ["-C", first.customerDir, "status", "--short"], { encoding: "utf-8" });
    expect(status).toBe("");
  });
});
