import type { BattleStationCopy } from "@/lib/battle-station-data";
import AppTopBar from "@/components/ui/AppTopBar";
import StatusBadge from "./StatusBadge";

interface TopStatusBarProps {
  copy: BattleStationCopy["topBar"];
  activeAgents: number;
  connected: boolean;
  currentTime: Date;
  operator: string;
  activeEvents: number;
}

export default function TopStatusBar({
  copy,
  activeAgents,
  connected,
  currentTime,
  operator,
  activeEvents,
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
    <AppTopBar title={copy.title} meta="v2.4.1 / live operations" active="/">
      <div className="flex min-w-0 items-center justify-end gap-2">
        <StatusBadge tone={connected ? "safe" : "pending"} pulse={connected} className="px-1.5">
          <span className="sm:hidden">{connected ? activeAgents : "sync"}</span>
          <span className="hidden sm:inline">
            {connected ? copy.activeAgents(activeAgents) : copy.feedReconnecting}
          </span>
        </StatusBadge>
        <span className="hidden font-mono text-[10px] text-slate-300 2xl:inline">{formatted} CST</span>
        <span className="hidden font-mono text-[10px] text-blue-400 sm:inline">
          {copy.sessionEvents(activeEvents)}
        </span>
        <span className="hidden rounded border border-slate-600 bg-slate-900/45 px-2 py-1 text-xs text-slate-200 sm:inline">
          {operator}
        </span>
      </div>
    </AppTopBar>
  );
}
