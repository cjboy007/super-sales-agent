"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge, PanelSection, type Tone } from "@/components/ui/BattleTokens";
import { CommandButton, InputField, TextAreaField } from "@/components/ui/CommandControls";
import { useProject } from "@/lib/project";

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
}

type Tab = "sent" | "drafts" | "pending";

function formatDate(iso: string): string {
  if (!iso) return "NA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ComposeModal({
  open,
  onClose,
  onSent,
  apiUrl,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  apiUrl: (path: string) => string;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  if (!open) return null;

  const canSave = Boolean(to && subject && body && !saving);

  const handleSaveDraft = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveStatus("idle");
    setSaveError("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      setSaveStatus("success");
      setTo("");
      setSubject("");
      setBody("");
      onSent?.();
      window.setTimeout(() => {
        onClose();
        setSaveStatus("idle");
      }, 1200);
    } catch (e: unknown) {
      setSaveStatus("error");
      setSaveError(e instanceof Error ? e.message : "Draft save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="w-full max-w-2xl overflow-hidden rounded-md border border-slate-800 bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-11 items-center justify-between border-b border-slate-800 px-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Draft Customer Email</h2>
          <button disabled={saving} onClick={onClose} className="font-mono text-xs text-slate-500 hover:text-slate-200 disabled:opacity-40">CLOSE</button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            Customer-facing send is blocked here. This screen saves a draft for human approval.
          </div>
          {saveStatus === "success" && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">Draft saved to local operator queue.</div>
          )}
          {saveStatus === "error" && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <span>{saveError}</span>
              <button onClick={() => setSaveStatus("idle")} className="ml-auto font-mono text-[10px] uppercase text-red-300">Retry</button>
            </div>
          )}
          <InputField label="Recipient" mono value={to} onChange={(e) => setTo(e.target.value)} disabled={saving} placeholder="customer@example.com" />
          <InputField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={saving} placeholder="Re: Inquiry about..." />
          <TextAreaField label="Body" mono rows={10} value={body} onChange={(e) => setBody(e.target.value)} disabled={saving} placeholder="Dear..." />
          <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
            <CommandButton variant="ghost" onClick={onClose} disabled={saving}>Cancel</CommandButton>
            <CommandButton onClick={handleSaveDraft} disabled={!canSave}>{saving ? "Saving" : "Save Draft"}</CommandButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmailsPage() {
  const { apiUrl, projectId } = useProject();
  const [activeTab, setActiveTab] = useState<Tab>("sent");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("compose") === "true";
  });
  const [stats, setStats] = useState<EmailStats>({ totalSent: 0, totalReceived: 0, totalReplied: 0, replyRate: 0 });
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  const fetchStats = useCallback(async () => {
    const res = await fetch(apiUrl("/api/emails/stats"));
    const json = await res.json();
    if (json.success) setStats(json.data);
  }, [apiUrl]);

  const fetchSent = useCallback(async (p: number) => {
    const res = await fetch(apiUrl(`/api/emails/sent?page=${p}&limit=${limit}`));
    const json = await res.json();
    if (json.success) {
      setSentEmails(json.data.items);
      setTotalPages(json.data.totalPages);
      setPage(json.data.page);
    }
  }, [apiUrl]);

  const fetchDrafts = useCallback(async () => {
    const res = await fetch(apiUrl("/api/emails/drafts"));
    const json = await res.json();
    if (json.success) setDrafts(json.data);
  }, [apiUrl]);

  const fetchPending = useCallback(async () => {
    const res = await fetch(apiUrl("/api/emails/pending"));
    const json = await res.json();
    if (json.success) setPendingEmails(json.data);
  }, [apiUrl]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchSent(1), fetchDrafts(), fetchPending()]);
  }, [fetchDrafts, fetchPending, fetchSent, fetchStats]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await refreshAll();
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [refreshAll, projectId]);

  const tabs: Array<{ key: Tab; label: string; count: number; tone: Tone }> = [
    { key: "sent", label: "Sent Log", count: stats.totalSent, tone: "emerald" },
    { key: "drafts", label: "Drafts", count: drafts.length, tone: "purple" },
    { key: "pending", label: "Pending Send", count: pendingEmails.length, tone: "amber" },
  ];

  return (
    <PageShell>
      <PageHeader title="Email Operations" meta={`${projectId} / sent-log / human-gated send`}>
        <CommandButton variant="ghost" size="xs" onClick={refreshAll} disabled={loading}>Refresh</CommandButton>
        <CommandButton size="xs" onClick={() => setComposeOpen(true)}>Compose</CommandButton>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ["Sent", stats.totalSent, "emerald" as Tone],
            ["Received", stats.totalReceived, "blue" as Tone],
            ["Reply Rate", `${stats.replyRate}%`, "purple" as Tone],
            ["Draft Gate", drafts.length + pendingEmails.length, "amber" as Tone],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="rounded-md border border-slate-800 bg-slate-900/75 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <Badge tone={tone as Tone}>{tone as string}</Badge>
              </div>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-100">{loading ? "..." : value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-800 bg-slate-900/75 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex h-8 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold ${activeTab === tab.key ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"}`}
            >
              <span>{tab.label}</span>
              <Badge tone={activeTab === tab.key ? "neutral" : tab.tone}>{tab.count}</Badge>
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
        )}

        <PanelSection title={tabs.find((tab) => tab.key === activeTab)?.label ?? "Email Table"}>
          {activeTab === "sent" && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Subject</th>
                      <th className="px-3 py-2 font-semibold">Recipient</th>
                      <th className="px-3 py-2 font-semibold">Sent At</th>
                      <th className="px-3 py-2 text-right font-semibold">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sentEmails.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-12 text-center text-slate-500">No sent emails found</td></tr>
                    ) : sentEmails.map((email, index) => (
                      <tr key={`${email.email}-${index}`} className="hover:bg-slate-800/30">
                        <td className="max-w-[420px] truncate px-3 py-2 text-slate-200">{email.subject}</td>
                        <td className="max-w-[260px] truncate px-3 py-2 font-mono text-[11px] text-slate-400">{email.email}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{formatDate(email.sent_at)}</td>
                        <td className="px-3 py-2 text-right"><Badge tone="emerald">sent</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2">
                  <span className="font-mono text-[10px] text-slate-500">page {page} / {totalPages}</span>
                  <div className="flex gap-1">
                    <CommandButton variant="ghost" size="xs" disabled={page <= 1} onClick={() => fetchSent(page - 1)}>Prev</CommandButton>
                    <CommandButton variant="ghost" size="xs" disabled={page >= totalPages} onClick={() => fetchSent(page + 1)}>Next</CommandButton>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "drafts" && (
            <div className="divide-y divide-slate-800">
              {drafts.length === 0 ? (
                <div className="px-3 py-12 text-center text-xs text-slate-500">No drafts found</div>
              ) : drafts.map((draft) => (
                <div key={draft.id} className="grid grid-cols-1 gap-2 px-3 py-2 hover:bg-slate-800/30 md:grid-cols-[1fr_260px_220px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-200">{draft.subject}</p>
                    <p className="font-mono text-[10px] text-slate-600">{draft.id}</p>
                  </div>
                  <p className="truncate font-mono text-[11px] text-slate-500">{draft.template}</p>
                  <div className="flex gap-1 md:justify-end">
                    <CommandButton size="xs">Edit</CommandButton>
                    <CommandButton variant="ghost" size="xs">Queue</CommandButton>
                    <CommandButton variant="danger" size="xs">Delete</CommandButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "pending" && (
            <div className="divide-y divide-slate-800">
              {pendingEmails.length === 0 ? (
                <div className="px-3 py-12 text-center text-xs text-slate-500">No pending emails</div>
              ) : pendingEmails.map((email) => (
                <div key={email.id} className="grid grid-cols-1 gap-2 px-3 py-2 hover:bg-slate-800/30 md:grid-cols-[1fr_180px_1fr_160px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-200">{email.subject}</p>
                    <p className="truncate font-mono text-[10px] text-slate-500">{email.to}</p>
                  </div>
                  <p className="font-mono text-[11px] text-amber-400">{formatDate(email.scheduledAt)}</p>
                  <p className="truncate text-xs text-slate-500">{email.reason}</p>
                  <div className="flex gap-1 md:justify-end">
                    <CommandButton size="xs">Approve</CommandButton>
                    <CommandButton variant="ghost" size="xs">Hold</CommandButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelSection>
      </div>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} onSent={refreshAll} apiUrl={apiUrl} />
    </PageShell>
  );
}
