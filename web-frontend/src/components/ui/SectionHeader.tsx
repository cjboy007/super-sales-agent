"use client";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="battle-topbar -mx-4 md:-mx-6 lg:-mx-8 mb-4 flex items-center gap-3 px-4 md:px-6 lg:px-8">
      <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</h2>
      {subtitle && <span className="hidden font-mono text-[10px] text-slate-600 sm:inline">{subtitle}</span>}
      <div className="h-px flex-1 bg-slate-800" />
      {actions}
    </div>
  );
}
