"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge, PanelSection, type Tone } from "@/components/ui/BattleTokens";
import { CommandButton, InputField, SelectField } from "@/components/ui/CommandControls";

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
  smtpHost: "smtphz.qiye.163.com",
  smtpPort: "465",
  smtpEncryption: "ssl",
  imapHost: "imaphz.qiye.163.com",
  imapPort: "993",
  imapEncryption: "ssl",
  email: "sale-9@farreach-electronic.com",
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

function MaskedInput({
  value,
  onChange,
  placeholder = "masked",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-600">{label}</label>
      <div className="flex gap-2">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500"
        />
        <button type="button" onClick={() => setVisible((current) => !current)} className="h-8 rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 hover:text-slate-100">
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-3 py-2 last:border-b-0">
      <div>
        <p className="text-xs font-semibold text-slate-200">{label}</p>
        <p className="text-[10px] text-slate-600">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`h-7 rounded-md px-3 font-mono text-[10px] font-semibold uppercase ${checked ? "bg-emerald-600 text-white" : "border border-slate-700 bg-slate-800 text-slate-400"}`}
      >
        {checked ? "on" : "off"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("api");
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          const payload = data.data || data;
          setConfig((prev) => ({ ...prev, ...payload, autoResearch: { ...prev.autoResearch, ...(payload.autoResearch || {}) } }));
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(`Config load failed: ${e.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const updateConfig = (partial: Partial<ConfigState>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleExport = useCallback(() => {
    const redacted = {
      ...config,
      openrouterApiKey: config.openrouterApiKey ? "MASKED" : "",
      geminiApiKey: config.geminiApiKey ? "MASKED" : "",
      tavilyApiKey: config.tavilyApiKey ? "MASKED" : "",
      emailPassword: config.emailPassword ? "MASKED" : "",
    };
    const blob = new Blob([JSON.stringify(redacted, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ssa-config-redacted-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [config]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImportMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        setConfig((prev) => ({
          ...prev,
          ...imported,
          autoResearch: { ...prev.autoResearch, ...(imported.autoResearch || {}) },
        }));
        setImportMsg("Config imported. Save to apply.");
        window.setTimeout(() => setImportMsg(null), 3500);
      } catch {
        setError("Import failed: invalid JSON");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const tabs: Array<{ key: TabKey; label: string; tone: Tone }> = [
    { key: "api", label: "LLM API", tone: "purple" },
    { key: "email", label: "Email Sync", tone: "amber" },
    { key: "search", label: "Research", tone: "blue" },
  ];

  return (
    <PageShell>
      <PageHeader title="System Settings" meta="local config / masked secrets / no production deploy">
        {error && <Badge tone="red">error</Badge>}
        {saved && <Badge tone="emerald">saved</Badge>}
        {importMsg && <Badge tone="blue">imported</Badge>}
        <CommandButton variant="ghost" size="xs" onClick={handleExport}>Export Redacted</CommandButton>
        <CommandButton variant="ghost" size="xs" onClick={() => fileInputRef.current?.click()}>Import</CommandButton>
        <CommandButton size="xs" onClick={handleSave} disabled={saving}>{saving ? "Saving" : "Save"}</CommandButton>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-slate-800 bg-slate-900/35 p-3">
          <div className="space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left ${activeTab === tab.key ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
              >
                <span className="text-xs font-semibold text-slate-200">{tab.label}</span>
                <Badge tone={tab.tone}>{tab.key}</Badge>
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-amber-300">Runtime Boundary</p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              OpenClaw, Hermes, PHOENIX, and Codex are not required at SSA runtime. Secrets remain masked in the UI.
            </p>
          </div>
          {error && <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">{error}</div>}
        </aside>

        <main className="min-h-0 overflow-y-auto p-3">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500">Loading config</div>
          ) : activeTab === "api" ? (
            <div className="space-y-3">
              <PanelSection title="LLM Provider Adapters">
                <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
                  <MaskedInput label="OpenRouter API Key" value={config.openrouterApiKey} onChange={(value) => updateConfig({ openrouterApiKey: value })} placeholder="masked key" />
                  <MaskedInput label="Gemini API Key" value={config.geminiApiKey} onChange={(value) => updateConfig({ geminiApiKey: value })} placeholder="masked key" />
                  <MaskedInput label="Tavily Search API Key" value={config.tavilyApiKey} onChange={(value) => updateConfig({ tavilyApiKey: value })} placeholder="masked key" />
                  <SelectField label="Default Model" value={config.defaultModel} onChange={(e) => updateConfig({ defaultModel: e.target.value })}>
                    <option value="qwen3.6-plus">Qwen 3.6 Plus</option>
                    <option value="claude-sonnet-4">Claude Sonnet 4</option>
                    <option value="gpt-4.1">GPT-4.1</option>
                    <option value="glm-5">GLM-5</option>
                  </SelectField>
                </div>
              </PanelSection>
            </div>
          ) : activeTab === "email" ? (
            <div className="space-y-3">
              <PanelSection title="SMTP">
                <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-3">
                  <InputField label="SMTP Host" mono value={config.smtpHost} onChange={(e) => updateConfig({ smtpHost: e.target.value })} />
                  <InputField label="SMTP Port" mono value={config.smtpPort} onChange={(e) => updateConfig({ smtpPort: e.target.value })} />
                  <SelectField label="Encryption" value={config.smtpEncryption} onChange={(e) => updateConfig({ smtpEncryption: e.target.value })}>
                    <option value="ssl">SSL</option>
                    <option value="tls">TLS</option>
                    <option value="none">None</option>
                  </SelectField>
                </div>
              </PanelSection>
              <PanelSection title="IMAP">
                <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-3">
                  <InputField label="IMAP Host" mono value={config.imapHost} onChange={(e) => updateConfig({ imapHost: e.target.value })} />
                  <InputField label="IMAP Port" mono value={config.imapPort} onChange={(e) => updateConfig({ imapPort: e.target.value })} />
                  <SelectField label="Encryption" value={config.imapEncryption} onChange={(e) => updateConfig({ imapEncryption: e.target.value })}>
                    <option value="ssl">SSL</option>
                    <option value="tls">TLS</option>
                    <option value="none">None</option>
                  </SelectField>
                </div>
              </PanelSection>
              <PanelSection title="Credentials And Capture">
                <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
                  <InputField label="Email Address" mono type="email" value={config.email} onChange={(e) => updateConfig({ email: e.target.value })} />
                  <MaskedInput label="Email Password / App Code" value={config.emailPassword} onChange={(value) => updateConfig({ emailPassword: value })} placeholder="masked credential" />
                </div>
                <ToggleRow label="Auto capture email" desc="Checks new mail and associates it with local customer records." checked={config.autoCapture} onChange={(checked) => updateConfig({ autoCapture: checked })} />
              </PanelSection>
            </div>
          ) : (
            <div className="space-y-3">
              <PanelSection title="Search Configuration">
                <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
                  <SelectField label="Search Engine" value={config.searchEngine} onChange={(e) => updateConfig({ searchEngine: e.target.value })}>
                    <option value="tavily">Tavily Search</option>
                    <option value="brave">Brave Search</option>
                    <option value="searxng">SearXNG</option>
                  </SelectField>
                  <SelectField label="Search Region" value={config.searchRegion} onChange={(e) => updateConfig({ searchRegion: e.target.value })}>
                    <option value="global">Global</option>
                    <option value="us">United States</option>
                    <option value="eu">Europe</option>
                    <option value="asia">Asia</option>
                  </SelectField>
                  <InputField label="Max Results" mono type="number" min={1} max={20} value={config.maxResults} onChange={(e) => updateConfig({ maxResults: Number(e.target.value) })} />
                  <SelectField label="Search Depth" value={config.searchDepth} onChange={(e) => updateConfig({ searchDepth: e.target.value })}>
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="deep">Deep</option>
                  </SelectField>
                </div>
              </PanelSection>
              <PanelSection title="Automatic Research Gates">
                {[
                  { label: "Lead background research", desc: "Research company context when a new lead enters SSA.", key: "leadResearch" as const },
                  { label: "Competitor price monitor", desc: "Track competitor pricing signals for review.", key: "priceMonitor" as const },
                  { label: "Industry trend tracking", desc: "Generate periodic market trend summaries.", key: "trendTracking" as const },
                  { label: "Email verification", desc: "Check lead email quality before outreach.", key: "emailVerify" as const },
                ].map((item) => (
                  <ToggleRow
                    key={item.key}
                    label={item.label}
                    desc={item.desc}
                    checked={config.autoResearch[item.key]}
                    onChange={(checked) => updateConfig({ autoResearch: { ...config.autoResearch, [item.key]: checked } })}
                  />
                ))}
              </PanelSection>
            </div>
          )}
        </main>
      </div>
    </PageShell>
  );
}
