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

const panelHeaderClasses: Record<BattleTone, { bg: string; border: string; rail: string; dot: string; text: string; meta: string }> = {
  emerald: {
    bg: "bg-[linear-gradient(90deg,rgba(16,185,129,0.18),rgba(15,23,42,0.76))]",
    border: "border-emerald-500/30",
    rail: "bg-emerald-400",
    dot: "bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.45)]",
    text: "text-emerald-200",
    meta: "font-semibold text-emerald-300/90",
  },
  amber: {
    bg: "bg-[linear-gradient(90deg,rgba(245,158,11,0.18),rgba(15,23,42,0.76))]",
    border: "border-amber-500/30",
    rail: "bg-amber-400",
    dot: "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.42)]",
    text: "text-amber-200",
    meta: "font-semibold text-amber-300/90",
  },
  red: {
    bg: "bg-[linear-gradient(90deg,rgba(239,68,68,0.18),rgba(15,23,42,0.76))]",
    border: "border-red-500/30",
    rail: "bg-red-400",
    dot: "bg-red-300 shadow-[0_0_12px_rgba(252,165,165,0.42)]",
    text: "text-red-200",
    meta: "font-semibold text-red-300/90",
  },
  blue: {
    bg: "bg-[linear-gradient(90deg,rgba(59,130,246,0.18),rgba(15,23,42,0.76))]",
    border: "border-blue-500/30",
    rail: "bg-blue-400",
    dot: "bg-blue-300 shadow-[0_0_12px_rgba(147,197,253,0.42)]",
    text: "text-blue-200",
    meta: "font-semibold text-blue-300/90",
  },
  purple: {
    bg: "bg-[linear-gradient(90deg,rgba(139,92,246,0.18),rgba(15,23,42,0.76))]",
    border: "border-violet-500/30",
    rail: "bg-violet-400",
    dot: "bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.42)]",
    text: "text-violet-200",
    meta: "font-semibold text-violet-300/90",
  },
  neutral: {
    bg: "bg-slate-900/75",
    border: "border-slate-800",
    rail: "bg-slate-500",
    dot: "bg-slate-400",
    text: "text-slate-300",
    meta: "font-semibold text-slate-400",
  },
};

function panelToneForTitle(title: string): BattleTone {
  const tones: BattleTone[] = ["emerald", "blue", "purple", "amber"];
  const score = Array.from(title).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[score % tones.length];
}

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
  return <main className={cx("min-h-0 flex-1 overflow-y-auto p-4 text-[13px]", className)}>{children}</main>;
}

export function BattlePanel({
  title,
  meta,
  tone,
  action,
  children,
  className,
}: {
  title: string;
  meta?: string;
  tone?: BattleTone;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const resolvedTone = tone || panelToneForTitle(title);
  const headerTone = panelHeaderClasses[resolvedTone];

  return (
    <section className={cx("overflow-hidden rounded-md border border-slate-800 bg-slate-900/45", className)}>
      <div
        data-panel-tone={resolvedTone}
        className={cx("battle-panel-header relative flex min-h-[var(--ui-panel-header-height)] items-center justify-between border-b px-4", headerTone.bg, headerTone.border)}
      >
        <span className={cx("absolute inset-y-0 left-0 w-1", headerTone.rail)} />
        <div className="flex min-w-0 items-center gap-2.5 pl-1">
          <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", headerTone.dot)} />
          <div className="min-w-0">
            <h2 className={cx("truncate text-[length:var(--ui-panel-title)] font-semibold", headerTone.text)}>
              {title}
            </h2>
            {meta && <p className={cx("mt-1 truncate font-mono text-[length:var(--ui-panel-meta)]", headerTone.meta)}>{meta}</p>}
          </div>
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
        "inline-flex min-h-6 items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] font-semibold uppercase leading-none ring-1",
        toneClasses[tone]
      )}
    >
      <span className={cx("h-2 w-2 rounded-full", dotClasses[tone], pulse && "animate-pulse")} />
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
        "h-[var(--ui-button-height)] rounded-md border px-4 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
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
        "h-[var(--ui-control-height)] rounded-md border border-slate-700 bg-slate-950 px-3 text-[13px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500",
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
        "h-[var(--ui-control-height)] rounded-md border border-slate-700 bg-slate-950 px-3 text-[13px] text-slate-200 outline-none focus:border-emerald-500",
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
        "rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-[13px] leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500",
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
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("mt-1 font-mono text-xl font-semibold", textTone[tone])}>{value}</p>
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
