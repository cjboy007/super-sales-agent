function envFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function runtimeMode(): string {
  return String(process.env.SSA_DEPLOYMENT_MODE || process.env.SSA_RUNTIME_MODE || "").trim().toLowerCase();
}

export function isLocalGatewayMode(): boolean {
  const mode = runtimeMode();
  return envFlag(process.env.SSA_LOCAL_GATEWAY) || mode === "local-gateway" || mode === "gateway" || mode === "docker";
}

export function isBetaAuthRequiredForRuntime(): boolean {
  return isLocalGatewayMode() || envFlag(process.env.SSA_BETA_AUTH_REQUIRED);
}

export function allowRuntimeFilePathFallback(): boolean {
  return !isLocalGatewayMode() || envFlag(process.env.SSA_ALLOW_FILE_PATH_FALLBACK);
}

export function allowServerSideFileOpen(): boolean {
  return !isLocalGatewayMode() && !envFlag(process.env.SSA_DISABLE_SERVER_FILE_OPEN);
}
