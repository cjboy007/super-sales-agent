import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TradeDocumentData } from "@/lib/runtime/documents";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

function request(url: string): NextRequest {
  return new NextRequest(url);
}

function tradeData(customer: string, product: string, unitPrice: number): TradeDocumentData {
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
        specification: "2m / black",
        hs_code: "",
        quantity: 500,
        unit_price: unitPrice,
        unit_cost: customer === "Local Buyer" ? 0.82 : 0.93,
        cost_currency: "USD",
        supplier: customer === "Local Buyer" ? "Shenzhen Cable Factory" : "Dongguan Backup Cable",
        supplier_candidates: customer === "Local Buyer"
          ? ["Shenzhen Cable Factory", "Dongguan Backup Cable"]
          : ["Dongguan Backup Cable"],
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

function writePiRecord(workspaceId: string, data: TradeDocumentData) {
  const dir = path.join(tempRoot, "companies", workspaceId, "documents", "pi-records");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${data.pi_info.pi_no}.json`),
    JSON.stringify({
      piNo: data.pi_info.pi_no,
      customer: data.customer.company_name,
      date: data.shipment.date,
      amount: `${data.currency} ${(data.products[0].quantity * data.products[0].unit_price).toFixed(2)}`,
      productSummary: data.products[0].description,
      updatedAt: "2026-05-21T00:00:00.000Z",
      source: "test",
      data,
    }),
    "utf-8"
  );
}

async function recordPrice(workspaceId: string, data: TradeDocumentData) {
  const { recordPiPrices } = await import("@/lib/runtime/price-memory");
  recordPiPrices(workspaceId, data, "test.pi-memory");
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-quick-quote-reference-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  const leadsDir = path.join(tempRoot, "companies", "demo-exporter", "leads");
  fs.mkdirSync(leadsDir, { recursive: true });
  fs.writeFileSync(
    path.join(leadsDir, "crm.csv"),
    [
      "company,contact_name,email,website,country,industry,tier,position,confidence",
      "Local Buyer,Ada,ada@local.example,https://local.example,USA,Electronics,Tier1 Buyer,Owner,92%",
    ].join("\n"),
    "utf-8"
  );
  writePiRecord("demo-exporter", tradeData("Local Buyer", "USB-C cable", 1.25));
  writePiRecord("demo-exporter", tradeData("Other Buyer", "USB-C cable", 1.38));
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  vi.unstubAllGlobals();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/documents/quick-quote/reference route", () => {
  it("returns customer suggestions, historical prices, similar prices, and exchange rates", async () => {
    await recordPrice("demo-exporter", tradeData("Local Buyer", "USB-C cable", 1.25));
    await recordPrice("demo-exporter", tradeData("Other Buyer", "USB-C cable", 1.38));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      date: "2026-06-01",
      rates: { CNY: 7.2, EUR: 0.92, GBP: 0.78 },
    }), { status: 200 })));

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/documents/quick-quote/reference?project=demo-exporter&customer=Local&products=USB-C%20cable&currency=EUR"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.customerSuggestions[0]).toMatchObject({
      name: "Local Buyer",
      contact: "Ada",
      email: "ada@local.example",
    });
    expect(json.data.customerPriceReferences).toEqual([
      expect.objectContaining({
        customer: "Local Buyer",
        unitPrice: 1.25,
        unitCost: 0.82,
        supplier: "Shenzhen Cable Factory",
        supplierCandidates: ["Shenzhen Cable Factory", "Dongguan Backup Cable"],
        source: "PI-Local-Buyer",
      }),
    ]);
    expect(json.data.similarProductReferences).toEqual([
      expect.objectContaining({
        customer: "Other Buyer",
        unitPrice: 1.38,
        unitCost: 0.93,
        supplier: "Dongguan Backup Cable",
        source: "PI-Other-Buyer",
      }),
    ]);
    expect(json.data.exchangeRate).toMatchObject({
      status: "available",
      base: "USD",
      quoteCurrency: "EUR",
      rates: { CNY: 7.2, EUR: 0.92, GBP: 0.78 },
      provider: "Frankfurter",
    });
  });

  it("keeps reference data available when the exchange rate provider fails", async () => {
    await recordPrice("demo-exporter", tradeData("Local Buyer", "USB-C cable", 1.25));
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/documents/quick-quote/reference?project=demo-exporter&customer=Local&products=USB-C%20cable"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.customerSuggestions).toHaveLength(1);
    expect(json.data.exchangeRate).toMatchObject({
      status: "unavailable",
      base: "USD",
      quoteCurrency: "USD",
    });
  });

  it("reuses exchange rates for repeated reference requests inside the cache window", async () => {
    await recordPrice("demo-exporter", tradeData("Local Buyer", "USB-C cable", 1.25));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      date: "2026-06-01",
      rates: { CNY: 7.2, EUR: 0.92, GBP: 0.78 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    await GET(request("http://localhost/api/documents/quick-quote/reference?project=demo-exporter&customer=Local&products=USB-C%20cable&currency=USD"));
    await GET(request("http://localhost/api/documents/quick-quote/reference?project=demo-exporter&customer=Local&products=USB-C%20cable&currency=EUR"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("supports scoped customer suggestion requests without loading price memory or exchange rates", async () => {
    await recordPrice("demo-exporter", tradeData("Local Buyer", "USB-C cable", 1.25));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      date: "2026-06-01",
      rates: { CNY: 7.2, EUR: 0.92, GBP: 0.78 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/documents/quick-quote/reference?project=demo-exporter&scope=customers&customer=Local"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.customerSuggestions).toHaveLength(1);
    expect(json.data.customerPriceReferences).toEqual([]);
    expect(json.data.similarProductReferences).toEqual([]);
    expect(json.data.exchangeRate).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supports scoped price requests without loading customer suggestions or exchange rates", async () => {
    await recordPrice("demo-exporter", tradeData("Local Buyer", "USB-C cable", 1.25));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      date: "2026-06-01",
      rates: { CNY: 7.2, EUR: 0.92, GBP: 0.78 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/documents/quick-quote/reference?project=demo-exporter&scope=prices&customer=Local&products=USB-C%20cable"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.customerSuggestions).toEqual([]);
    expect(json.data.customerPriceReferences).toHaveLength(1);
    expect(json.data.exchangeRate).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supports scoped exchange-rate requests without loading customer or price references", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      date: "2026-06-01",
      rates: { CNY: 7.2, EUR: 0.92, GBP: 0.78 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/documents/quick-quote/reference?project=demo-exporter&scope=exchange&currency=EUR"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.customerSuggestions).toEqual([]);
    expect(json.data.customerPriceReferences).toEqual([]);
    expect(json.data.similarProductReferences).toEqual([]);
    expect(json.data.exchangeRate).toMatchObject({ quoteCurrency: "EUR", rates: { CNY: 7.2 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
