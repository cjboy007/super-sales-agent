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
  it("exposes visible file names and summarizes main products from HTML quotes", async () => {
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

    const { getQuotations } = await import("./quotations");
    const result = getQuotations({ search: "USB-C", page: 1, pageSize: 10 });

    expect(result.quotations).toHaveLength(1);
    expect(result.quotations[0]).toMatchObject({
      fileName: "QT-20260512-001-AzureTech.html",
      fileType: "html",
      mainProducts: "HDMI 2.1 Ultra High Speed Cable 2m, DisplayPort 1.4 Cable 1.5m, USB-C to HDMI Adapter",
      status: "Sent",
      amount: "$5,850.00",
    });
  });
});
