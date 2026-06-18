import crypto from "crypto";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readJsonFile, ssaDataPath } from "../ssa-data-paths";
import { isBetaAuthRequiredForRuntime } from "./local-gateway";
import {
  TRIAL_SESSION_COOKIE,
  type TrialAccessSession,
  trialAccessEnabledForRuntime,
  trialReadOnlyForRuntime,
  validateTrialSessionToken,
} from "./trial-auth";

export interface BetaAuthSession {
  tokenId: string;
  workspaces: string[];
  trial?: TrialAccessSession;
}

interface BetaTokenConfig {
  token: string;
  workspaces: string[];
  name?: string;
  maxRedemptions?: number;
}

type AuthSuccess = { ok: true; session: BetaAuthSession };
type AuthFailure = { ok: false; response: NextResponse };
export type AuthResult = AuthSuccess | AuthFailure;
type RedemptionResult = { ok: true } | AuthFailure;
type WorkspaceAuthSuccess = AuthSuccess & { workspaceId: string; explicitWorkspace: boolean };
export type WorkspaceAuthResult = WorkspaceAuthSuccess | AuthFailure;

export interface BetaAccessSessionView {
  workspaces: string[];
  defaultWorkspace: string | null;
  wildcard: boolean;
}

function authFailure(status: number, message: string): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json({ success: false, error: message }, { status }),
  };
}

function configuredTokens(): BetaTokenConfig[] {
  const multi = process.env.SSA_BETA_AUTH_TOKENS;
  if (multi?.trim()) {
    try {
      const parsed = JSON.parse(multi) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
          .filter(Boolean)
          .map((item) => ({
            token: typeof item?.token === "string" ? item.token : "",
            name: typeof item?.name === "string" ? item.name : undefined,
            maxRedemptions: normalizeRedemptionLimit(item?.maxRedemptions ?? item?.maxUses),
            workspaces: Array.isArray(item?.workspaces)
              ? item.workspaces.filter((workspace): workspace is string => typeof workspace === "string" && Boolean(workspace.trim()))
              : ["*"],
          }))
          .filter((item) => item.token);
      }
    } catch {
      return [];
    }
  }

  const single = process.env.SSA_BETA_AUTH_TOKEN;
  if (single?.trim()) return [{ token: single.trim(), workspaces: ["*"], name: "single-token" }];
  const fileConfig = readJsonFile<{ tokens?: unknown } | unknown[]>(ssaDataPath("security", "beta-auth.json"), {});
  const fileTokens = Array.isArray(fileConfig)
    ? normalizeTokenConfigs(fileConfig)
    : fileConfig && typeof fileConfig === "object" && !Array.isArray(fileConfig)
      ? normalizeTokenConfigs((fileConfig as { tokens?: unknown }).tokens)
      : [];
  if (fileTokens.length > 0) return fileTokens;
  return [];
}

function normalizeTokenConfigs(value: unknown): BetaTokenConfig[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
    .filter(Boolean)
    .map((item) => ({
      token: typeof item?.token === "string" ? item.token.trim() : "",
      name: typeof item?.name === "string" ? item.name.trim() : undefined,
      maxRedemptions: normalizeRedemptionLimit(item?.maxRedemptions ?? item?.maxUses),
      workspaces: Array.isArray(item?.workspaces)
        ? item.workspaces.filter((workspace): workspace is string => typeof workspace === "string" && Boolean(workspace.trim()))
        : ["*"],
    }))
    .filter((item) => item.token.length > 0)
    .map((item) => ({
      ...item,
      workspaces: item.workspaces.length ? item.workspaces : ["*"],
    }));
}

function normalizeRedemptionLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(numeric)) return undefined;
  const whole = Math.floor(numeric);
  return whole > 0 ? whole : undefined;
}

function bearerToken(request?: NextRequest): string {
  if (!request) return "";
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  const explicitHeader = request.headers.get("x-ssa-beta-token")?.trim();
  if (explicitHeader) return explicitHeader;
  return request.cookies.get("ssa-beta-token")?.value.trim() || "";
}

function trialSessionToken(request?: NextRequest): string {
  if (!request) return "";
  return request.cookies.get(TRIAL_SESSION_COOKIE)?.value.trim() || "";
}

export function validateBetaToken(token: string): AuthResult {
  const tokens = configuredTokens();
  if (tokens.length === 0) {
    if (isBetaAuthRequiredForRuntime()) {
      return authFailure(503, "Beta access token is not configured for this local gateway.");
    }
    return {
      ok: true,
      session: {
        tokenId: token ? "local-token-ignored" : "local-open",
        workspaces: ["*"],
      },
    };
  }

  if (!token) return authFailure(401, "Beta access token is required.");
  const match = tokens.find((item) => item.token === token);
  if (!match) return authFailure(401, "Beta access token is invalid.");

  return betaAuthSuccess(match);
}

export function redeemBetaToken(token: string): AuthResult {
  const tokens = configuredTokens();
  if (tokens.length === 0) return validateBetaToken(token);

  if (!token) return authFailure(401, "Beta access token is required.");
  const match = tokens.find((item) => item.token === token);
  if (!match) return authFailure(401, "Beta access token is invalid.");

  const redemption = recordBetaTokenRedemption(match);
  if (!redemption.ok) return redemption;

  return betaAuthSuccess(match);
}

function betaAuthSuccess(match: BetaTokenConfig): AuthSuccess {
  return {
    ok: true,
    session: {
      tokenId: match.name || `token-${Math.abs(hashToken(match.token))}`,
      workspaces: match.workspaces.length ? match.workspaces : ["*"],
    },
  };
}

interface BetaTokenRedemptionRecord {
  tokenHash: string;
  tokenId: string;
  count: number;
  maxRedemptions: number;
  firstRedeemedAt: string;
  lastRedeemedAt: string;
}

interface BetaTokenRedemptionStore {
  redemptions: BetaTokenRedemptionRecord[];
}

function recordBetaTokenRedemption(tokenConfig: BetaTokenConfig): RedemptionResult {
  if (!tokenConfig.maxRedemptions) return { ok: true };

  const filePath = ssaDataPath("security", "beta-auth-redemptions.json");
  const tokenHash = tokenFingerprint(tokenConfig.token);
  const tokenId = tokenConfig.name || `token-${Math.abs(hashToken(tokenConfig.token))}`;
  const now = new Date().toISOString();
  const store = readJsonFile<BetaTokenRedemptionStore>(filePath, { redemptions: [] });
  const redemptions = Array.isArray(store.redemptions) ? store.redemptions : [];
  const existing = redemptions.find((item) => item?.tokenHash === tokenHash);

  if (existing && existing.count >= tokenConfig.maxRedemptions) {
    return authFailure(401, "Beta access invite has already been fully redeemed.");
  }

  if (existing) {
    existing.count += 1;
    existing.maxRedemptions = tokenConfig.maxRedemptions;
    existing.lastRedeemedAt = now;
  } else {
    redemptions.push({
      tokenHash,
      tokenId,
      count: 1,
      maxRedemptions: tokenConfig.maxRedemptions,
      firstRedeemedAt: now,
      lastRedeemedAt: now,
    });
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ redemptions }, null, 2), { encoding: "utf-8", mode: 0o600 });
  } catch {
    return authFailure(503, "Unable to record beta access redemption.");
  }

  return { ok: true };
}

function tokenFingerprint(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function requireBetaAuth(request?: NextRequest): AuthResult {
  const token = bearerToken(request);
  if (token) return validateBetaToken(token);

  if (trialAccessEnabledForRuntime()) {
    const trialToken = trialSessionToken(request);
    if (!trialToken) return authFailure(401, "Phone verification is required for the trial experience.");
    const trial = validateTrialSessionToken(trialToken);
    if (!trial.ok) return authFailure(401, trial.message);
    return {
      ok: true,
      session: {
        tokenId: trial.session.tokenId,
        workspaces: trial.session.workspaces,
        trial: trial.session,
      },
    };
  }

  return validateBetaToken("");
}

export function hasWorkspaceAccess(session: BetaAuthSession, workspaceId: string): boolean {
  return session.workspaces.includes("*") || session.workspaces.includes(workspaceId);
}

export function hasAdminAccess(session: BetaAuthSession): boolean {
  return session.workspaces.includes("*");
}

function trialReadOnlyFailure(request: NextRequest, session: BetaAuthSession): AuthFailure | null {
  if (!session.trial || !trialReadOnlyForRuntime()) return null;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return null;
  return authFailure(403, "Trial experience is currently read-only.");
}

export function filterWorkspaceScoped<T extends { workspaceId: string }>(
  session: BetaAuthSession,
  items: T[]
): T[] {
  if (session.workspaces.includes("*")) return items;
  const allowed = new Set(session.workspaces);
  return items.filter((item) => allowed.has(item.workspaceId));
}

export function requireWorkspaceAccess(request: NextRequest, workspaceId: string): AuthResult {
  const auth = requireBetaAuth(request);
  if (!auth.ok) return auth;
  if (!hasWorkspaceAccess(auth.session, workspaceId)) return authFailure(403, "Workspace access is not allowed for this beta token.");
  const readOnly = trialReadOnlyFailure(request, auth.session);
  if (readOnly) return readOnly;
  return auth;
}

function explicitWorkspaceId(request: NextRequest, body?: Record<string, unknown> | null): string {
  const bodyWorkspace = body?.workspaceId;
  if (typeof bodyWorkspace === "string" && bodyWorkspace.trim()) return bodyWorkspace.trim();
  const bodyProject = body?.project;
  if (typeof bodyProject === "string" && bodyProject.trim()) return bodyProject.trim();
  return request.nextUrl.searchParams.get("project")?.trim() || request.nextUrl.searchParams.get("workspaceId")?.trim() || "";
}

export function resolveWorkspaceId(request: NextRequest, body?: Record<string, unknown> | null): string {
  return explicitWorkspaceId(request, body) || "farreach";
}

export function betaAccessSessionView(session: BetaAuthSession): BetaAccessSessionView {
  const wildcard = session.workspaces.includes("*");
  const scoped = session.workspaces.filter((workspace) => workspace !== "*");
  const defaultWorkspace = scoped.length === 1
    ? scoped[0]
    : wildcard && !betaAuthIsConfiguredForRuntime()
      ? "farreach"
      : null;
  return {
    workspaces: session.workspaces,
    defaultWorkspace,
    wildcard,
  };
}

export function requireResolvedWorkspaceAccess(
  request: NextRequest,
  body?: Record<string, unknown> | null
): WorkspaceAuthResult {
  const requestedWorkspace = explicitWorkspaceId(request, body);
  if (requestedWorkspace) {
    const auth = requireWorkspaceAccess(request, requestedWorkspace);
    if (!auth.ok) return auth;
    return { ok: true, session: auth.session, workspaceId: requestedWorkspace, explicitWorkspace: true };
  }

  const auth = requireBetaAuth(request);
  if (!auth.ok) return auth;
  const readOnly = trialReadOnlyFailure(request, auth.session);
  if (readOnly) return readOnly;

  if (!betaAuthIsConfiguredForRuntime()) {
    return { ok: true, session: auth.session, workspaceId: "farreach", explicitWorkspace: false };
  }

  const scoped = auth.session.workspaces.filter((workspace) => workspace !== "*");
  if (scoped.length === 1 && !auth.session.workspaces.includes("*")) {
    return { ok: true, session: auth.session, workspaceId: scoped[0], explicitWorkspace: false };
  }

  return authFailure(400, "Workspace is required for this beta token.");
}

export function requireAdminBetaAuth(request: NextRequest): AuthResult {
  const auth = requireBetaAuth(request);
  if (!auth.ok) return auth;
  if (!hasAdminAccess(auth.session)) return authFailure(403, "Admin access is required.");
  return auth;
}

export function betaAuthIsConfiguredForRuntime(): boolean {
  return configuredTokens().length > 0 || trialAccessEnabledForRuntime();
}

function hashToken(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}
