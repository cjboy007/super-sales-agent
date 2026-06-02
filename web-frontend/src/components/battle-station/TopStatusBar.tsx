import type { BattleStationCopy } from "@/lib/battle-station-data";
import AppTopBar from "@/components/ui/AppTopBar";
import StatusBadge from "./StatusBadge";

interface TopStatusBarProps {
  copy: BattleStationCopy["topBar"];
  activeAgents: number;
  connected: boolean;
  activeEvents: number;
}

export default function TopStatusBar({
  copy,
  activeAgents,
  connected,
  activeEvents,
}: TopStatusBarProps) {
  return (
    <AppTopBar title={copy.title} meta={copy.title} active="/">
      <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:gap-2 2xl:justify-end 2xl:flex-nowrap">
        <StatusBadge tone={connected ? "safe" : "pending"} pulse={connected} className="shrink-0 px-1.5 normal-case">
          <span>{connected ? copy.activeAgents(activeAgents) : copy.feedReconnecting}</span>
        </StatusBadge>
        <span className="shrink-0 font-mono text-[10px] text-blue-400">
          {copy.sessionEvents(activeEvents)}
        </span>
      </div>
    </AppTopBar>
  );
}
