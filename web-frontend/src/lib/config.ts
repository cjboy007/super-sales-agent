import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

export interface AppConfig {
  apiKeys: {
    tavily: string;
    openai: string;
  };
  email: {
    imapHost: string;
    imapPort: number;
    smtpHost: string;
    smtpPort: number;
    username: string;
    password: string;
  };
  search: {
    provider: string;
    searxngUrl: string;
  };
}

export function readConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    return {
      apiKeys: { tavily: "", openai: "" },
      email: {
        imapHost: "",
        imapPort: 993,
        smtpHost: "",
        smtpPort: 465,
        username: "",
        password: "",
      },
      search: { provider: "tavily", searxngUrl: "" },
    };
  }
}

export function writeConfig(config: AppConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/** Mask sensitive fields for API responses */
export function sanitizeConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    apiKeys: {
      tavily: config.apiKeys.tavily ? `${config.apiKeys.tavily.slice(0, 4)}****` : "",
      openai: config.apiKeys.openai ? `${config.apiKeys.openai.slice(0, 8)}****` : "",
    },
    email: {
      ...config.email,
      password: config.email.password ? "********" : "",
    },
  };
}
