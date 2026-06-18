#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function dataRoot() {
  return path.resolve(process.env.SSA_DATA_ROOT || path.join(os.homedir(), ".ssa", "data"));
}

function tokenFilePath() {
  return path.join(dataRoot(), "security", "beta-auth.json");
}

function normalizeWorkspaces(value) {
  return String(value || "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function usage() {
  console.log([
    "Usage:",
    "  node scripts/configure-beta-access.mjs create --name farreach-beta --workspaces farreach",
    "  node scripts/configure-beta-access.mjs create --name ops-admin --workspaces '*'",
    "  node scripts/configure-beta-access.mjs status",
    "",
    "Options:",
    "  --token <token>       Use an existing token instead of generating one",
    "  --max-redemptions <n> Limit how many times this access pass can be redeemed",
    "  --max-uses <n>        Alias for --max-redemptions",
    "  --replace            Replace existing token entries with the same name",
    "  --allow-wildcard     Allow '*' workspace access for an operator/admin token",
    "  --admin              Alias for --allow-wildcard",
  ].join("\n"));
}

function readConfig(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return { tokens: [] };
  }
}

function safeTokens(config) {
  const tokens = Array.isArray(config) ? config : Array.isArray(config.tokens) ? config.tokens : [];
  return tokens
    .filter((item) => item && typeof item === "object" && typeof item.token === "string")
    .map((item) => ({
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "beta-token",
      token: item.token,
      workspaces: Array.isArray(item.workspaces) && item.workspaces.length ? item.workspaces : ["*"],
      createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
      maxRedemptions: normalizeRedemptionLimit(item.maxRedemptions ?? item.maxUses),
    }));
}

function normalizeRedemptionLimit(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function redemptionLimitFromArgs() {
  const raw = argValue("--max-redemptions") || argValue("--max-uses");
  if (!raw) return undefined;
  const limit = normalizeRedemptionLimit(raw);
  if (!limit) {
    console.error("--max-redemptions requires a positive integer.");
    process.exit(1);
  }
  return limit;
}

function createToken() {
  const name = argValue("--name", "beta-token").trim();
  const token = argValue("--token") || crypto.randomBytes(32).toString("base64url");
  const maxRedemptions = redemptionLimitFromArgs();
  const rawWorkspaces = argValue("--workspaces");
  if (!rawWorkspaces.trim()) {
    console.error("Closed-alpha beta tokens require --workspaces with a non-wildcard workspace id.");
    process.exit(1);
  }
  const workspaces = normalizeWorkspaces(rawWorkspaces);
  const hasWildcard = workspaces.includes("*");
  if (hasWildcard && !hasFlag("--allow-wildcard") && !hasFlag("--admin")) {
    console.error("Wildcard workspace access requires --allow-wildcard or --admin.");
    process.exit(1);
  }
  const filePath = tokenFilePath();
  const existing = safeTokens(readConfig(filePath));
  const tokens = hasFlag("--replace")
    ? existing.filter((item) => item.name !== name)
    : existing;
  tokens.push({
    name,
    token,
    workspaces,
    createdAt: new Date().toISOString(),
    ...(maxRedemptions ? { maxRedemptions } : {}),
  });

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ tokens }, null, 2), { encoding: "utf-8", mode: 0o600 });

  console.log(JSON.stringify({
    file: filePath,
    name,
    token,
    workspaces,
    ...(maxRedemptions ? { maxRedemptions } : {}),
    next: "Share this token only with intended beta users. Keep the file on the server runtime data root.",
  }, null, 2));
}

function status() {
  const filePath = tokenFilePath();
  const tokens = safeTokens(readConfig(filePath));
  console.log(JSON.stringify({
    file: filePath,
    configured: tokens.length > 0,
    tokens: tokens.map((item) => ({
      name: item.name,
      workspaces: item.workspaces,
      createdAt: item.createdAt,
      maxRedemptions: item.maxRedemptions,
    })),
  }, null, 2));
}

const command = process.argv[2] || "help";
if (command === "create") createToken();
else if (command === "status") status();
else {
  usage();
  process.exit(command === "help" ? 0 : 1);
}
