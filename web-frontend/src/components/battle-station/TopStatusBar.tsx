import type { BattleStationCopy } from "@/lib/battle-station-data";
import { summarizeOpsStatus } from "@/lib/runtime/ops-status-summary";
import AppTopBar from "@/components/ui/AppTopBar";
import { useOpsStatus } from "@/components/ui/OpsStatusProvider";
import { useTheme } from "@/components/ui/ThemeProvider";
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
  const { language } = useTheme();
  const runtimeStatus = useOpsStatus() || summarizeOpsStatus();
  const runtimeTone = runtimeStatus.level === "critical"
    ? "risk"
    : runtimeStatus.level === "attention"
      ? "pending"
      : runtimeStatus.level === "running"
        ? "safe"
        : "neutral";
  const runtimeSummary = language === "zh" ? runtimeStatus.zhSummary : runtimeStatus.summary;

  return (
    <AppTopBar title={copy.title} meta={copy.title} active="/">
      <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:gap-2 2xl:justify-end 2xl:flex-nowrap">
        <StatusBadge tone={runtimeTone} pulse={runtimeStatus.level === "running"} className="shrink-0 px-1.5 normal-case">
          <span className="max-w-[15rem] truncate">{runtimeSummary}</span>
        </StatusBadge>
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
