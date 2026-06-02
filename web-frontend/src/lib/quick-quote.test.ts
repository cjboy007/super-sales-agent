import { describe, expect, it } from "vitest";
import { calculateQuickQuote, createQuickQuoteDefaults } from "./quick-quote";

describe("quick quote calculations", () => {
  it("calculates line totals, subtotal, charges, and grand total", () => {
    const quote = createQuickQuoteDefaults();
    quote.lines = [
      { id: "1", description: "USB-C Cable", specification: "1m braided", quantity: 1000, unitCost: 1.2, supplier: "Shenzhen Cable Factory", marginPercent: 25 },
      { id: "2", description: "HDMI Cable", specification: "2m", quantity: 500, unitCost: 2, supplier: "Dongguan Backup Cable", marginPercent: 30 },
    ];
    quote.charges.freight = 120;
    quote.charges.packing = 30;
    quote.charges.discount = 50;

    const result = calculateQuickQuote(quote);

    expect(result.lines[0]).toMatchObject({
      supplier: "Shenzhen Cable Factory",
      unitPrice: 1.5,
      amount: 1500,
      profit: 300,
    });
    expect(result.lines[1]).toMatchObject({
      unitPrice: 2.6,
      amount: 1300,
      profit: 300,
    });
    expect(result.subtotal).toBe(2800);
    expect(result.totalCharges).toBe(100);
    expect(result.grandTotal).toBe(2900);
    expect(result.totalProfit).toBe(600);
  });

  it("keeps invalid or empty numeric inputs safe", () => {
    const quote = createQuickQuoteDefaults();
    quote.lines = [
      { id: "1", description: "", specification: "", quantity: -5, unitCost: Number.NaN, supplier: "", marginPercent: -10 },
    ];
    quote.charges.freight = Number.NaN;
    quote.charges.discount = -25;

    const result = calculateQuickQuote(quote);

    expect(result.lines[0].unitPrice).toBe(0);
    expect(result.lines[0].amount).toBe(0);
    expect(result.totalCharges).toBe(0);
    expect(result.grandTotal).toBe(0);
  });
});
