import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-quotations-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("quotation listing", () => {
  it("groups customer PDF and internal Excel files while using HTML only for metadata", async () => {
    const quotePath = path.join(tempRoot, "companies", "farreach", "quotations", "QT-20260512-001-AzureTech.html");
    fs.mkdirSync(path.dirname(quotePath), { recursive: true });
    fs.writeFileSync(
      quotePath,
      `<!doctype html>
      <html>
        <body>
          <!-- STATUS: Sent -->
          <h1>Quotation</h1>
          <table>
            <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>
            <tr><td>HDMI 2.1 Ultra High Speed Cable 2m</td><td>500</td><td>$4.80</td><td>$2,400.00</td></tr>
            <tr><td>DisplayPort 1.4 Cable 1.5m</td><td>300</td><td>$3.50</td><td>$1,050.00</td></tr>
            <tr><td>USB-C to HDMI Adapter</td><td>200</td><td>$12.00</td><td>$2,400.00</td></tr>
          </table>
          <h2>Total: $5,850.00</h2>
        </body>
      </html>`,
      "utf-8"
    );
    fs.writeFileSync(path.join(path.dirname(quotePath), "QT-20260512-001-AzureTech.pdf"), "pdf", "utf-8");
    fs.writeFileSync(path.join(path.dirname(quotePath), "QT-20260512-001-AzureTech.xlsx"), "excel", "utf-8");

    const { getQuotations } = await import("./quotations");
    const result = getQuotations({ search: "AzureTech", page: 1, pageSize: 10 });

    expect(result.quotations).toHaveLength(1);
    expect(result.quotations[0]).toMatchObject({
      fileName: "QT-20260512-001-AzureTech.pdf",
      fileType: "pdf",
      mainProducts: "HDMI 2.1 Ultra High Speed Cable 2m, DisplayPort 1.4 Cable 1.5m, USB-C to HDMI Adapter",
      status: "Sent",
      amount: "USD 5,850.00",
    });
    expect(result.quotations[0].files).toEqual([
      expect.objectContaining({
        format: "pdf",
        fileName: "QT-20260512-001-AzureTech.pdf",
      }),
      expect.objectContaining({
        format: "excel",
        fileName: "QT-20260512-001-AzureTech.xlsx",
      }),
    ]);
    expect(result.quotations[0].files.map((file) => file.fileType)).not.toContain("html");
  });

  it("does not list html-only quotation artifacts", async () => {
    const quoteDir = path.join(tempRoot, "companies", "farreach", "quotations");
    fs.mkdirSync(quoteDir, { recursive: true });
    fs.writeFileSync(path.join(quoteDir, "QT-20260512-001-HtmlOnly.html"), "<h1>Total: $10.00</h1>", "utf-8");

    const { getQuotations } = await import("./quotations");
    const result = getQuotations({ search: "HtmlOnly", page: 1, pageSize: 10 });

    expect(result.quotations).toHaveLength(0);
  });

  it("uses companion JSON metadata when PDF and Excel do not have an HTML source", async () => {
    const quoteDir = path.join(tempRoot, "companies", "farreach", "quotations", "json-only");
    fs.mkdirSync(quoteDir, { recursive: true });
    fs.writeFileSync(path.join(quoteDir, "PI-20260512-003-JsonBuyer.pdf"), "pi", "utf-8");
    fs.writeFileSync(path.join(quoteDir, "PI-20260512-003-JsonBuyer.xlsx"), "excel", "utf-8");
    fs.writeFileSync(
      path.join(quoteDir, "PI-20260512-003-JsonBuyer.json"),
      JSON.stringify({
        customer: { company_name: "Json Buyer Ltd" },
        currency: "USD",
        products: [
          { description: "USB-C Charging Cable", quantity: 800, unit_price: 1.24 },
          { description: "Retail Color Box", quantity: 800, unit_price: 0.18 },
        ],
        freight: 50,
      }),
      "utf-8"
    );

    const { getQuotations } = await import("./quotations");
    const result = getQuotations({ search: "JsonBuyer", page: 1, pageSize: 10 });

    expect(result.quotations).toHaveLength(1);
    expect(result.quotations[0]).toMatchObject({
      amount: "USD 1,186.00",
      customer: "Json Buyer Ltd",
      mainProducts: "USB-C Charging Cable, Retail Color Box",
    });
  });

  it("keeps the quote page focused on quotations, sample orders, and bulk PI files", async () => {
    const docsDir = path.join(tempRoot, "companies", "farreach", "documents");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "PI-20260512-001-BulkBuyer.pdf"), "pi", "utf-8");
    fs.writeFileSync(path.join(docsDir, "PN-20260512-001-PaymentNotice.pdf"), "payment", "utf-8");

    const quoteDir = path.join(tempRoot, "companies", "farreach", "quotations");
    fs.mkdirSync(quoteDir, { recursive: true });
    fs.writeFileSync(path.join(quoteDir, "QT-20260512-002-QuoteBuyer.pdf"), "quote", "utf-8");

    const { getQuotations, getQuotationTypes } = await import("./quotations");
    const result = getQuotations({ page: 1, pageSize: 10 });
    const types = result.quotations.map((item) => item.type);

    expect(types).toContain("PI");
    expect(types).toContain("QT");
    expect(types.every((item) => ["QT", "PI", "SPL"].includes(item))).toBe(true);
    expect(result.quotations.map((item) => item.fileName)).not.toContain("PN-20260512-001-PaymentNotice.pdf");
    expect(getQuotationTypes().every((item) => ["QT", "PI", "SPL"].includes(item))).toBe(true);
  });
});
