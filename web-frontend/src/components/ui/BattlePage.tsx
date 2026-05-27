"use client";

import { cx } from "@/components/battle-station/theme";
import AppTopBar, { APP_NAV_ITEMS } from "./AppTopBar";
import { useTheme } from "./ThemeProvider";

export type BattleTone = "emerald" | "amber" | "red" | "blue" | "purple" | "neutral";

const toneClasses: Record<BattleTone, string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  red: "bg-red-500/10 text-red-400 ring-red-500/20",
  blue: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  purple: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  neutral: "bg-slate-800 text-slate-300 ring-slate-700",
};

const dotClasses: Record<BattleTone, string> = {
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
  blue: "bg-blue-400",
  purple: "bg-violet-400",
  neutral: "bg-slate-400",
};

export const SECONDARY_NAV = APP_NAV_ITEMS;

export function BattleText({ en, zh }: { en: string; zh: string }) {
  const { language } = useTheme();
  return <>{language === "zh" ? zh : en}</>;
}

export function useBattleLanguage() {
  return useTheme().language;
}

export function BattlePageShell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200">{children}</div>;
}

export function BattlePageHeader({
  title,
  zhTitle,
  meta,
  zhMeta,
  active,
  children,
}: {
  title: string;
  zhTitle?: string;
  meta?: string;
  zhMeta?: string;
  active?: string;
  children?: React.ReactNode;
}) {
  return (
    <AppTopBar title={title} zhTitle={zhTitle} meta={meta} zhMeta={zhMeta} active={active}>
      {children}
    </AppTopBar>
  );
}

export function BattlePageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <main className={cx("min-h-0 flex-1 overflow-y-auto p-4", className)}>{children}</main>;
}

export function BattlePanel({
  title,
  meta,
  action,
  children,
  className,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("overflow-hidden rounded-md border border-slate-800 bg-slate-900/45", className)}>
      <div className="flex min-h-10 items-center justify-between border-b border-slate-800 bg-slate-900/75 px-3">
        <div className="min-w-0">
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {title}
          </h2>
          {meta && <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">{meta}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function BattleBadge({
  tone = "neutral",
  pulse = false,
  children,
}: {
  tone?: BattleTone;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none ring-1",
        toneClasses[tone]
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", dotClasses[tone], pulse && "animate-pulse")} />
      {children}
    </span>
  );
}

export function CommandButton({
  variant = "secondary",
  className,
  children,
  ...props
}: {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500",
    secondary: "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600",
    danger: "border-red-600 bg-red-600/70 text-white hover:bg-red-500",
    ghost: "border-slate-800 bg-transparent text-slate-400 hover:text-slate-200",
  };

  return (
    <button
      className={cx(
        "h-7 rounded-md border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function InputField({
  mono,
  className,
  ...props
}: { mono?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500",
        mono && "font-mono",
        className
      )}
      {...props}
    />
  );
}

export function SelectField({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-emerald-500",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function TextAreaField({
  mono,
  className,
  ...props
}: { mono?: boolean } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500",
        mono && "font-mono",
        className
      )}
      {...props}
    />
  );
}

export function StatCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: BattleTone;
}) {
  const textTone: Record<BattleTone, string> = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
    blue: "text-blue-400",
    purple: "text-violet-400",
    neutral: "text-slate-200",
  };
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("mt-1 font-mono text-lg font-semibold", textTone[tone])}>{value}</p>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-3 py-10 text-center font-mono text-xs text-slate-600">
      {label}
    </div>
  );
}
