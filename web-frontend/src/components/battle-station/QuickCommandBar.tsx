import Link from "next/link";
import type { BattleStationCopy, ModuleLink } from "@/lib/battle-station-data";
import { cx } from "./theme";

interface QuickCommandBarProps {
  copy: BattleStationCopy["quickCommand"];
  moduleLinks: ModuleLink[];
  command: string;
  lastCommand?: string;
  onCommandChange: (value: string) => void;
  onSubmit: () => void;
}

export default function QuickCommandBar({
  copy,
  moduleLinks,
  command,
  lastCommand,
  onCommandChange,
  onSubmit,
}: QuickCommandBarProps) {
  return (
    <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-slate-800 bg-slate-900/95 px-3">
      <div className="hidden items-center gap-1 lg:flex">
        {moduleLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-slate-700 hover:text-slate-100"
          >
            <span className="font-mono text-slate-600">{item.hotkey}</span> {item.label}
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
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
        />
        <button
          type="button"
          onClick={onSubmit}
          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
        >
          {copy.queue}
        </button>
      </div>
      {lastCommand && (
        <p className="hidden max-w-[260px] truncate text-[10px] text-slate-500 xl:block">
          {copy.queued} {lastCommand}
        </p>
      )}
    </footer>
  );
}
