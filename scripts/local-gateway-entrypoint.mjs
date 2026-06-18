#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function defaultDataRoot(env = process.env) {
  return path.resolve(env.SSA_DATA_ROOT || path.join(os.homedir(), ".ssa", "data"));
}

function tokenFilePath(dataRoot) {
  return path.join(dataRoot, "security", "beta-auth.json");
}

function normalizeTokenRecords(value) {
  const rawTokens = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray(value.tokens)
      ? value.tokens
      : [];
  return rawTokens
    .filter((item) => item && typeof item === "object" && typeof item.token === "string" && item.token.trim())
    .map((item) => ({
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "local-gateway",
      token: item.token.trim(),
      workspaces: Array.isArray(item.workspaces) && item.workspaces.length
        ? item.workspaces.filter((workspace) => typeof workspace === "string" && workspace.trim())
        : ["*"],
      createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    }))
    .map((item) => ({
      ...item,
      workspaces: item.workspaces.length ? item.workspaces : ["*"],
    }));
}

function envTokens(env) {
  if (env.SSA_BETA_AUTH_TOKENS?.trim()) {
    try {
      return normalizeTokenRecords(JSON.parse(env.SSA_BETA_AUTH_TOKENS));
    } catch {
      return [];
    }
  }
  if (env.SSA_BETA_AUTH_TOKEN?.trim()) {
    return [{
      name: "env-token",
      token: env.SSA_BETA_AUTH_TOKEN.trim(),
      workspaces: ["*"],
    }];
  }
  return [];
}

function readTokenFile(filePath) {
  try {
    return normalizeTokenRecords(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  } catch {
    return [];
  }
}

function writeTokenFile(filePath, tokens) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ tokens }, null, 2), { encoding: "utf-8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

export function ensureGatewayAuth(options = {}) {
  const env = options.env || process.env;
  const dataRoot = path.resolve(options.dataRoot || defaultDataRoot(env));
  const filePath = tokenFilePath(dataRoot);
  const configuredEnvTokens = envTokens(env);
  if (configuredEnvTokens.length > 0) {
    return {
      generated: false,
      tokenFile: filePath,
      tokens: configuredEnvTokens,
    };
  }

  const fileTokens = readTokenFile(filePath);
  if (fileTokens.length > 0) {
    return {
      generated: false,
      tokenFile: filePath,
      tokens: fileTokens,
    };
  }

  const now = options.now || (() => new Date());
  const randomToken = options.randomToken || (() => crypto.randomBytes(32).toString("base64url"));
  const tokens = [{
    name: "local-gateway",
    token: randomToken(),
    workspaces: ["*"],
    createdAt: now().toISOString(),
  }];
  writeTokenFile(filePath, tokens);
  return {
    generated: true,
    tokenFile: filePath,
    tokens,
  };
}

export function buildGatewayEnv(options = {}) {
  const env = { ...(options.env || process.env) };
  const dataRoot = path.resolve(options.dataRoot || defaultDataRoot(env));
  const appRoot = path.resolve(options.appRoot || env.SSA_APP_ROOT || process.cwd());
  const auth = ensureGatewayAuth({
    dataRoot,
    env,
    now: options.now,
    randomToken: options.randomToken,
  });

  return {
    ...env,
    SSA_DATA_ROOT: dataRoot,
    SSA_APP_ROOT: appRoot,
    SSA_LOCAL_GATEWAY: "true",
    SSA_BETA_AUTH_REQUIRED: "true",
    SSA_BETA_AUTH_TOKENS: JSON.stringify(auth.tokens),
    PORT: env.PORT || "3000",
    HOSTNAME: env.HOSTNAME || "0.0.0.0",
  };
}

export function prepareGatewayEnvironment(options = {}) {
  const env = buildGatewayEnv(options);
  return {
    env,
    auth: ensureGatewayAuth({
      dataRoot: env.SSA_DATA_ROOT,
      env,
      now: options.now,
      randomToken: options.randomToken,
    }),
  };
}

export function startGateway(options = {}) {
  const serverPath = path.resolve(options.serverPath || process.argv[2] || path.join(process.cwd(), "server.js"));
  const appRoot = path.resolve(options.appRoot || process.env.SSA_APP_ROOT || path.dirname(serverPath));
  const { env, auth } = prepareGatewayEnvironment({
    ...options,
    appRoot,
    dataRoot: options.dataRoot || process.env.SSA_DATA_ROOT,
    env: options.env || process.env,
  });
  const urlHost = env.SSA_PUBLIC_HOST || "127.0.0.1";
  const urlPort = env.SSA_PUBLIC_PORT || env.PORT || "3000";
  const firstToken = auth.tokens[0]?.token || "";

  console.log(`[ssa] Local gateway data root: ${env.SSA_DATA_ROOT}`);
  console.log(`[ssa] Local gateway token file: ${auth.tokenFile}`);
  console.log(`[ssa] Local gateway URL: http://${urlHost}:${urlPort}`);
  if (firstToken) console.log(`[ssa] Local gateway access token: ${firstToken}`);

  const child = spawn(process.execPath, [serverPath, ...(options.args || process.argv.slice(3))], {
    cwd: appRoot,
    env,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
  child.on("error", (error) => {
    console.error(`[ssa] Failed to start local gateway: ${error.message}`);
    process.exit(1);
  });
  return child;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = path.resolve(fileURLToPath(import.meta.url));

if (invokedPath === currentPath) {
  startGateway();
}
