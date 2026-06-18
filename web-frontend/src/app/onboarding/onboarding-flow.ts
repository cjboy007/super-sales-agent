import type { AppSettings } from "@/lib/config-store";

export type ConfigState = AppSettings;

export type OnboardingStepId =
  | "token"
  | "access"
  | "model"
  | "storage"
  | "upload"
  | "synthesize"
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
  id: "token" | "access" | "model" | "storage" | "upload" | "synthesize";
  label: string;
  zhLabel: string;
  done: boolean;
}

export const JADENOS_ONBOARDING_ROUTE = "/jadenos/onboarding";

export interface OnboardingRuntimeState {
  tokenPresent?: boolean;
  storageKnown?: boolean;
  testUploadCompleted?: boolean;
  synthesisTestCompleted?: boolean;
}

export const DEFAULT_CONFIG: ConfigState = {
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

export function hasValue(value: string | undefined) {
  return String(value || "").trim().length > 0;
}

export function isConfiguredSecret(value: string | undefined) {
  return hasValue(value) || String(value || "").includes("****");
}

export function hasRealModelConfig(config: ConfigState) {
  return hasValue(config.llmProvider)
    || hasValue(config.llmBaseUrl)
    || isConfiguredSecret(config.llmApiKey)
    || isConfiguredSecret(config.deepseekApiKey)
    || isConfiguredSecret(config.openaiApiKey)
    || isConfiguredSecret(config.openrouterApiKey);
}

export function getReadinessItems(
  config: ConfigState,
  runtime: OnboardingRuntimeState = {}
): ReadinessItem[] {
  return [
    {
      id: "token",
      label: "Access pass",
      zhLabel: "访问口令",
      done: Boolean(runtime.tokenPresent),
    },
    {
      id: "access",
      label: "Access mode",
      zhLabel: "访问模式",
      done: config.gatewayAccessMode === "local" || config.gatewayAccessMode === "lan",
    },
    {
      id: "model",
      label: "Real model",
      zhLabel: "真实模型",
      done: hasRealModelConfig(config),
    },
    {
      id: "storage",
      label: "Local folder",
      zhLabel: "本地目录",
      done: Boolean(runtime.storageKnown),
    },
    {
      id: "upload",
      label: "Test file",
      zhLabel: "测试文件",
      done: Boolean(runtime.testUploadCompleted),
    },
    {
      id: "synthesize",
      label: "Synthesis",
      zhLabel: "文件归纳",
      done: Boolean(runtime.synthesisTestCompleted),
    },
  ];
}

export function getOnboardingReadiness(
  config: ConfigState,
  runtime: OnboardingRuntimeState = {}
) {
  const items = getReadinessItems(config, runtime);
  const completed = items.filter((item) => item.done).length;
  const total = items.length;
  const blockingItems = items.filter((item) => item.id !== "model");
  return {
    items,
    completed,
    total,
    allReady: blockingItems.every((item) => item.done),
  };
}

export function getJadenosOnboardingSteps(
  config: ConfigState,
  runtime: OnboardingRuntimeState = {}
): JadenosOnboardingStep[] {
  const readiness = getOnboardingReadiness(config, runtime);
  const statusFor = (id: ReadinessItem["id"]) => (
    readiness.items.find((item) => item.id === id)?.done ? "done" : "missing"
  );

  return [
    {
      id: "token",
      title: "Save access pass",
      zhTitle: "保存访问口令",
      command: "Save access pass",
      prompt: "Save the access pass in this browser. Local-only and LAN access both keep token protection.",
      zhPrompt: "先在这个浏览器保存访问口令。仅本机和 LAN 局域网访问都保留口令保护。",
      status: statusFor("token"),
      core: true,
    },
    {
      id: "access",
      title: "Choose access mode",
      zhTitle: "选择访问方式",
      command: "Local only or LAN",
      prompt: "Use local-only on this computer, or enable LAN so devices on the same network can open SSA by host IP and port.",
      zhPrompt: "可选择仅本机使用，也可开启 LAN，让同一局域网设备通过本机 IP 和端口打开 SSA。",
      status: statusFor("access"),
      core: true,
    },
    {
      id: "model",
      title: "Connect a real model",
      zhTitle: "连接真实模型",
      command: "Configure model",
      prompt: "Choose a local model or China model service when ready. Mock fallback is allowed for first run, but it is not counted as a real model.",
      zhPrompt: "你可以按自己的供应商选择本地模型或国内模型服务。首次启动可以先用 Mock fallback，但它不会被算作真实模型。",
      status: statusFor("model"),
      core: true,
    },
    {
      id: "storage",
      title: "Review local folder",
      zhTitle: "查看本地目录",
      command: "Check local folder",
      prompt: "Review the local folder used by SSA. Browser preview and download go through the SSA gateway, not direct host file access.",
      zhPrompt: "查看 SSA 使用的本地目录。浏览器预览和下载都通过 SSA 网关完成，不直接读取宿主机文件。",
      status: statusFor("storage"),
      core: true,
    },
    {
      id: "upload",
      title: "Upload a test file",
      zhTitle: "上传测试文件",
      command: "Test Intake upload",
      prompt: "Drop one test file into Intake so SSA saves it in the local folder and keeps the original.",
      zhPrompt: "向投递台放入一个测试文件，让 SSA 保存到本地目录，并保留原始文件。",
      status: statusFor("upload"),
      core: true,
    },
    {
      id: "synthesize",
      title: "Run synthesis once",
      zhTitle: "运行一次归纳",
      command: "Create synthesis",
      prompt: "Ask SSA to summarize the uploaded test file and write the result back to local storage.",
      zhPrompt: "让 SSA 归纳刚上传的测试文件，并把结果写回本地存储。",
      status: statusFor("synthesize"),
      core: true,
    },
    {
      id: "finish",
      title: "Finish setup",
      zhTitle: "完成设置",
      command: "Review launch readiness",
      prompt: readiness.allReady
        ? "First-run setup is ready. Open Cockpit now, and connect a real model later from Settings if needed."
        : "Some first-run items are still missing. You can keep going now or finish the missing items in Settings.",
      zhPrompt: readiness.allReady
        ? "首次启动设置已就绪。现在可以进入驾驶舱；真实模型之后可在设置里连接。"
        : "还有首次启动项目未完成。你可以继续设置，也可以之后在设置里补齐。",
      status: readiness.allReady ? "done" : "missing",
      core: false,
    },
  ];
}
