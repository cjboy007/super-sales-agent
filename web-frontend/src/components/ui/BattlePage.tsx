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
  loading = false,
  className,
  children,
  ...props
}: {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-400 hover:bg-emerald-500 active:bg-emerald-700 focus-visible:ring-emerald-300/70",
    secondary: "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700 hover:text-white active:bg-slate-900 focus-visible:ring-slate-300/60",
    danger: "border-red-600 bg-red-600/70 text-white hover:border-red-400 hover:bg-red-500 active:bg-red-700 focus-visible:ring-red-300/70",
    ghost: "border-slate-800 bg-transparent text-slate-400 hover:border-slate-600 hover:bg-slate-800/60 hover:text-slate-100 active:bg-slate-900 focus-visible:ring-slate-300/50",
  };
  const disabled = Boolean(props.disabled || loading);

  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-[var(--ui-button-height)] min-w-0 items-center justify-center gap-2 rounded-md border px-4 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:translate-y-px disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/70 disabled:text-slate-600 disabled:opacity-70",
        variants[variant],
        className
      )}
      aria-busy={loading || undefined}
      disabled={disabled}
    >
      {loading ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" /> : null}
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
        "h-[var(--ui-control-height)] rounded-md border border-slate-700 bg-slate-950 px-3 text-[13px] text-slate-200 outline-none transition placeholder:text-slate-600 hover:border-slate-500 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600",
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
        "h-[var(--ui-control-height)] rounded-md border border-slate-700 bg-slate-950 px-3 text-[13px] text-slate-200 outline-none transition hover:border-slate-500 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600",
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
        "rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-[13px] leading-5 text-slate-200 outline-none transition placeholder:text-slate-600 hover:border-slate-500 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/30 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600",
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

export type AccessRequiredIssue = "beta_required" | "workspace_denied";

/**
 * Lightweight top-banner for access-gated pages.
 * Shows a single recovery action; page content remains visible (dimmed) below.
 */
export function AccessBanner({
  issue,
  next,
}: {
  issue: AccessRequiredIssue;
  next: string;
}) {
  const denied = issue === "workspace_denied";
  const href = `/settings?next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-4 mt-4 rounded-md border border-amber-500/25 bg-amber-500/8 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-6 items-center gap-1.5 rounded bg-amber-500/15 px-2 font-mono text-[10px] font-semibold uppercase text-amber-300 ring-1 ring-amber-500/25">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <BattleText
            en={denied ? "Workspace unavailable" : "Load failed"}
            zh={denied ? "工作区不可用" : "加载失败"}
          />
        </span>
        <p className="min-w-0 flex-1 text-xs text-amber-100/85">
          <BattleText
            en={denied ? "The selected workspace cannot provide this module." : "The request could not finish. Check Settings or try again."}
            zh={denied ? "当前工作区不能提供此模块。" : "请求未能完成。请检查设置或重试。"}
          />
        </p>
        <a
          href={href}
          className="inline-flex h-7 shrink-0 items-center rounded-md border border-amber-300/40 bg-amber-300 px-3 text-[11px] font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          <BattleText en="Open Settings" zh="打开设置" />
        </a>
      </div>
    </div>
  );
}

/**
 * @deprecated Use AccessBanner instead. Kept for backward compatibility during migration.
 */
export function AccessRequiredState({
  issue,
  next,
  title,
  zhTitle,
}: {
  issue: AccessRequiredIssue;
  next: string;
  title: string;
  zhTitle: string;
}) {
  const denied = issue === "workspace_denied";
  const href = `/settings?next=${encodeURIComponent(next)}`;

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-xl rounded-md border border-amber-500/30 bg-amber-500/10 px-5 py-6 text-center">
        <BattleBadge tone="amber">
          {denied ? <BattleText en="Workspace unavailable" zh="工作区不可用" /> : <BattleText en="Request failed" zh="请求失败" />}
        </BattleBadge>
        <p className="mt-4 text-sm font-semibold text-amber-50">
          <BattleText
            en={denied ? `The current workspace cannot open ${title}.` : `${title} could not load.`}
            zh={denied ? `当前工作区不能打开${zhTitle}。` : `${zhTitle}未能加载。`}
          />
        </p>
        <p className="mt-2 text-xs leading-5 text-amber-100/80">
          <BattleText
            en="Check local settings, workspace selection, and runtime health, then try again."
            zh="请检查本地设置、工作区选择和运行状态，然后重试。"
          />
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <a
            href={href}
            className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300/40 bg-amber-300 px-4 text-xs font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            <BattleText en="Open Settings" zh="打开设置" />
          </a>
          <a
            href="/user-guide"
            className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300/30 bg-slate-950/40 px-4 text-xs font-semibold text-amber-100 transition hover:border-amber-200/50"
          >
            <BattleText en="User guide" zh="使用指南" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function LoadFailedState({
  title,
  zhTitle,
  onRetry,
}: {
  title: string;
  zhTitle: string;
  onRetry?: () => void;
}) {
  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-xl rounded-md border border-red-500/25 bg-red-500/10 px-5 py-6 text-center">
        <BattleBadge tone="red">
          <BattleText en="Load Failed" zh="读取失败" />
        </BattleBadge>
        <p className="mt-4 text-sm font-semibold text-red-50">
          <BattleText en={`We could not load ${title}.`} zh={`${zhTitle}暂时无法读取。`} />
        </p>
        <p className="mt-2 text-xs leading-5 text-red-100/75">
          <BattleText
            en="Your data is protected while the page recovers. Retry the request or check Task Progress if the problem continues."
            zh="页面恢复前会继续保护业务数据。请重试；如果仍失败，再到任务进度页检查。"
          />
        </p>
        {onRetry ? (
          <div className="mt-5">
            <CommandButton variant="danger" onClick={onRetry}>
              <BattleText en="Retry" zh="重试" />
            </CommandButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  label,
  action,
  actionHref,
}: {
  label: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="px-3 py-10 text-center">
      <p className="font-mono text-xs text-slate-600">{label}</p>
      {action && actionHref && (
        <a
          href={actionHref}
          className="mt-3 inline-flex h-7 items-center rounded-md border border-slate-700 bg-slate-800/60 px-3 text-[11px] font-semibold text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
        >
          {action}
        </a>
      )}
    </div>
  );
}
