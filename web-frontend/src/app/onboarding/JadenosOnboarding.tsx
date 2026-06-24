"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cx } from "@/components/battle-station/theme";
import {
  BattleBadge,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  BattleText,
  CommandButton,
  InputField,
  SelectField,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import { useProject } from "@/lib/project";
import { LLM_PROVIDER_OPTIONS, defaultBaseUrlForProvider } from "@/lib/llm-provider-options";
import {
  DEFAULT_CONFIG,
  JADENOS_ONBOARDING_ROUTE,
  type ConfigState,
  type JadenosOnboardingStep,
  type OnboardingStepGroup,
  type OnboardingRuntimeState,
  getJadenosOnboardingSteps,
  getOnboardingReadiness,
} from "./onboarding-flow";

const LOCAL_GATEWAY_API = "/api/local-gateway";
const LOCAL_STORAGE_API = "/api/local-storage";
const LLM_TEST_API = "/api/llm/test";

interface GatewayStatus {
  accessMode: "local" | "lan";
  bindHost: string;
  publicHost: string;
  port: string;
  tokenRequired: boolean;
  localUrl: string;
  lanUrl: string | null;
  warning: string;
  firewallHint: string;
}

interface LocalOnboardingStatus {
  completed: boolean;
  completedAt: string | null;
  accessMode: "local" | "lan" | null;
  modelProvider: string | null;
  testUploadCompleted: boolean;
  synthesisTestCompleted: boolean;
}

interface LocalStorageState {
  summary: {
    dataRoot: string;
    totalBytes: number;
    totalFiles: number;
    retention: {
      mode: "keep" | "archive";
      maxActiveSessions: number | null;
      deletesOriginals: false;
    };
    directories: Array<{
      id: string;
      label: string;
      relativePath: string;
      bytes: number;
      files: number;
    }>;
  };
}

interface ModelHealth {
  readiness: "local_model_ready" | "cloud_model_ready" | "mock_fallback";
  mode: "local" | "cloud" | "mock";
  configured: boolean;
  model: string;
  endpointConfigured: boolean;
  mockFallbackActive: boolean;
}

interface IntakeUploadReceipt {
  id: string;
  uploads?: Array<{ name: string; size: number }>;
  analysis?: { summary?: string };
}

interface SynthesisReceipt {
  synthesisId: string;
  title: string;
  fileName: string;
  downloadUrl?: string;
  filesRead: number;
  filesSkipped: number;
  source: "provider" | "mock" | "local";
  summary: string;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wide text-slate-500">{children}</label>;
}

function ConfigInput({
  label,
  value,
  onChange,
  mono,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  mono?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <FieldLabel>
      {label}
      <InputField
        value={value}
        type={type}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        mono={mono}
        className="mt-1 w-full"
      />
    </FieldLabel>
  );
}

function StatusBadge({ status }: { status: JadenosOnboardingStep["status"] }) {
  if (status === "done") {
    return <BattleBadge tone="emerald"><BattleText en="Done" zh="完成" /></BattleBadge>;
  }
  if (status === "optional") {
    return <BattleBadge tone="neutral"><BattleText en="Later" zh="稍后" /></BattleBadge>;
  }
  return <BattleBadge tone="amber"><BattleText en="Needed" zh="需要" /></BattleBadge>;
}

const GROUP_LABELS: Record<OnboardingStepGroup, { en: string; zh: string; meta: string; zhMeta: string }> = {
  quickstart: {
    en: "Quick start",
    zh: "快速开始",
    meta: "enter product first",
    zhMeta: "先进入产品",
  },
  recommended: {
    en: "Recommended",
    zh: "推荐配置",
    meta: "better real work",
    zhMeta: "正式使用更完整",
  },
  advanced: {
    en: "Advanced local",
    zh: "高级本地部署",
    meta: "gateway and file checks",
    zhMeta: "网关与文件自检",
  },
  finish: {
    en: "Save",
    zh: "保存",
    meta: "keep checklist state",
    zhMeta: "保留清单状态",
  },
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function ReadinessMeter({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/45 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            <BattleText en="Setup checklist" zh="设置清单" />
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-100">{completed}/{total}</p>
        </div>
        <BattleBadge tone={completed === total ? "emerald" : "neutral"}>
          {completed === total ? <BattleText en="Done" zh="完成" /> : <BattleText en="Optional" zh="可选" />}
        </BattleBadge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StepList({
  steps,
  activeIndex,
  onSelect,
  language,
}: {
  steps: JadenosOnboardingStep[];
  activeIndex: number;
  onSelect: (index: number) => void;
  language: "en" | "zh";
}) {
  const grouped = steps.reduce<Array<{ group: OnboardingStepGroup; items: Array<{ step: JadenosOnboardingStep; index: number }> }>>((acc, step, index) => {
    const existing = acc.find((item) => item.group === step.group);
    if (existing) existing.items.push({ step, index });
    else acc.push({ group: step.group, items: [{ step, index }] });
    return acc;
  }, []);

  return (
    <BattlePanel
      title={language === "zh" ? "设置清单" : "Setup Checklist"}
      meta={language === "zh" ? "非强制，可随时返回" : "optional, return anytime"}
    >
      <div>
        {grouped.map(({ group, items }) => {
          const label = GROUP_LABELS[group];
          return (
            <div key={group} className="border-b border-slate-800 last:border-b-0">
              <div className="bg-slate-950/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{language === "zh" ? label.zh : label.en}</p>
                <p className="mt-0.5 text-[10px] text-slate-600">{language === "zh" ? label.zhMeta : label.meta}</p>
              </div>
              <div className="divide-y divide-slate-800">
                {items.map(({ step, index }) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onSelect(index)}
                    className={cx(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:bg-slate-950",
                      index === activeIndex
                        ? "bg-emerald-500/10 text-slate-100"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{language === "zh" ? step.zhTitle : step.title}</span>
                      <span className="block truncate text-[10px] text-slate-600">{step.command}</span>
                    </span>
                    <StatusBadge status={step.status} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </BattlePanel>
  );
}

function modelReadinessLabel(model: ModelHealth | null, language: "en" | "zh") {
  if (model?.readiness === "local_model_ready") return language === "zh" ? "本地模型已连接" : "Local model ready";
  if (model?.readiness === "cloud_model_ready") return language === "zh" ? "云模型已连接" : "Cloud model ready";
  return language === "zh" ? "演示模式生效" : "Demo mode active";
}

function StepBody({
  step,
  config,
  updateConfig,
  accessTokenInput,
  setAccessTokenInput,
  saveAccess,
  clearAccess,
  betaToken,
  gateway,
  storage,
  model,
  testModel,
  testingModel,
  uploadTestFile,
  uploadSampleTestFile,
  uploading,
  uploadReceipt,
  runSynthesis,
  synthesizing,
  synthesisReceipt,
  markOnboardingComplete,
  finishing,
  loading,
  language,
}: {
  step: JadenosOnboardingStep;
  config: ConfigState;
  updateConfig: (partial: Partial<ConfigState>) => void;
  accessTokenInput: string;
  setAccessTokenInput: (value: string) => void;
  saveAccess: () => void;
  clearAccess: () => void;
  betaToken: string;
  gateway: GatewayStatus | null;
  storage: LocalStorageState | null;
  model: ModelHealth | null;
  testModel: () => void;
  testingModel: boolean;
  uploadTestFile: (files: FileList | null) => void;
  uploadSampleTestFile: () => void;
  uploading: boolean;
  uploadReceipt: IntakeUploadReceipt | null;
  runSynthesis: () => void;
  synthesizing: boolean;
  synthesisReceipt: SynthesisReceipt | null;
  markOnboardingComplete: () => void;
  finishing: boolean;
  loading: boolean;
  language: "en" | "zh";
}) {
  if (step.id === "start") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-50">
          <BattleBadge tone="emerald"><BattleText en="Ready now" zh="现在可用" /></BattleBadge>
          <p className="mt-3">
            <BattleText
              en="Access is separate from setup. You can enter the product now, then return here from Settings when you want to connect providers or run local deployment checks."
              zh="访问和设置已经拆开。你现在就可以进入产品；之后需要连接服务或做本地部署自检时，再从设置回到这里。"
            />
          </p>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <Link
            href="/leads"
            className="inline-flex h-9 items-center justify-center rounded-md border border-emerald-500/50 bg-emerald-500/20 px-4 text-xs font-semibold text-emerald-50 transition hover:border-emerald-300 hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
          >
            <BattleText en="Open Follow-up" zh="进入客户跟进" />
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
          >
            <BattleText en="Open Workbench" zh="进入工作台" />
          </Link>
        </div>
      </div>
    );
  }

  if (step.id === "customers") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-3">
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <BattleBadge tone="emerald"><BattleText en="Customer Follow-up" zh="客户跟进" /></BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            <BattleText en="Inspect existing accounts, contacts, orders, and activity timeline first." zh="先查看已有客户、联系人、订单和互动时间线。" />
          </p>
          <Link href="/leads" className="mt-3 inline-flex h-8 items-center rounded-md border border-emerald-500/50 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/25">
            <BattleText en="View follow-up" zh="查看客户跟进" />
          </Link>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <BattleBadge tone="blue"><BattleText en="Demo data" zh="演示数据" /></BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            <BattleText en="If the workspace is empty, Task Progress can load demo customers and a sample timeline." zh="如果工作区为空，可在任务进度页创建演示客户和样例时间线。" />
          </p>
          <Link href="/agent-status" className="mt-3 inline-flex h-8 items-center rounded-md border border-blue-500/50 bg-blue-500/15 px-3 text-xs font-semibold text-blue-100 transition hover:border-blue-300 hover:bg-blue-500/25">
            <BattleText en="Open Task Progress" zh="打开任务进度" />
          </Link>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <BattleBadge tone="neutral"><BattleText en="Import later" zh="稍后导入" /></BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            <BattleText en="Customer import and document intake can happen after you have seen the core workspace." zh="先看核心工作区，再做客户导入和资料导入也可以。" />
          </p>
          <Link href="/intake" className="mt-3 inline-flex h-8 items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700">
            <BattleText en="Open Data Import" zh="打开资料导入" />
          </Link>
        </div>
      </div>
    );
  }

  if (step.id === "email") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-300">
          <BattleBadge tone="blue"><BattleText en="Recommended later" zh="稍后推荐" /></BattleBadge>
          <p className="mt-3">
            <BattleText
              en="Connect mailbox when you are ready for real inbound review and reply drafting. This is not required to enter Customer Follow-up or use demo data."
              zh="准备处理真实来信和回复草稿时再连接邮箱。进入客户跟进或使用演示数据不需要先完成这一步。"
            />
          </p>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <Link
            href="/settings"
            className="inline-flex h-9 items-center justify-center rounded-md border border-blue-500/40 bg-blue-500/15 px-4 text-xs font-semibold text-blue-100 transition hover:border-blue-300 hover:bg-blue-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 active:translate-y-px"
          >
            <BattleText en="Open Email Settings" zh="打开邮箱设置" />
          </Link>
          <Link
            href="/leads"
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
          >
            <BattleText en="Skip to Follow-up" zh="先去客户跟进" />
          </Link>
        </div>
      </div>
    );
  }

  if (step.id === "token") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <FieldLabel>
          {language === "zh" ? "会员激活码" : "Activation Code"}
          <InputField
            value={accessTokenInput}
            type="password"
            autoComplete="off"
            onChange={(event) => setAccessTokenInput(event.target.value)}
            className="mt-1 w-full"
          />
        </FieldLabel>
        <CommandButton type="button" variant="primary" onClick={saveAccess} disabled={!accessTokenInput.trim()}>
          <BattleText en="Save Code" zh="保存激活码" />
        </CommandButton>
        <CommandButton type="button" variant="ghost" onClick={clearAccess} disabled={!betaToken && !accessTokenInput}>
          <BattleText en="Clear" zh="清除" />
        </CommandButton>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-300 lg:col-span-3">
          <BattleText
            en="The browser stores the Activation Code and sends it to SSA with each protected request. LAN mode keeps the same protection."
            zh="浏览器会保存会员激活码，并在访问受保护页面/API 时交给 SSA。LAN 模式也继续使用同一套保护。"
          />
        </div>
      </div>
    );
  }

  if (step.id === "access") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <FieldLabel>
          {language === "zh" ? "访问模式" : "Access Mode"}
          <SelectField
            value={config.gatewayAccessMode || "local"}
            onChange={(event) => {
              const mode = event.target.value === "lan" ? "lan" : "local";
              updateConfig({
                gatewayAccessMode: mode,
                gatewayBindHost: mode === "lan" ? "0.0.0.0" : "127.0.0.1",
              });
            }}
            className="mt-1 w-full"
          >
            <option value="local">{language === "zh" ? "仅本机" : "Local only"}</option>
            <option value="lan">{language === "zh" ? "LAN 局域网" : "LAN"}</option>
          </SelectField>
        </FieldLabel>
        <ConfigInput
          label={language === "zh" ? "本机局域网 IP" : "LAN Host IP"}
          value={config.gatewayPublicHost || ""}
          onChange={(value) => updateConfig({ gatewayPublicHost: value })}
          mono
          placeholder={language === "zh" ? "留空自动检测" : "Auto-detect when empty"}
        />
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{language === "zh" ? "本机地址" : "Local URL"}</p>
          <p className="mt-2 break-all font-mono text-sm text-slate-100">{gateway?.localUrl || "http://127.0.0.1:3001"}</p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{language === "zh" ? "局域网地址" : "LAN URL"}</p>
          <p className="mt-2 break-all font-mono text-sm text-slate-100">{gateway?.lanUrl || (language === "zh" ? "未开启" : "Not enabled")}</p>
        </div>
        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100 lg:col-span-2">
          <p>{gateway?.warning || (language === "zh" ? "LAN 访问开启后，请只在可信局域网使用，不要暴露到公网。" : "Use LAN access only on trusted private networks. Do not expose it to the public internet.")}</p>
          <p className="mt-1">{gateway?.firewallHint || (language === "zh" ? "如果同一局域网设备打不开，请检查系统防火墙是否允许该端口。" : "If another LAN device cannot connect, check whether the host firewall allows the selected port.")}</p>
        </div>
      </div>
    );
  }

  if (step.id === "model") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-2 xl:grid-cols-4">
        <FieldLabel>
          {language === "zh" ? "模型来源" : "Model Source"}
          <SelectField
            value={config.llmProvider || ""}
            onChange={(event) => updateConfig({
              llmProvider: event.target.value,
              llmBaseUrl: defaultBaseUrlForProvider(event.target.value),
            })}
            className="mt-1 w-full"
          >
            <option value="">{language === "zh" ? "未配置，使用演示模式" : "Not configured, use demo mode"}</option>
            {LLM_PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{language === "zh" ? option.zhLabel : option.label}</option>
            ))}
          </SelectField>
        </FieldLabel>
        <ConfigInput label={language === "zh" ? "Base URL（自动填充，可高级修改）" : "Base URL (auto-filled, advanced editable)"} value={config.llmBaseUrl || ""} onChange={(value) => updateConfig({ llmBaseUrl: value })} mono placeholder={language === "zh" ? "选择 Provider 后自动填充" : "Auto-filled after choosing provider"} />
        <ConfigInput label={language === "zh" ? "API Key" : "API Key"} value={config.llmApiKey || ""} onChange={(value) => updateConfig({ llmApiKey: value })} mono type="password" placeholder={language === "zh" ? "本地模型通常可留空" : "often blank for local models"} />
        <ConfigInput label={language === "zh" ? "模型名" : "Model Name"} value={config.defaultModel || ""} onChange={(value) => updateConfig({ defaultModel: value })} mono placeholder={language === "zh" ? "按所选供应商填写" : "Choose per provider"} />
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 xl:col-span-3">
          <BattleBadge tone={model?.mockFallbackActive ? "amber" : model ? "emerald" : "neutral"}>
            {modelReadinessLabel(model, language)}
          </BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            {model?.mockFallbackActive
              ? (language === "zh" ? "当前没有真实模型可用，SSA 只会用演示模式做占位响应。" : "No real model is available. SSA will only use demo-mode placeholder responses.")
              : (language === "zh" ? `当前模型：${model?.model || config.defaultModel}` : `Current model: ${model?.model || config.defaultModel}`)}
          </p>
        </div>
        <CommandButton type="button" variant="primary" onClick={testModel} loading={testingModel} disabled={testingModel || loading}>
          <BattleText en="Test Model" zh="测试模型" />
        </CommandButton>
      </div>
    );
  }

  if (step.id === "search") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <FieldLabel>
          {language === "zh" ? "搜索引擎" : "Search Engine"}
          <SelectField
            value={config.searchEngine || "tavily"}
            onChange={(event) => updateConfig({ searchEngine: event.target.value })}
            className="mt-1 w-full"
          >
            <option value="tavily">Tavily</option>
            <option value="none">{language === "zh" ? "暂不配置" : "Not configured yet"}</option>
          </SelectField>
        </FieldLabel>
        <ConfigInput label={language === "zh" ? "Tavily API Key" : "Tavily API Key"} value={config.tavilyApiKey || ""} onChange={(value) => updateConfig({ tavilyApiKey: value })} mono type="password" placeholder={language === "zh" ? "需要真实搜索时再填写" : "Add when live search is needed"} />
        <ConfigInput label={language === "zh" ? "Hunter API Key（邮箱验证）" : "Hunter API Key (email verification)"} value={config.hunterApiKey || ""} onChange={(value) => updateConfig({ hunterApiKey: value })} mono type="password" placeholder={language === "zh" ? "需要邮箱验证时再填写" : "Add when email verification is needed"} />
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-300">
          <BattleBadge tone="blue"><BattleText en="Recommended" zh="推荐配置" /></BattleBadge>
          <p className="mt-2">
            <BattleText
              en="These keys improve live lead research and verification. You can keep exploring product screens without them."
              zh="这些 Key 会增强真实线索搜索和邮箱验证。没有它们也可以继续体验产品页面。"
            />
          </p>
        </div>
      </div>
    );
  }

  if (step.id === "storage") {
    return (
      <div className="grid gap-3 p-3">
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{language === "zh" ? "数据目录" : "Data directory"}</p>
          <p className="mt-2 break-all font-mono text-xs text-slate-200">{storage?.summary.dataRoot || (language === "zh" ? "保存会员激活码后显示" : "Shown after the Activation Code is saved")}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {(storage?.summary.directories || []).map((directory) => (
            <div key={directory.id} className="rounded-md border border-slate-800 bg-slate-950 p-3">
              <p className="text-sm font-semibold text-slate-100">{directory.label}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">{formatBytes(directory.bytes)} / {directory.files}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-slate-600">{directory.relativePath}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100">
          <BattleText
            en="File browsing stays inside SSA_DATA_ROOT and is served by the SSA gateway. Docker mode does not open host folders from the server."
            zh="文件浏览只在 SSA_DATA_ROOT 内进行，并由 SSA 网关提供预览/下载。Docker 模式不会从服务端打开宿主机文件夹。"
          />
        </div>
        <Link
          href="/settings"
          className="inline-flex h-9 w-fit items-center rounded-md border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
        >
          <BattleText en="Open Storage Settings" zh="打开本地存储设置" />
        </Link>
      </div>
    );
  }

  if (step.id === "upload") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_320px_320px]">
        <label className="block rounded-md border border-dashed border-slate-700 bg-slate-950 px-4 py-6 text-center text-sm text-slate-300 transition hover:border-emerald-500 hover:bg-slate-900 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-300/40">
          <input
            type="file"
            accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx,.csv,.html,.htm"
            className="sr-only"
            onChange={(event) => uploadTestFile(event.target.files)}
            disabled={uploading || loading}
          />
          <span className="block font-semibold text-slate-100">
            {uploading ? <BattleText en="Uploading test file" zh="正在上传测试文件" /> : <BattleText en="Choose a test file" zh="选择测试文件" />}
          </span>
          <span className="mt-2 block text-xs leading-5 text-slate-500">
            <BattleText en="SSA saves the original locally and uses it for the synthesis check." zh="SSA 会把原始文件保存在本地，并用于下一步归纳测试。" />
          </span>
        </label>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <BattleBadge tone="blue"><BattleText en="No file handy" zh="没有现成文件" /></BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            <BattleText
              en="Create a small sample text file in the browser and upload it through the same Intake gateway."
              zh="可以直接在浏览器里生成一个小的示例文本文件，并通过同一个资料导入网关上传。"
            />
          </p>
          <CommandButton type="button" variant="secondary" onClick={uploadSampleTestFile} loading={uploading} disabled={uploading || loading} className="mt-3">
            <BattleText en="Use sample file" zh="使用示例文件" />
          </CommandButton>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <BattleBadge tone={uploadReceipt ? "emerald" : "amber"}>
            {uploadReceipt ? <BattleText en="Uploaded" zh="已上传" /> : <BattleText en="Waiting" zh="等待文件" />}
          </BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            {uploadReceipt
              ? (language === "zh"
                ? `已创建投递记录 ${uploadReceipt.id}，文件数 ${uploadReceipt.uploads?.length || 0}。`
                : `Created intake ${uploadReceipt.id} with ${uploadReceipt.uploads?.length || 0} file(s).`)
              : (language === "zh" ? "上传成功后，会在这里显示投递记录。" : "After upload, the intake receipt appears here.")}
          </p>
        </div>
      </div>
    );
  }

  if (step.id === "synthesize") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <BattleBadge tone={uploadReceipt ? "emerald" : "amber"}>
            {uploadReceipt ? <BattleText en="Input ready" zh="输入已就绪" /> : <BattleText en="Upload first" zh="先上传文件" />}
          </BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            <BattleText
              en="Run one synthesis to prove SSA can read the uploaded file and write a markdown summary back to local storage."
              zh="运行一次归纳，确认 SSA 能读取上传文件，并把 Markdown 总结写回本地存储。"
            />
          </p>
          <div className="mt-3">
            <CommandButton type="button" variant="primary" onClick={runSynthesis} loading={synthesizing} disabled={synthesizing || !uploadReceipt}>
              <BattleText en="Run Synthesis" zh="运行归纳" />
            </CommandButton>
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <BattleBadge tone={synthesisReceipt ? "emerald" : "amber"}>
            {synthesisReceipt ? <BattleText en="Created" zh="已生成" /> : <BattleText en="Waiting" zh="等待生成" />}
          </BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            {synthesisReceipt
              ? synthesisReceipt.summary
              : (language === "zh" ? "归纳完成后，会显示输出文件和下载入口。" : "After synthesis, the output file and download link appear here.")}
          </p>
          {synthesisReceipt?.downloadUrl ? (
            <a
              href={synthesisReceipt.downloadUrl}
              className="mt-3 inline-flex h-8 items-center rounded-md border border-emerald-500/50 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
            >
              <BattleText en="Download output" zh="下载结果" />
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
        <BattleBadge tone="emerald"><BattleText en="Ready to enter" zh="可以进入" /></BattleBadge>
        <p className="mt-3">
          <BattleText
            en="Finish saves this setup checklist. It does not unlock the product because access already did that; use it only to keep your local setup state tidy."
            zh="完成会保存这份设置清单。它不是解锁产品的第二道门；只是帮你保留本地设置状态。"
          />
        </p>
      </div>
      <div className="flex flex-col justify-center gap-2">
        <CommandButton type="button" variant="primary" onClick={markOnboardingComplete} loading={finishing} disabled={finishing}>
          <BattleText en="Save Checklist" zh="保存清单" />
        </CommandButton>
        <Link
          href="/leads"
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
        >
          <BattleText en="Open Follow-up" zh="进入客户跟进" />
        </Link>
      </div>
    </div>
  );
}

export default function JadenosOnboarding() {
  const router = useRouter();
  const language = useBattleLanguage();
  const {
    apiFetch,
    betaToken,
    setBetaToken,
    clearBetaToken,
  } = useProject();
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [activeIndex, setActiveIndex] = useState(0);
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<LocalOnboardingStatus | null>(null);
  const [storage, setStorage] = useState<LocalStorageState | null>(null);
  const [model, setModel] = useState<ModelHealth | null>(null);
  const [uploadReceipt, setUploadReceipt] = useState<IntakeUploadReceipt | null>(null);
  const [synthesisReceipt, setSynthesisReceipt] = useState<SynthesisReceipt | null>(null);
  const [currentIntakeId, setCurrentIntakeId] = useState("");
  const [testUploadCompleted, setTestUploadCompleted] = useState(false);
  const [synthesisTestCompleted, setSynthesisTestCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const runtimeState: OnboardingRuntimeState = useMemo(() => ({
    tokenPresent: Boolean(betaToken),
    storageKnown: Boolean(storage?.summary.dataRoot),
    testUploadCompleted,
    synthesisTestCompleted,
  }), [betaToken, storage?.summary.dataRoot, testUploadCompleted, synthesisTestCompleted]);

  const readiness = useMemo(() => getOnboardingReadiness(config, runtimeState), [config, runtimeState]);
  const steps = useMemo(() => getJadenosOnboardingSteps(config, runtimeState), [config, runtimeState]);
  const activeStep = steps[activeIndex] ?? steps[0];

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const configResponse = await apiFetch("/api/config", { cache: "no-store" });
      const configJson = await configResponse.json().catch(() => ({}));
      if (configResponse.ok && configJson.success) {
        setConfig((prev) => ({ ...prev, ...configJson.data }));
      } else if (configResponse.status === 401 || configResponse.status === 403) {
        setError(language === "zh" ? "请先保存会员激活码。" : "Save the Activation Code first.");
      }

      const gatewayResponse = await apiFetch(LOCAL_GATEWAY_API, { cache: "no-store" });
      const gatewayJson = await gatewayResponse.json().catch(() => ({}));
      if (gatewayResponse.ok && gatewayJson.success) {
        setGateway(gatewayJson.data.gateway || null);
        setOnboardingStatus(gatewayJson.data.onboarding || null);
        setTestUploadCompleted((prev) => prev || Boolean(gatewayJson.data.onboarding?.testUploadCompleted));
        setSynthesisTestCompleted((prev) => prev || Boolean(gatewayJson.data.onboarding?.synthesisTestCompleted));
      }

      const storageResponse = await apiFetch(`${LOCAL_STORAGE_API}?path=documents`, { cache: "no-store" });
      const storageJson = await storageResponse.json().catch(() => ({}));
      if (storageResponse.ok && storageJson.success) setStorage(storageJson.data);

      const healthResponse = await apiFetch("/api/health", { cache: "no-store" });
      const healthJson = await healthResponse.json().catch(() => ({}));
      if (healthResponse.ok) setModel(healthJson.beta?.model || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "读取失败" : "Failed to load setup"));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, language]);

  useEffect(() => {
    setAccessTokenInput(betaToken);
  }, [betaToken]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const updateConfig = useCallback((partial: Partial<ConfigState>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage("");
    try {
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || (language === "zh" ? "保存失败" : "Save failed"));
      setConfig((prev) => ({ ...prev, ...json.data }));
      setMessage(language === "zh" ? "设置已保存。" : "Settings saved.");
      await loadAll();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "保存失败" : "Save failed"));
      return false;
    } finally {
      setSaving(false);
    }
  }, [apiFetch, config, language, loadAll]);

  const saveAccess = useCallback(() => {
    setBetaToken(accessTokenInput);
    setError(null);
    setMessage(language === "zh" ? "会员激活码已保存。" : "Activation Code saved.");
    setActiveIndex((current) => Math.max(current, 1));
  }, [accessTokenInput, language, setBetaToken]);

  const clearAccess = useCallback(() => {
    clearBetaToken();
    setAccessTokenInput("");
    setGateway(null);
    setStorage(null);
    setError(null);
    setMessage(language === "zh" ? "会员激活码已清除。" : "Activation Code cleared.");
  }, [clearBetaToken, language]);

  const testModel = useCallback(async () => {
    const saved = await saveConfig();
    if (!saved) return;
    setTestingModel(true);
    setError(null);
    setMessage("");
    try {
      const res = await apiFetch(LLM_TEST_API, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.data?.message || json.error || (language === "zh" ? "模型连接失败" : "Model test failed"));
      }
      setModel(json.data?.status || null);
      setMessage(json.data?.message || (language === "zh" ? "模型连接测试完成。" : "Model connection tested."));
      setActiveIndex((current) => Math.max(current, 3));
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "模型连接失败" : "Model test failed"));
    } finally {
      setTestingModel(false);
    }
  }, [apiFetch, language, saveConfig]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    setMessage("");
    try {
      const form = new FormData();
      form.append("message", language === "zh" ? "首次启动测试上传" : "First-run test upload");
      form.append("pastedText", language === "zh" ? "这是首次启动测试文件，请保存并用于归纳。" : "This is a first-run test file. Save it and use it for synthesis.");
      form.append("files", files[0]);
      const res = await apiFetch("/api/intake", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || (language === "zh" ? "上传失败" : "Upload failed"));
      const receipt = json.data as IntakeUploadReceipt;
      setUploadReceipt(receipt);
      setCurrentIntakeId(receipt.id);
      setTestUploadCompleted(true);
      setMessage(language === "zh" ? "测试文件已保存到本地资料导入。" : "The test file has been saved in local Data Import.");
      setActiveIndex((current) => Math.max(current, 5));
      void loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "上传失败" : "Upload failed"));
    } finally {
      setUploading(false);
    }
  }, [apiFetch, language, loadAll]);

  const uploadTestFile = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    void uploadFiles(Array.from(files).slice(0, 1));
  }, [uploadFiles]);

  const uploadSampleTestFile = useCallback(() => {
    const sample = new File([
      "SSA first-run sample file\nCustomer: Example Industrial Buyer\nRequest: summarize attached buying notes and next steps.\n",
    ], "ssa-first-run-sample.txt", { type: "text/plain" });
    void uploadFiles([sample]);
  }, [uploadFiles]);

  const runSynthesis = useCallback(async () => {
    if (!currentIntakeId) {
      setError(language === "zh" ? "请先上传一个测试文件。" : "Upload a test file first.");
      return;
    }
    setSynthesizing(true);
    setError(null);
    setMessage("");
    try {
      const res = await apiFetch(`/api/intake/${encodeURIComponent(currentIntakeId)}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: language === "zh" ? "首次启动测试归纳" : "First-run test synthesis",
          instruction: language === "zh" ? "请归纳上传文件中的核心信息，输出简明总结。" : "Summarize the uploaded file into a concise note.",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || (language === "zh" ? "归纳失败" : "Synthesis failed"));
      setSynthesisReceipt(json.data as SynthesisReceipt);
      setSynthesisTestCompleted(true);
      setMessage(language === "zh" ? "归纳结果已写入本地存储。" : "Synthesis output has been written to local storage.");
      setActiveIndex((current) => Math.max(current, 6));
      void loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "归纳失败" : "Synthesis failed"));
    } finally {
      setSynthesizing(false);
    }
  }, [apiFetch, currentIntakeId, language, loadAll]);

  const markOnboardingComplete = useCallback(async () => {
    const saved = await saveConfig();
    if (!saved) return;
    setFinishing(true);
    setError(null);
    setMessage("");
    try {
      const res = await apiFetch(LOCAL_GATEWAY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessMode: config.gatewayAccessMode || "local",
          modelProvider: config.llmProvider || config.defaultModel || "",
          testUploadCompleted,
          synthesisTestCompleted,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || (language === "zh" ? "完成失败" : "Could not finish onboarding"));
      setOnboardingStatus(json.data);
      setMessage(language === "zh" ? "设置清单已保存。" : "Setup checklist saved.");
      router.push("/leads");
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "完成失败" : "Could not finish onboarding"));
    } finally {
      setFinishing(false);
    }
  }, [apiFetch, config.defaultModel, config.gatewayAccessMode, config.llmProvider, language, router, saveConfig, synthesisTestCompleted, testUploadCompleted]);

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="SSA Setup Checklist"
        zhTitle="SSA 设置清单"
        meta="Quick start / Recommended / Advanced local"
        zhMeta="快速开始 / 推荐配置 / 高级本地部署"
        active={JADENOS_ONBOARDING_ROUTE}
      >
        <BattleBadge tone={loading ? "blue" : readiness.allReady ? "emerald" : "amber"} pulse={loading}>
          {loading ? <BattleText en="LOAD" zh="加载" /> : <BattleText en="OPTIONAL" zh="可选" />}
        </BattleBadge>
        {onboardingStatus?.completed ? (
          <BattleBadge tone="emerald"><BattleText en="Completed" zh="已完成" /></BattleBadge>
        ) : null}
        <Link
          href="/docs/PUBLIC_BETA_READINESS.md"
          className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-[13px] font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
        >
          <BattleText en="Beta guide" zh="内测指南" />
        </Link>
        <Link
          href="/user-guide"
          className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-[13px] font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
        >
          <BattleText en="User guide" zh="使用指南" />
        </Link>
        <CommandButton variant="primary" onClick={saveConfig} disabled={saving || loading} loading={saving}>
          <BattleText en="Save" zh="保存" />
        </CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        {(message || error) && (
          <div className={`rounded-md border px-3 py-2 text-xs ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
            {error || message}
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="order-2 space-y-3 xl:order-1">
            <ReadinessMeter completed={readiness.completed} total={readiness.total} />
            <StepList steps={steps} activeIndex={activeIndex} onSelect={setActiveIndex} language={language} />
            <BattlePanel
              title={language === "zh" ? "配置状态" : "Setup status"}
              meta={language === "zh" ? "都不是进入产品的硬门槛" : "none blocks product entry"}
            >
              <div className="divide-y divide-slate-800">
                {readiness.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className={cx(item.done ? "text-slate-200" : "text-slate-500")}>
                      {language === "zh" ? item.zhLabel : item.label}
                    </span>
                    <StatusBadge status={item.done ? "done" : item.blocking ? "missing" : "optional"} />
                  </div>
                ))}
              </div>
            </BattlePanel>
          </aside>

          <div className="order-1 space-y-3 xl:order-2">
            <BattlePanel
              title={`${activeIndex + 1}. ${language === "zh" ? activeStep.zhTitle : activeStep.title}`}
              meta={activeStep.command}
              action={<StatusBadge status={activeStep.status} />}
            >
              <div className="border-b border-slate-800 bg-slate-950/70 px-3 py-2 text-xs leading-5 text-slate-400">
                {language === "zh" ? activeStep.zhPrompt : activeStep.prompt}
              </div>
              <StepBody
                step={activeStep}
                config={config}
                updateConfig={updateConfig}
                accessTokenInput={accessTokenInput}
                setAccessTokenInput={setAccessTokenInput}
                saveAccess={saveAccess}
                clearAccess={clearAccess}
                betaToken={betaToken}
                gateway={gateway}
                storage={storage}
                model={model}
                testModel={testModel}
                testingModel={testingModel}
                uploadTestFile={uploadTestFile}
                uploadSampleTestFile={uploadSampleTestFile}
                uploading={uploading}
                uploadReceipt={uploadReceipt}
                runSynthesis={runSynthesis}
                synthesizing={synthesizing}
                synthesisReceipt={synthesisReceipt}
                markOnboardingComplete={markOnboardingComplete}
                finishing={finishing}
                loading={loading}
                language={language}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CommandButton
                    type="button"
                    variant="secondary"
                    onClick={() => setActiveIndex((current) => Math.max(current - 1, 0))}
                    disabled={activeIndex === 0}
                  >
                    <BattleText en="Back" zh="上一步" />
                  </CommandButton>
                  <CommandButton
                    type="button"
                    variant={activeStep.status === "missing" && activeStep.core ? "primary" : "secondary"}
                    onClick={() => {
                      if (activeStep.id === "token") saveAccess();
                      else if (activeStep.id === "model") void testModel();
                      else void saveConfig();
                      setActiveIndex((current) => Math.min(current + 1, steps.length - 1));
                    }}
                    disabled={saving || loading || activeIndex === steps.length - 1}
                    loading={saving}
                  >
                    <BattleText en="Save and next" zh="保存并继续" />
                  </CommandButton>
                  <CommandButton
                    type="button"
                    variant="ghost"
                    onClick={() => setActiveIndex((current) => Math.min(current + 1, steps.length - 1))}
                    disabled={activeIndex === steps.length - 1}
                  >
                    <BattleText en="Skip for now" zh="先跳过" />
                  </CommandButton>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/settings"
                    className="inline-flex h-8 items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
                  >
                    <BattleText en="Settings" zh="设置" />
                  </Link>
                  <Link
                    href="/intake"
                    className="inline-flex h-8 items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
                  >
                    <BattleText en="Open Data Import" zh="打开资料导入" />
                  </Link>
                </div>
              </div>
            </BattlePanel>
          </div>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}
