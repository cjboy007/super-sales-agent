"use client";

import Link from "next/link";
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
import { useProject } from "@/lib/project";

type TabKey = "api" | "email" | "search";

interface ConfigState {
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
  const { apiUrl } = useProject();
  const [activeTab, setActiveTab] = useState<TabKey>("api");
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"imap" | "smtp" | null>(null);
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

  const testConnection = useCallback(async (kind: "imap" | "smtp") => {
    setTesting(kind);
    setError(null);
    setMessage("");
    try {
      const res = await fetch(apiUrl("/api/email-connection/test"), {
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
  }, [apiUrl, language]);

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

        <BattlePanel
          title={language === "zh" ? "JadenOS 入门终端" : "JadenOS Onboarding Terminal"}
          meta={language === "zh" ? "运行 /jadenos onboarding 逐步设置" : "run /jadenos onboarding for guided setup"}
          action={
            <Link
              href="/jadenos/onboarding"
              className="inline-flex h-7 items-center rounded-md border border-emerald-600 bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              {language === "zh" ? "打开" : "Open"}
            </Link>
          }
        >
          <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300">
              <span className="text-emerald-300">$ /jadenos onboarding</span>
              <span className="ml-2 text-slate-500">
                {language === "zh" ? "逐步连接 DeepSeek、邮箱、Hunter、Tavily 和可选连接器。" : "step through DeepSeek, email, Hunter, Tavily, and optional connectors."}
              </span>
            </div>
            <p className="self-center text-xs text-slate-500">
              {language === "zh" ? "完整设置仍可在本页修改。" : "Full setup remains editable here."}
            </p>
          </div>
        </BattlePanel>

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
              <ConfigInput label={language === "zh" ? "DeepSeek 密钥" : "DeepSeek Key"} value={config.deepseekApiKey} onChange={(v) => updateConfig({ deepseekApiKey: v })} mono />
              <ConfigInput label={language === "zh" ? "OpenAI 密钥" : "OpenAI Key"} value={config.openaiApiKey} onChange={(v) => updateConfig({ openaiApiKey: v })} mono />
              <ConfigInput label={language === "zh" ? "OpenRouter 密钥" : "OpenRouter Key"} value={config.openrouterApiKey} onChange={(v) => updateConfig({ openrouterApiKey: v })} mono />
              <ConfigInput label={language === "zh" ? "Tavily 调研密钥" : "Tavily Research Key"} value={config.tavilyApiKey} onChange={(v) => updateConfig({ tavilyApiKey: v })} mono />
              <FieldLabel>
                {language === "zh" ? "默认 AI 模型" : "Default AI Model"}
                <SelectField value={config.defaultModel} onChange={(event) => updateConfig({ defaultModel: event.target.value })} className="mt-1 w-full">
                  <option value="deepseek-v4-pro">deepseek-v4-pro</option>
                  <option value="deepseekv4pro">deepseekv4pro</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                  <option value="deepseek/deepseek-v4-pro">deepseek/deepseek-v4-pro</option>
                  <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
                  <option value="anthropic/claude-sonnet-4">anthropic/claude-sonnet-4</option>
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
              <CommandButton type="button" variant="secondary" onClick={() => testConnection("imap")} disabled={Boolean(testing) || loading}>
                {testing === "imap" ? <BattleText en="Testing inbox" zh="测试收件中" /> : <BattleText en="Test inbox" zh="测试收件" />}
              </CommandButton>
              <CommandButton type="button" variant="secondary" onClick={() => testConnection("smtp")} disabled={Boolean(testing) || loading}>
                {testing === "smtp" ? <BattleText en="Testing sending" zh="测试发信中" /> : <BattleText en="Test sending" zh="测试发信" />}
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

        {activeTab === "search" && (
          <BattlePanel title={language === "zh" ? "可选连接器" : "Optional Connectors"} meta={language === "zh" ? "不上线第一天也可以稍后连接" : "can be connected after the first launch"}>
            <div className="grid gap-3 p-3 md:grid-cols-2">
              <FieldLabel>
                {language === "zh" ? "CRM" : "CRM"}
                <SelectField value={config.crmProvider} onChange={(event) => updateConfig({ crmProvider: event.target.value })} className="mt-1 w-full">
                  <option value="none">None / Local Workspace</option>
                  <option value="hubspot">HubSpot</option>
                  <option value="salesforce">Salesforce</option>
                  <option value="pipedrive">Pipedrive</option>
                  <option value="close">Close</option>
                  <option value="okki">OKKI</option>
                </SelectField>
              </FieldLabel>
              <ConfigInput label={language === "zh" ? "CRM API 密钥" : "CRM API Key"} value={config.crmApiKey} onChange={(v) => updateConfig({ crmApiKey: v })} mono />
              <FieldLabel>
                {language === "zh" ? "通知渠道" : "Notification Channel"}
                <SelectField value={config.notificationProvider} onChange={(event) => updateConfig({ notificationProvider: event.target.value })} className="mt-1 w-full">
                  <option value="none">None</option>
                  <option value="slack">Slack</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="feishu">Feishu / Lark</option>
                </SelectField>
              </FieldLabel>
              <ConfigInput label={language === "zh" ? "Webhook 地址" : "Webhook URL"} value={config.notificationWebhookUrl} onChange={(v) => updateConfig({ notificationWebhookUrl: v })} mono />
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
                <BattleText en="Developer and supervisor tools can help operators, but OpenClaw can run without them." zh="开发和监督工具可以辅助操作员，但 OpenClaw 不依赖它们运行。" />
              </p>
            </div>
          </div>
        </BattlePanel>
      </BattlePageBody>
    </BattlePageShell>
  );
}
