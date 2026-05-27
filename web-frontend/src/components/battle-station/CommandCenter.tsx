import type { ActiveAgent, ApprovalRequest, BattleStationCopy, DomainAccount } from "@/lib/battle-station-data";
import SectionChrome from "./SectionChrome";
import StatusBadge from "./StatusBadge";
import { cx, toneClasses } from "./theme";

interface CommandCenterProps {
  copy: BattleStationCopy["commandCenter"];
  approvalStateLabels: BattleStationCopy["approvalStates"];
  approvals: ApprovalRequest[];
  agents: ActiveAgent[];
  selectedDeal?: DomainAccount;
  approvalState: Record<string, string>;
  stats: {
    activeLeads: number;
    todayEmails: number;
    pendingQuotations: number;
    conversionRate: number;
  };
  onOpenFocus: (dealId: string) => void;
}

export default function CommandCenter({
  copy,
  approvalStateLabels,
  approvals,
  agents,
  selectedDeal,
  approvalState,
  stats,
  onOpenFocus,
}: CommandCenterProps) {
  return (
    <aside className="flex min-h-[520px] flex-col bg-slate-900/45 lg:min-h-0">
      <SectionChrome title={copy.title} meta={copy.meta} />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectedDeal && (
          <section className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-100">{selectedDeal.account}</h3>
                <p className="mt-1 truncate text-xs text-slate-500">{selectedDeal.product}</p>
              </div>
              <StatusBadge tone={selectedDeal.tone}>{selectedDeal.statusLabel}</StatusBadge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div>
                <dt className="text-slate-600">{copy.dealValue}</dt>
                <dd className="text-emerald-400">{selectedDeal.value}</dd>
              </div>
              <div>
                <dt className="text-slate-600">{copy.risk}</dt>
                <dd className={toneClasses[selectedDeal.tone].softText}>{selectedDeal.risk}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-600">{copy.nextAction}</dt>
                <dd className="mt-1 text-slate-300">{selectedDeal.nextAction}</dd>
              </div>
            </dl>
          </section>
        )}

        <section className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {copy.pendingApprovals}
            </h3>
            <span className="font-mono text-[10px] text-amber-400">{approvals.length} {copy.open}</span>
          </div>
          <div className="space-y-2">
            {approvals.map((approval) => {
              const state = approvalState[approval.id] || "waiting-human";

              return (
                <article
                  key={approval.id}
                  className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-amber-200">{approval.title}</h4>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500">{approval.account}</p>
                    </div>
                    <StatusBadge tone="pending" pulse>
                      {approvalStateLabels[state] ?? state}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <div>
                      <p className="text-slate-600">{copy.value}</p>
                      <p className="text-slate-300">{approval.value}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">{copy.due}</p>
                      <p className="text-amber-400">{approval.due}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{approval.recommendation}</p>
                  <p className="mt-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-[10px] text-slate-500">
                    {approval.guardrail}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenFocus(approval.dealId)}
                    className="mt-2 w-full rounded bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                  >
                    {copy.reviewInFocus}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {copy.keyStats}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              [copy.statLabels.leads, stats.activeLeads || 128, "safe"],
              [copy.statLabels.emails, stats.todayEmails || 34, "processing"],
              [copy.statLabels.quotes, stats.pendingQuotations || 6, "pending"],
              [copy.statLabels.winRate, stats.conversionRate ? `${stats.conversionRate}%` : "18.7%", "intel"],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded border border-slate-800 bg-slate-950/55 p-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
                <p className={cx("mt-1 font-mono text-lg font-semibold", toneClasses[tone as keyof typeof toneClasses].softText)}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {copy.activeAgents}
          </h3>
          <div className="space-y-2">
            {agents.map((agent) => {
              const tone = toneClasses[agent.tone];
              return (
                <article key={agent.id} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-xs font-semibold text-slate-200">{agent.name}</h4>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{agent.role}</p>
                    </div>
                    <StatusBadge tone={agent.tone}>{agent.status}</StatusBadge>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{agent.currentTask}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div className={cx("h-full rounded-full", tone.progress)} style={{ width: `${agent.load}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500">{agent.queue} tasks</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}
