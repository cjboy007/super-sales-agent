import type { AppSettings } from "../config-store";
import {
  importSettings as importStoredSettings,
  maskSettings,
  readSettings,
  writeSettings,
} from "../config-store";

export type SettingsInput = Partial<AppSettings>;

const SENSITIVE_SETTINGS_KEYS = [
  "deepseekApiKey",
  "llmApiKey",
  "openrouterApiKey",
  "openaiApiKey",
  "geminiApiKey",
  "tavilyApiKey",
  "hunterApiKey",
  "apolloApiKey",
  "crmApiKey",
  "notificationWebhookUrl",
  "emailPassword",
] as const satisfies ReadonlyArray<keyof AppSettings>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && value.includes("****");
}

function mergeSettings(input: SettingsInput, base: AppSettings): AppSettings {
  const merged: AppSettings = {
    ...base,
    ...input,
    autoResearch: {
      ...base.autoResearch,
      ...(isRecord(input.autoResearch) ? input.autoResearch : {}),
    },
  };

  for (const key of SENSITIVE_SETTINGS_KEYS) {
    if (isMaskedSecret(input[key])) {
      (merged as unknown as Record<string, unknown>)[key] = base[key] ?? "";
    }
  }

  return merged;
}

function changedKeys(before: AppSettings, after: AppSettings): Array<keyof AppSettings> {
  const keys = Object.keys(after) as Array<keyof AppSettings>;
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function auditPayload(before: AppSettings, after: AppSettings): Record<string, unknown> {
  const changed = changedKeys(before, after);
  return {
    changedKeys: changed,
    sensitiveKeysChanged: changed.filter((key) => SENSITIVE_SETTINGS_KEYS.includes(key as (typeof SENSITIVE_SETTINGS_KEYS)[number])),
    llmConfigured: Boolean(after.llmProvider || after.llmBaseUrl || after.llmApiKey || after.deepseekApiKey || after.openaiApiKey || after.openrouterApiKey),
    mailboxConfigured: Boolean(after.email && after.imapHost && after.smtpHost),
    emailVerificationConfigured: Boolean(after.hunterApiKey),
    leadSourceConfigured: Boolean(after.apolloApiKey),
    crmConfigured: Boolean(after.crmProvider && after.crmProvider !== "none" && after.crmApiKey),
    notificationsConfigured: Boolean(after.notificationProvider && after.notificationProvider !== "none" && after.notificationWebhookUrl),
    searchEngine: after.searchEngine,
    defaultModel: after.defaultModel,
    llmProvider: after.llmProvider || "auto",
    gatewayAccessMode: after.gatewayAccessMode,
    intakeRetentionMode: after.intakeRetentionMode,
    autoCapture: after.autoCapture,
  };
}

export function getMaskedSettings(): Partial<AppSettings> {
  return maskSettings(readSettings());
}

export function updateSettings(input: SettingsInput): {
  settings: AppSettings;
  masked: Partial<AppSettings>;
  audit: Record<string, unknown>;
} {
  const before = readSettings();
  const settings = mergeSettings(input, before);
  writeSettings(settings);
  return {
    settings,
    masked: maskSettings(settings),
    audit: auditPayload(before, settings),
  };
}

export function importSettings(input: SettingsInput): {
  settings: AppSettings;
  masked: Partial<AppSettings>;
  audit: Record<string, unknown>;
} {
  const before = readSettings();
  const imported = importStoredSettings(JSON.stringify(input));
  const settings = mergeSettings(imported, before);
  writeSettings(settings);
  return {
    settings,
    masked: maskSettings(settings),
    audit: auditPayload(before, settings),
  };
}
