import { describe, expect, it } from "vitest";
import { buildQuickQuoteReference } from "./quick-quote-reference";
import type { Lead } from "./leads";
import type { Quotation } from "./quotations";
import type { PiRecord, TradeDocumentData } from "./runtime/documents";

function lead(overrides: Partial<Lead>): Lead {
  return {
    companyName: "",
    country: "",
    industry: "",
    contact: "",
    position: "",
    email: "",
    homepage: "",
    category: "A",
    reason: "",
    confidence: "",
    score: "Hot",
    ...overrides,
  };
}

function quote(overrides: Partial<Quotation>): Quotation {
  return {
    id: "QT-20260501-001",
    type: "QT",
    customer: "",
    amount: "—",
    status: "Draft",
    date: "2026-05-01",
    filePath: "/tmp/QT-20260501-001.html",
    fileName: "QT-20260501-001.html",
    fileType: "html",
    mainProducts: "—",
    files: [],
    ...overrides,
  };
}

function tradeData(customer: string, product: string, unitPrice: number, quantity = 100): TradeDocumentData {
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
        quantity,
        unit_price: unitPrice,
        net_weight_kg: 0,
        gross_weight_kg: 0,
        dimensions_cm: "",
        package_type: "Carton",
        packages: 1,
      },
    ],
    pi_info: { pi_no: "PI-20260520-001", valid_until: "" },
    ci_info: { ci_no: "", ci_date: "", payment_terms: "T/T" },
    pl_info: { pl_no: "" },
  };
}

function piRecord(overrides: Partial<PiRecord> & { data: TradeDocumentData }): PiRecord {
  return {
    piNo: overrides.data.pi_info.pi_no,
    customer: overrides.data.customer.company_name,
    date: overrides.data.shipment.date,
    amount: `${overrides.data.currency} ${(overrides.data.products[0].quantity * overrides.data.products[0].unit_price).toFixed(2)}`,
    productSummary: overrides.data.products[0].description,
    updatedAt: "2026-05-21T00:00:00.000Z",
    source: "test",
    ...overrides,
  };
}

describe("quick quote references", () => {
  it("returns fuzzy customer suggestions from leads, PI records, and quotations", () => {
    const result = buildQuickQuoteReference({
      query: "amph",
      products: [],
      leads: [
        lead({ companyName: "Amphenol Asia", contact: "Li Wei", email: "li@amphenol.example", country: "China" }),
      ],
      quotations: [
        quote({ id: "QT-20260501-002-Amphenol", customer: "Amphenol Global", mainProducts: "USB-C cable" }),
      ],
      piRecords: [
        piRecord({ data: tradeData("Amphenol Shenzhen", "USB-C cable", 1.2) }),
      ],
    });

    expect(result.customerSuggestions.map((item) => item.name)).toEqual([
      "Amphenol Asia",
      "Amphenol Shenzhen",
      "Amphenol Global",
    ]);
    expect(result.customerSuggestions[0]).toMatchObject({
      contact: "Li Wei",
      email: "li@amphenol.example",
      source: "lead",
    });
  });

  it("keeps price references empty because prices are loaded from local price memory", () => {
    const result = buildQuickQuoteReference({
      query: "Amphenol",
      products: ["USB-C cable"],
      leads: [],
      quotations: [],
      piRecords: [
        piRecord({ data: tradeData("Amphenol Asia", "USB-C cable", 1.25, 500) }),
        piRecord({ data: tradeData("Molex Shanghai", "USB-C cable", 1.38, 200) }),
        piRecord({ data: tradeData("Other Buyer", "HDMI adapter", 3.5, 50) }),
      ],
    });

    expect(result.customerPriceReferences).toEqual([]);
    expect(result.similarProductReferences).toEqual([]);
  });
});
