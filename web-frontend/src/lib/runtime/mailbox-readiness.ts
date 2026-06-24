import { existsSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import { readSettings } from "../config-store";
import type { WorkerHealthSummary } from "./worker-health";

export type MailboxReadinessStatus = "ready" | "needs_setup" | "needs_review";

export interface MailboxReadinessSummary {
  status: MailboxReadinessStatus;
  configured: boolean;
  autoCapture: boolean;
  recentlySynced: boolean;
  summary: string;
  nextStep: string;
  requiredActions: string[];
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPositivePort(value: unknown): boolean {
  const port = Number(value);
  return Number.isFinite(port) && port > 0;
}

function resolveHome(input: string): string {
  return input.replace(/^~(?=$|\/)/, os.homedir());
}

function sanitizeProfile(profile: string): string {
  return /^[a-zA-Z0-9._-]+$/.test(profile) ? profile : "farreach";
}

function defaultSecretsDir(): string {
  if (process.env.SSA_SECRETS_DIR) return path.resolve(resolveHome(process.env.SSA_SECRETS_DIR));
  const configHome = process.env.SSA_CONFIG_HOME
    ? path.resolve(resolveHome(process.env.SSA_CONFIG_HOME))
    : path.join(os.homedir(), ".config", "super-sales-agent");
  return path.join(configHome, "profiles");
}

function parseEnvKeys(filePath: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function externalProfileValues(workspaceId: string): Record<string, string> {
  const profile = sanitizeProfile(process.env.SSA_PROFILE || process.env.EMAIL_PROFILE || workspaceId || "farreach");
  const profilePath = process.env.SSA_PROFILE_PATH
    ? path.resolve(resolveHome(process.env.SSA_PROFILE_PATH))
    : path.join(defaultSecretsDir(), `${profile}.env`);
  if (!existsSync(profilePath)) return {};
  try {
    return parseEnvKeys(profilePath);
  } catch {
    return {};
  }
}

export function summarizeMailboxReadiness(
  worker: WorkerHealthSummary,
  options: { workspaceId?: string } = {}
): MailboxReadinessSummary {
  const settings = readSettings();
  const profile = externalProfileValues(options.workspaceId || "farreach");
  const email = settings.email || profile.IMAP_USER || profile.SMTP_USER;
  const imapHost = settings.imapHost || profile.IMAP_HOST;
  const imapPort = settings.imapPort || profile.IMAP_PORT;
  const emailPassword = settings.emailPassword || profile.IMAP_PASS;
  const requiredActions: string[] = [];
  if (!hasValue(email)) requiredActions.push("Add the mailbox account.");
  if (!hasValue(imapHost)) requiredActions.push("Add the incoming mail server.");
  if (!hasPositivePort(imapPort)) requiredActions.push("Add the incoming mail port.");
  if (!hasValue(emailPassword)) requiredActions.push("Add the mailbox password or app password.");
  const configured =
    hasValue(email) &&
    hasValue(imapHost) &&
    hasPositivePort(imapPort) &&
    hasValue(emailPassword);
  const autoCapture = settings.autoCapture !== false;
  if (!autoCapture) requiredActions.push("Enable automatic mailbox capture.");
  const activitySummary = worker.activity?.lastActivitySummary?.toLowerCase() || "";
  const recentlySynced =
    Number(worker.latest?.lastResult?.crmActivities || 0) > 0 ||
    Number(worker.latest?.lastResult?.orderActivities || 0) > 0 ||
    Number(worker.latest?.lastResult?.inboxSynced || 0) > 0 ||
    (
      Boolean(worker.activity?.lastActivityAt || worker.activity?.hasRecentActivity) &&
      (
        activitySummary.includes("mailbox message") ||
        activitySummary.includes("customer timeline item") ||
        activitySummary.includes("order milestone")
      )
    );
  const status = !configured || !autoCapture ? "needs_setup" : recentlySynced ? "ready" : "needs_review";
  if (status === "needs_review") {
    requiredActions.push("Run automation until a new inbound mail sync is visible.");
  }

  return {
    status,
    configured,
    autoCapture,
    recentlySynced,
    summary: status === "ready"
      ? "Mailbox capture is connected and recent incoming mail has entered CRM."
      : status === "needs_review"
        ? "Mailbox capture is connected, but the latest automation run has not shown a fresh incoming mail sync."
        : "Mailbox setup needs attention before incoming customer email can enter CRM.",
    nextStep: status === "ready"
      ? "Monitor new inbound mail in the customer timeline."
      : !configured
        ? "Complete the mailbox connection in Settings, then run automation again."
        : !autoCapture
          ? "Enable automatic mailbox capture so inbound customer messages create CRM activity."
          : "Start or repair automation, then confirm new mail appears in the customer timeline.",
    requiredActions,
  };
}
