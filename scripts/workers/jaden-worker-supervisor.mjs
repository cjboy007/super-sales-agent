#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_DATA_ROOT = path.join(os.homedir(), ".ssa", "data");
const SUPPORTED_PLATFORMS = new Set(["launchd", "systemd", "pm2"]);

function sanitizeId(value, fallback) {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function positiveInt(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(number)));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function commandArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : shellQuote(text);
}

function shellCommand(parts) {
  return parts.map(commandArg).join(" ");
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function defaultPlatform() {
  if (process.platform === "darwin") return "launchd";
  if (process.platform === "linux") return "systemd";
  return "pm2";
}

function normalizeOptions(options = {}) {
  const workspaceId = sanitizeId(options.workspaceId || options.workspace || "farreach", "farreach");
  const workerId = sanitizeId(options.workerId || `jaden-${workspaceId}-1`, `jaden-${workspaceId}-1`);
  const platform = sanitizeId(options.platform || defaultPlatform(), "pm2");
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`Unsupported supervisor platform: ${platform}. Use launchd, systemd, or pm2.`);
  }

  return {
    platform,
    workspaceId,
    workerId,
    dataRoot: path.resolve(String(options.dataRoot || DEFAULT_DATA_ROOT)),
    intervalMs: positiveInt(options.intervalMs, 5000, 60 * 60 * 1000),
    maxJobs: positiveInt(options.maxJobs, 5, 50),
    maxAttempts: positiveInt(options.maxAttempts, 3, 10),
    repoRoot: path.resolve(String(options.repoRoot || REPO_ROOT)),
    nodePath: String(options.nodePath || process.execPath || "node"),
    llmProvider: options.llmProvider ? String(options.llmProvider) : undefined,
  };
}

function workerScript(options) {
  return path.join(options.repoRoot, "scripts", "workers", "jaden-worker.mjs");
}

function buildWorkerCommand(options) {
  return [
    options.nodePath,
    workerScript(options),
    "--workspace",
    options.workspaceId,
    "--worker-id",
    options.workerId,
    "--max-jobs",
    String(options.maxJobs),
    "--max-attempts",
    String(options.maxAttempts),
    "--interval-ms",
    String(options.intervalMs),
  ];
}

function serviceName(workerId) {
  return `ssa-${workerId}`;
}

function configFileName(platform, name) {
  if (platform === "launchd") return `com.supersalesagent.${name}.plist`;
  if (platform === "systemd") return `${name}.service`;
  return `ecosystem.${name}.config.json`;
}

export function buildSupervisorPlan(options = {}) {
  const normalized = normalizeOptions(options);
  const name = serviceName(normalized.workerId);
  const workerCommand = buildWorkerCommand(normalized);
  const statusCommand = [
    normalized.nodePath,
    workerScript(normalized),
    "--status",
    "--worker-id",
    normalized.workerId,
  ];
  const config = configFileName(normalized.platform, name);
  const configPath =
    normalized.platform === "launchd"
      ? path.join("~/Library/LaunchAgents", config)
      : normalized.platform === "systemd"
        ? path.join("~/.config/systemd/user", config)
        : config;

  const commandsByPlatform = {
    launchd: {
      install: `cp ${shellQuote(config)} ~/Library/LaunchAgents/${shellQuote(config)}`,
      start: `launchctl load -w ~/Library/LaunchAgents/${shellQuote(config)}`,
      stop: `launchctl unload -w ~/Library/LaunchAgents/${shellQuote(config)}`,
      restart: `launchctl kickstart -k gui/$(id -u)/com.supersalesagent.${name}`,
      status: `launchctl print gui/$(id -u)/com.supersalesagent.${name}`,
    },
    systemd: {
      install: `mkdir -p ~/.config/systemd/user && cp ${shellQuote(config)} ~/.config/systemd/user/${shellQuote(config)} && systemctl --user daemon-reload && systemctl --user enable ${name}`,
      start: `systemctl --user start ${name}`,
      stop: `systemctl --user stop ${name}`,
      restart: `systemctl --user restart ${name}`,
      status: `systemctl --user status ${name}`,
    },
    pm2: {
      install: `pm2 start ${shellQuote(config)} && pm2 save`,
      start: `pm2 start ${name}`,
      stop: `pm2 stop ${name}`,
      restart: `pm2 restart ${name}`,
      status: `pm2 status ${name}`,
    },
  };

  return {
    platform: normalized.platform,
    workspaceId: normalized.workspaceId,
    workerId: normalized.workerId,
    serviceName: name,
    configFileName: config,
    configPath,
    dataRoot: normalized.dataRoot,
    repoRoot: normalized.repoRoot,
    restartPolicy: "always",
    workerCommand,
    statusCommand,
    commands: {
      ...commandsByPlatform[normalized.platform],
      health: shellCommand(statusCommand),
    },
  };
}

export function renderSystemdUnit(options = {}) {
  const normalized = normalizeOptions({ ...options, platform: "systemd" });
  const plan = buildSupervisorPlan(normalized);
  const env = [`SSA_DATA_ROOT=${normalized.dataRoot}`];
  if (normalized.llmProvider) env.push(`SSA_LLM_PROVIDER=${normalized.llmProvider}`);

  return `[Unit]
Description=Super Sales Agent Jaden CRM Worker (${normalized.workspaceId})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${normalized.repoRoot}
Environment=${env.join(" ")}
ExecStart=${shellCommand(plan.workerCommand)}
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=default.target
`;
}

export function renderLaunchdPlist(options = {}) {
  const normalized = normalizeOptions({ ...options, platform: "launchd" });
  const plan = buildSupervisorPlan(normalized);
  const programArguments = plan.workerCommand.map((argument) => `    <string>${xmlEscape(argument)}</string>`).join("\n");
  const logDir = path.join(normalized.dataRoot, "runtime", "workers", "logs");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.supersalesagent.${xmlEscape(plan.serviceName)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(normalized.repoRoot)}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SSA_DATA_ROOT</key>
    <string>${xmlEscape(normalized.dataRoot)}</string>
${normalized.llmProvider ? `    <key>SSA_LLM_PROVIDER</key>\n    <string>${xmlEscape(normalized.llmProvider)}</string>\n` : ""}  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(path.join(logDir, `${plan.serviceName}.out.log`))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.join(logDir, `${plan.serviceName}.err.log`))}</string>
</dict>
</plist>
`;
}

export function renderPm2Ecosystem(options = {}) {
  const normalized = normalizeOptions({ ...options, platform: "pm2" });
  const plan = buildSupervisorPlan(normalized);
  const args = plan.workerCommand.slice(2).join(" ");
  const env = {
    SSA_DATA_ROOT: normalized.dataRoot,
  };
  if (normalized.llmProvider) env.SSA_LLM_PROVIDER = normalized.llmProvider;

  return `${JSON.stringify({
    apps: [
      {
        name: plan.serviceName,
        script: workerScript(normalized),
        args,
        cwd: normalized.repoRoot,
        interpreter: normalized.nodePath,
        autorestart: true,
        max_restarts: 20,
        restart_delay: 5000,
        kill_timeout: 20000,
        env,
      },
    ],
  }, null, 2)}\n`;
}

function renderConfig(options) {
  if (options.platform === "launchd") return renderLaunchdPlist(options);
  if (options.platform === "systemd") return renderSystemdUnit(options);
  return renderPm2Ecosystem(options);
}

function parseArgs(argv) {
  const options = {
    command: "generate",
    platform: defaultPlatform(),
    workspaceId: "farreach",
    workerId: undefined,
    dataRoot: DEFAULT_DATA_ROOT,
    intervalMs: 5000,
    maxJobs: 5,
    maxAttempts: 3,
    output: undefined,
    llmProvider: undefined,
  };

  if (argv[0] && !argv[0].startsWith("-")) {
    options.command = argv[0];
    argv = argv.slice(1);
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--platform" && next) {
      options.platform = next;
      index += 1;
    } else if ((arg === "--workspace" || arg === "-w") && next) {
      options.workspaceId = next;
      index += 1;
    } else if (arg === "--worker-id" && next) {
      options.workerId = next;
      index += 1;
    } else if (arg === "--data-root" && next) {
      options.dataRoot = next;
      index += 1;
    } else if (arg === "--interval-ms" && next) {
      options.intervalMs = next;
      index += 1;
    } else if (arg === "--max-jobs" && next) {
      options.maxJobs = next;
      index += 1;
    } else if (arg === "--max-attempts" && next) {
      options.maxAttempts = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      index += 1;
    } else if (arg === "--llm-provider" && next) {
      options.llmProvider = next;
      index += 1;
    }
  }

  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.command !== "generate") {
    throw new Error(`Unsupported command: ${parsed.command}. Use generate.`);
  }

  const normalized = normalizeOptions(parsed);
  const plan = buildSupervisorPlan(normalized);
  const outputDir = path.resolve(String(parsed.output || path.join(normalized.dataRoot, "runtime", "supervisors")));
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(normalized.dataRoot, "runtime", "workers", "logs"), { recursive: true });

  const configPath = path.join(outputDir, plan.configFileName);
  const manifestPath = path.join(outputDir, `${plan.serviceName}.supervisor.json`);
  fs.writeFileSync(configPath, renderConfig(normalized), "utf-8");
  fs.writeFileSync(manifestPath, `${JSON.stringify(plan, null, 2)}\n`, "utf-8");

  process.stdout.write(`${JSON.stringify({
    success: true,
    platform: plan.platform,
    serviceName: plan.serviceName,
    configPath,
    manifestPath,
    commands: plan.commands,
  })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
