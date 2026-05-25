import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/documents/generate/route";

vi.mock("child_process", () => ({
  execFile: vi.fn((...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === "function") {
      callback(new Error("trade-doc script unavailable"), "", "");
    }
  }),
}));

describe("document generation fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes SSA-owned fallback HTML when the export script fails", async () => {
    const request = new Request("http://localhost/api/documents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          company: {
            name: "Farreach Electronic",
            address: "Shenzhen, CN",
            phone: "+86-755-0000",
            email: "sales@farreach.example",
          },
          customer: {
            company_name: "Acme Industrial",
            contact: "Jane Buyer",
            email: "buyer@example.com",
            phone: "+1-555-0100",
            address: "Houston, TX",
            country: "USA",
          },
          shipment: {
            date: "2026-05-23",
            vessel: "SSA Vessel",
            departure_port: "Shenzhen",
            destination_port: "Houston",
            incoterms: "FOB",
            country_of_origin: "CN",
            marks: "ACME-01",
          },
          currency: "USD",
          freight: 1200,
          insurance: 180,
          products: [
            {
              description: "USB-C cable",
              specification: "1m, black",
              hs_code: "8544.42",
              quantity: 1000,
              unit_price: 2.5,
              net_weight_kg: 120,
              gross_weight_kg: 140,
              dimensions_cm: "40x30x20",
              package_type: "Carton",
              packages: 10,
            },
          ],
          pi_info: { pi_no: "PI-20260523-001", valid_until: "2026-06-23" },
          ci_info: { ci_no: "CI-20260523-001", ci_date: "2026-05-23", payment_terms: "Net 30" },
          pl_info: { pl_no: "PL-20260523-001" },
        },
        docTypes: ["PI"],
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.fallback).toBe(true);
    expect(payload.documents).toHaveLength(1);
    expect(payload.message).toContain("SSA fallback");

    const docPath = payload.documents[0].path as string;
    expect(fs.existsSync(docPath)).toBe(true);
    const html = fs.readFileSync(docPath, "utf-8");
    expect(html).toContain("SSA fallback export");
    fs.unlinkSync(docPath);
  });
});
