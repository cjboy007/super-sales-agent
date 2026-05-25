// ── Approval Engine for SSA Battle Station ──
// Rules, state machine, and persistence for human-gated decisions.

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type ApprovalTrigger =
  | "price_discount"      // discount exceeds threshold
  | "new_customer_first"  // first order from new account
  | "high_value"          // order value above floor
  | "competitor_detected" // undercut signal from rival
  | "payment_terms"       // non-standard terms (e.g. Net 120)
  | "margin_below_floor"  // computed margin below minimum
  | "manual";             // human-initiated

export interface ApprovalRule {
  id: string;
  name: string;
  trigger: ApprovalTrigger;
  description: string;
  // Threshold config — each trigger type has its own shape
  threshold: Record<string, number | string | boolean>;
  enabled: boolean;
  // Escalation: auto-expire after N hours if no human response
  autoExpireHours: number;
}

export interface ApprovalRequestRecord {
  id: string;
  dealId: string;
  account: string;
  title: string;
  trigger: ApprovalTrigger;
  value: string;
  risk: string;
  due: string;
  recommendation: string;
  guardrail: string;
  status: ApprovalStatus;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  // Optional: who approved/rejected and why
  decisionBy?: string;
  decisionNote?: string;
  // Optional: metadata for audit trail
  metadata?: Record<string, unknown>;
}

// ── Default Rules (Farreach cable trading) ──
export const DEFAULT_RULES: ApprovalRule[] = [
  {
    id: "rule-discount-5",
    name: "Discount above 5%",
    trigger: "price_discount",
    description: "Any customer-facing discount exceeding 5% requires human review",
    threshold: { discount_pct: 5 },
    enabled: true,
    autoExpireHours: 4,
  },
  {
    id: "rule-discount-10",
    name: "Discount above 10%",
    trigger: "price_discount",
    description: "Double-digit discount blocks send entirely until Wilson approves",
    threshold: { discount_pct: 10 },
    enabled: true,
    autoExpireHours: 2,
  },
  {
    id: "rule-new-customer",
    name: "New customer first order",
    trigger: "new_customer_first",
    description: "First PO from a new account — verify terms before committing",
    threshold: { min_po_count: 1 },
    enabled: true,
    autoExpireHours: 24,
  },
  {
    id: "rule-high-value",
    name: "Order above $500K",
    trigger: "high_value",
    description: "Any single PO above $500K requires human sign-off",
    threshold: { value_usd: 500_000 },
    enabled: true,
    autoExpireHours: 8,
  },
  {
    id: "rule-competitor",
    name: "Competitor undercut detected",
    trigger: "competitor_detected",
    description: "When AI detects rival pricing below our quote, flag for strategy review",
    threshold: { price_diff_pct: 10 },
    enabled: true,
    autoExpireHours: 6,
  },
  {
    id: "rule-payment-terms",
    name: "Non-standard payment terms",
    trigger: "payment_terms",
    description: "Terms beyond Net 60 require approval",
    threshold: { max_days: 60 },
    enabled: true,
    autoExpireHours: 12,
  },
  {
    id: "rule-margin-floor",
    name: "Margin below floor (15%)",
    trigger: "margin_below_floor",
    description: "Computed margin after discount drops below 15% gross margin floor",
    threshold: { min_margin_pct: 15 },
    enabled: true,
    autoExpireHours: 2,
  },
];
