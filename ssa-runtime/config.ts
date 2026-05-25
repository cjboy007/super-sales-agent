/**
 * SSA Runtime Configuration
 *
 * Resolves all paths relative to PROJECT_ROOT. No hardcoded .openclaw paths.
 * Supports env-based overrides for every path.
 */

import path from "path";

const PROJECT_ROOT =
  process.env.SSA_PROJECT_ROOT ||
  process.env.MONOREPO_ROOT ||
  path.resolve(__dirname, "..");

export type RuntimeMode = "production" | "development" | "test";

export interface SSAConfig {
  mode: RuntimeMode;
  projectRoot: string;
  paths: {
    data: string;
    shared: string;
    skills: string;
    heroPublished: string;
    farreach: string;
    webFrontend: string;
    output: string;
    mailArchive: string;
    signatures: string;
  };
  db: {
    agentState: string;
    approvalEngine: string;
    crm: string;
    runtime: string;
  };
  llm: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
    mockMode: boolean;
  };
}

function resolveFromRoot(root: string, sub: string): string {
  return path.resolve(root, sub);
}

export function loadConfig(overrides?: Partial<SSAConfig>): SSAConfig {
  const mode: RuntimeMode =
    (process.env.SSA_MODE as RuntimeMode) ||
    (process.env.NODE_ENV === "test"
      ? "test"
      : process.env.NODE_ENV === "production"
        ? "production"
        : "development");

  const root = overrides?.projectRoot || PROJECT_ROOT;

  const config: SSAConfig = {
    mode,
    projectRoot: root,
    paths: {
      data: process.env.SSA_DATA_DIR || resolveFromRoot(root, "data"),
      shared: process.env.SSA_SHARED_DIR || resolveFromRoot(root, "shared"),
      skills: process.env.SSA_SKILLS_DIR || resolveFromRoot(root, "skills"),
      heroPublished: process.env.SSA_HERO_DIR || resolveFromRoot(root, "hero-pumps"),
      farreach: process.env.SSA_FARREACH_DIR || resolveFromRoot(root, "farreach"),
      webFrontend: process.env.SSA_WEB_DIR || resolveFromRoot(root, "web-frontend"),
      output: process.env.SSA_OUTPUT_DIR || resolveFromRoot(root, "output"),
      mailArchive: process.env.SSA_MAIL_ARCHIVE || resolveFromRoot(root, "mail-archive"),
      signatures: process.env.SSA_SIGNATURES_DIR || resolveFromRoot(root, "hero-pumps/config/signatures"),
    },
    db: {
      agentState: process.env.SSA_DB_AGENT_STATE || resolveFromRoot(root, "data/agent_state.db"),
      approvalEngine: process.env.SSA_DB_APPROVAL || resolveFromRoot(root, "data/approval_engine.db"),
      crm: process.env.SSA_DB_CRM || resolveFromRoot(root, "data/crm.db"),
      runtime: process.env.SSA_DB_RUNTIME || resolveFromRoot(root, "data/ssa_runtime.db"),
    },
    llm: {
      provider: process.env.SSA_LLM_PROVIDER || "mock",
      apiKey: process.env.SSA_LLM_API_KEY || "",
      model: process.env.SSA_LLM_MODEL || "qwen-plus",
      baseUrl: process.env.SSA_LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      mockMode: mode === "test" || process.env.SSA_LLM_MOCK === "true",
    },
    ...overrides,
  };

  return config;
}

let _config: SSAConfig | null = null;

export function getConfig(): SSAConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}

export { PROJECT_ROOT };
