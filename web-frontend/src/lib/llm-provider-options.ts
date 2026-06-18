export type LlmProviderId =
  | "mock"
  | "local-openai"
  | "ollama"
  | "lm-studio"
  | "vllm"
  | "llama.cpp"
  | "deepseek"
  | "dashscope"
  | "dashscope-coding-plan"
  | "zhipu"
  | "zhipu-coding-plan"
  | "moonshot"
  | "kimi-code"
  | "doubao"
  | "doubao-coding-plan"
  | "qianfan"
  | "hunyuan"
  | "openai"
  | "openrouter";

export type ConfigurableLlmProviderId = Exclude<LlmProviderId, "mock">;

export interface LlmProviderOption {
  id: ConfigurableLlmProviderId;
  label: string;
  zhLabel: string;
  defaultBaseUrl: string;
  category: "local" | "api" | "coding-plan" | "gateway";
}

export const LLM_PROVIDER_OPTIONS: LlmProviderOption[] = [
  {
    id: "ollama",
    label: "Ollama",
    zhLabel: "Ollama 本地模型",
    defaultBaseUrl: "http://host.docker.internal:11434/v1",
    category: "local",
  },
  {
    id: "lm-studio",
    label: "LM Studio",
    zhLabel: "LM Studio 本地模型",
    defaultBaseUrl: "http://host.docker.internal:1234/v1",
    category: "local",
  },
  {
    id: "local-openai",
    label: "Custom OpenAI-compatible",
    zhLabel: "自定义 OpenAI-compatible",
    defaultBaseUrl: "http://host.docker.internal:8000/v1",
    category: "gateway",
  },
  {
    id: "vllm",
    label: "vLLM",
    zhLabel: "vLLM 本地/内网服务",
    defaultBaseUrl: "http://host.docker.internal:8000/v1",
    category: "local",
  },
  {
    id: "llama.cpp",
    label: "llama.cpp server",
    zhLabel: "llama.cpp server",
    defaultBaseUrl: "http://host.docker.internal:8080/v1",
    category: "local",
  },
  {
    id: "deepseek",
    label: "DeepSeek API",
    zhLabel: "DeepSeek 标准 API",
    defaultBaseUrl: "https://api.deepseek.com",
    category: "api",
  },
  {
    id: "dashscope",
    label: "Qwen / DashScope API",
    zhLabel: "通义千问 / DashScope 标准 API",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    category: "api",
  },
  {
    id: "dashscope-coding-plan",
    label: "Qwen Coding Plan",
    zhLabel: "通义千问 Coding Plan",
    defaultBaseUrl: "https://coding.dashscope.aliyuncs.com/v1",
    category: "coding-plan",
  },
  {
    id: "zhipu",
    label: "Zhipu GLM API",
    zhLabel: "智谱 GLM 标准 API",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    category: "api",
  },
  {
    id: "zhipu-coding-plan",
    label: "Zhipu Coding Plan",
    zhLabel: "智谱 Coding Plan",
    defaultBaseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    category: "coding-plan",
  },
  {
    id: "moonshot",
    label: "Kimi / Moonshot API",
    zhLabel: "Kimi / Moonshot 标准 API",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    category: "api",
  },
  {
    id: "kimi-code",
    label: "Kimi Code API",
    zhLabel: "Kimi Code API",
    defaultBaseUrl: "https://api.kimi.com/coding/v1",
    category: "coding-plan",
  },
  {
    id: "doubao",
    label: "Doubao / Volcengine Ark API",
    zhLabel: "豆包 / 火山方舟标准 API",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    category: "api",
  },
  {
    id: "doubao-coding-plan",
    label: "Doubao Coding Plan",
    zhLabel: "豆包 / 火山方舟 Coding Plan",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    category: "coding-plan",
  },
  {
    id: "qianfan",
    label: "Baidu Qianfan API",
    zhLabel: "百度千帆标准 API",
    defaultBaseUrl: "https://qianfan.baidubce.com/v2",
    category: "api",
  },
  {
    id: "hunyuan",
    label: "Tencent Hunyuan API",
    zhLabel: "腾讯混元标准 API",
    defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    category: "api",
  },
  {
    id: "openai",
    label: "OpenAI",
    zhLabel: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    category: "api",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    zhLabel: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    category: "api",
  },
];

const KNOWN_PROVIDER_IDS = new Set<LlmProviderId>(["mock", ...LLM_PROVIDER_OPTIONS.map((option) => option.id)]);

export function normalizeLlmProviderId(value: string | undefined): LlmProviderId | "" {
  const provider = String(value || "").trim().toLowerCase();
  if (!provider) return "";
  if (provider === "local" || provider === "openai-compatible" || provider === "local-openai-compatible") return "local-openai";
  if (provider === "lmstudio" || provider === "lm_studio") return "lm-studio";
  if (provider === "llamacpp" || provider === "llama-cpp") return "llama.cpp";
  if (provider === "dashscope" || provider === "qwen" || provider === "tongyi" || provider === "aliyun") return "dashscope";
  if (provider === "dashscope-coding" || provider === "qwen-code" || provider === "qwen-coding" || provider === "qwen-coding-plan") return "dashscope-coding-plan";
  if (provider === "glm" || provider === "bigmodel") return "zhipu";
  if (provider === "zhipu-code" || provider === "glm-coding-plan") return "zhipu-coding-plan";
  if (provider === "kimi") return "moonshot";
  if (provider === "kimi-coding" || provider === "kimi-code-api" || provider === "kimi-coding-plan") return "kimi-code";
  if (provider === "volcengine" || provider === "ark" || provider === "doubao-ark") return "doubao";
  if (provider === "volcengine-coding-plan" || provider === "ark-coding-plan" || provider === "doubao-coding") return "doubao-coding-plan";
  if (provider === "baidu" || provider === "baidu-qianfan") return "qianfan";
  if (provider === "tencent" || provider === "tencent-hunyuan") return "hunyuan";
  return KNOWN_PROVIDER_IDS.has(provider as LlmProviderId) ? provider as LlmProviderId : "";
}

export function defaultBaseUrlForProvider(provider: string | undefined): string {
  const normalized = normalizeLlmProviderId(provider);
  if (!normalized || normalized === "mock") return "";
  return LLM_PROVIDER_OPTIONS.find((option) => option.id === normalized)?.defaultBaseUrl || "";
}

export function isLocalLlmProvider(provider: string | undefined): boolean {
  const normalized = normalizeLlmProviderId(provider);
  return normalized === "local-openai"
    || normalized === "ollama"
    || normalized === "lm-studio"
    || normalized === "vllm"
    || normalized === "llama.cpp";
}
