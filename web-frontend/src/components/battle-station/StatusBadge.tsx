import type { BattleTone } from "@/lib/battle-station-data";
import { cx, toneClasses } from "./theme";

interface StatusBadgeProps {
  tone?: BattleTone;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

export default function StatusBadge({
  tone = "neutral",
  children,
  pulse = false,
  className,
}: StatusBadgeProps) {
  const t = toneClasses[tone];

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-wide",
        t.bg,
        t.border,
        t.softText,
        className
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", t.dot, pulse && "animate-pulse")} />
      {children}
    </span>
  );
}
