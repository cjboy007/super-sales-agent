import { cx } from "./theme";

interface SectionChromeProps {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function SectionChrome({ title, meta, action, className }: SectionChromeProps) {
  return (
    <div
      className={cx(
        "flex min-h-[var(--ui-section-header-height)] flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-2",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[length:var(--ui-section-title)] font-semibold text-slate-400">
          {title}
        </h2>
        {meta && <p className="mt-0.5 truncate font-mono text-[length:var(--ui-section-meta)] text-slate-600">{meta}</p>}
      </div>
      {action}
    </div>
  );
}
