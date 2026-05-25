import { getConfig } from "./config";
import { requestSideEffect, SideEffectResult } from "./side-effect-gate";

export interface OkkiConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  timeout: number;
  enabled: boolean;
}

export interface OkkiCompany {
  companyId: string;
  serialId?: string;
  companyName: string;
  contact?: string;
  contactEmail?: string;
  phone?: string;
  country?: string;
  industry?: string;
}

export interface OkkiTrailData {
  companyId: string;
  remarkType: number;
  content: string;
  subject?: string;
  attachments?: string[];
}

export type TrailType = "email" | "quotation" | "order" | "meeting" | "social";

const TRAIL_TYPE_MAP: Record<TrailType, number> = {
  email: 102,
  quotation: 101,
  order: 103,
  meeting: 104,
  social: 105,
};

export function getOkkiConfig(): OkkiConfig {
  return {
    apiKey: process.env.OKKI_API_KEY || "",
    apiSecret: process.env.OKKI_API_SECRET || "",
    baseUrl: process.env.OKKI_API_BASE_URL || "https://api.okki.com",
    timeout: Number(process.env.OKKI_TIMEOUT) || 10000,
    enabled: !!process.env.OKKI_API_KEY && !!process.env.OKKI_API_SECRET,
  };
}

export function isOkkiAvailable(): boolean {
  return getOkkiConfig().enabled;
}

export function matchCustomerByEmail(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return domain;
}

export async function getCompany(companyId: string): Promise<OkkiCompany | null> {
  const config = getOkkiConfig();
  if (!config.enabled) return null;

  const gate = requestSideEffect({
    type: "okki_sync",
    target: `okki:getCompany:${companyId}`,
    payload: { companyId },
    requestedBy: "okki-adapter",
  });

  if (gate.blocked) return null;

  const url = `${config.baseUrl}/v1/companies/${companyId}`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": config.apiKey,
      "X-API-Secret": config.apiSecret,
    },
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return normalizeCompany(data);
}

export async function createTrail(
  trailType: TrailType,
  data: Omit<OkkiTrailData, "remarkType">,
  approvalId?: string
): Promise<SideEffectResult> {
  const config = getOkkiConfig();
  if (!config.enabled) {
    return {
      executed: false,
      blocked: true,
      reason: "OKKI not configured (missing API credentials)",
      timestamp: new Date().toISOString(),
      request: {
        type: "okki_sync",
        target: `okki:createTrail:${data.companyId}`,
        payload: data as unknown as Record<string, unknown>,
        requestedBy: "okki-adapter",
      },
    };
  }

  const gate = requestSideEffect({
    type: "okki_sync",
    target: `okki:createTrail:${trailType}:${data.companyId}`,
    payload: { ...data, remarkType: TRAIL_TYPE_MAP[trailType] },
    approvalId,
    requestedBy: "okki-adapter",
  });

  if (gate.blocked) return gate;

  const url = `${config.baseUrl}/v1/remarks`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
      "X-API-Secret": config.apiSecret,
    },
    body: JSON.stringify({
      company_id: data.companyId,
      remark_type: TRAIL_TYPE_MAP[trailType],
      content: data.content,
      subject: data.subject || "",
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  return {
    ...gate,
    executed: res.ok,
    reason: res.ok ? "Trail created" : `OKKI API error: ${res.status}`,
  };
}

function normalizeCompany(raw: Record<string, unknown>): OkkiCompany {
  return {
    companyId: String(raw.company_id || raw.companyId || ""),
    serialId: raw.serial_id ? String(raw.serial_id) : undefined,
    companyName: String(raw.company_name || raw.name || ""),
    contact: raw.contact ? String(raw.contact) : undefined,
    contactEmail: raw.contact_email ? String(raw.contact_email) : undefined,
    phone: raw.phone ? String(raw.phone) : undefined,
    country: raw.country ? String(raw.country) : undefined,
    industry: raw.industry ? String(raw.industry) : undefined,
  };
}
