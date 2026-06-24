import Link from "next/link";
import type { BattleStationCopy, ModuleLink } from "@/lib/battle-station-data";
import { useTheme } from "@/components/ui/ThemeProvider";
import { cx } from "./theme";

interface QuickCommandBarProps {
  copy: BattleStationCopy["quickCommand"];
  moduleLinks: ModuleLink[];
  command: string;
  lastCommand?: string;
  status?: "idle" | "sending" | "queued" | "error";
  receipt?: string;
  tasksAvailable?: boolean;
  onCommandChange: (value: string) => void;
  onSubmit: () => void;
  onOpenTasks?: () => void;
}

export default function QuickCommandBar({
  copy,
  moduleLinks,
  command,
  lastCommand,
  status = "idle",
  receipt,
  tasksAvailable = false,
  onCommandChange,
  onSubmit,
  onOpenTasks,
}: QuickCommandBarProps) {
  const { language } = useTheme();

  return (
    <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-slate-800 bg-slate-900/95 px-3">
      <div className="hidden items-center gap-1 lg:flex">
        {moduleLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-slate-700 hover:text-slate-100"
          >
            <span className="font-mono text-slate-600">{item.hotkey}</span> {language === "zh" ? item.zhLabel ?? item.label : item.label}
          </Link>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
        <span className="font-mono text-xs text-emerald-400">SSA</span>
        <input
          value={command}
          onChange={(event) => onCommandChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
          placeholder={copy.placeholder}
          disabled={status === "sending"}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={status === "sending" || !command.trim()}
          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {status === "sending" ? (language === "zh" ? "提交中" : "Sending") : copy.queue}
        </button>
      </div>
      {(receipt || lastCommand) && (
        <div className="hidden max-w-[360px] items-center gap-2 xl:flex">
          <p className={cx(
            "min-w-0 truncate text-[10px]",
            status === "error" ? "text-red-300" : status === "queued" ? "text-emerald-300" : "text-slate-500"
          )}>
            {receipt || `${copy.queued} ${lastCommand}`}
          </p>
          {tasksAvailable && (
            <button
              type="button"
              onClick={onOpenTasks}
              className="shrink-0 rounded border border-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
            >
              {language === "zh" ? "查看任务" : "View tasks"}
            </button>
          )}
        </div>
      )}
    </footer>
  );
}
