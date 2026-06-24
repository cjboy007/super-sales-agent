"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { cx } from "@/components/battle-station/theme";
import { useTheme } from "./ThemeProvider";
import { APP_NAV_ITEMS, APP_PAGE_LABELS, type AppNavItem } from "./app-nav";
import { useOpsStatus } from "./OpsStatusProvider";
export { APP_NAV_ITEMS };

interface AppTopBarProps {
  title: string;
  zhTitle?: string;
  meta?: string;
  zhMeta?: string;
  active?: string;
  navItems?: AppNavItem[];
  children?: React.ReactNode;
}

export default function AppTopBar({
  title,
  zhTitle,
  meta,
  zhMeta,
  active = "/",
  navItems = APP_NAV_ITEMS,
  children,
}: AppTopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePreferencesOpen, setMobilePreferencesOpen] = useState(false);
  const { theme, language, toggleTheme, setLanguage } = useTheme();
  const opsStatus = useOpsStatus();
  const activeItem = APP_PAGE_LABELS.find((item) => item.href === active)
    ?? navItems.find((item) => item.href === active)
    ?? navItems[0];
  const activeLabel = activeItem
    ? language === "zh" ? activeItem.zhLabel ?? activeItem.label : activeItem.label
    : language === "zh" ? "当前页面" : "Current";
  const modulesLabel = language === "zh" ? "模块" : "Modules";
  const preferencesLabel = language === "zh" ? "偏好" : "Preferences";
  const themeLabel = theme === "dark"
    ? language === "zh" ? "浅色" : "Light"
    : language === "zh" ? "深色" : "Dark";

  return (
    <header className="shrink-0 border-b border-slate-700 bg-slate-800/95">
      <div className="grid min-h-[var(--ui-topbar-height)] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:px-4 lg:grid-cols-[minmax(190px,320px)_minmax(0,1fr)_auto] lg:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="grid h-[calc(var(--ui-button-height)-4px)] w-[calc(var(--ui-button-height)-4px)] shrink-0 place-items-center overflow-hidden rounded bg-slate-100 ring-1 ring-slate-600/60"
            aria-label="SSA home"
          >
            <Image
              src="/brand/ssa-icon-192.png"
              alt="SSA"
              width={32}
              height={32}
              className="h-full w-full object-contain"
              priority
            />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[length:var(--ui-page-title)] font-semibold text-slate-100">
              {language === "zh" ? zhTitle ?? title : title}
            </h1>
            <p className="truncate font-mono text-[length:var(--ui-page-meta)] text-slate-400">
              {language === "zh" ? zhMeta ?? meta ?? zhTitle ?? title : meta ?? title}
            </p>
          </div>
        </div>

        <nav className="mx-auto hidden min-w-0 max-w-full items-center gap-1 overflow-x-auto lg:flex">
          {navItems.map((item) => {
            const isOps = item.href === "/agent-status";
            const label = language === "zh" ? item.zhLabel ?? item.label : item.label;
            return (
            <Link
              key={item.href}
              href={item.href}
              title={isOps ? (language === "zh" ? opsStatus.zhSummary : opsStatus.summary) : undefined}
              aria-label={isOps ? `${label}: ${language === "zh" ? opsStatus.zhSummary : opsStatus.summary}` : undefined}
              className={cx(
                "relative shrink-0 whitespace-nowrap rounded border px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase leading-none transition",
                active === item.href
                  ? "border-[var(--accent)]/55 bg-[var(--accent)]/15 text-slate-100"
                  : "border-slate-600 bg-slate-900/45 text-slate-300 hover:border-slate-500 hover:text-white"
              )}
            >
              {label}
              {isOps && opsStatus.badge ? (
                <span
                  id="ops-status-dot"
                  aria-hidden="true"
                  className={cx(
                    "absolute -right-1 -top-1 h-2.5 min-w-2.5 rounded-full border border-slate-900",
                    opsStatus.level === "critical" && "bg-red-400",
                    opsStatus.level === "attention" && "bg-amber-400",
                    opsStatus.level === "running" && "bg-emerald-400",
                    opsStatus.level === "unknown" && "bg-slate-400"
                  )}
                />
              ) : null}
            </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
          {children && (
            <div className="hidden min-w-max items-center justify-end gap-2 2xl:flex">
              {children}
            </div>
          )}
          <button
            type="button"
            aria-expanded={mobilePreferencesOpen}
            aria-controls="mobile-preferences-menu"
            onClick={() => setMobilePreferencesOpen((open) => !open)}
            className="h-[calc(var(--ui-button-height)-4px)] min-w-20 shrink-0 whitespace-nowrap rounded-md border border-slate-600 bg-slate-900/45 px-2.5 font-mono text-[11px] font-semibold uppercase text-slate-200 transition hover:border-slate-500 hover:text-white lg:hidden"
          >
            {preferencesLabel}
          </button>
          <div className="hidden shrink-0 rounded border border-slate-600 bg-slate-900/70 p-0.5 lg:flex">
            {(["en", "zh"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLanguage(item)}
                className={cx(
                  "min-w-9 whitespace-nowrap rounded px-2.5 py-1.5 text-[11px] font-semibold transition",
                  language === item
                    ? "bg-[var(--accent)] text-white"
                    : "text-slate-300 hover:text-white"
                )}
              >
                {item === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="hidden h-[calc(var(--ui-button-height)-4px)] min-w-12 shrink-0 whitespace-nowrap rounded-md border border-slate-600 bg-slate-900/45 px-2.5 font-mono text-[11px] font-semibold uppercase text-slate-200 transition hover:border-slate-500 hover:text-white lg:inline-block"
          >
            {themeLabel}
          </button>
        </div>
      </div>

      {children && (
        <div className="flex min-h-10 flex-wrap items-center gap-2 border-t border-slate-700 px-3 py-1.5 2xl:hidden">
          {children}
        </div>
      )}

      {mobilePreferencesOpen && (
        <div id="mobile-preferences-menu" className="border-t border-slate-700 px-3 py-2 lg:hidden">
          <div className="grid gap-2 rounded-md border border-slate-700 bg-slate-900/85 p-2 shadow-xl">
            <div className="grid grid-cols-2 gap-1 rounded border border-slate-700 bg-slate-950/45 p-0.5">
              {(["en", "zh"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLanguage(item)}
                  className={cx(
                    "min-w-0 truncate rounded px-2.5 py-2 text-xs font-semibold transition",
                    language === item
                      ? "bg-[var(--accent)] text-white"
                      : "text-slate-300 hover:text-white"
                  )}
                >
                  {item === "en" ? "EN" : "中文"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="h-9 w-full rounded-md border border-slate-600 bg-slate-900/45 px-3 text-left font-mono text-[11px] font-semibold uppercase text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              {themeLabel}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-700 px-3 py-2 lg:hidden">
        <button
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-modules-menu"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="flex h-9 w-full items-center justify-between gap-3 rounded-md border border-slate-600 bg-slate-900/55 px-3 text-left transition hover:border-slate-500"
        >
          <span className="font-mono text-[11px] font-semibold uppercase leading-none text-slate-300">
            {modulesLabel}
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-xs font-semibold text-slate-100">
            {activeLabel}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className={cx("h-3.5 w-3.5 shrink-0 text-slate-300 transition", mobileMenuOpen ? "rotate-180" : "")}
          >
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        </button>

        {mobileMenuOpen && (
          <nav
            id="mobile-modules-menu"
            aria-label={modulesLabel}
            className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-slate-700 bg-slate-900/85 p-1 shadow-xl"
          >
            {navItems.map((item) => {
              const isOps = item.href === "/agent-status";
              const label = language === "zh" ? item.zhLabel ?? item.label : item.label;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cx(
                    "min-w-0 truncate rounded px-2.5 py-2 text-xs font-semibold leading-none transition",
                    active === item.href
                      ? "bg-[var(--accent)]/20 text-slate-100 ring-1 ring-[var(--accent)]/45"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
