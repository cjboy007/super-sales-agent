// ─── Trade Documents Integration Types ────────────────────────────────────

export interface TradeProduct {
  description: string;
  specification: string;
  hs_code: string;
  quantity: number;
  unit_price: number;
  net_weight_kg: number;
  gross_weight_kg: number;
  dimensions_cm: string;
  package_type: string;
  packages: number;
}

export interface TradeDocumentData {
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
  customer: {
    company_name: string;
    contact: string;
    email: string;
    phone: string;
    address: string;
    country: string;
  };
  shipment: {
    date: string;
    vessel: string;
    departure_port: string;
    destination_port: string;
    incoterms: string;
    country_of_origin: string;
    marks: string;
  };
  currency: string;
  freight: number;
  insurance: number;
  products: TradeProduct[];
  pi_info: {
    pi_no: string;
    valid_until: string;
  };
  ci_info: {
    ci_no: string;
    ci_date: string;
    payment_terms: string;
  };
  pl_info: {
    pl_no: string;
  };
}

export type DocType = "PI" | "CI" | "PL" | "ALL";

export interface GenerateResult {
  success: boolean;
  documents: {
    type: string;
    filename: string;
    path: string;
    size: number;
    created?: string;
  }[];
  error?: string;
}

export interface HistoryDoc {
  type: string;
  filename: string;
  path: string;
  size: number;
  created: string;
}

// ─── Default template ─────────────────────────────────────────────────────

export function createDefaultTradeData(): TradeDocumentData {
  const today = new Date().toISOString().split("T")[0];
  const dateNum = today.replace(/-/g, "");
  return {
    company: {
      name: "FARREACH ELECTRONIC CO LIMITED",
      address: "No. 6, Chuangye Road East, Shuanglinpian, Liangang Industrial Zone, Zhuhai, China",
      phone: "",
      email: "",
    },
    customer: {
      company_name: "",
      contact: "",
      email: "",
      phone: "",
      address: "",
      country: "",
    },
    shipment: {
      date: today,
      vessel: "",
      departure_port: "Shenzhen, China",
      destination_port: "",
      incoterms: "FOB Shenzhen",
      country_of_origin: "China",
      marks: "N/M",
    },
    currency: "USD",
    freight: 0,
    insurance: 0,
    products: [
      {
        description: "",
        specification: "",
        hs_code: "",
        quantity: 0,
        unit_price: 0,
        net_weight_kg: 0,
        gross_weight_kg: 0,
        dimensions_cm: "",
        package_type: "Carton",
        packages: 0,
      },
    ],
    pi_info: {
      pi_no: `PI-${dateNum}-001`,
      valid_until: "",
    },
    ci_info: {
      ci_no: `CI-${dateNum}-001`,
      ci_date: today,
      payment_terms: "T/T 30% deposit, 70% before shipment",
    },
    pl_info: {
      pl_no: `PL-${dateNum}-001`,
    },
  };
}

// ─── Auto-numbering ───────────────────────────────────────────────────────

export function autoNumberDocs(docType: DocType): { pi_no: string; ci_no: string; pl_no: string } {
  const today = new Date().toISOString().split("T")[0];
  const dateNum = today.replace(/-/g, "");
  return {
    pi_no: `PI-${dateNum}-001`,
    ci_no: `CI-${dateNum}-001`,
    pl_no: `PL-${dateNum}-001`,
  };
}
