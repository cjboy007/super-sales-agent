export interface QuickQuoteLine {
  id: string;
  description: string;
  specification: string;
  quantity: number;
  unitCost: number;
  supplier: string;
  marginPercent: number;
}

export interface QuickQuoteData {
  quoteNo: string;
  date: string;
  validUntil: string;
  seller: string;
  customer: string;
  contact: string;
  email: string;
  country: string;
  currency: string;
  incoterms: string;
  paymentTerms: string;
  leadTime: string;
  notes: string;
  charges: {
    freight: number;
    packing: number;
    discount: number;
  };
  lines: QuickQuoteLine[];
}

export interface QuickQuoteCalculatedLine extends QuickQuoteLine {
  unitPrice: number;
  amount: number;
  costAmount: number;
  profit: number;
}

export interface QuickQuoteCalculation {
  lines: QuickQuoteCalculatedLine[];
  subtotal: number;
  totalCharges: number;
  grandTotal: number;
  totalCost: number;
  totalProfit: number;
}

function safeNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function quoteNoForToday() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `QT-${date}-001`;
}

export function createQuickQuoteDefaults(): QuickQuoteData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    quoteNo: quoteNoForToday(),
    date: today,
    validUntil: "",
    seller: "FARREACH ELECTRONIC CO LIMITED",
    customer: "",
    contact: "",
    email: "",
    country: "",
    currency: "USD",
    incoterms: "FOB Shenzhen",
    paymentTerms: "T/T 30% deposit, 70% before shipment",
    leadTime: "15-25 days after deposit and sample confirmation",
    notes: "",
    charges: {
      freight: 0,
      packing: 0,
      discount: 0,
    },
    lines: [
      {
        id: "line-1",
        description: "",
        specification: "",
        quantity: 0,
        unitCost: 0,
        supplier: "",
        marginPercent: 25,
      },
    ],
  };
}

export function calculateQuickQuote(data: QuickQuoteData): QuickQuoteCalculation {
  const lines = data.lines.map((line) => {
    const quantity = safeNumber(line.quantity);
    const unitCost = safeNumber(line.unitCost);
    const marginPercent = safeNumber(line.marginPercent);
    const unitPrice = money(unitCost * (1 + marginPercent / 100));
    const amount = money(quantity * unitPrice);
    const costAmount = money(quantity * unitCost);

    return {
      ...line,
      quantity,
      unitCost,
      marginPercent,
      unitPrice,
      amount,
      costAmount,
      profit: money(amount - costAmount),
    };
  });

  const subtotal = money(lines.reduce((sum, line) => sum + line.amount, 0));
  const totalCost = money(lines.reduce((sum, line) => sum + line.costAmount, 0));
  const totalCharges = money(
    safeNumber(data.charges.freight) +
    safeNumber(data.charges.packing) -
    safeNumber(data.charges.discount)
  );
  const grandTotal = money(Math.max(0, subtotal + totalCharges));

  return {
    lines,
    subtotal,
    totalCharges,
    grandTotal,
    totalCost,
    totalProfit: money(subtotal - totalCost),
  };
}
