import { isBetaAuthRequiredForRuntime, isLocalGatewayMode } from "./local-gateway";

interface EdgeBetaTokenConfig {
  token: string;
}

function normalizeEdgeTokenConfigs(value: unknown): EdgeBetaTokenConfig[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
    .filter(Boolean)
    .map((item) => ({
      token: typeof item?.token === "string" ? item.token.trim() : "",
    }))
    .filter((item) => item.token.length > 0);
}

function configuredEdgeTokens(): EdgeBetaTokenConfig[] {
  const multi = process.env.SSA_BETA_AUTH_TOKENS;
  if (multi?.trim()) {
    try {
      return normalizeEdgeTokenConfigs(JSON.parse(multi) as unknown);
    } catch {
      return [];
    }
  }

  const single = process.env.SSA_BETA_AUTH_TOKEN;
  if (single?.trim()) return [{ token: single.trim() }];
  return [];
}

export function betaAccessRequiredForPageRuntime(): boolean {
  if (trialAccessRequiredForPageRuntime()) return true;
  if (configuredEdgeTokens().length > 0) return true;
  return isBetaAuthRequiredForRuntime();
}

export function trialAccessRequiredForPageRuntime(): boolean {
  const value = process.env.SSA_TRIAL_ACCESS_ENABLED;
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function validatePageBetaToken(token: string): boolean {
  const tokens = configuredEdgeTokens();
  if (tokens.length === 0 && isLocalGatewayMode()) return false;
  if (tokens.length === 0) return token.trim().length > 0;
  return tokens.some((item) => item.token === token);
}
