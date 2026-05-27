"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  InputField,
  SelectField,
  useBattleLanguage,
} from "@/components/ui/BattlePage";

type TabKey = "api" | "email" | "search";

interface ConfigState {
  openrouterApiKey: string;
  geminiApiKey: string;
  tavilyApiKey: string;
  defaultModel: string;
  smtpHost: string;
  smtpPort: string;
  smtpEncryption: string;
  imapHost: string;
  imapPort: string;
  imapEncryption: string;
  email: string;
  emailPassword: string;
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

const DEFAULT_CONFIG: ConfigState = {
  openrouterApiKey: "",
  geminiApiKey: "",
  tavilyApiKey: "",
  defaultModel: "qwen3.6-plus",
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wide text-slate-500">{children}</label>;
}

function ConfigInput({
  label,
  value,
  onChange,
  mono,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  mono?: boolean;
  type?: string;
}) {
  return (
    <FieldLabel>
      {label}
      <InputField value={value} type={type} onChange={(event) => onChange(event.target.value)} mono={mono} className="mt-1 w-full" />
    </FieldLabel>
  );
}

export default function SettingsPage() {
  const language = useBattleLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>("api");
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) {
          setConfig((prev) => ({ ...prev, ...json.data }));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load config");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = useCallback((partial: Partial<ConfigState>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || (language === "zh" ? "保存失败" : "Save failed"));
      setMessage(language === "zh" ? "设置已保存；密钥仍会隐藏显示。" : "Settings saved. Sensitive values stay hidden.");
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "保存失败" : "Save failed"));
    } finally {
      setSaving(false);
    }
  }, [config, language]);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "api", label: language === "zh" ? "AI 与调研" : "AI & Research" },
    { key: "email", label: language === "zh" ? "邮件连接" : "Email Connection" },
    { key: "search", label: language === "zh" ? "搜索" : "Search" },
  ];

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="System Settings"
        zhTitle="系统设置"
        meta="SAFE SETTINGS / KEYS HIDDEN / CUSTOMER SENDS LOCKED"
        zhMeta="安全设置 / 密钥隐藏 / 客户发送已锁定"
        active="/settings"
      >
        <BattleBadge tone={loading ? "blue" : error ? "red" : "emerald"} pulse={loading}>
          {loading ? <BattleText en="LOAD" zh="加载" /> : error ? <BattleText en="ERROR" zh="错误" /> : <BattleText en="READY" zh="就绪" />}
        </BattleBadge>
        <CommandButton variant="primary" onClick={save} disabled={saving || loading}>
          {saving ? <BattleText en="Saving" zh="保存中" /> : <BattleText en="Save" zh="保存" />}
        </CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        {(message || error) && (
          <div className={`rounded-md border px-3 py-2 text-xs ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
            {error || message}
          </div>
        )}

        <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-900/60 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`h-8 flex-1 rounded font-mono text-[10px] uppercase ${
                activeTab === tab.key ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "api" && (
          <BattlePanel
            title={language === "zh" ? "AI 与调研服务" : "AI & Research Services"}
            meta={language === "zh" ? "AI 只辅助阅读、起草和总结；关键动作仍由 SSA 控制" : "AI assists reading, drafting, and summaries; SSA controls final actions"}
          >
            <div className="grid gap-3 p-3 md:grid-cols-2">
              <ConfigInput label={language === "zh" ? "OpenRouter 密钥" : "OpenRouter Key"} value={config.openrouterApiKey} onChange={(v) => updateConfig({ openrouterApiKey: v })} mono />
              <ConfigInput label={language === "zh" ? "Gemini 密钥" : "Gemini Key"} value={config.geminiApiKey} onChange={(v) => updateConfig({ geminiApiKey: v })} mono />
              <ConfigInput label={language === "zh" ? "Tavily 调研密钥" : "Tavily Research Key"} value={config.tavilyApiKey} onChange={(v) => updateConfig({ tavilyApiKey: v })} mono />
              <FieldLabel>
                {language === "zh" ? "默认 AI 模型" : "Default AI Model"}
                <SelectField value={config.defaultModel} onChange={(event) => updateConfig({ defaultModel: event.target.value })} className="mt-1 w-full">
                  <option value="qwen3.6-plus">qwen3.6-plus</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                  <option value="claude-sonnet-4">claude-sonnet-4</option>
                  <option value="mock">mock</option>
                </SelectField>
              </FieldLabel>
            </div>
          </BattlePanel>
        )}

        {activeTab === "email" && (
          <BattlePanel
            title={language === "zh" ? "邮件连接设置" : "Email Connection Settings"}
            meta={language === "zh" ? "客户发送默认锁定，必须人工批准" : "customer sends stay locked until approved"}
          >
            <div className="grid gap-3 p-3 md:grid-cols-3">
              <ConfigInput label={language === "zh" ? "发信服务器" : "Outgoing Mail Server"} value={config.smtpHost} onChange={(v) => updateConfig({ smtpHost: v })} mono />
              <ConfigInput label={language === "zh" ? "发信端口" : "Outgoing Port"} value={config.smtpPort} onChange={(v) => updateConfig({ smtpPort: v })} mono />
              <ConfigInput label={language === "zh" ? "发信加密" : "Outgoing Security"} value={config.smtpEncryption} onChange={(v) => updateConfig({ smtpEncryption: v })} mono />
              <ConfigInput label={language === "zh" ? "收信服务器" : "Incoming Mail Server"} value={config.imapHost} onChange={(v) => updateConfig({ imapHost: v })} mono />
              <ConfigInput label={language === "zh" ? "收信端口" : "Incoming Port"} value={config.imapPort} onChange={(v) => updateConfig({ imapPort: v })} mono />
              <ConfigInput label={language === "zh" ? "收信加密" : "Incoming Security"} value={config.imapEncryption} onChange={(v) => updateConfig({ imapEncryption: v })} mono />
              <ConfigInput label={language === "zh" ? "邮箱账号" : "Email Account"} value={config.email} onChange={(v) => updateConfig({ email: v })} mono />
              <ConfigInput label={language === "zh" ? "邮箱密码" : "Email Password"} value={config.emailPassword} onChange={(v) => updateConfig({ emailPassword: v })} mono />
              <label className="flex h-8 items-center gap-2 self-end rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={config.autoCapture}
                  onChange={(event) => updateConfig({ autoCapture: event.target.checked })}
                />
                {language === "zh" ? "保存草稿供审批" : "Save drafts for review"}
              </label>
            </div>
          </BattlePanel>
        )}

        {activeTab === "search" && (
          <BattlePanel title={language === "zh" ? "搜索与情报设置" : "Search & Intelligence Settings"} meta={language === "zh" ? "用于线索调研和市场情报" : "used for lead research and market intelligence"}>
            <div className="grid gap-3 p-3 md:grid-cols-4">
              <ConfigInput label={language === "zh" ? "搜索服务" : "Search Service"} value={config.searchEngine} onChange={(v) => updateConfig({ searchEngine: v })} mono />
              <ConfigInput label={language === "zh" ? "地区" : "Region"} value={config.searchRegion} onChange={(v) => updateConfig({ searchRegion: v })} mono />
              <ConfigInput label={language === "zh" ? "最多结果数" : "Max Results"} value={config.maxResults} type="number" onChange={(v) => updateConfig({ maxResults: Number(v) })} mono />
              <ConfigInput label={language === "zh" ? "搜索深度" : "Search Depth"} value={config.searchDepth} onChange={(v) => updateConfig({ searchDepth: v })} mono />
              {(["leadResearch", "priceMonitor", "trendTracking", "emailVerify"] as const).map((key) => (
                <label key={key} className="flex h-8 items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300">
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

        <BattlePanel title={language === "zh" ? "安全规则" : "Safety Rules"} meta={language === "zh" ? "哪些可以自动做，哪些必须审批" : "what SSA can do automatically and what needs approval"}>
          <div className="grid gap-3 p-3 md:grid-cols-3">
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <BattleBadge tone="emerald"><BattleText en="Core" zh="核心" /></BattleBadge>
              <p className="mt-2 text-xs text-slate-300">
                <BattleText en="SSA stores sales state, approvals, tasks, and files itself." zh="SSA 自己保存销售状态、审批、任务和文件。" />
              </p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <BattleBadge tone="amber"><BattleText en="Approval Needed" zh="需要审批" /></BattleBadge>
              <p className="mt-2 text-xs text-slate-300">
                <BattleText en="Customer emails, outside systems, payments, and live business changes stay locked until approved." zh="客户邮件、外部系统、付款和真实业务变更，在批准前都会锁定。" />
              </p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <BattleBadge tone="neutral"><BattleText en="Optional Tools" zh="可选工具" /></BattleBadge>
              <p className="mt-2 text-xs text-slate-300">
                <BattleText en="Developer and supervisor tools can help Wilson, but SSA can run without them." zh="开发和监督工具可以辅助 Wilson，但 SSA 不依赖它们运行。" />
              </p>
            </div>
          </div>
        </BattlePanel>
      </BattlePageBody>
    </BattlePageShell>
  );
}
