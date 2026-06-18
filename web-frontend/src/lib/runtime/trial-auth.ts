import crypto from "crypto";
import fs from "fs";
import path from "path";
import { readJsonFile, ssaDataPath } from "../ssa-data-paths";
import { sendTrialSmsVerificationCode, verifyTrialSmsVerificationCode, type TrialSmsProvider } from "./trial-sms";

export const TRIAL_SESSION_COOKIE = "ssa-trial-session";
export const TRIAL_PRESENT_COOKIE = "ssa-trial-present";

export type TrialFailureReason =
  | "trial_disabled"
  | "registration_closed"
  | "invalid_phone"
  | "sms_cooldown"
  | "sms_phone_daily_limit"
  | "sms_ip_daily_limit"
  | "daily_new_user_limit"
  | "active_trial_limit"
  | "sms_unavailable"
  | "invalid_code"
  | "trial_expired"
  | "invalid_session"
  | "quota_exceeded";

export interface TrialAccessSession {
  phone: string;
  phoneHash: string;
  tokenId: string;
  workspaces: string[];
  trialStartedAt: string;
  trialExpiresAt: string;
  contactPhone: string;
}

type TrialFailure = {
  ok: false;
  reason: TrialFailureReason;
  message: string;
  contactPhone: string;
  retryAfterSeconds?: number;
};

export type TrialSmsRequestResult = ({
  ok: true;
  phone: string;
  expiresInSeconds: number;
  sentAt: string;
} | TrialFailure);

export type TrialVerifyResult = ({
  ok: true;
  session: TrialAccessSession;
  sessionToken: string;
} | TrialFailure);

export type TrialSessionResult = ({ ok: true; session: TrialAccessSession } | TrialFailure);

export type TrialQuotaResult = ({
  ok: true;
  remaining: number;
} | TrialFailure);

interface TrialRecord {
  phone: string;
  phoneHash: string;
  trialStartedAt: string;
  trialExpiresAt: string;
  createdAt: string;
  lastVerifiedAt: string;
}

interface ChallengeRecord {
  phone: string;
  phoneHash: string;
  ipHash: string;
  codeHash: string;
  provider?: TrialSmsProvider;
  externalVerification?: boolean;
  outId?: string;
  mockCode?: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

interface SmsAttemptRecord {
  phoneHash: string;
  ipHash: string;
  sentAt: string;
}

interface SessionRecord {
  sessionHash: string;
  phoneHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

interface QuotaRecord {
  phoneHash: string;
  kind: string;
  day: string;
  count: number;
}

interface TrialAccessStore {
  trials: TrialRecord[];
  challenges: ChallengeRecord[];
  smsAttempts: SmsAttemptRecord[];
  sessions: SessionRecord[];
  quotas: QuotaRecord[];
}

function now(): Date {
  return new Date();
}

function iso(date: Date): string {
  return date.toISOString();
}

function plusSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function envFlag(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function trialAccessEnabledForRuntime(): boolean {
  return envFlag(process.env.SSA_TRIAL_ACCESS_ENABLED, false);
}

export function trialRegistrationEnabledForRuntime(): boolean {
  return envFlag(process.env.SSA_TRIAL_REGISTRATION_ENABLED, true);
}

export function trialReadOnlyForRuntime(): boolean {
  return envFlag(process.env.SSA_TRIAL_READ_ONLY, false);
}

export function trialContactPhone(): string {
  return process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE?.trim() || "13680342402";
}

function trialWorkspaceId(): string {
  return process.env.SSA_TRIAL_WORKSPACE_ID?.trim() || "farreach";
}

function trialDays(): number {
  return envInt("SSA_TRIAL_DAYS", 14);
}

function smsTtlSeconds(): number {
  return envInt("SSA_TRIAL_SMS_TTL_SECONDS", 300);
}

function smsCooldownSeconds(): number {
  return envInt("SSA_TRIAL_SMS_COOLDOWN_SECONDS", 60);
}

function phoneDailySmsLimit(): number {
  return envInt("SSA_TRIAL_SMS_PHONE_DAILY_LIMIT", 3);
}

function ipDailySmsLimit(): number {
  return envInt("SSA_TRIAL_SMS_IP_DAILY_LIMIT", 10);
}

function dailyNewUserLimit(): number {
  return envInt("SSA_TRIAL_DAILY_NEW_USERS_LIMIT", 5);
}

function maxActiveTrialUsers(): number {
  return envInt("SSA_TRIAL_MAX_ACTIVE_USERS", 30);
}

function heavyDailyLimit(): number {
  return envInt("SSA_TRIAL_HEAVY_DAILY_LIMIT", 20);
}

export function normalizeCnMobilePhone(value: string): string | null {
  const compact = value.replace(/[\s-]/g, "");
  const withoutCountry = compact
    .replace(/^\+86/, "")
    .replace(/^0086/, "")
    .replace(/^86(?=1[3-9]\d{9}$)/, "");
  return /^1[3-9]\d{9}$/.test(withoutCountry) ? withoutCountry : null;
}

export function maskTrialPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function phoneHash(phone: string): string {
  return hash(`phone:${phone}`);
}

function ipHash(ip: string): string {
  return hash(`ip:${ip || "unknown"}`);
}

function codeHash(phone: string, code: string): string {
  return hash(`code:${phone}:${code}`);
}

function sessionHash(token: string): string {
  return hash(`session:${token}`);
}

function storePath(): string {
  return ssaDataPath("security", "trial-access.json");
}

function emptyStore(): TrialAccessStore {
  return { trials: [], challenges: [], smsAttempts: [], sessions: [], quotas: [] };
}

function readStore(): TrialAccessStore {
  const parsed = readJsonFile<Partial<TrialAccessStore>>(storePath(), emptyStore());
  return {
    trials: Array.isArray(parsed.trials) ? parsed.trials : [],
    challenges: Array.isArray(parsed.challenges) ? parsed.challenges : [],
    smsAttempts: Array.isArray(parsed.smsAttempts) ? parsed.smsAttempts : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    quotas: Array.isArray(parsed.quotas) ? parsed.quotas : [],
  };
}

function writeStore(store: TrialAccessStore): void {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), { encoding: "utf-8", mode: 0o600 });
}

function failure(reason: TrialFailureReason, message: string, retryAfterSeconds?: number): TrialFailure {
  return {
    ok: false,
    reason,
    message,
    contactPhone: trialContactPhone(),
    retryAfterSeconds,
  };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isAfterNow(value: string, current = now()): boolean {
  return new Date(value).getTime() > current.getTime();
}

function trialSessionFromRecord(record: TrialRecord): TrialAccessSession {
  return {
    phone: record.phone,
    phoneHash: record.phoneHash,
    tokenId: `trial-${record.phoneHash.slice(0, 12)}`,
    workspaces: [trialWorkspaceId()],
    trialStartedAt: record.trialStartedAt,
    trialExpiresAt: record.trialExpiresAt,
    contactPhone: trialContactPhone(),
  };
}

function countActiveTrials(store: TrialAccessStore, current = now()): number {
  return store.trials.filter((trial) => isAfterNow(trial.trialExpiresAt, current)).length;
}

function countNewTrialsToday(store: TrialAccessStore, current = now()): number {
  const today = dayKey(current);
  return store.trials.filter((trial) => trial.trialStartedAt.slice(0, 10) === today).length;
}

function newestChallenge(store: TrialAccessStore, normalizedPhone: string, current = now()): ChallengeRecord | null {
  return store.challenges
    .filter((challenge) => (
      challenge.phone === normalizedPhone &&
      !challenge.consumedAt &&
      new Date(challenge.expiresAt).getTime() > current.getTime()
    ))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
}

function codeValue(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

function canStartNewTrial(store: TrialAccessStore, existing: TrialRecord | undefined, current = now()): TrialFailure | null {
  if (existing) {
    if (!isAfterNow(existing.trialExpiresAt, current)) {
      return failure("trial_expired", `体验已到期，请联系 ${trialContactPhone()} 开通本地部署。`);
    }
    return null;
  }
  if (!trialRegistrationEnabledForRuntime()) {
    return failure("registration_closed", `今日体验名额已关闭，请联系 ${trialContactPhone()} 开通本地部署。`);
  }
  if (countActiveTrials(store, current) >= maxActiveTrialUsers()) {
    return failure("active_trial_limit", `体验服务繁忙，请联系 ${trialContactPhone()} 开通本地部署。`);
  }
  if (countNewTrialsToday(store, current) >= dailyNewUserLimit()) {
    return failure("daily_new_user_limit", `今日体验名额已满，请联系 ${trialContactPhone()} 开通本地部署。`);
  }
  return null;
}

export async function requestTrialSmsCode(input: { phone: string; ip?: string }): Promise<TrialSmsRequestResult> {
  if (!trialAccessEnabledForRuntime()) {
    return failure("trial_disabled", "体验版手机号验证未启用。");
  }
  const phone = normalizeCnMobilePhone(input.phone);
  if (!phone) return failure("invalid_phone", "请输入中国大陆手机号。");

  const current = now();
  const store = readStore();
  const pHash = phoneHash(phone);
  const existingTrial = store.trials.find((trial) => trial.phoneHash === pHash);
  const eligibilityFailure = canStartNewTrial(store, existingTrial, current);
  if (eligibilityFailure) return eligibilityFailure;

  const iHash = ipHash(input.ip || "");
  const today = dayKey(current);
  const phoneAttemptsToday = store.smsAttempts.filter((attempt) => attempt.phoneHash === pHash && attempt.sentAt.slice(0, 10) === today);
  const ipAttemptsToday = store.smsAttempts.filter((attempt) => attempt.ipHash === iHash && attempt.sentAt.slice(0, 10) === today);
  const lastPhoneAttempt = phoneAttemptsToday
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];
  if (lastPhoneAttempt) {
    const secondsSinceLast = Math.floor((current.getTime() - new Date(lastPhoneAttempt.sentAt).getTime()) / 1000);
    if (secondsSinceLast < smsCooldownSeconds()) {
      return failure("sms_cooldown", "验证码发送太频繁，请稍后再试。", smsCooldownSeconds() - secondsSinceLast);
    }
  }
  if (phoneAttemptsToday.length >= phoneDailySmsLimit()) {
    return failure("sms_phone_daily_limit", "该手机号今日验证码次数已达上限。");
  }
  if (ipAttemptsToday.length >= ipDailySmsLimit()) {
    return failure("sms_ip_daily_limit", "当前网络今日验证码次数已达上限。");
  }

  const code = codeValue();
  const requestedOutId = crypto.randomUUID();
  const sent = await sendTrialSmsVerificationCode(phone, code, {
    outId: requestedOutId,
    ttlSeconds: smsTtlSeconds(),
    cooldownSeconds: smsCooldownSeconds(),
  });
  if (!sent.ok) return failure("sms_unavailable", "短信验证码暂时无法发送，请稍后再试。");

  store.challenges.push({
    phone,
    phoneHash: pHash,
    ipHash: iHash,
    codeHash: sent.externalVerification ? "" : codeHash(phone, code),
    provider: sent.provider,
    ...(sent.externalVerification ? { externalVerification: true, outId: sent.outId || requestedOutId } : {}),
    ...(process.env.SSA_TRIAL_SMS_PROVIDER === "mock" || process.env.NODE_ENV === "test" ? { mockCode: code } : {}),
    createdAt: iso(current),
    expiresAt: iso(plusSeconds(current, smsTtlSeconds())),
  });
  store.smsAttempts.push({ phoneHash: pHash, ipHash: iHash, sentAt: iso(current) });
  writeStore(store);

  return {
    ok: true,
    phone,
    expiresInSeconds: smsTtlSeconds(),
    sentAt: iso(current),
  };
}

export async function verifyTrialSmsCode(input: { phone: string; code: string; ip?: string }): Promise<TrialVerifyResult> {
  if (!trialAccessEnabledForRuntime()) {
    return failure("trial_disabled", "体验版手机号验证未启用。");
  }
  const phone = normalizeCnMobilePhone(input.phone);
  if (!phone) return failure("invalid_phone", "请输入中国大陆手机号。");
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) return failure("invalid_code", "验证码无效或已过期。");

  const current = now();
  const store = readStore();
  const challenge = newestChallenge(store, phone, current);
  if (!challenge) {
    return failure("invalid_code", "验证码无效或已过期。");
  }
  if (challenge.externalVerification) {
    const verified = await verifyTrialSmsVerificationCode(phone, code, { outId: challenge.outId });
    if (!verified.ok || !verified.verified) {
      return failure("invalid_code", "验证码无效或已过期。");
    }
  } else if (challenge.codeHash !== codeHash(phone, code)) {
    return failure("invalid_code", "验证码无效或已过期。");
  }

  const pHash = phoneHash(phone);
  let trial = store.trials.find((item) => item.phoneHash === pHash);
  const eligibilityFailure = canStartNewTrial(store, trial, current);
  if (eligibilityFailure) return eligibilityFailure;

  if (!trial) {
    trial = {
      phone,
      phoneHash: pHash,
      trialStartedAt: iso(current),
      trialExpiresAt: iso(plusDays(current, trialDays())),
      createdAt: iso(current),
      lastVerifiedAt: iso(current),
    };
    store.trials.push(trial);
  } else {
    trial.lastVerifiedAt = iso(current);
  }
  challenge.consumedAt = iso(current);

  const sessionToken = crypto.randomBytes(32).toString("base64url");
  store.sessions.push({
    sessionHash: sessionHash(sessionToken),
    phoneHash: pHash,
    createdAt: iso(current),
    expiresAt: trial.trialExpiresAt,
    lastSeenAt: iso(current),
  });
  writeStore(store);

  return {
    ok: true,
    session: trialSessionFromRecord(trial),
    sessionToken,
  };
}

export function validateTrialSessionToken(token: string): TrialSessionResult {
  if (!trialAccessEnabledForRuntime()) {
    return failure("trial_disabled", "体验版手机号验证未启用。");
  }
  if (!token.trim()) return failure("invalid_session", "体验登录已失效，请重新验证手机号。");

  const current = now();
  const store = readStore();
  const session = store.sessions.find((item) => item.sessionHash === sessionHash(token.trim()));
  if (!session) {
    return failure("invalid_session", "体验登录已失效，请重新验证手机号。");
  }
  const trial = store.trials.find((item) => item.phoneHash === session.phoneHash);
  if (!trial) return failure("invalid_session", "体验登录已失效，请重新验证手机号。");
  if (!isAfterNow(session.expiresAt, current) && isAfterNow(trial.trialExpiresAt, current)) {
    return failure("invalid_session", "体验登录已失效，请重新验证手机号。");
  }
  if (!isAfterNow(trial.trialExpiresAt, current)) {
    return failure("trial_expired", `体验已到期，请联系 ${trialContactPhone()} 开通本地部署。`);
  }
  session.lastSeenAt = iso(current);
  writeStore(store);
  return { ok: true, session: trialSessionFromRecord(trial) };
}

export function consumeTrialQuota(session: TrialAccessSession, kind: "heavy" | "ai" | "document" = "heavy"): TrialQuotaResult {
  const current = now();
  if (!isAfterNow(session.trialExpiresAt, current)) {
    return failure("trial_expired", `体验已到期，请联系 ${trialContactPhone()} 开通本地部署。`);
  }
  const normalizedKind = kind === "ai" || kind === "document" ? kind : "heavy";
  const limit = heavyDailyLimit();
  const store = readStore();
  const today = dayKey(current);
  const existing = store.quotas.find((quota) => (
    quota.phoneHash === session.phoneHash &&
    quota.kind === normalizedKind &&
    quota.day === today
  ));
  const currentCount = existing?.count || 0;
  if (currentCount >= limit) {
    return failure("quota_exceeded", "今日体验额度已用完，请稍后再试或联系开通本地部署。");
  }
  if (existing) existing.count += 1;
  else store.quotas.push({ phoneHash: session.phoneHash, kind: normalizedKind, day: today, count: 1 });
  writeStore(store);
  return { ok: true, remaining: limit - currentCount - 1 };
}
