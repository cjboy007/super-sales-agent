"use client";

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageShell({ children, className = "" }: PageShellProps) {
  return (
    <div className={`flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/75 px-4">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 truncate">
          {title}
        </h1>
        {meta && (
          <span className="font-mono text-[10px] text-slate-600 hidden sm:inline">{meta}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}
