import { networkInterfaces } from "node:os";
import { readSettings } from "../config-store";

export type LocalGatewayAccessMode = "local" | "lan";

export interface LocalGatewayStatus {
  accessMode: LocalGatewayAccessMode;
  bindHost: string;
  publicHost: string;
  port: string;
  tokenRequired: false;
  localUrl: string;
  lanUrl: string | null;
  warning: string;
  firewallHint: string;
}

function firstValue(...values: Array<string | undefined | null>): string {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function normalizeAccessMode(value: string): LocalGatewayAccessMode | "" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "lan") return "lan";
  if (normalized === "local" || normalized === "localhost") return "local";
  return "";
}

function isLanBind(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::" || (
    normalized !== "" &&
    normalized !== "127.0.0.1" &&
    normalized !== "localhost" &&
    normalized !== "::1"
  );
}

function isWildcardHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::";
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "" || normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function detectLanHost(): string {
  const candidates = Object.values(networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address)
    .filter((address) => !isLoopbackHost(address) && !address.startsWith("169.254."));
  return candidates.find(isPrivateIpv4) || candidates[0] || "";
}

export function getLocalGatewayStatus(): LocalGatewayStatus {
  const settings = readSettings();
  const envBindHost = firstValue(process.env.SSA_BIND_HOST);
  const envMode = normalizeAccessMode(firstValue(
    process.env.SSA_GATEWAY_ACCESS_MODE,
    process.env.SSA_ACCESS_MODE
  ));
  const requestedMode = envMode || (envBindHost ? "" : normalizeAccessMode(firstValue(settings.gatewayAccessMode)));
  const bindHost = firstValue(
    envBindHost,
    settings.gatewayBindHost,
    requestedMode === "lan" ? "0.0.0.0" : "127.0.0.1"
  );
  const accessMode: LocalGatewayAccessMode = requestedMode || (isLanBind(bindHost) ? "lan" : "local");
  const port = firstValue(process.env.SSA_PUBLIC_PORT, process.env.SSA_PORT, "3001");
  const envPublicHost = firstValue(process.env.SSA_PUBLIC_HOST);
  const configuredPublicHost = firstValue(settings.gatewayPublicHost);
  const bindPublicHost = accessMode === "lan" && isLanBind(bindHost) && !isWildcardHost(bindHost) ? bindHost : "";
  const publicHost = accessMode === "lan"
    ? firstValue(
      envPublicHost,
      isLoopbackHost(configuredPublicHost) ? "" : configuredPublicHost,
      bindPublicHost,
      detectLanHost(),
      "127.0.0.1"
    )
    : "127.0.0.1";
  const localUrl = `http://127.0.0.1:${port}`;
  const lanUrl = accessMode === "lan" ? `http://${publicHost}:${port}` : null;

  return {
    accessMode,
    bindHost: accessMode === "lan" && !bindHost ? "0.0.0.0" : bindHost,
    publicHost: accessMode === "lan" ? publicHost : "127.0.0.1",
    port,
    tokenRequired: false,
    localUrl,
    lanUrl,
    warning: accessMode === "lan"
      ? "LAN access is enabled. Do not expose this port to the public internet."
      : "LAN access is off. This gateway is reachable from this computer only.",
    firewallHint: accessMode === "lan"
      ? "If another device on the same LAN cannot connect, check the host firewall and make sure the selected port is allowed on private networks."
      : "No firewall change is needed for local-only access.",
  };
}
