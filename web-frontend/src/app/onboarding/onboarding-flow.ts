import type { AppSettings } from "@/lib/config-store";

export type ConfigState = AppSettings;

export type OnboardingStepId =
  | "identity"
  | "llm"
  | "email"
  | "verification"
  | "research"
  | "optional"
  | "finish";

export type StepStatus = "done" | "missing" | "optional";

export interface JadenosOnboardingStep {
  id: OnboardingStepId;
  title: string;
  zhTitle: string;
  command: string;
  prompt: string;
  zhPrompt: string;
  status: StepStatus;
  core: boolean;
}

export interface ReadinessItem {
  id: "llm" | "email" | "verification" | "research";
  label: string;
  zhLabel: string;
  done: boolean;
}

export const JADENOS_ONBOARDING_ROUTE = "/jadenos/onboarding";

export const DEFAULT_CONFIG: ConfigState = {
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
  defaultModel: "deepseek-v4-pro",
  smtpHost: "",
  smtpPort: "465",
  smtpEncryption: "ssl",
  imapHost: "",
  imapPort: "993",
  imapEncryption: "ssl",
  email: "",
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

export function hasValue(value: string) {
  return value.trim().length > 0;
}

export function isConfiguredSecret(value: string) {
  return hasValue(value) || value.includes("****");
}

export function getReadinessItems(config: ConfigState): ReadinessItem[] {
  return [
    {
      id: "llm",
      label: "LLM",
      zhLabel: "LLM",
      done: isConfiguredSecret(config.deepseekApiKey) || isConfiguredSecret(config.openaiApiKey) || isConfiguredSecret(config.openrouterApiKey),
    },
    {
      id: "email",
      label: "Work email",
      zhLabel: "工作邮箱",
      done: hasValue(config.email) && hasValue(config.imapHost) && hasValue(config.smtpHost) && isConfiguredSecret(config.emailPassword),
    },
    {
      id: "verification",
      label: "Hunter verification",
      zhLabel: "Hunter 邮箱核验",
      done: isConfiguredSecret(config.hunterApiKey),
    },
    {
      id: "research",
      label: "Search research",
      zhLabel: "搜索调研",
      done: hasValue(config.searchEngine) && isConfiguredSecret(config.tavilyApiKey),
    },
  ];
}

export function getOnboardingReadiness(config: ConfigState) {
  const items = getReadinessItems(config);
  const completed = items.filter((item) => item.done).length;
  const total = items.length;
  return {
    items,
    completed,
    total,
    allReady: completed === total,
  };
}

export function getJadenosOnboardingSteps(config: ConfigState): JadenosOnboardingStep[] {
  const readiness = getOnboardingReadiness(config);
  const isOptionalConnected = isConfiguredSecret(config.apolloApiKey)
    || (config.crmProvider !== "none" && isConfiguredSecret(config.crmApiKey))
    || (config.notificationProvider !== "none" && isConfiguredSecret(config.notificationWebhookUrl));

  return [
    {
      id: "identity",
      title: "Name the workspace",
      zhTitle: "确认工作台",
      command: "$ jadenos onboarding",
      prompt: "JadenOS starts with a local sales workspace. Files go through Intake; keys and connectors stay editable in Settings.",
      zhPrompt: "JadenOS 会先建立本地销售工作台。文件走投递台；密钥和连接器之后可在设置里修改。",
      status: "done",
      core: false,
    },
    {
      id: "llm",
      title: "Connect DeepSeek",
      zhTitle: "连接 DeepSeek",
      command: "$ connect deepseek",
      prompt: "Paste the DeepSeek key and keep deepseek-v4-pro as the default model unless you intentionally change it.",
      zhPrompt: "填入 DeepSeek 密钥，默认模型保持 deepseek-v4-pro，除非你明确要换。",
      status: readiness.items[0].done ? "done" : "missing",
      core: true,
    },
    {
      id: "email",
      title: "Connect work email",
      zhTitle: "连接工作邮箱",
      command: "$ connect mailbox",
      prompt: "Connect IMAP for reading and SMTP for drafts. Customer sends still require approval.",
      zhPrompt: "连接 IMAP 收信和 SMTP 草稿。客户邮件发送仍需要审批。",
      status: readiness.items[1].done ? "done" : "missing",
      core: true,
    },
    {
      id: "verification",
      title: "Enable verification",
      zhTitle: "开启邮箱核验",
      command: "$ connect hunter",
      prompt: "Hunter is the first verifier before cold outbound. Keep checks on before sending to new leads.",
      zhPrompt: "Hunter 是冷邮件的第一版核验器。给新线索发信前建议保持核验开启。",
      status: readiness.items[2].done ? "done" : "missing",
      core: true,
    },
    {
      id: "research",
      title: "Connect research",
      zhTitle: "连接调研",
      command: "$ connect tavily",
      prompt: "Tavily gives JadenOS company context, lead research, and personalization inputs.",
      zhPrompt: "Tavily 为 JadenOS 提供公司背景、线索调研和个性化素材。",
      status: readiness.items[3].done ? "done" : "missing",
      core: true,
    },
    {
      id: "optional",
      title: "Add optional connectors",
      zhTitle: "添加可选连接",
      command: "$ connect extras --later-ok",
      prompt: "Apollo, CRM sync, and notifications help after the first flow works. They do not block launch.",
      zhPrompt: "Apollo、CRM 同步和通知适合核心流程跑通后再接，不阻塞上线。",
      status: isOptionalConnected ? "done" : "optional",
      core: false,
    },
    {
      id: "finish",
      title: "Finish setup",
      zhTitle: "完成设置",
      command: "$ jadenos status",
      prompt: readiness.allReady
        ? "Core setup is ready. Open Cockpit to operate or Settings to revise the setup later."
        : "Some core setup is still missing. You can keep going now or finish the missing items in Settings.",
      zhPrompt: readiness.allReady
        ? "核心设置已就绪。打开驾驶舱开始操作，或之后到设置里修改。"
        : "还有核心设置未完成。你可以继续设置，也可以之后在设置里补齐。",
      status: readiness.allReady ? "done" : "missing",
      core: false,
    },
  ];
}
