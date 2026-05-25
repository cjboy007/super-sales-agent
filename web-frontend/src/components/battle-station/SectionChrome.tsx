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
        "flex min-h-[42px] items-center justify-between border-b border-slate-800 bg-slate-950/80 px-3",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {title}
        </h2>
        {meta && <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">{meta}</p>}
      </div>
      {action}
    </div>
  );
}
