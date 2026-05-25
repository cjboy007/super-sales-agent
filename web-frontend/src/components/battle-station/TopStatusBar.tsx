import Link from "next/link";
import type { BattleLanguage, BattleStationCopy, ModuleLink } from "@/lib/battle-station-data";
import StatusBadge from "./StatusBadge";
import { cx } from "./theme";

interface TopStatusBarProps {
  copy: BattleStationCopy["topBar"];
  languageCopy: BattleStationCopy["language"];
  language: BattleLanguage;
  moduleLinks: ModuleLink[];
  activeAgents: number;
  connected: boolean;
  currentTime: Date;
  operator: string;
  activeEvents: number;
  onLanguageChange: (language: BattleLanguage) => void;
}

export default function TopStatusBar({
  copy,
  languageCopy,
  language,
  moduleLinks,
  activeAgents,
  connected,
  currentTime,
  operator,
  activeEvents,
  onLanguageChange,
}: TopStatusBarProps) {
  const formatted = currentTime
    .toLocaleString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(",", "");

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-emerald-600 text-[11px] font-black text-white shadow-[0_0_18px_rgba(16,185,129,0.26)]">
          FR
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
              {copy.title}
            </h1>
            <span className="hidden font-mono text-[10px] text-slate-600 sm:inline">v2.4.1</span>
          </div>
          <nav className="hidden items-center gap-2 lg:flex">
            {moduleLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-mono text-[10px] text-slate-500 transition hover:text-slate-200"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <StatusBadge tone={connected ? "safe" : "pending"} pulse={connected}>
          {connected ? copy.activeAgents(activeAgents) : copy.feedReconnecting}
        </StatusBadge>
        <span className="hidden font-mono text-xs text-slate-500 md:inline">{formatted} CST</span>
        <span className="hidden font-mono text-[10px] text-blue-400 sm:inline">
          {copy.sessionEvents(activeEvents)}
        </span>
        <div className="flex rounded border border-slate-800 bg-slate-950/70 p-0.5">
          {(["en", "zh"] as BattleLanguage[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onLanguageChange(item)}
              className={cx(
                "rounded px-2 py-0.5 text-[10px] font-semibold transition",
                language === item
                  ? "bg-emerald-600 text-white"
                  : "text-slate-500 hover:text-slate-200"
              )}
            >
              {item === "en" ? languageCopy.english : languageCopy.chinese}
            </button>
          ))}
        </div>
        <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">
          {operator}
        </span>
      </div>
    </header>
  );
}
