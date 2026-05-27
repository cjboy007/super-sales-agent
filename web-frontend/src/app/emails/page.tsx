"use client";

import { useCallback, useEffect, useState } from "react";
import { useProject } from "@/lib/project";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  EmptyState,
  InputField,
  StatCell,
  TextAreaField,
  useBattleLanguage,
} from "@/components/ui/BattlePage";

interface SentEmail {
  email: string;
  sent_at: string;
  subject: string;
}

interface Draft {
  id: string;
  subject: string;
  template: string;
}

interface PendingEmail {
  id: string;
  to: string;
  subject: string;
  scheduledAt: string;
  reason: string;
}

interface EmailStats {
  totalSent: number;
  totalReceived: number;
  totalReplied: number;
  replyRate: number;
  totalDrafts?: number;
}

type Tab = "sent" | "drafts" | "pending";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "-";
  return d.toLocaleString("en-CA", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function EmailsPage() {
  const { apiUrl, project } = useProject();
  const language = useBattleLanguage();
  const [activeTab, setActiveTab] = useState<Tab>("sent");
  const [stats, setStats] = useState<EmailStats>({ totalSent: 0, totalReceived: 0, totalReplied: 0, replyRate: 0 });
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, sentRes, draftsRes, pendingRes] = await Promise.all([
        fetch(apiUrl("/api/emails/stats")),
        fetch(apiUrl("/api/emails/sent?page=1&limit=30")),
        fetch(apiUrl("/api/emails/drafts")),
        fetch(apiUrl("/api/emails/pending")),
      ]);
      const [statsJson, sentJson, draftsJson, pendingJson] = await Promise.all([
        statsRes.json(),
        sentRes.json(),
        draftsRes.json(),
        pendingRes.json(),
      ]);
      if (statsJson.success) setStats(statsJson.data);
      if (sentJson.success) setSentEmails(sentJson.data.items || []);
      if (draftsJson.success) setDrafts(draftsJson.data || []);
      if (pendingJson.success) setPendingEmails(pendingJson.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email data");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveRequest() {
    if (!to || !subject || !body) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to save request");
      setSaveMessage(json.detail || (language === "zh" ? "已保存为待审批草稿，未发送给客户。" : "Saved for review. Nothing was sent to a customer."));
      setTo("");
      setSubject("");
      setBody("");
      await load();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to save request");
    } finally {
      setSaving(false);
    }
  }

  const rows = activeTab === "sent" ? sentEmails : activeTab === "drafts" ? drafts : pendingEmails;

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Email Operations"
        zhTitle="邮件操作台"
        meta={`${project.name.toUpperCase()} / SAFE MODE / CUSTOMER SENDS NEED APPROVAL`}
        zhMeta={`${project.name.toUpperCase()} / 安全模式 / 发给客户前需要审批`}
        active="/emails"
      >
        <BattleBadge tone={loading ? "blue" : "emerald"} pulse={loading}>
          {loading ? <BattleText en="SYNC" zh="同步" /> : <BattleText en="READY" zh="就绪" />}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={() => load()}><BattleText en="Refresh" zh="刷新" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "已记录邮件" : "Saved Emails"} value={stats.totalSent} tone="emerald" />
          <StatCell label={language === "zh" ? "收到" : "Received"} value={stats.totalReceived} tone="blue" />
          <StatCell label={language === "zh" ? "已回复" : "Replied"} value={stats.totalReplied} tone="purple" />
          <StatCell label={language === "zh" ? "回复率" : "Reply Rate"} value={`${stats.replyRate}%`} tone="amber" />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <BattlePanel
            title={language === "zh" ? "邮件记录" : "Email Records"}
            meta={language === "zh" ? `${rows.length} 条记录` : `${rows.length} records`}
            action={
              <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-950 p-0.5">
                {(["sent", "drafts", "pending"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`h-6 rounded px-2 font-mono text-[10px] uppercase ${
                      activeTab === tab ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {language === "zh"
                      ? tab === "sent" ? "已保存" : tab === "drafts" ? "草稿" : "待审批"
                      : tab === "sent" ? "saved" : tab}
                  </button>
                ))}
              </div>
            }
          >
            {error ? (
              <EmptyState label={error} />
            ) : rows.length === 0 ? (
              <EmptyState label={language === "zh" ? (loading ? "正在读取邮件记录" : "没有记录") : (loading ? "loading email records" : "no records")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/70 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{language === "zh" ? "收件人" : "Recipient"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "主题" : "Subject"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "状态" : "Status"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "时间" : "Time"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {activeTab === "sent" && sentEmails.map((email) => (
                      <tr key={`${email.email}-${email.sent_at}`} className="hover:bg-slate-800/35">
                        <td className="px-3 py-2 font-mono text-slate-400">{email.email}</td>
                        <td className="px-3 py-2 text-slate-200">{email.subject}</td>
                        <td className="px-3 py-2"><BattleBadge tone="emerald"><BattleText en="saved" zh="已保存" /></BattleBadge></td>
                        <td className="px-3 py-2 font-mono text-slate-500">{formatDate(email.sent_at)}</td>
                      </tr>
                    ))}
                    {activeTab === "drafts" && drafts.map((draft) => (
                      <tr key={draft.id} className="hover:bg-slate-800/35">
                        <td className="px-3 py-2 font-mono text-slate-500">{draft.id}</td>
                        <td className="px-3 py-2 text-slate-200">{draft.subject}</td>
                        <td className="px-3 py-2"><BattleBadge tone="amber"><BattleText en="draft" zh="草稿" /></BattleBadge></td>
                        <td className="px-3 py-2 font-mono text-slate-500">{draft.template}</td>
                      </tr>
                    ))}
                    {activeTab === "pending" && pendingEmails.map((email) => (
                      <tr key={email.id} className="hover:bg-slate-800/35">
                        <td className="px-3 py-2 font-mono text-slate-400">{email.to}</td>
                        <td className="px-3 py-2 text-slate-200">{email.subject}</td>
                        <td className="px-3 py-2"><BattleBadge tone="amber"><BattleText en="review" zh="待审批" /></BattleBadge></td>
                        <td className="px-3 py-2 font-mono text-slate-500">{formatDate(email.scheduledAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "新建待审批邮件" : "New Review Draft"}
            meta={language === "zh" ? "保存草稿，不会直接发给客户" : "saves a draft; does not send to customers"}
          >
            <div className="space-y-3 p-3">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <BattleText
                  en="This page saves the email for review. Customer sends stay locked until Wilson explicitly approves."
                  zh="本页只把邮件保存为待审批草稿。Wilson 明确批准前，不会发给客户。"
                />
              </div>
              <InputField value={to} onChange={(event) => setTo(event.target.value)} placeholder="recipient@example.com" mono />
              <InputField value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={language === "zh" ? "主题" : "Subject"} />
              <TextAreaField value={body} onChange={(event) => setBody(event.target.value)} placeholder={language === "zh" ? "邮件草稿" : "Draft body"} className="h-52" />
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-[10px] text-slate-500">
                  {saveMessage || (language === "zh" ? "准备保存待审批草稿" : "ready to save for review")}
                </p>
                <CommandButton variant="primary" disabled={!to || !subject || !body || saving} onClick={saveRequest}>
                  {saving ? <BattleText en="Saving" zh="保存中" /> : <BattleText en="Save for Review" zh="保存待审批" />}
                </CommandButton>
              </div>
            </div>
          </BattlePanel>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}
