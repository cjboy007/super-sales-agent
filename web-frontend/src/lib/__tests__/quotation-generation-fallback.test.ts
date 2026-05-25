import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/quotations/generate/route";
import { deleteQuoteRecord, getQuoteRecords } from "../db";

vi.mock("child_process", () => ({
  execFile: vi.fn((...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === "function") {
      callback(new Error("quotation export script unavailable"), "", "");
    }
  }),
}));

describe("quotation generation fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores an SSA-owned quote record when the export script is unavailable", async () => {
    const request = new Request("http://localhost/api/quotations/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "QT",
        customer: "Acme Industrial",
        items: [{ name: "USB-C cable", qty: 100, unitPrice: 2.5 }],
        terms: "Net 30",
        notes: "Fallback test",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.fallback).toBe(true);
    expect(payload.quotationNo).toMatch(/^QT-/);
    expect(payload.files).toEqual([]);

    const records = getQuoteRecords({ search: payload.quotationNo });
    const record = records.find((item) => item.id === payload.quotationNo);
    expect(record).toBeTruthy();
    expect(record?.metadata?.fallback).toBe(true);

    deleteQuoteRecord(payload.quotationNo);
  });
});
