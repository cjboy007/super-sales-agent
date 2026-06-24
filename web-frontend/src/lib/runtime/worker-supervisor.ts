import fs from "fs";
import path from "path";
import { ensureDir, readJsonFile, repoPath, ssaDataPath, ssaDataRoot } from "../ssa-data-paths";

export type WorkerSupervisorStatus = "ready" | "needs_setup" | "needs_review";
export type WorkerSupervisorPlatform = "launchd" | "systemd" | "pm2";
export type WorkerControlAction = "start" | "stop" | "restart" | "health";

interface WorkerSupervisorManifest {
  workspaceId?: unknown;
  workerId?: unknown;
  restartPolicy?: unknown;
  commands?: unknown;
}

export interface WorkerSupervisorSummary {
  status: WorkerSupervisorStatus;
  configured: number;
  reviewed: number;
  capabilities: {
    autoRestart: boolean;
    startStop: boolean;
    healthCheck: boolean;
  };
}

export interface PublicWorkerRecoverySummary {
  status: WorkerSupervisorStatus;
  configured: boolean;
  reviewed: boolean;
  capabilities: WorkerSupervisorSummary["capabilities"];
  summary: string;
  nextStep: string;
  availableActions: string[];
  recentRequests: PublicWorkerControlRequest[];
}

export interface WorkerControlRequest {
  id: string;
  workspaceId: string;
  workerId: string;
  workerLabel: string;
  control: WorkerControlAction;
  actionLabel: string;
  status: "requested";
  execution: "operator_review";
  requestedAt: string;
  nextStep: string;
}

export interface PublicWorkerControlRequest {
  actionLabel: string;
  status: WorkerControlRequest["status"];
  execution: WorkerControlRequest["execution"];
  requestedAt: string;
  nextStep: string;
}

export interface PreparedWorkerSupervisor {
  status: "ready";
  workspaceId: string;
  workerId: string;
  workerLabel: string;
  platform: WorkerSupervisorPlatform;
  recovery: {
    autoRestart: boolean;
    startStop: boolean;
    healthCheck: boolean;
  };
  nextStep: string;
}

interface WorkerSupervisorPlan {
  platform: WorkerSupervisorPlatform;
  workspaceId: string;
  workerId: string;
  serviceName: string;
  configFileName: string;
  configPath: string;
  dataRoot: string;
  repoRoot: string;
  restartPolicy: "always";
  workerCommand: string[];
  statusCommand: string[];
  commands: {
    install: string;
    start: string;
    stop: string;
    restart: string;
    status: string;
    health: string;
  };
}

interface PrepareWorkerSupervisorOptions {
  platform?: unknown;
  workspaceId?: unknown;
  workerId?: unknown;
  intervalMs?: unknown;
  maxJobs?: unknown;
  maxAttempts?: unknown;
}

interface RequestWorkerControlOptions {
  workspaceId?: unknown;
  workerId?: unknown;
  control?: unknown;
  now?: string;
}

const SUPPORTED_PLATFORMS = new Set<WorkerSupervisorPlatform>(["launchd", "systemd", "pm2"]);

function supervisorDir(): string {
  return ssaDataPath("runtime", "supervisors");
}

function supervisorRequestsDir(): string {
  return path.join(supervisorDir(), "requests");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasCommand(commands: unknown, name: string): boolean {
  return isRecord(commands) && typeof commands[name] === "string" && commands[name].trim().length > 0;
}

function sanitizeId(value: unknown, fallback: string): string {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(number)));
}

function defaultPlatform(): WorkerSupervisorPlatform {
  if (process.platform === "darwin") return "launchd";
  if (process.platform === "linux") return "systemd";
  return "pm2";
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function commandArg(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : shellQuote(value);
}

function shellCommand(parts: string[]): string {
  return parts.map(commandArg).join(" ");
}

function xmlEscape(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePlatform(value: unknown): WorkerSupervisorPlatform {
  const platform = sanitizeId(value || defaultPlatform(), defaultPlatform()) as WorkerSupervisorPlatform;
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error("Choose a supported worker recovery platform.");
  }
  return platform;
}

function serviceName(workerId: string): string {
  return `ssa-${workerId}`;
}

function configFileName(platform: WorkerSupervisorPlatform, name: string): string {
  if (platform === "launchd") return `com.supersalesagent.${name}.plist`;
  if (platform === "systemd") return `${name}.service`;
  return `ecosystem.${name}.config.json`;
}

function normalizeControl(value: unknown): WorkerControlAction {
  if (value === "start" || value === "stop" || value === "restart" || value === "health") return value;
  throw new Error("Choose a supported worker control.");
}

function actionLabel(control: WorkerControlAction): string {
  if (control === "start") return "Start worker";
  if (control === "stop") return "Stop worker";
  if (control === "restart") return "Restart worker";
  return "Check worker health";
}

function normalizedOptions(options: PrepareWorkerSupervisorOptions) {
  const workspaceId = sanitizeId(options.workspaceId, "farreach");
  return {
    platform: normalizePlatform(options.platform),
    workspaceId,
    workerId: sanitizeId(options.workerId, `jaden-${workspaceId}-1`),
    intervalMs: positiveInt(options.intervalMs, 5000, 60 * 60 * 1000),
    maxJobs: positiveInt(options.maxJobs, 5, 50),
    maxAttempts: positiveInt(options.maxAttempts, 3, 10),
    dataRoot: ssaDataRoot(),
    repoRoot: repoPath(),
    nodePath: process.execPath || "node",
  };
}

function workerScript(repoRoot: string): string {
  return path.join(repoRoot, "scripts", "workers", "jaden-worker.mjs");
}

function buildSupervisorPlan(options: PrepareWorkerSupervisorOptions = {}): WorkerSupervisorPlan {
  const normalized = normalizedOptions(options);
  const name = serviceName(normalized.workerId);
  const workerCommand = [
    normalized.nodePath,
    workerScript(normalized.repoRoot),
    "--workspace",
    normalized.workspaceId,
    "--worker-id",
    normalized.workerId,
    "--max-jobs",
    String(normalized.maxJobs),
    "--max-attempts",
    String(normalized.maxAttempts),
    "--interval-ms",
    String(normalized.intervalMs),
  ];
  const statusCommand = [
    normalized.nodePath,
    workerScript(normalized.repoRoot),
    "--status",
    "--worker-id",
    normalized.workerId,
  ];
  const config = configFileName(normalized.platform, name);
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
    configPath: path.join(supervisorDir(), config),
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

function renderSystemdUnit(options: PrepareWorkerSupervisorOptions): string {
  const normalized = normalizedOptions({ ...options, platform: "systemd" });
  const plan = buildSupervisorPlan(normalized);

  return `[Unit]
Description=Super Sales Agent Jaden CRM Worker (${normalized.workspaceId})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${normalized.repoRoot}
Environment=SSA_DATA_ROOT=${normalized.dataRoot}
ExecStart=${shellCommand(plan.workerCommand)}
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=default.target
`;
}

function renderLaunchdPlist(options: PrepareWorkerSupervisorOptions): string {
  const normalized = normalizedOptions({ ...options, platform: "launchd" });
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
  </dict>
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

function renderPm2Ecosystem(options: PrepareWorkerSupervisorOptions): string {
  const normalized = normalizedOptions({ ...options, platform: "pm2" });
  const plan = buildSupervisorPlan(normalized);
  return `${JSON.stringify({
    apps: [
      {
        name: plan.serviceName,
        script: workerScript(normalized.repoRoot),
        args: plan.workerCommand.slice(2).join(" "),
        cwd: normalized.repoRoot,
        interpreter: normalized.nodePath,
        autorestart: true,
        max_restarts: 20,
        restart_delay: 5000,
        kill_timeout: 20000,
        env: {
          SSA_DATA_ROOT: normalized.dataRoot,
        },
      },
    ],
  }, null, 2)}\n`;
}

function renderConfig(platform: WorkerSupervisorPlatform, options: PrepareWorkerSupervisorOptions): string {
  if (platform === "launchd") return renderLaunchdPlist(options);
  if (platform === "systemd") return renderSystemdUnit(options);
  return renderPm2Ecosystem(options);
}

function manifestIsValidForWorkspace(manifest: WorkerSupervisorManifest, workspaceId: string): boolean {
  return (
    manifest.workspaceId === workspaceId &&
    typeof manifest.workerId === "string" &&
    manifest.workerId.trim().length > 0 &&
    manifest.restartPolicy === "always" &&
    hasCommand(manifest.commands, "start") &&
    hasCommand(manifest.commands, "stop") &&
    hasCommand(manifest.commands, "restart") &&
    hasCommand(manifest.commands, "health")
  );
}

export function prepareWorkerSupervisor(options: PrepareWorkerSupervisorOptions = {}): PreparedWorkerSupervisor {
  const normalized = normalizedOptions(options);
  const plan = buildSupervisorPlan(normalized);
  const dir = ensureDir(supervisorDir());
  ensureDir(path.join(normalized.dataRoot, "runtime", "workers", "logs"));

  fs.writeFileSync(path.join(dir, plan.configFileName), renderConfig(normalized.platform, normalized), "utf-8");
  fs.writeFileSync(path.join(dir, `${plan.serviceName}.supervisor.json`), `${JSON.stringify(plan, null, 2)}\n`, "utf-8");

  const readiness = summarizeWorkerSupervisorReadiness(plan.workspaceId);
  return {
    status: "ready",
    workspaceId: plan.workspaceId,
    workerId: plan.workerId,
    workerLabel: "Jaden CRM worker",
    platform: plan.platform,
    recovery: {
      autoRestart: readiness.capabilities.autoRestart,
      startStop: readiness.capabilities.startStop,
      healthCheck: readiness.capabilities.healthCheck,
    },
    nextStep: "Review and install the prepared recovery setup on the host, then start the resident worker and verify the Operations heartbeat.",
  };
}

export function requestWorkerControl(options: RequestWorkerControlOptions = {}): WorkerControlRequest {
  const workspaceId = sanitizeId(options.workspaceId, "farreach");
  const workerId = sanitizeId(options.workerId, `jaden-${workspaceId}-1`);
  const control = normalizeControl(options.control);
  const requestedAt = options.now || new Date().toISOString();
  const id = `worker-control-${Date.parse(requestedAt) || Date.now()}-${control}-${Math.random().toString(36).slice(2, 8)}`;
  const record: WorkerControlRequest = {
    id,
    workspaceId,
    workerId,
    workerLabel: "Jaden CRM worker",
    control,
    actionLabel: actionLabel(control),
    status: "requested",
    execution: "operator_review",
    requestedAt,
    nextStep: "Review the request in Operations and run it from the installed host supervisor.",
  };

  const dir = ensureDir(supervisorRequestsDir());
  fs.writeFileSync(path.join(dir, `${sanitizeId(id, "worker-control")}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return record;
}

export function listWorkerControlRequests(workspaceId = "farreach", limit = 5): WorkerControlRequest[] {
  const dir = supervisorRequestsDir();
  if (!fs.existsSync(dir)) return [];
  const requestedLimit = Math.min(20, Math.max(1, Math.floor(Number(limit)) || 5));
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readJsonFile<WorkerControlRequest | null>(path.join(dir, entry.name), null))
    .filter((request): request is WorkerControlRequest => Boolean(request?.workspaceId === workspaceId && request.actionLabel && request.requestedAt))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .slice(0, requestedLimit);
}

export function summarizeWorkerSupervisorReadiness(workspaceId = "farreach"): WorkerSupervisorSummary {
  const dir = supervisorDir();
  if (!fs.existsSync(dir)) {
    return {
      status: "needs_setup",
      configured: 0,
      reviewed: 0,
      capabilities: {
        autoRestart: false,
        startStop: false,
        healthCheck: false,
      },
    };
  }

  const manifests = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".supervisor.json"))
    .map((entry) => readJsonFile<WorkerSupervisorManifest | null>(path.join(dir, entry.name), null))
    .filter((manifest): manifest is WorkerSupervisorManifest => Boolean(manifest));

  const matching = manifests.filter((manifest) => manifest.workspaceId === workspaceId);
  const valid = matching.filter((manifest) => manifestIsValidForWorkspace(manifest, workspaceId));

  return {
    status: valid.length > 0 ? "ready" : matching.length > 0 || manifests.length > 0 ? "needs_review" : "needs_setup",
    configured: matching.length,
    reviewed: valid.length,
    capabilities: {
      autoRestart: valid.some((manifest) => manifest.restartPolicy === "always"),
      startStop: valid.some((manifest) => hasCommand(manifest.commands, "start") && hasCommand(manifest.commands, "stop") && hasCommand(manifest.commands, "restart")),
      healthCheck: valid.some((manifest) => hasCommand(manifest.commands, "health")),
    },
  };
}

export function publicWorkerRecoverySummary(summary: WorkerSupervisorSummary): PublicWorkerRecoverySummary {
  const availableActions = [
    summary.capabilities.startStop ? ["Start worker", "Stop worker", "Restart worker"] : [],
    summary.capabilities.healthCheck ? ["Check worker health"] : [],
  ].flat();

  return {
    status: summary.status,
    configured: summary.configured > 0,
    reviewed: summary.reviewed > 0,
    capabilities: summary.capabilities,
    summary: summary.status === "ready"
      ? "Task recovery is prepared with restart and health controls."
      : summary.status === "needs_review"
        ? "Task recovery setup exists but needs review before beta."
        : "Task recovery setup has not been prepared yet.",
    nextStep: summary.status === "ready"
      ? "Keep the recovery setup installed and verify it after deployment changes."
      : summary.status === "needs_review"
        ? "Review the prepared recovery setup, then regenerate it if controls are missing."
        : "Prepare task recovery from Task Progress before inviting external testers.",
    availableActions,
    recentRequests: listWorkerControlRequests().map((request) => ({
      actionLabel: request.actionLabel,
      status: request.status,
      execution: request.execution,
      requestedAt: request.requestedAt,
      nextStep: request.nextStep,
    })),
  };
}
