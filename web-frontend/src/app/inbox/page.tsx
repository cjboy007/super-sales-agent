"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import InboxCard from "@/components/inbox/InboxCard";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge } from "@/components/ui/BattleTokens";
import { CommandButton } from "@/components/ui/CommandControls";
import type { InboundEmail, InboxStats } from "@/types/inbox";

export default function InboxPage() {
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/inbox");
        const json = await res.json();
        if (json.success) {
          setEmails(json.data);
          setStats(json.stats);
        } else {
          setError("Failed to load inbox");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="Inbox Queue"
        meta={stats ? `${stats.pending_decision} pending decisions` : "loading inbox"}
      >
        <Link href="/emails">
          <CommandButton variant="ghost" size="xs">Email Center</CommandButton>
        </Link>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-h-0 space-y-3">
          {stats && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                { label: "Awaiting", value: stats.pending_decision, tone: "amber" as const },
                { label: "Sent Today", value: stats.sent_today, tone: "emerald" as const },
                { label: "Reply Rate", value: `${stats.reply_rate_week}%`, tone: "blue" as const },
                { label: "Avg Response", value: `${stats.avg_response_time_hours}h`, tone: "purple" as const },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-slate-800 bg-slate-900/75 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
                    <Badge tone={s.tone}>{s.tone}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-lg font-semibold text-slate-100">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-md border border-slate-800 bg-slate-900/75 p-3 animate-pulse">
                  <div className="h-3 w-1/3 rounded bg-slate-800" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-slate-800/70" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={() => window.location.reload()} className="mt-2 text-xs text-slate-400 hover:text-slate-100">
                Retry
              </button>
            </div>
          ) : emails.length === 0 ? (
            <div className="rounded-md border border-slate-800 bg-slate-900/75 p-6">
              <Badge tone="emerald">clear</Badge>
              <p className="mt-3 text-sm font-semibold text-slate-100">All caught up</p>
              <p className="mt-1 text-xs text-slate-500">No emails awaiting operator decision.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-600">
                {emails.length} emails awaiting decision
              </p>
              {emails.map((email) => (
                <InboxCard key={email.id} email={email} />
              ))}
            </div>
          )}
        </main>

        <aside className="hidden min-h-0 rounded-md border border-slate-800 bg-slate-900/75 xl:block">
          <div className="border-b border-slate-800 px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">AI Reply Gate</h2>
          </div>
          <div className="space-y-3 p-3 text-xs text-slate-400">
            <p>Every customer-facing reply opens in strategy review before send.</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
              <span className="text-slate-600">FLOW</span>
              <span className="text-slate-300">read / choose / edit / approve</span>
              <span className="text-slate-600">SEND</span>
              <span className="text-amber-400">human gated</span>
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
