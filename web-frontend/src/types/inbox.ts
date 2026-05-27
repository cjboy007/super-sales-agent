// ─── Inbox Types — Roguelike Reply System ────────────────────────────────────

export type EmailStatus =
  | "pending_analysis"
  | "pending_decision"
  | "decided"
  | "sent"
  | "skipped";

export type ReplyStyle = "steady" | "aggressive" | "creative";

export type IntentType =
  | "inquiry"
  | "inquiry_rfq"
  | "technical"
  | "order"
  | "order_confirm"
  | "negotiation"
  | "complaint"
  | "logistics"
  | "rejection"
  | "positive"
  | "follow_up"
  | "other"
  | "general";

export type UrgencyLevel = "urgent" | "high" | "medium" | "low";

export type SentimentType = "positive" | "neutral" | "negative";

export type RiskLevel = "low" | "medium" | "high";

// ─── AI Analysis ─────────────────────────────────────────────────────────────

export interface EmailAnalysis {
  intent: IntentType;
  confidence?: number;
  reasoning?: string;
  urgency: UrgencyLevel;
  sentiment: SentimentType;
  key_points: string[];
  customer_level: string;
  tags: { label: string; color: string }[];
}

// ─── Reply Option (one of three) ─────────────────────────────────────────────

export interface KeyMetrics {
  discount: string;    // e.g. "8% off"
  margin: string;      // e.g. "30.2%"
  lead_time: string;   // e.g. "15 days"
  special: string;     // e.g. "Free samples included"
}

export interface ReplyOption {
  id: string;
  style: ReplyStyle;
  icon: string;        // 🛡️ / ⚔️ / 🎲
  title: string;       // Steady / Aggressive / Creative
  subtitle: string;    // One-line description
  outline: string[];   // 4-5 strategy points
  key_metrics: KeyMetrics;
  expected_outcome: string;
  risk_level: RiskLevel;
  full_email?: string; // Only populated after user selects this option
}

// ─── User Decision ────────────────────────────────────────────────────────────

export interface Decision {
  selected_style: ReplyStyle;
  decided_at: string;
  edited: boolean;
  final_email: string;
  sent_at?: string;
}

// ─── Inbound Email ────────────────────────────────────────────────────────────

export interface InboundEmail {
  id: string;
  uid: number;
  from_email: string;
  from_name: string;
  subject: string;
  body_text: string;
  body_html?: string;
  received_at: string;
  status: EmailStatus;
  customer_id?: string;
  analysis?: EmailAnalysis;
  options?: ReplyOption[];
  decision?: Decision;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface InboxListResponse {
  success: boolean;
  data: InboundEmail[];
  total: number;
}

export interface InboxDetailResponse {
  success: boolean;
  data: InboundEmail;
}

export interface SelectStyleRequest {
  style: ReplyStyle;
}

export interface SelectStyleResponse {
  success: boolean;
  full_email: {
    subject: string;
    body: string;
    attachments?: string[];
  };
}

export interface SendEmailResponse {
  success: boolean;
  sent_at: string;
  message?: string;
}

export interface InboxStats {
  pending_decision: number;
  sent_today: number;
  reply_rate_week: number;
  avg_response_time_hours: number;
}
