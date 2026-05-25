"use client";

import Link from "next/link";

interface QuickAction {
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
  count?: number;
  variant?: "primary" | "default";
  disabled?: boolean;
}

interface QuickActionsProps {
  actions: QuickAction[];
}

export default function QuickActions({ actions }: QuickActionsProps) {
  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-4 sm:p-5">
      <h2 className="text-sm sm:text-base font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
        <span>⚡</span> 快捷操作
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {actions.map((action) => {
          const isPrimary = action.variant === "primary";
          const baseClass = `relative flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            action.disabled
              ? "opacity-40 cursor-not-allowed bg-[var(--sidebar-hover)] text-gray-400"
              : isPrimary
              ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:-translate-y-0.5"
              : "bg-[var(--sidebar-hover)] hover:bg-[var(--sidebar-hover)]/80 text-gray-200 hover:text-white border border-[var(--border-color)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5"
          }`;

          const inner = (
            <>
              <span className="text-xl">{action.icon}</span>
              <span className="flex-1">{action.label}</span>
              {action.count !== undefined && action.count > 0 && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isPrimary ? "bg-white/20 text-white" : "bg-[var(--accent)]/20 text-[var(--accent)]"
                  }`}
                >
                  {action.count}
                </span>
              )}
            </>
          );

          if (action.href && !action.disabled) {
            return (
              <Link key={action.label} href={action.href} className={baseClass}>
                {inner}
              </Link>
            );
          }

          return (
            <button
              key={action.label}
              className={baseClass}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
