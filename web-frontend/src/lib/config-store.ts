import fs from "fs";
import { ensureSsaDataPath } from "./ssa-data-paths";

// Resolve per-call so SSA_DATA_ROOT is honored at read/write time, not frozen
// at module import. ensureSsaDataPath also makes the parent dir (needed for writes).
function configPath(): string {
  return ensureSsaDataPath("config.json");
}

// ─── Config schema matching settings page ────────────────────────────────────

export interface AppSettings {
  // Local gateway
  gatewayAccessMode?: "local" | "lan";
  gatewayBindHost?: string;
  gatewayPublicHost?: string;
  intakeRetentionMode?: "keep" | "archive";
  intakeMaxActiveSessions?: number;
  // LLM provider
  llmProvider?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  // API keys
  deepseekApiKey: string;
  openaiApiKey: string;
  openrouterApiKey: string;
  geminiApiKey: string;
  tavilyApiKey: string;
  hunterApiKey: string;
  apolloApiKey: string;
  crmProvider: string;
  crmApiKey: string;
  notificationProvider: string;
  notificationWebhookUrl: string;
  defaultModel: string;
  // Email
  smtpHost: string;
  smtpPort: string;
  smtpEncryption: string;
  imapHost: string;
  imapPort: string;
  imapEncryption: string;
  email: string;
  emailPassword: string;
  autoCapture: boolean;
  // Search
  searchEngine: string;
  searchRegion: string;
  maxResults: number;
  searchDepth: string;
  autoResearch: {
    leadResearch: boolean;
    priceMonitor: boolean;
    trendTracking: boolean;
    emailVerify: boolean;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  gatewayAccessMode: "local",
  gatewayBindHost: "127.0.0.1",
  gatewayPublicHost: "",
  intakeRetentionMode: "keep",
  intakeMaxActiveSessions: 100,
  llmProvider: "",
  llmBaseUrl: "",
  llmApiKey: "",
  deepseekApiKey: "",
  openaiApiKey: "",
  openrouterApiKey: "",
  geminiApiKey: "",
  tavilyApiKey: "",
  hunterApiKey: "",
  apolloApiKey: "",
  crmProvider: "none",
  crmApiKey: "",
  notificationProvider: "none",
  notificationWebhookUrl: "",
  defaultModel: "",
  smtpHost: "smtp.qiye.aliyun.com",
  smtpPort: "465",
  smtpEncryption: "ssl",
  imapHost: "imap.qiye.aliyun.com",
  imapPort: "993",
  imapEncryption: "ssl",
  email: "sales@heropumps.com.cn",
  emailPassword: "",
  autoCapture: true,
  searchEngine: "tavily",
  searchRegion: "global",
  maxResults: 10,
  searchDepth: "standard",
  autoResearch: {
    leadResearch: true,
    priceMonitor: true,
    trendTracking: false,
    emailVerify: true,
  },
};

// Fields that should be Base64-encoded on disk
const SENSITIVE_FIELDS: (keyof AppSettings)[] = [
  "deepseekApiKey",
  "llmApiKey",
  "openaiApiKey",
  "openrouterApiKey",
  "geminiApiKey",
  "tavilyApiKey",
  "hunterApiKey",
  "apolloApiKey",
  "crmApiKey",
  "notificationWebhookUrl",
  "emailPassword",
];

// ─── Base64 helpers ──────────────────────────────────────────────────────────

function encodeValue(value: string): string {
  if (!value) return "";
  return Buffer.from(value, "utf-8").toString("base64");
}

function decodeValue(encoded: string): string {
  if (!encoded) return "";
  try {
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    // If it's not valid base64, return as-is (backward compat)
    return encoded;
  }
}

// ─── Disk I/O ────────────────────────────────────────────────────────────────

interface StoredConfig {
  [key: string]: unknown;
  _encrypted?: string[]; // track which fields were encrypted
}

export function readSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const stored: StoredConfig = JSON.parse(raw);

    const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    const allKeys = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];

    for (const key of allKeys) {
      if (key === "autoResearch") {
        result.autoResearch = {
          ...DEFAULT_SETTINGS.autoResearch,
          ...((stored.autoResearch as Record<string, unknown>) || {}),
        };
      } else if (SENSITIVE_FIELDS.includes(key)) {
        const val = stored[key];
        result[key] = typeof val === "string" ? decodeValue(val) : (val ?? "");
      } else {
        result[key] = stored[key] ?? DEFAULT_SETTINGS[key];
      }
    }

    return result as unknown as AppSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(settings: AppSettings): void {
  const stored: StoredConfig = {};

  const allKeys = Object.keys(settings) as (keyof AppSettings)[];
  for (const key of allKeys) {
    if (SENSITIVE_FIELDS.includes(key)) {
      const val = settings[key];
      if (typeof val === "string" && val) {
        stored[key] = encodeValue(val);
      } else {
        stored[key] = "";
      }
    } else {
      stored[key] = settings[key];
    }
  }

  stored._encrypted = SENSITIVE_FIELDS as unknown as string[];

  fs.writeFileSync(configPath(), JSON.stringify(stored, null, 2), "utf-8");
}

/** Return settings with sensitive fields masked (for API responses) */
export function maskSettings(settings: AppSettings): Partial<AppSettings> {
  const result: Record<string, unknown> = { ...settings };
  for (const key of SENSITIVE_FIELDS) {
    const val = settings[key];
    if (typeof val === "string" && val.length > 8) {
      result[key] = `${val.slice(0, 4)}****${val.slice(-4)}`;
    } else if (val) {
      result[key] = "****";
    }
  }
  return result as Partial<AppSettings>;
}

/** Export full settings (including secrets) as JSON string */
export function exportSettings(settings: AppSettings): string {
  return JSON.stringify(settings, null, 2);
}

/** Import settings from JSON string, merging with defaults */
export function importSettings(jsonString: string): AppSettings {
  const parsed = JSON.parse(jsonString) as Partial<AppSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    autoResearch: {
      ...DEFAULT_SETTINGS.autoResearch,
      ...(parsed.autoResearch || {}),
    },
  };
}
