import type { AppSettings } from "@/lib/config-store";

export type ConfigState = AppSettings;

export type OnboardingStepId =
  | "start"
  | "customers"
  | "email"
  | "access"
  | "model"
  | "search"
  | "storage"
  | "upload"
  | "synthesize"
  | "finish";

export type StepStatus = "done" | "missing" | "optional";
export type OnboardingStepGroup = "quickstart" | "recommended" | "advanced" | "finish";

export interface JadenosOnboardingStep {
  id: OnboardingStepId;
  title: string;
  zhTitle: string;
  command: string;
  prompt: string;
  zhPrompt: string;
  status: StepStatus;
  core: boolean;
  group: OnboardingStepGroup;
}

export interface ReadinessItem {
  id: "access" | "model" | "email" | "search" | "storage" | "upload" | "synthesize";
  label: string;
  zhLabel: string;
  done: boolean;
  blocking: boolean;
}

export const JADENOS_ONBOARDING_ROUTE = "/jadenos/onboarding";

export interface OnboardingRuntimeState {
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

export function hasEmailConfig(config: ConfigState) {
  return hasValue(config.email) && (hasValue(config.imapHost) || hasValue(config.smtpHost));
}

export function hasSearchConfig(config: ConfigState) {
  if (config.searchEngine === "tavily") return isConfiguredSecret(config.tavilyApiKey);
  return hasValue(config.searchEngine);
}

export function getReadinessItems(
  config: ConfigState,
  runtime: OnboardingRuntimeState = {}
): ReadinessItem[] {
  return [
    {
      id: "access",
      label: "Access mode",
      zhLabel: "访问模式",
      done: config.gatewayAccessMode === "local" || config.gatewayAccessMode === "lan",
      blocking: false,
    },
    {
      id: "model",
      label: "Real model",
      zhLabel: "真实模型",
      done: hasRealModelConfig(config),
      blocking: false,
    },
    {
      id: "email",
      label: "Mailbox",
      zhLabel: "邮箱",
      done: hasEmailConfig(config),
      blocking: false,
    },
    {
      id: "search",
      label: "Search / verify",
      zhLabel: "搜索/验证",
      done: hasSearchConfig(config),
      blocking: false,
    },
    {
      id: "storage",
      label: "Local folder",
      zhLabel: "本地目录",
      done: Boolean(runtime.storageKnown),
      blocking: false,
    },
    {
      id: "upload",
      label: "Test file",
      zhLabel: "测试文件",
      done: Boolean(runtime.testUploadCompleted),
      blocking: false,
    },
    {
      id: "synthesize",
      label: "Synthesis",
      zhLabel: "文件归纳",
      done: Boolean(runtime.synthesisTestCompleted),
      blocking: false,
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
  const blockingItems = items.filter((item) => item.blocking);
  return {
    items,
    completed,
    total,
    allReady: blockingItems.every((item) => item.done),
    canEnterProduct: true,
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
  const optionalStatusFor = (id: ReadinessItem["id"]) => (
    readiness.items.find((item) => item.id === id)?.done ? "done" : "optional"
  );

  return [
    {
      id: "start",
      title: "Quick start",
      zhTitle: "快速开始",
      command: "Open product",
      prompt: "You can enter SSA now. Start from Customer Follow-up, existing demo data, or the workbench, then return here when you want to tune setup.",
      zhPrompt: "现在就可以进入 SSA。先从客户跟进、已有演示数据或工作台开始；需要调设置时再回到这里。",
      status: "done",
      core: false,
      group: "quickstart",
    },
    {
      id: "customers",
      title: "Open follow-up, demo data, or import paths",
      zhTitle: "查看客户跟进、演示数据或导入入口",
      command: "Follow-up / Demo data / Import",
      prompt: "Open Customer Follow-up to inspect existing accounts. If the workspace is empty, load demo data, import files through Data Import, or connect a mailbox later.",
      zhPrompt: "打开客户跟进查看已有客户。如果工作区为空，可以加载演示数据，也可以通过资料导入添加文件，或稍后连接邮箱。",
      status: "done",
      core: false,
      group: "quickstart",
    },
    {
      id: "model",
      title: "Connect a real model",
      zhTitle: "连接真实模型",
      command: "Configure model",
      prompt: "Recommended for serious work. Demo mode is enough to explore the product first, so this is not a gate to entering SSA.",
      zhPrompt: "正式使用前建议连接真实模型。先体验产品时可以使用演示模式，因此这不是进入 SSA 的门槛。",
      status: optionalStatusFor("model"),
      core: false,
      group: "recommended",
    },
    {
      id: "email",
      title: "Connect mailbox or import customers",
      zhTitle: "连接邮箱或导入客户",
      command: "Mailbox / Import customers",
      prompt: "Connect mailbox when you are ready for real inbound work. You can also keep using existing customers and import lists later.",
      zhPrompt: "准备处理真实来信时再连接邮箱。也可以先用已有客户，稍后再导入客户列表。",
      status: optionalStatusFor("email"),
      core: false,
      group: "recommended",
    },
    {
      id: "search",
      title: "Search and verification services",
      zhTitle: "搜索与验证服务",
      command: "Configure search",
      prompt: "Add search or email-verification keys when you want lead research and address checks to use live providers.",
      zhPrompt: "需要真实线索搜索和邮箱验证时，再补充搜索或验证服务的 Key。",
      status: optionalStatusFor("search"),
      core: false,
      group: "recommended",
    },
    {
      id: "access",
      title: "Choose access mode",
      zhTitle: "选择访问方式",
      command: "Local only or LAN",
      prompt: "Use local-only on this computer, or enable LAN so devices on the same network can open SSA by host IP and port.",
      zhPrompt: "可选择仅本机使用，也可开启 LAN，让同一局域网设备通过本机 IP 和端口打开 SSA。",
      status: statusFor("access"),
      core: false,
      group: "advanced",
    },
    {
      id: "storage",
      title: "Review local folder",
      zhTitle: "查看本地目录",
      command: "Check local folder",
      prompt: "Review the local folder used by SSA. Browser preview and download go through the SSA gateway, not direct host file access.",
      zhPrompt: "查看 SSA 使用的本地目录。浏览器预览和下载都通过 SSA 网关完成，不直接读取宿主机文件。",
      status: optionalStatusFor("storage"),
      core: false,
      group: "advanced",
    },
    {
      id: "upload",
      title: "Upload a test file",
      zhTitle: "上传测试文件",
      command: "Test data import",
      prompt: "Optional deployment check. Upload a sample only when you want to verify local file saving before using real documents.",
      zhPrompt: "这是可选部署自检。只有想先验证本地文件保存时，才需要上传示例文件。",
      status: optionalStatusFor("upload"),
      core: false,
      group: "advanced",
    },
    {
      id: "synthesize",
      title: "Run synthesis once",
      zhTitle: "运行一次归纳",
      command: "Create synthesis",
      prompt: "Optional deployment check. Run synthesis after a test upload to prove read/write behavior, or skip it and start with customers.",
      zhPrompt: "这是可选部署自检。上传测试文件后可运行一次归纳验证读写，也可以跳过并先从客户开始。",
      status: optionalStatusFor("synthesize"),
      core: false,
      group: "advanced",
    },
    {
      id: "finish",
      title: "Save setup checklist",
      zhTitle: "保存设置清单",
      command: "Save and enter",
      prompt: "Save the checklist state when you are done reviewing. You can enter Customers at any time and return to Settings later.",
      zhPrompt: "检查完后保存清单状态即可。你随时都可以进入客户页，后续再从设置回来补齐。",
      status: readiness.allReady ? "done" : "optional",
      core: false,
      group: "finish",
    },
  ];
}
