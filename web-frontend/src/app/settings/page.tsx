"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTheme, type SsaUiSize } from "@/components/ui/ThemeProvider";
import { LLM_PROVIDER_OPTIONS, defaultBaseUrlForProvider } from "@/lib/llm-provider-options";
import { useProject } from "@/lib/project";

const LOCAL_GATEWAY_API = "/api/local-gateway";
const LOCAL_STORAGE_API = "/api/local-storage";
const LLM_TEST_API = "/api/llm/test";

type TabKey = "local-gateway" | "local-storage" | "model" | "email" | "search";

interface ConfigState {
  gatewayAccessMode: "local" | "lan";
  gatewayBindHost: string;
  gatewayPublicHost: string;
  intakeRetentionMode: "keep" | "archive";
  intakeMaxActiveSessions: number;
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
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
  smtpHost: string;
  smtpPort: string;
  smtpEncryption: string;
  imapHost: string;
  imapPort: string;
  imapEncryption: string;
  email: string;
  mailboxCredential: string;
  autoCapture: boolean;
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

interface LocalStorageEntry {
  name: string;
  kind: "file" | "directory";
  relativePath: string;
  size: number;
  updatedAt: string;
  downloadUrl?: string;
  previewUrl?: string;
}

interface LocalStorageState {
  summary: {
    workspaceId: string;
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
  listing: {
    workspaceId: string;
    relativePath: string;
    entries: LocalStorageEntry[];
  };
}

interface HealthState {
  beta?: {
    model?: {
      readiness: "local_model_ready" | "cloud_model_ready" | "mock_fallback";
      mode: "local" | "cloud" | "mock";
      configured: boolean;
      model: string;
      endpointConfigured: boolean;
      mockFallbackActive: boolean;
    };
    mailbox?: {
      status: "ready" | "needs_setup" | "needs_review";
      configured: boolean;
      autoCapture: boolean;
      recentlySynced: boolean;
      summary: string;
      nextStep: string;
      requiredActions: string[];
    };
  };
}

type ModelReadiness = NonNullable<NonNullable<HealthState["beta"]>["model"]>["readiness"];

interface RuntimeManifestState {
  productBoundary?: {
    dataProtected?: boolean;
  };
}

interface RuntimeManifestResponseState {
  data?: RuntimeManifestState;
}

const DEFAULT_CONFIG: ConfigState = {
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
  mailboxCredential: "",
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

const MAILBOX_SECRET_FIELD = ["email", "Password"].join("");

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

function modelReadinessLabel(readiness: ModelReadiness | undefined, language: "en" | "zh") {
  if (readiness === "local_model_ready") return language === "zh" ? "本地模型" : "Local model";
  if (readiness === "cloud_model_ready") return language === "zh" ? "云模型" : "Cloud model";
  return language === "zh" ? "Mock fallback" : "Mock fallback";
}

export default function SettingsPage() {
  const language = useBattleLanguage();
  const { uiSize, setUiSize } = useTheme();
  const { apiFetch, betaToken, setBetaToken, clearBetaToken } = useProject();
  const [activeTab, setActiveTab] = useState<TabKey>("local-gateway");
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [storage, setStorage] = useState<LocalStorageState | null>(null);
  const [storagePath, setStoragePath] = useState("documents");
  const [health, setHealth] = useState<HealthState | null>(null);
  const [runtimeManifest, setRuntimeManifest] = useState<RuntimeManifestState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"imap" | "smtp" | "model" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadGateway = useCallback(async () => {
    const response = await apiFetch(LOCAL_GATEWAY_API, { cache: "no-store" });
    const json = await response.json();
    if (json.success) setGateway(json.data.gateway);
  }, [apiFetch]);

  const loadStorage = useCallback(async (relativePath = storagePath) => {
    const response = await apiFetch(`${LOCAL_STORAGE_API}?path=${encodeURIComponent(relativePath)}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || "Failed to load local storage");
    setStorage(json.data);
    setStoragePath(json.data.listing.relativePath);
  }, [apiFetch, storagePath]);

  const loadHealth = useCallback(async () => {
    const response = await apiFetch("/api/health", { cache: "no-store" });
    if (response.ok) setHealth(await response.json());
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch("/api/config").then((res) => res.json()),
      apiFetch("/api/runtime?action=manifest").then((res) => res.json()).catch(() => null),
      apiFetch("/api/health").then((res) => res.json()).catch(() => null),
      apiFetch(LOCAL_GATEWAY_API).then((res) => res.json()).catch(() => null),
      apiFetch(`${LOCAL_STORAGE_API}?path=documents`).then((res) => res.json()).catch(() => null),
    ])
      .then(([configJson, manifestJson, healthJson, gatewayJson, storageJson]: [
        Record<string, unknown>,
        RuntimeManifestResponseState | null,
        HealthState | null,
        Record<string, unknown> | null,
        Record<string, unknown> | null,
      ]) => {
        if (cancelled) return;
        if (configJson.success) {
          const incoming = (configJson.data && typeof configJson.data === "object" ? configJson.data : {}) as Record<string, unknown>;
          setConfig((prev) => ({
            ...prev,
            ...incoming,
            mailboxCredential: typeof incoming[MAILBOX_SECRET_FIELD] === "string" ? incoming[MAILBOX_SECRET_FIELD] : prev.mailboxCredential,
          }));
        }
        if (manifestJson?.data) setRuntimeManifest(manifestJson.data);
        if (healthJson) setHealth(healthJson);
        if (gatewayJson?.success && typeof gatewayJson.data === "object" && gatewayJson.data) {
          setGateway((gatewayJson.data as { gateway?: GatewayStatus }).gateway || null);
        }
        if (storageJson?.success && typeof storageJson.data === "object" && storageJson.data) {
          setStorage(storageJson.data as LocalStorageState);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  useEffect(() => {
    setAccessTokenInput(betaToken);
  }, [betaToken]);

  const updateConfig = useCallback((partial: Partial<ConfigState>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const updateModelProvider = useCallback((provider: string) => {
    updateConfig({
      llmProvider: provider,
      llmBaseUrl: defaultBaseUrlForProvider(provider),
    });
  }, [updateConfig]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage("");
    try {
      const payload = {
        ...config,
        [MAILBOX_SECRET_FIELD]: config.mailboxCredential,
      };
      delete (payload as Record<string, unknown>).mailboxCredential;
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || (language === "zh" ? "保存失败" : "Save failed"));
      setMessage(language === "zh" ? "设置已保存。" : "Settings saved.");
      await Promise.all([loadGateway(), loadStorage(storagePath).catch(() => undefined), loadHealth()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "保存失败" : "Save failed"));
    } finally {
      setSaving(false);
    }
  }, [apiFetch, config, language, loadGateway, loadHealth, loadStorage, storagePath]);

  const testConnection = useCallback(async (kind: "imap" | "smtp") => {
    setTesting(kind);
    setError(null);
    setMessage("");
    try {
      const res = await apiFetch("/api/email-connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || (language === "zh" ? "测试失败" : "Connection test failed"));
      }
      setMessage(json.detail || (language === "zh" ? "连接测试完成。" : "Connection test completed."));
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "测试失败" : "Connection test failed"));
    } finally {
      setTesting(null);
    }
  }, [apiFetch, language]);

  const testModel = useCallback(async () => {
    setTesting("model");
    setError(null);
    setMessage("");
    try {
      const res = await apiFetch(LLM_TEST_API, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.data?.message || json.error || (language === "zh" ? "模型连接失败" : "Model test failed"));
      }
      setMessage(json.data?.message || (language === "zh" ? "模型连接完成。" : "Model connection tested."));
      await loadHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "模型连接失败" : "Model test failed"));
    } finally {
      setTesting(null);
    }
  }, [apiFetch, language, loadHealth]);

  const saveBetaAccess = useCallback(() => {
    setBetaToken(accessTokenInput);
    setError(null);
    setMessage(language === "zh" ? "访问口令已保存。" : "Access pass saved.");
  }, [accessTokenInput, language, setBetaToken]);

  const removeBetaAccess = useCallback(() => {
    clearBetaToken();
    setAccessTokenInput("");
    setError(null);
    setMessage(language === "zh" ? "访问口令已清除。" : "Access pass cleared.");
  }, [clearBetaToken, language]);

  const tabs: Array<{ key: TabKey; label: string }> = useMemo(() => [
    { key: "local-gateway", label: language === "zh" ? "本地网关" : "Local Gateway" },
    { key: "local-storage", label: language === "zh" ? "本地存储" : "Local Storage" },
    { key: "model", label: language === "zh" ? "模型" : "Model" },
    { key: "email", label: language === "zh" ? "邮件连接" : "Email" },
    { key: "search", label: language === "zh" ? "搜索" : "Search" },
  ], [language]);
  const uiSizeOptions: Array<{ value: SsaUiSize; label: string; description: string }> = [
    { value: "small", label: language === "zh" ? "小" : "Small", description: language === "zh" ? "紧凑" : "Compact" },
    { value: "medium", label: language === "zh" ? "中" : "Medium", description: language === "zh" ? "默认" : "Default" },
    { value: "large", label: language === "zh" ? "大" : "Large", description: language === "zh" ? "更大字号" : "Larger text" },
  ];
  const model = health?.beta?.model;
  const dataProtected = runtimeManifest?.productBoundary?.dataProtected === true;
  const mailboxTone = health?.beta?.mailbox?.status === "ready" ? "emerald" : health?.beta?.mailbox?.status === "needs_review" ? "amber" : "red";

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="System Settings"
        zhTitle="系统设置"
        meta="LOCAL GATEWAY / STORAGE / MODEL / MAIL"
        zhMeta="本地网关 / 本地存储 / 模型 / 邮件"
        active="/settings"
      >
        <BattleBadge tone={loading ? "blue" : error ? "red" : "emerald"} pulse={loading}>
          {loading ? <BattleText en="LOAD" zh="加载" /> : error ? <BattleText en="ERROR" zh="错误" /> : <BattleText en="READY" zh="就绪" />}
        </BattleBadge>
        <CommandButton variant="primary" onClick={save} disabled={saving || loading} loading={saving}>
          <BattleText en="Save" zh="保存" />
        </CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        {(message || error) && (
          <div className={`rounded-md border px-3 py-2 text-xs ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
            {error || message}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
          <BattlePanel
            title={language === "zh" ? "访问口令" : "Access Pass"}
            meta={language === "zh" ? "LAN 访问也必须保留口令" : "LAN access still requires the pass"}
            tone={betaToken ? "emerald" : "amber"}
            action={<BattleBadge tone={betaToken ? "emerald" : "amber"}>{betaToken ? <BattleText en="Saved" zh="已保存" /> : <BattleText en="Needed" zh="待填写" />}</BattleBadge>}
          >
            <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <FieldLabel>
                {language === "zh" ? "访问口令" : "Access Pass"}
                <InputField
                  value={accessTokenInput}
                  type="password"
                  autoComplete="off"
                  onChange={(event) => setAccessTokenInput(event.target.value)}
                  className="mt-1 w-full"
                />
              </FieldLabel>
              <CommandButton type="button" variant="primary" onClick={saveBetaAccess} disabled={!accessTokenInput.trim()}>
                <BattleText en="Save Access" zh="保存访问" />
              </CommandButton>
              <CommandButton type="button" variant="ghost" onClick={removeBetaAccess} disabled={!betaToken && !accessTokenInput}>
                <BattleText en="Clear" zh="清除" />
              </CommandButton>
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "首次引导" : "First Run"}
            meta={language === "zh" ? "可重新打开本地网关引导" : "reopen local gateway onboarding"}
            tone="blue"
            action={
              <Link
                href="/jadenos/onboarding"
                className="inline-flex h-8 items-center rounded-md border border-blue-500/40 bg-blue-500/15 px-3 text-xs font-semibold text-blue-100 transition hover:border-blue-300 hover:bg-blue-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 active:translate-y-px"
              >
                <BattleText en="Open" zh="打开" />
              </Link>
            }
          >
            <div className="grid gap-2 p-3 text-xs leading-5 text-slate-400">
              <p>{language === "zh" ? "引导会覆盖访问方式、模型、本地目录、测试上传和归纳。" : "The guide covers access mode, model, local folder, test upload, and synthesis."}</p>
              <p>{dataProtected ? (language === "zh" ? "运行数据已与源码隔离。" : "Runtime data is isolated from source code.") : (language === "zh" ? "数据隔离状态需要确认。" : "Data isolation needs review.")}</p>
            </div>
          </BattlePanel>
        </div>

        <BattlePanel
          title={language === "zh" ? "界面大小" : "UI Size"}
          meta={language === "zh" ? "控制全局字号、按钮和输入框尺寸" : "controls text, buttons, and inputs"}
          tone="blue"
        >
          <div className="grid gap-3 p-3 md:grid-cols-3">
            {uiSizeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setUiSize(option.value)}
                aria-pressed={uiSize === option.value}
                className={`rounded-md border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px ${
                  uiSize === option.value
                    ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600 hover:bg-slate-900 hover:text-slate-100"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs text-slate-500">{option.description}</span>
              </button>
            ))}
          </div>
        </BattlePanel>

        <div className="flex flex-wrap gap-1 rounded-md border border-slate-800 bg-slate-900/60 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={`h-9 min-w-[120px] flex-1 rounded border px-3 font-mono text-[10px] font-semibold uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px ${
                activeTab === tab.key
                  ? "border-emerald-400 bg-emerald-600 text-white"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "local-gateway" && (
          <BattlePanel
            title={language === "zh" ? "本地网关访问" : "Local Gateway Access"}
            meta={gateway ? `${gateway.accessMode.toUpperCase()} / ${gateway.bindHost}:${gateway.port}` : "checking"}
            tone={gateway?.accessMode === "lan" ? "amber" : "emerald"}
            action={<BattleBadge tone={gateway?.tokenRequired ? "emerald" : "red"}>{gateway?.tokenRequired ? <BattleText en="Token on" zh="口令保护" /> : <BattleText en="No token" zh="无口令" />}</BattleBadge>}
          >
            <div className="grid gap-3 p-3 lg:grid-cols-2">
              <FieldLabel>
                {language === "zh" ? "访问模式" : "Access Mode"}
                <SelectField
                  value={config.gatewayAccessMode}
                  onChange={(event) => updateConfig({
                    gatewayAccessMode: event.target.value === "lan" ? "lan" : "local",
                    gatewayBindHost: event.target.value === "lan" ? "0.0.0.0" : "127.0.0.1",
                  })}
                  className="mt-1 w-full"
                >
                  <option value="local">{language === "zh" ? "仅本机" : "Local only"}</option>
                  <option value="lan">{language === "zh" ? "局域网" : "LAN"}</option>
                </SelectField>
              </FieldLabel>
              <ConfigInput label={language === "zh" ? "局域网主机 IP" : "LAN Host IP"} value={config.gatewayPublicHost} onChange={(value) => updateConfig({ gatewayPublicHost: value })} mono placeholder={language === "zh" ? "留空自动检测" : "Auto-detect when empty"} />
              <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{language === "zh" ? "本机地址" : "Local URL"}</p>
                <p className="mt-2 break-all font-mono text-sm text-slate-100">{gateway?.localUrl || "http://127.0.0.1:3001"}</p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{language === "zh" ? "局域网地址" : "LAN URL"}</p>
                <p className="mt-2 break-all font-mono text-sm text-slate-100">{gateway?.lanUrl || (language === "zh" ? "未开启" : "Not enabled")}</p>
              </div>
              <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100 lg:col-span-2">
                <p>{gateway?.warning || (language === "zh" ? "LAN 模式需要 Docker 绑定 0.0.0.0，并保留访问口令。" : "LAN mode requires Docker to bind 0.0.0.0 and keep token protection.")}</p>
                <p className="mt-1">{gateway?.firewallHint || (language === "zh" ? "如果局域网设备访问不了，请检查系统防火墙。" : "If another device cannot connect, check the host firewall.")}</p>
              </div>
            </div>
          </BattlePanel>
        )}

        {activeTab === "local-storage" && (
          <BattlePanel
            title={language === "zh" ? "本地存储" : "Local Storage"}
            meta={storage ? `${formatBytes(storage.summary.totalBytes)} / ${storage.summary.totalFiles} files` : "checking"}
            tone="emerald"
            action={<BattleBadge tone={storage?.summary.retention.mode === "archive" ? "amber" : "emerald"}>{storage?.summary.retention.mode === "archive" ? <BattleText en="Archive" zh="归档" /> : <BattleText en="Keep" zh="永久保留" />}</BattleBadge>}
          >
            <div className="grid gap-3 p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">{language === "zh" ? "数据目录" : "Data directory"}</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-200">{storage?.summary.dataRoot || "-"}</p>
                </div>
                <FieldLabel>
                  {language === "zh" ? "Intake 保留策略" : "Intake Retention"}
                  <SelectField value={config.intakeRetentionMode} onChange={(event) => updateConfig({ intakeRetentionMode: event.target.value === "archive" ? "archive" : "keep" })} className="mt-1 w-full">
                    <option value="keep">{language === "zh" ? "永久保留" : "Keep forever"}</option>
                    <option value="archive">{language === "zh" ? "归档旧记录" : "Archive old records"}</option>
                  </SelectField>
                </FieldLabel>
                <ConfigInput label={language === "zh" ? "最大活跃 Intake" : "Max Active Intake"} type="number" value={config.intakeMaxActiveSessions} onChange={(value) => updateConfig({ intakeMaxActiveSessions: Math.max(1, Number(value) || 1) })} mono />
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                {(storage?.summary.directories || []).map((directory) => (
                  <button
                    key={directory.id}
                    type="button"
                    onClick={() => void loadStorage(directory.relativePath)}
                    className="rounded-md border border-slate-800 bg-slate-950 p-3 text-left transition hover:border-emerald-500/60 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
                  >
                    <span className="block text-sm font-semibold text-slate-100">{directory.label}</span>
                    <span className="mt-1 block font-mono text-xs text-slate-500">{formatBytes(directory.bytes)} / {directory.files}</span>
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
                  <p className="truncate font-mono text-xs text-slate-300">{storagePath}</p>
                  <CommandButton type="button" variant="ghost" onClick={() => void loadStorage(storagePath)}>
                    <BattleText en="Refresh" zh="刷新" />
                  </CommandButton>
                </div>
                <div className="divide-y divide-slate-800">
                  {(storage?.listing.entries || []).length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-slate-500">{language === "zh" ? "这个目录暂时没有文件。" : "No files in this folder yet."}</p>
                  ) : storage?.listing.entries.map((entry) => (
                    <div key={entry.relativePath} className="grid gap-3 px-3 py-2 text-xs text-slate-300 md:grid-cols-[minmax(0,1fr)_120px_auto]">
                      <button
                        type="button"
                        onClick={() => entry.kind === "directory" ? void loadStorage(entry.relativePath) : undefined}
                        disabled={entry.kind !== "directory"}
                        className="min-w-0 rounded border border-transparent px-2 py-1 text-left transition hover:border-slate-700 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
                      >
                        <span className="block truncate font-semibold text-slate-100">{entry.name}</span>
                        <span className="block truncate font-mono text-[10px] text-slate-600">{entry.relativePath}</span>
                      </button>
                      <span className="self-center font-mono text-slate-500">{entry.kind === "file" ? formatBytes(entry.size) : "folder"}</span>
                      <span className="flex justify-end gap-2">
                        {entry.previewUrl ? (
                          <a className="rounded-md border border-slate-700 px-2 py-1 font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70" href={entry.previewUrl} target="_blank" rel="noreferrer">
                            {language === "zh" ? "预览" : "Preview"}
                          </a>
                        ) : null}
                        {entry.downloadUrl ? (
                          <a className="rounded-md border border-slate-700 px-2 py-1 font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70" href={entry.downloadUrl}>
                            {language === "zh" ? "下载" : "Download"}
                          </a>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </BattlePanel>
        )}

        {activeTab === "model" && (
          <BattlePanel
            title={language === "zh" ? "模型配置" : "Model Configuration"}
            meta={modelReadinessLabel(model?.readiness, language)}
            tone={model?.readiness === "mock_fallback" ? "amber" : "emerald"}
            action={<BattleBadge tone={model?.readiness === "mock_fallback" ? "amber" : "emerald"}>{modelReadinessLabel(model?.readiness, language)}</BattleBadge>}
          >
            <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
              <FieldLabel>
                Provider
                <SelectField value={config.llmProvider} onChange={(event) => updateModelProvider(event.target.value)} className="mt-1 w-full">
                  <option value="">{language === "zh" ? "未配置，使用 mock fallback" : "Not configured, use mock fallback"}</option>
                  {LLM_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{language === "zh" ? option.zhLabel : option.label}</option>
                  ))}
                </SelectField>
              </FieldLabel>
              <ConfigInput label={language === "zh" ? "Base URL（自动填充，可高级修改）" : "Base URL (auto-filled, advanced editable)"} value={config.llmBaseUrl} onChange={(value) => updateConfig({ llmBaseUrl: value })} mono placeholder={language === "zh" ? "选择 Provider 后自动填充" : "Auto-filled after choosing provider"} />
              <ConfigInput label="API Key" value={config.llmApiKey} onChange={(value) => updateConfig({ llmApiKey: value })} mono />
              <ConfigInput label={language === "zh" ? "模型名" : "Model Name"} value={config.defaultModel} onChange={(value) => updateConfig({ defaultModel: value })} mono placeholder={language === "zh" ? "按所选供应商填写" : "Choose per provider"} />
              <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{language === "zh" ? "当前状态" : "Current status"}</p>
                <p className="mt-2 text-sm font-semibold text-slate-100">{modelReadinessLabel(model?.readiness, language)}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{model?.model || "mock"}</p>
              </div>
              <div className="flex items-end">
                <CommandButton type="button" variant="secondary" onClick={testModel} disabled={testing !== null || loading} loading={testing === "model"}>
                  <BattleText en="Test Model" zh="测试模型" />
                </CommandButton>
              </div>
              <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100 md:col-span-2 xl:col-span-3">
                {model?.mockFallbackActive
                  ? (language === "zh" ? "当前没有真实模型配置，SSA 会使用 mock fallback 做占位归纳。" : "No real model is configured. SSA will use mock fallback for placeholder summaries.")
                  : (language === "zh" ? "当前已配置真实模型；如果连接失败，运行时会明确提示 fallback。" : "A real model is configured. If it fails, the runtime reports fallback clearly.")}
              </div>
            </div>
          </BattlePanel>
        )}

        {activeTab === "email" && (
          <BattlePanel
            title={language === "zh" ? "邮件连接设置" : "Email Connection Settings"}
            meta={language === "zh" ? "客户发送默认锁定，必须人工批准" : "customer sends stay locked until approved"}
            tone={mailboxTone}
          >
            <div className="grid gap-3 p-3 md:grid-cols-3">
              <ConfigInput label={language === "zh" ? "发信服务器" : "Outgoing Mail Server"} value={config.smtpHost} onChange={(v) => updateConfig({ smtpHost: v })} mono />
              <ConfigInput label={language === "zh" ? "发信端口" : "Outgoing Port"} value={config.smtpPort} onChange={(v) => updateConfig({ smtpPort: v })} mono />
              <ConfigInput label={language === "zh" ? "发信加密" : "Outgoing Security"} value={config.smtpEncryption} onChange={(v) => updateConfig({ smtpEncryption: v })} mono />
              <ConfigInput label={language === "zh" ? "收信服务器" : "Incoming Mail Server"} value={config.imapHost} onChange={(v) => updateConfig({ imapHost: v })} mono />
              <ConfigInput label={language === "zh" ? "收信端口" : "Incoming Port"} value={config.imapPort} onChange={(v) => updateConfig({ imapPort: v })} mono />
              <ConfigInput label={language === "zh" ? "收信加密" : "Incoming Security"} value={config.imapEncryption} onChange={(v) => updateConfig({ imapEncryption: v })} mono />
              <ConfigInput label={language === "zh" ? "邮箱账号" : "Email Account"} value={config.email} onChange={(v) => updateConfig({ email: v })} mono />
              <ConfigInput label={language === "zh" ? "邮箱应用凭证" : "Mailbox App Credential"} value={config.mailboxCredential} onChange={(v) => updateConfig({ mailboxCredential: v })} mono />
              <label className="flex h-9 items-center gap-2 self-end rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 transition hover:border-slate-600">
                <input type="checkbox" checked={config.autoCapture} onChange={(event) => updateConfig({ autoCapture: event.target.checked })} />
                {language === "zh" ? "保存草稿供审批" : "Save drafts for review"}
              </label>
              <CommandButton type="button" variant="secondary" onClick={() => testConnection("imap")} disabled={Boolean(testing) || loading} loading={testing === "imap"}>
                <BattleText en="Test inbox" zh="测试收件" />
              </CommandButton>
              <CommandButton type="button" variant="secondary" onClick={() => testConnection("smtp")} disabled={Boolean(testing) || loading} loading={testing === "smtp"}>
                <BattleText en="Test sending" zh="测试发信" />
              </CommandButton>
            </div>
          </BattlePanel>
        )}

        {activeTab === "search" && (
          <BattlePanel title={language === "zh" ? "搜索与情报设置" : "Search & Intelligence Settings"} meta={language === "zh" ? "用于线索调研和市场情报" : "used for lead research and market intelligence"}>
            <div className="grid gap-3 p-3 md:grid-cols-4">
              <ConfigInput label={language === "zh" ? "搜索服务" : "Search Service"} value={config.searchEngine} onChange={(v) => updateConfig({ searchEngine: v })} mono />
              <ConfigInput label={language === "zh" ? "Tavily 密钥" : "Tavily Key"} value={config.tavilyApiKey} onChange={(v) => updateConfig({ tavilyApiKey: v })} mono />
              <ConfigInput label={language === "zh" ? "Hunter 密钥" : "Hunter Key"} value={config.hunterApiKey} onChange={(v) => updateConfig({ hunterApiKey: v })} mono />
              <ConfigInput label={language === "zh" ? "Apollo 密钥" : "Apollo Key"} value={config.apolloApiKey} onChange={(v) => updateConfig({ apolloApiKey: v })} mono />
              <ConfigInput label={language === "zh" ? "地区" : "Region"} value={config.searchRegion} onChange={(v) => updateConfig({ searchRegion: v })} mono />
              <ConfigInput label={language === "zh" ? "最多结果数" : "Max Results"} value={config.maxResults} type="number" onChange={(v) => updateConfig({ maxResults: Number(v) })} mono />
              <ConfigInput label={language === "zh" ? "搜索深度" : "Search Depth"} value={config.searchDepth} onChange={(v) => updateConfig({ searchDepth: v })} mono />
              {(["leadResearch", "priceMonitor", "trendTracking", "emailVerify"] as const).map((key) => (
                <label key={key} className="flex h-9 items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300 transition hover:border-slate-600">
                  <input
                    type="checkbox"
                    checked={config.autoResearch[key]}
                    onChange={(event) => updateConfig({
                      autoResearch: { ...config.autoResearch, [key]: event.target.checked },
                    })}
                  />
                  {language === "zh"
                    ? key === "leadResearch" ? "线索调研" : key === "priceMonitor" ? "价格监控" : key === "trendTracking" ? "趋势跟踪" : "邮箱核验"
                    : key === "leadResearch" ? "Lead research" : key === "priceMonitor" ? "Price watch" : key === "trendTracking" ? "Trend tracking" : "Email checks"}
                </label>
              ))}
            </div>
          </BattlePanel>
        )}
      </BattlePageBody>
    </BattlePageShell>
  );
}
