import type { BattleStationCopy, TimelineEvent } from "@/lib/battle-station-data";
import SectionChrome from "./SectionChrome";
import StatusBadge from "./StatusBadge";
import { cx, toneClasses } from "./theme";

export type TimelineFilter = "all" | "approval" | "ai" | "alert" | "quote" | "intel" | "completed";

const FILTERS: TimelineFilter[] = ["all", "approval", "ai", "alert", "quote", "intel", "completed"];

function formatAge(hours: number, language: "en" | "zh") {
  const safeHours = Math.max(0, Math.floor(hours));
  const days = Math.floor(safeHours / 24);
  const restHours = safeHours % 24;

  if (language === "zh") {
    if (days > 0 && restHours > 0) return `${days}天${restHours}小时`;
    if (days > 0) return `${days}天`;
    return `${safeHours}小时`;
  }

  if (days > 0 && restHours > 0) return `${days}d ${restHours}h`;
  if (days > 0) return `${days}d`;
  return `${safeHours}h`;
}

interface LiveTimelineProps {
  copy: BattleStationCopy["timeline"];
  events: TimelineEvent[];
  language: "en" | "zh";
  selectedDealId: string;
  filter: TimelineFilter;
  onFilterChange: (filter: TimelineFilter) => void;
  onSelectDeal: (dealId: string) => void;
  onOpenFocus: (dealId: string) => void;
  approvalState: Record<string, string>;
  approvalStateLabels: BattleStationCopy["approvalStates"];
  className?: string;
}

export default function LiveTimeline({
  copy,
  events,
  language,
  selectedDealId,
  filter,
  onFilterChange,
  onSelectDeal,
  onOpenFocus,
  approvalState,
  approvalStateLabels,
  className,
}: LiveTimelineProps) {
  const visibleEvents = events.filter((event) => filter === "all" || event.type === filter);

  return (
    <main className={cx("relative flex min-h-[420px] flex-col border-r border-slate-800 bg-slate-950/70 min-[900px]:min-h-0", className)}>
      <div className="pointer-events-none absolute inset-0 battle-scan" />
      <SectionChrome
        title={copy.title}
        meta={copy.eventsVisible(visibleEvents.length)}
        action={
          <div className="flex max-w-full flex-wrap justify-end gap-1">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onFilterChange(item)}
                className={cx(
                  "rounded border px-2 py-1 text-[10px] font-semibold transition",
                  filter === item
                    ? "border-emerald-500 bg-emerald-600 text-white"
                    : "border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-700 hover:text-slate-200"
                )}
              >
                {copy.filters[item]}
              </button>
            ))}
          </div>
        }
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto p-3">
        <div className="absolute bottom-4 left-[22px] top-6 w-px bg-slate-800" />
        <div className="space-y-2">
          {visibleEvents.map((event) => {
            const tone = toneClasses[event.tone];
            const selected = event.dealId === selectedDealId;
            const status = event.approvalId ? approvalState[event.approvalId] : null;

            return (
              <article key={event.id} className="relative flex gap-3">
                <div
                  className={cx(
                    "relative z-10 mt-2 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                    tone.bg,
                    tone.border
                  )}
                >
                  <span
                    className={cx(
                      "h-1.5 w-1.5 rounded-full",
                      tone.dot,
                      (event.type === "approval" || event.type === "alert") && "animate-pulse"
                    )}
                  />
                </div>
                <article
                  onClick={() => event.dealId && onSelectDeal(event.dealId)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                      keyEvent.preventDefault();
                      if (event.dealId) onSelectDeal(event.dealId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={cx(
                    "w-full cursor-pointer rounded-lg border p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/60",
                    selected ? cx(tone.bg, tone.border, tone.glow) : "border-slate-800 bg-slate-900/80 hover:bg-slate-900"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={cx("text-xs font-semibold", tone.text)}>{event.title}</h3>
                        <StatusBadge tone={event.tone}>{copy.eventTypes[event.type]}</StatusBadge>
                        {status && (
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                            {approvalStateLabels[status] ?? status}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-600">{event.account}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">{event.time}</span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{event.body}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {[event.eventKind, event.account, formatAge(event.ageHours, language)].map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                    {event.approvalId && event.dealId && (
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onOpenFocus(event.dealId as string);
                        }}
                        className="ml-auto rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-500"
                      >
                        {copy.openFocusMode}
                      </button>
                    )}
                  </div>
                </article>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
