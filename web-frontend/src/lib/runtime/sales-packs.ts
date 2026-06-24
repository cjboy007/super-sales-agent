import type { SalesPack, SalesPackId } from "./types";

const SALES_PACKS: SalesPack[] = [
  {
    id: "email-reply",
    name: "Email Reply Pack",
    description: "Classify inbound mail, draft replies, and keep send decisions behind confirmation checks.",
    workflows: ["email.reply"],
    sideEffects: ["email.send"],
  },
  {
    id: "follow-up",
    name: "Follow-up Pack",
    description: "Plan next touches for active leads and customers.",
    workflows: ["follow_up.plan"],
    sideEffects: ["email.send"],
  },
  {
    id: "quotation",
    name: "Quotation Pack",
    description: "Prepare quotation and PI document workflows from sales context.",
    workflows: ["quotation.prepare"],
    sideEffects: ["document.generate", "document.preview", "email.send"],
  },
  {
    id: "product-catalog",
    name: "Product Catalog Pack",
    description: "Attach product catalog context to sales memory and drafting workflows.",
    workflows: ["email.reply", "quotation.prepare"],
    sideEffects: ["data.read"],
  },
  {
    id: "payment-collection",
    name: "Payment Collection Pack",
    description: "Draft payment follow-ups and keep payment/bank operations gated.",
    workflows: ["email.reply", "follow_up.plan"],
    sideEffects: ["payment.write", "bank.read", "email.send"],
  },
  {
    id: "export-b2b",
    name: "Export B2B Pack",
    description: "Default export-sales workflows for leads, follow-ups, quotations, and customer replies.",
    workflows: ["lead.import", "company_intel.run", "email.reply", "follow_up.plan", "quotation.prepare"],
    sideEffects: ["crm.write", "data.read", "email.send", "document.generate", "document.preview"],
  },
];

export function listSalesPacks(): SalesPack[] {
  return SALES_PACKS.map((pack) => ({
    ...pack,
    workflows: [...pack.workflows],
    sideEffects: [...pack.sideEffects],
  }));
}

export function getSalesPack(id: SalesPackId): SalesPack | null {
  return listSalesPacks().find((pack) => pack.id === id) || null;
}
