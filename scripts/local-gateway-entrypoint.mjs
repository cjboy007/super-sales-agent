#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function defaultDataRoot(env = process.env) {
  return path.resolve(env.SSA_DATA_ROOT || path.join(os.homedir(), ".ssa", "data"));
}

export function buildGatewayEnv(options = {}) {
  const env = { ...(options.env || process.env) };
  const dataRoot = path.resolve(options.dataRoot || defaultDataRoot(env));
  const appRoot = path.resolve(options.appRoot || env.SSA_APP_ROOT || process.cwd());

  return {
    ...env,
    SSA_DATA_ROOT: dataRoot,
    SSA_APP_ROOT: appRoot,
    SSA_LOCAL_GATEWAY: "true",
    PORT: env.PORT || "3000",
    HOSTNAME: env.HOSTNAME || "0.0.0.0",
  };
}

export function prepareGatewayEnvironment(options = {}) {
  const env = buildGatewayEnv(options);
  return {
    env,
  };
}

export function startGateway(options = {}) {
  const serverPath = path.resolve(options.serverPath || process.argv[2] || path.join(process.cwd(), "server.js"));
  const appRoot = path.resolve(options.appRoot || process.env.SSA_APP_ROOT || path.dirname(serverPath));
  const { env } = prepareGatewayEnvironment({
    ...options,
    appRoot,
    dataRoot: options.dataRoot || process.env.SSA_DATA_ROOT,
    env: options.env || process.env,
  });
  const urlHost = env.SSA_PUBLIC_HOST || "127.0.0.1";
  const urlPort = env.SSA_PUBLIC_PORT || env.PORT || "3000";

  console.log(`[ssa] Local gateway data root: ${env.SSA_DATA_ROOT}`);
  console.log(`[ssa] Local gateway URL: http://${urlHost}:${urlPort}`);

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
