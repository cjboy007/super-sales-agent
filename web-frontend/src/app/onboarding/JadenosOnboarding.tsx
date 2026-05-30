"use client";

import Link from "next/link";
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
import {
  DEFAULT_CONFIG,
  JADENOS_ONBOARDING_ROUTE,
  type ConfigState,
  type JadenosOnboardingStep,
  getJadenosOnboardingSteps,
  getOnboardingReadiness,
  isConfiguredSecret,
} from "./onboarding-flow";

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

function ReadinessMeter({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/45 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            <BattleText en="Core launch" zh="核心上线" />
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-100">{completed}/{total}</p>
        </div>
        <BattleBadge tone={completed === total ? "emerald" : "amber"}>
          {completed === total ? <BattleText en="Ready" zh="就绪" /> : <BattleText en="Setup" zh="配置" />}
        </BattleBadge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SwitchRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <label className="flex min-h-8 items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function TerminalPanel({
  steps,
  activeIndex,
  language,
}: {
  steps: JadenosOnboardingStep[];
  activeIndex: number;
  language: "en" | "zh";
}) {
  const visibleSteps = steps.slice(0, activeIndex + 1);

  return (
    <BattlePanel
      title={language === "zh" ? "JadenOS 设置终端" : "JadenOS Setup Terminal"}
      meta={language === "zh" ? "一步一步连接销售工作台" : "step-by-step sales workspace setup"}
    >
      <div className="bg-slate-950 p-3 font-mono text-xs leading-6">
        <div className="max-h-[330px] min-h-[260px] overflow-y-auto rounded-md border border-slate-800 bg-black/35 px-3 py-2">
          {visibleSteps.map((step) => (
            <div key={step.id} className="py-1">
              <div className="text-emerald-300">{step.command}</div>
              <div className="text-slate-300">
                <span className="text-slate-500">JadenOS: </span>
                {language === "zh" ? step.zhPrompt : step.prompt}
              </div>
              <div className={cx(
                "text-[11px]",
                step.status === "done" ? "text-emerald-400" : step.status === "optional" ? "text-slate-500" : "text-amber-300"
              )}>
                status: {step.status}
              </div>
            </div>
          ))}
          <div className="mt-1 inline-flex items-center gap-2 text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span>{language === "zh" ? "等待下一步" : "waiting for next step"}</span>
          </div>
        </div>
      </div>
    </BattlePanel>
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
  return (
    <BattlePanel
      title={language === "zh" ? "步骤" : "Steps"}
      meta={language === "zh" ? "可跳转；核心项仍需补齐" : "jump around; core items remain required"}
    >
      <div className="divide-y divide-slate-800">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(index)}
            className={cx(
              "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition",
              index === activeIndex ? "bg-emerald-500/10 text-slate-100" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
            )}
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{language === "zh" ? step.zhTitle : step.title}</span>
              <span className="block truncate font-mono text-[10px] text-slate-600">{step.command.replace("$ ", "")}</span>
            </span>
            <StatusBadge status={step.status} />
          </button>
        ))}
      </div>
    </BattlePanel>
  );
}

function StepBody({
  step,
  config,
  updateConfig,
  testConnection,
  testing,
  loading,
  language,
}: {
  step: JadenosOnboardingStep;
  config: ConfigState;
  updateConfig: (partial: Partial<ConfigState>) => void;
  testConnection: (kind: "imap" | "smtp") => void;
  testing: "imap" | "smtp" | null;
  loading: boolean;
  language: "en" | "zh";
}) {
  if (step.id === "identity") {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-3">
        <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
          <BattleBadge tone="emerald"><BattleText en="Workspace" zh="工作台" /></BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            <BattleText
              en="JadenOS runs as a local sales cockpit for leads, approvals, drafts, documents, and account memory."
              zh="JadenOS 是本地销售驾驶舱，用于线索、审批、草稿、单证和客户记忆。"
            />
          </p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
          <BattleBadge tone="blue"><BattleText en="Files" zh="文件" /></BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            <BattleText
              en="Catalogs, price sheets, templates, and customer files go through Intake so the workspace stays organized."
              zh="产品册、价格表、模板和客户文件走投递台，工作区不会乱成一团。"
            />
          </p>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
          <BattleBadge tone="amber"><BattleText en="Editable" zh="可修改" /></BattleBadge>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            <BattleText
              en="Every setup choice here can be changed later in Settings."
              zh="这里的每个设置之后都可以在设置里修改。"
            />
          </p>
        </div>
        <SwitchRow
          checked={config.autoCapture}
          onChange={(checked) => updateConfig({ autoCapture: checked })}
          label={<BattleText en="Save outbound drafts for review" zh="保存外发草稿供审批" />}
        />
        <Link
          href="/intake"
          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600"
        >
          <BattleText en="Open Intake" zh="打开投递台" />
        </Link>
        <Link
          href="/settings"
          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600"
        >
          <BattleText en="Open Settings" zh="打开设置" />
        </Link>
      </div>
    );
  }

  if (step.id === "llm") {
    return (
      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
        <ConfigInput label={language === "zh" ? "DeepSeek 密钥" : "DeepSeek Key"} value={config.deepseekApiKey} onChange={(v) => updateConfig({ deepseekApiKey: v })} mono placeholder="sk-..." />
        <FieldLabel>
          {language === "zh" ? "默认模型" : "Default Model"}
          <SelectField value={config.defaultModel} onChange={(event) => updateConfig({ defaultModel: event.target.value })} className="mt-1 w-full">
            <option value="deepseek-v4-pro">deepseek-v4-pro</option>
            <option value="deepseekv4pro">deepseekv4pro</option>
            <option value="deepseek/deepseek-v4-pro">deepseek/deepseek-v4-pro</option>
            <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4.1">gpt-4.1</option>
            <option value="anthropic/claude-sonnet-4">anthropic/claude-sonnet-4</option>
            <option value="mock">mock</option>
          </SelectField>
        </FieldLabel>
        <ConfigInput label={language === "zh" ? "OpenRouter 备用密钥" : "OpenRouter fallback key"} value={config.openrouterApiKey} onChange={(v) => updateConfig({ openrouterApiKey: v })} mono placeholder="sk-or-..." />
        <ConfigInput label={language === "zh" ? "OpenAI 备用密钥" : "OpenAI fallback key"} value={config.openaiApiKey} onChange={(v) => updateConfig({ openaiApiKey: v })} mono placeholder="sk-..." />
      </div>
    );
  }

  if (step.id === "email") {
    return (
      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
        <ConfigInput label={language === "zh" ? "邮箱账号" : "Email Account"} value={config.email} onChange={(v) => updateConfig({ email: v })} mono placeholder="sales@example.com" />
        <ConfigInput label={language === "zh" ? "邮箱密码 / 应用密码" : "Email Password / App Password"} value={config.emailPassword} onChange={(v) => updateConfig({ emailPassword: v })} mono />
        <ConfigInput label={language === "zh" ? "收信服务器" : "Incoming Mail Server"} value={config.imapHost} onChange={(v) => updateConfig({ imapHost: v })} mono placeholder="imap.example.com" />
        <ConfigInput label={language === "zh" ? "收信端口" : "Incoming Port"} value={config.imapPort} onChange={(v) => updateConfig({ imapPort: v })} mono />
        <ConfigInput label={language === "zh" ? "收信加密" : "Incoming Security"} value={config.imapEncryption} onChange={(v) => updateConfig({ imapEncryption: v })} mono />
        <ConfigInput label={language === "zh" ? "发信服务器" : "Outgoing Mail Server"} value={config.smtpHost} onChange={(v) => updateConfig({ smtpHost: v })} mono placeholder="smtp.example.com" />
        <ConfigInput label={language === "zh" ? "发信端口" : "Outgoing Port"} value={config.smtpPort} onChange={(v) => updateConfig({ smtpPort: v })} mono />
        <ConfigInput label={language === "zh" ? "发信加密" : "Outgoing Security"} value={config.smtpEncryption} onChange={(v) => updateConfig({ smtpEncryption: v })} mono />
        <CommandButton type="button" variant="secondary" onClick={() => testConnection("imap")} disabled={Boolean(testing) || loading}>
          {testing === "imap" ? <BattleText en="Testing inbox" zh="测试收件中" /> : <BattleText en="Test inbox" zh="测试收件" />}
        </CommandButton>
        <CommandButton type="button" variant="secondary" onClick={() => testConnection("smtp")} disabled={Boolean(testing) || loading}>
          {testing === "smtp" ? <BattleText en="Testing sending" zh="测试发信中" /> : <BattleText en="Test sending" zh="测试发信" />}
        </CommandButton>
      </div>
    );
  }

  if (step.id === "verification") {
    return (
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <ConfigInput label={language === "zh" ? "Hunter API 密钥" : "Hunter API Key"} value={config.hunterApiKey} onChange={(v) => updateConfig({ hunterApiKey: v })} mono />
        <SwitchRow
          checked={config.autoResearch.emailVerify}
          onChange={(checked) => updateConfig({ autoResearch: { ...config.autoResearch, emailVerify: checked } })}
          label={<BattleText en="Require checks before cold send" zh="冷邮件发送前要求核验" />}
        />
      </div>
    );
  }

  if (step.id === "research") {
    return (
      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
        <ConfigInput label={language === "zh" ? "Tavily API 密钥" : "Tavily API Key"} value={config.tavilyApiKey} onChange={(v) => updateConfig({ tavilyApiKey: v })} mono />
        <ConfigInput label={language === "zh" ? "搜索服务" : "Search Service"} value={config.searchEngine} onChange={(v) => updateConfig({ searchEngine: v })} mono />
        <ConfigInput label={language === "zh" ? "地区" : "Region"} value={config.searchRegion} onChange={(v) => updateConfig({ searchRegion: v })} mono />
        <ConfigInput label={language === "zh" ? "最多结果数" : "Max Results"} value={config.maxResults} type="number" onChange={(v) => updateConfig({ maxResults: Math.max(1, Number(v) || 1) })} mono />
        <ConfigInput label={language === "zh" ? "搜索深度" : "Search Depth"} value={config.searchDepth} onChange={(v) => updateConfig({ searchDepth: v })} mono />
        <SwitchRow
          checked={config.autoResearch.leadResearch}
          onChange={(checked) => updateConfig({ autoResearch: { ...config.autoResearch, leadResearch: checked } })}
          label={<BattleText en="Lead research" zh="线索调研" />}
        />
        <SwitchRow
          checked={config.autoResearch.priceMonitor}
          onChange={(checked) => updateConfig({ autoResearch: { ...config.autoResearch, priceMonitor: checked } })}
          label={<BattleText en="Price watch" zh="价格监控" />}
        />
        <SwitchRow
          checked={config.autoResearch.trendTracking}
          onChange={(checked) => updateConfig({ autoResearch: { ...config.autoResearch, trendTracking: checked } })}
          label={<BattleText en="Trend tracking" zh="趋势跟踪" />}
        />
      </div>
    );
  }

  if (step.id === "optional") {
    return (
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <div className="grid gap-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Apollo</h3>
              <p className="mt-1 text-xs text-slate-500">
                <BattleText en="Lead source and enrichment after core mail works." zh="核心邮件跑通后，用于线索来源和信息补全。" />
              </p>
            </div>
            <StatusBadge status={isConfiguredSecret(config.apolloApiKey) ? "done" : "optional"} />
          </div>
          <ConfigInput label={language === "zh" ? "Apollo API 密钥" : "Apollo API Key"} value={config.apolloApiKey} onChange={(v) => updateConfig({ apolloApiKey: v })} mono />
        </div>

        <div className="grid gap-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">CRM</h3>
              <p className="mt-1 text-xs text-slate-500">
                <BattleText en="Local workspace first, CRM sync later if needed." zh="先用本地工作台，需要时再接 CRM 同步。" />
              </p>
            </div>
            <StatusBadge status={config.crmProvider !== "none" && isConfiguredSecret(config.crmApiKey) ? "done" : "optional"} />
          </div>
          <FieldLabel>
            CRM
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
        </div>

        <div className="grid gap-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-3 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                <BattleText en="Team notifications" zh="团队通知" />
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                <BattleText en="Approval alerts can go to Slack, Teams, Feishu, or Lark." zh="审批提醒可以发到 Slack、Teams、飞书或 Lark。" />
              </p>
            </div>
            <StatusBadge status={config.notificationProvider !== "none" && isConfiguredSecret(config.notificationWebhookUrl) ? "done" : "optional"} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
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
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3 md:grid-cols-3">
      <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
        <BattleBadge tone="emerald"><BattleText en="Cockpit" zh="驾驶舱" /></BattleBadge>
        <p className="mt-2 text-xs leading-5 text-slate-300">
          <BattleText en="Operate leads, inbox, approvals, docs, and quotes." zh="处理线索、收件箱、审批、单证和报价。" />
        </p>
        <Link href="/" className="mt-3 inline-flex text-xs font-semibold text-emerald-300 hover:text-emerald-200">
          <BattleText en="Open Cockpit" zh="打开驾驶舱" />
        </Link>
      </div>
      <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
        <BattleBadge tone="blue"><BattleText en="Settings" zh="设置" /></BattleBadge>
        <p className="mt-2 text-xs leading-5 text-slate-300">
          <BattleText en="Change keys, mail, search, CRM, and notification setup later." zh="之后可修改密钥、邮件、搜索、CRM 和通知设置。" />
        </p>
        <Link href="/settings" className="mt-3 inline-flex text-xs font-semibold text-emerald-300 hover:text-emerald-200">
          <BattleText en="Open Settings" zh="打开设置" />
        </Link>
      </div>
      <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
        <BattleBadge tone="amber"><BattleText en="Files" zh="文件" /></BattleBadge>
        <p className="mt-2 text-xs leading-5 text-slate-300">
          <BattleText en="Use Intake for catalogs, price sheets, templates, and customer documents." zh="用投递台管理产品册、价格表、模板和客户文件。" />
        </p>
        <Link href="/intake" className="mt-3 inline-flex text-xs font-semibold text-emerald-300 hover:text-emerald-200">
          <BattleText en="Open Intake" zh="打开投递台" />
        </Link>
      </div>
    </div>
  );
}

export default function JadenosOnboarding() {
  const language = useBattleLanguage();
  const { apiUrl } = useProject();
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [activeIndex, setActiveIndex] = useState(0);
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load onboarding");
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

  const readiness = useMemo(() => getOnboardingReadiness(config), [config]);
  const steps = useMemo(() => getJadenosOnboardingSteps(config), [config]);
  const activeStep = steps[activeIndex] ?? steps[0];

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
      setConfig((prev) => ({ ...prev, ...json.data }));
      setMessage(language === "zh" ? "设置已保存。之后可以在设置页修改。" : "Setup saved. You can change it later in Settings.");
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "zh" ? "保存失败" : "Save failed"));
    } finally {
      setSaving(false);
    }
  }, [config, language]);

  const saveAndNext = useCallback(async () => {
    await save();
    setActiveIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [save, steps.length]);

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

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="JadenOS Onboarding"
        zhTitle="JadenOS 入门"
        meta="OPENCLAW FOR SALESPEOPLE / TERMINAL SETUP"
        zhMeta="销售版 OPENCLAW / 终端式设置"
        active={JADENOS_ONBOARDING_ROUTE}
      >
        <BattleBadge tone={loading ? "blue" : readiness.allReady ? "emerald" : "amber"} pulse={loading}>
          {loading ? <BattleText en="LOAD" zh="加载" /> : readiness.allReady ? <BattleText en="READY" zh="就绪" /> : <BattleText en="SETUP" zh="设置" />}
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

        <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="order-2 space-y-3 xl:order-1">
            <ReadinessMeter completed={readiness.completed} total={readiness.total} />
            <StepList steps={steps} activeIndex={activeIndex} onSelect={setActiveIndex} language={language} />
            <BattlePanel
              title={language === "zh" ? "核心清单" : "Core checklist"}
              meta={language === "zh" ? "不含可选连接器" : "optional connectors excluded"}
            >
              <div className="divide-y divide-slate-800">
                {readiness.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className={cx(item.done ? "text-slate-200" : "text-slate-500")}>
                      {language === "zh" ? item.zhLabel : item.label}
                    </span>
                    <StatusBadge status={item.done ? "done" : "missing"} />
                  </div>
                ))}
              </div>
            </BattlePanel>
          </aside>

          <div className="order-1 space-y-3 xl:order-2">
            <TerminalPanel steps={steps} activeIndex={activeIndex} language={language} />

            <BattlePanel
              title={`${activeIndex + 1}. ${language === "zh" ? activeStep.zhTitle : activeStep.title}`}
              meta={activeStep.command}
              action={<StatusBadge status={activeStep.status} />}
            >
              <StepBody
                step={activeStep}
                config={config}
                updateConfig={updateConfig}
                testConnection={testConnection}
                testing={testing}
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
                    onClick={saveAndNext}
                    disabled={saving || loading || activeIndex === steps.length - 1}
                  >
                    {saving ? <BattleText en="Saving" zh="保存中" /> : <BattleText en="Save and next" zh="保存并继续" />}
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
                  <Link href="/settings" className="inline-flex h-7 items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600">
                    <BattleText en="Change in Settings" zh="到设置修改" />
                  </Link>
                  <Link href="/" className="inline-flex h-7 items-center rounded-md border border-emerald-600 bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500">
                    <BattleText en="Open Cockpit" zh="打开驾驶舱" />
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
