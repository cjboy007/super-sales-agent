import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TradeDocumentData } from "./documents";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

function tradeData(customer: string, product: string, specification: string, unitPrice: number, quantity = 100): TradeDocumentData {
  return {
    company: { name: "Seller", address: "", phone: "", email: "" },
    customer: {
      company_name: customer,
      contact: "Ada",
      email: "ada@example.com",
      phone: "",
      address: "",
      country: "USA",
    },
    shipment: {
      date: "2026-05-20",
      vessel: "",
      departure_port: "Shenzhen",
      destination_port: "Los Angeles",
      incoterms: "FOB",
      country_of_origin: "China",
      marks: "N/M",
    },
    currency: "USD",
    freight: 0,
    insurance: 0,
    products: [
      {
        description: product,
        specification,
        hs_code: "854442",
        quantity,
        unit_price: unitPrice,
        net_weight_kg: 0,
        gross_weight_kg: 0,
        dimensions_cm: "",
        package_type: "Carton",
        packages: 1,
      },
    ],
    pi_info: { pi_no: `PI-${customer.replace(/\W+/g, "-")}`, valid_until: "" },
    ci_info: { ci_no: "", ci_date: "", payment_terms: "T/T" },
    pl_info: { pl_no: "" },
  };
}

function tradeDataWithInternalCost(): TradeDocumentData {
  const data = tradeData("Local Buyer", "USB-C cable", "2m / black", 1.25, 500);
  data.products[0] = {
    ...data.products[0],
    unit_cost: 0.82,
    cost_currency: "USD",
    supplier: "Shenzhen Cable Factory",
    supplier_candidates: ["Shenzhen Cable Factory", "Dongguan Backup Cable"],
  };
  return data;
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-price-memory-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("local price memory", () => {
  it("records one searchable price row per PI product line", async () => {
    const { recordPiPrices, listPriceMemory } = await import("./price-memory");
    const data = tradeData("Local Buyer", "USB-C cable", "2m / black", 1.25, 500);

    recordPiPrices("demo-exporter", data, "documents.generate");
    const rows = listPriceMemory("demo-exporter");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspaceId: "demo-exporter",
      customer: "Local Buyer",
      contact: "Ada",
      email: "ada@example.com",
      product: "USB-C cable",
      specification: "2m / black",
      model: "2m / black",
      quantity: 500,
      unitPrice: 1.25,
      unitCost: 0,
      costCurrency: "USD",
      supplier: "",
      supplierCandidates: [],
      currency: "USD",
      piNo: "PI-Local-Buyer",
      source: "documents.generate",
    });
  });

  it("records internal cost and supplier context with each PI price row", async () => {
    const { recordPiPrices, listPriceMemory, findPriceReferences } = await import("./price-memory");

    recordPiPrices("demo-exporter", tradeDataWithInternalCost(), "documents.generate");
    const rows = listPriceMemory("demo-exporter");
    const references = findPriceReferences("demo-exporter", {
      customer: "Local",
      products: ["USB-C cable"],
    });

    expect(rows[0]).toMatchObject({
      unitPrice: 1.25,
      unitCost: 0.82,
      costCurrency: "USD",
      supplier: "Shenzhen Cable Factory",
      supplierCandidates: ["Shenzhen Cable Factory", "Dongguan Backup Cable"],
    });
    expect(references.customerPriceReferences[0]).toMatchObject({
      unitPrice: 1.25,
      unitCost: 0.82,
      costCurrency: "USD",
      supplier: "Shenzhen Cable Factory",
      supplierCandidates: ["Shenzhen Cable Factory", "Dongguan Backup Cable"],
    });
  });

  it("finds same-customer and similar product references from the local price database", async () => {
    const { recordPiPrices, findPriceReferences } = await import("./price-memory");
    recordPiPrices("demo-exporter", tradeData("Local Buyer", "USB-C cable", "2m / black", 1.25, 500), "documents.generate");
    recordPiPrices("demo-exporter", tradeData("Other Buyer", "USB-C cable", "1m / white", 1.38, 200), "documents.generate");
    recordPiPrices("demo-exporter", tradeData("Other Buyer", "HDMI adapter", "4K", 3.5, 80), "documents.generate");

    const references = findPriceReferences("demo-exporter", {
      customer: "Local",
      products: ["USB-C cable"],
    });

    expect(references.customerPriceReferences).toEqual([
      expect.objectContaining({
        kind: "customer",
        customer: "Local Buyer",
        product: "USB-C cable / 2m / black",
        unitPrice: 1.25,
        source: "PI-Local-Buyer",
      }),
    ]);
    expect(references.similarProductReferences).toEqual([
      expect.objectContaining({
        kind: "similar",
        customer: "Other Buyer",
        product: "USB-C cable / 1m / white",
        unitPrice: 1.38,
      }),
    ]);
  });

  it("reuses cached local price rows while the price memory file is unchanged", async () => {
    const dir = path.join(tempRoot, "companies", "demo-exporter", "pricing");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "price-memory.json"),
      JSON.stringify([
        {
          id: "PI-1:0:usb-c-cable",
          workspaceId: "demo-exporter",
          customer: "Local Buyer",
          contact: "Ada",
          email: "ada@example.com",
          country: "USA",
          product: "USB-C cable",
          specification: "2m / black",
          model: "2m / black",
          hsCode: "854442",
          quantity: 500,
          unitPrice: 1.25,
          unitCost: 0.82,
          costCurrency: "USD",
          supplier: "Shenzhen Cable Factory",
          supplierCandidates: ["Shenzhen Cable Factory"],
          currency: "USD",
          piNo: "PI-1",
          date: "2026-05-20",
          incoterms: "FOB",
          source: "test",
          updatedAt: "2026-05-21T00:00:00.000Z",
        },
      ]),
      "utf-8"
    );
    const { listPriceMemory } = await import("./price-memory");
    const readSpy = vi.spyOn(fs, "readFileSync");

    expect(listPriceMemory("demo-exporter")).toHaveLength(1);
    expect(listPriceMemory("demo-exporter")).toHaveLength(1);

    const priceMemoryReads = readSpy.mock.calls.filter(([filePath]) => String(filePath).endsWith("price-memory.json"));
    expect(priceMemoryReads).toHaveLength(1);
    readSpy.mockRestore();
  });

  it("keeps weak customer token matches in similar product references", async () => {
    const { recordPiPrices, findPriceReferences } = await import("./price-memory");
    recordPiPrices("demo-exporter", tradeData("Cable House", "USB-C cable", "2m / black", 1.25, 500), "documents.generate");

    const references = findPriceReferences("demo-exporter", {
      customer: "ACME Cable",
      products: ["USB-C cable"],
    });

    expect(references.customerPriceReferences).toHaveLength(0);
    expect(references.similarProductReferences).toEqual([
      expect.objectContaining({
        kind: "similar",
        customer: "Cable House",
      }),
    ]);
  });
});
