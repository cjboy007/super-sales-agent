"use client";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{title}</h2>
      {subtitle && <span className="text-xs text-gray-600">{subtitle}</span>}
      <div className="flex-1 h-px bg-[var(--border-color)]" />
      {actions}
    </div>
  );
}
