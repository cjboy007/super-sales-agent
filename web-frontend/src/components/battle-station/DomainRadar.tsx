import type { BattleStationCopy, DomainAccount } from "@/lib/battle-station-data";
import SectionChrome from "./SectionChrome";
import StatusBadge from "./StatusBadge";
import { cx, toneClasses } from "./theme";

interface DomainRadarProps {
  copy: BattleStationCopy["domain"];
  accounts: DomainAccount[];
  selectedDealId: string;
  onSelectDeal: (dealId: string) => void;
  onOpenFocus: (dealId: string) => void;
  className?: string;
}

export default function DomainRadar({
  copy,
  accounts,
  selectedDealId,
  onSelectDeal,
  onOpenFocus,
  className,
}: DomainRadarProps) {
  return (
    <aside className={cx("flex min-h-[360px] flex-col border-r border-slate-800 bg-slate-900/45 min-[900px]:min-h-0", className)}>
      <SectionChrome
        title={copy.title}
        meta={copy.monitoredDomains(accounts.length)}
        action={<span className="font-mono text-[10px] text-emerald-400">{copy.live}</span>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {accounts.map((account) => {
          const tone = toneClasses[account.tone];
          const selected = account.id === selectedDealId;
          const needsApproval = account.status === "pending";

          return (
            <article
              key={account.id}
              onClick={() => onSelectDeal(account.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectDeal(account.id);
                }
              }}
              role="button"
              tabIndex={0}
              className={cx(
                "block w-full cursor-pointer border-b border-slate-800/70 p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/60",
                selected ? cx("bg-slate-800/70", tone.glow) : "hover:bg-slate-800/45"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className={cx("truncate text-sm font-semibold", tone.text)}>{account.account}</h3>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">{account.location}</p>
                </div>
                <StatusBadge tone={account.tone} pulse={needsApproval || account.status === "risk"}>
                  {account.statusLabel}
                </StatusBadge>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div>
                  <p className="text-slate-600">{copy.deal}</p>
                  <p className="truncate text-slate-300">{account.dealCode}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-600">{copy.value}</p>
                  <p className={tone.softText}>{account.value}</p>
                </div>
              </div>

              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{account.summary}</p>

              <div className="mt-2 flex items-center gap-1 text-[10px]">
                <span className="text-slate-600">{copy.agent}</span>
                <span className={cx("truncate", tone.softText)}>{account.agentStatus}</span>
                <span className="ml-auto shrink-0 font-mono text-slate-600">{account.lastTouch}</span>
              </div>

              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={cx("h-full rounded-full", tone.progress)}
                  style={{ width: `${account.confidence}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                <span className="text-slate-600">{copy.confidence}</span>
                <span className={tone.softText}>{account.confidence}%</span>
              </div>

              {needsApproval && (
                <div className="mt-2 grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenFocus(account.id);
                    }}
                    className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-500"
                  >
                    {copy.review}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenFocus(account.id);
                    }}
                    className="rounded bg-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-100 transition hover:bg-slate-600"
                  >
                    {copy.edit}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    className="rounded bg-red-600/70 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-red-500"
                  >
                    {copy.reject}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
