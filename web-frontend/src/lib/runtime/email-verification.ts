import fs from "fs";
import { readSettings } from "../config-store";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";
import type { WorkspaceId } from "./types";

export type EmailVerificationStatus = "valid" | "risky" | "invalid" | "unknown";

export interface EmailVerificationResult {
  email: string;
  provider: "hunter";
  status: EmailVerificationStatus;
  score: number;
  checkedAt: string;
  reason?: string;
  raw?: Record<string, unknown>;
}

export interface EmailVerificationInput {
  workspaceId: WorkspaceId;
  email: string;
  forceRefresh?: boolean;
}

type VerificationCache = Record<string, EmailVerificationResult>;

const HUNTER_ENDPOINT = "https://api.hunter.io/v2/email-verifier";

function verificationCachePath(workspaceId: WorkspaceId) {
  return ensureSsaCompanyDataPath(workspaceId, "verification", "email-verifications.json");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function readVerificationCache(workspaceId: WorkspaceId): VerificationCache {
  return readJsonFile<VerificationCache>(verificationCachePath(workspaceId), {});
}

function writeVerificationCache(workspaceId: WorkspaceId, cache: VerificationCache) {
  fs.writeFileSync(verificationCachePath(workspaceId), JSON.stringify(cache, null, 2), "utf-8");
}

function result(
  email: string,
  status: EmailVerificationStatus,
  score: number,
  checkedAt = nowIso(),
  extra: Partial<EmailVerificationResult> = {}
): EmailVerificationResult {
  return {
    email,
    provider: "hunter",
    status,
    score,
    checkedAt,
    ...extra,
  };
}

function statusFromHunter(data: Record<string, unknown>): EmailVerificationStatus {
  const status = String(data.status || "").toLowerCase();
  const hunterResult = String(data.result || "").toLowerCase();
  const score = Number(data.score ?? 0);

  if (status === "valid" || hunterResult === "deliverable") return "valid";
  if (status === "invalid" || hunterResult === "undeliverable") return "invalid";
  if (status === "accept_all" || status === "webmail" || hunterResult === "risky") return "risky";
  if (score >= 90 && Boolean(data.smtp_check) && Boolean(data.mx_records)) return "valid";
  if (score > 0 && score < 60) return "risky";
  return "unknown";
}

function rawFromHunter(data: Record<string, unknown>): Record<string, unknown> {
  return {
    result: data.result,
    hunterStatus: data.status,
    regexp: data.regexp,
    gibberish: data.gibberish,
    mxRecords: data.mx_records,
    smtpServer: data.smtp_server,
    smtpCheck: data.smtp_check,
    acceptAll: data.accept_all,
    disposable: data.disposable,
    webmail: data.webmail,
  };
}

async function callHunter(email: string, apiKey: string): Promise<EmailVerificationResult> {
  const url = new URL(HUNTER_ENDPOINT);
  url.searchParams.set("email", email);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    return result(email, "unknown", 0, nowIso(), {
      reason: `Hunter verification failed with HTTP ${response.status}.`,
    });
  }

  const json = await response.json() as { data?: Record<string, unknown> };
  const data = json.data || {};
  const normalized = normalizeEmail(String(data.email || email));
  const score = Number(data.score ?? 0);
  return result(normalized, statusFromHunter(data), Number.isFinite(score) ? score : 0, nowIso(), {
    raw: rawFromHunter(data),
  });
}

export async function verifyEmailAddress(input: EmailVerificationInput): Promise<EmailVerificationResult> {
  const email = normalizeEmail(input.email);
  const settings = readSettings();
  const cache = readVerificationCache(input.workspaceId);

  if (!input.forceRefresh && cache[email]) return cache[email];

  const apiKey = process.env.HUNTER_API_KEY || settings.hunterApiKey;

  if (!apiKey) {
    const missing = result(email, "unknown", 0, nowIso(), {
      reason: "Hunter API key is not configured.",
    });
    cache[email] = missing;
    writeVerificationCache(input.workspaceId, cache);
    return missing;
  }

  try {
    const verified = await callHunter(email, apiKey);
    cache[email] = verified;
    writeVerificationCache(input.workspaceId, cache);
    return verified;
  } catch (error) {
    const failed = result(email, "unknown", 0, nowIso(), {
      reason: error instanceof Error ? `Hunter verification failed: ${error.message}` : "Hunter verification failed.",
    });
    cache[email] = failed;
    writeVerificationCache(input.workspaceId, cache);
    return failed;
  }
}

export function getCachedEmailVerification(workspaceId: WorkspaceId, email: string): EmailVerificationResult | null {
  const cache = readVerificationCache(workspaceId);
  return cache[normalizeEmail(email)] || null;
}
