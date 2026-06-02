"use client";

import Image from "next/image";
import Link from "next/link";
import { cx } from "@/components/battle-station/theme";
import { useTheme } from "./ThemeProvider";
import { APP_NAV_ITEMS, type AppNavItem } from "./app-nav";
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
  const { theme, language, toggleTheme, setLanguage } = useTheme();
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
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "shrink-0 whitespace-nowrap rounded border px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase leading-none transition",
                active === item.href
                  ? "border-[var(--accent)]/55 bg-[var(--accent)]/15 text-slate-100"
                  : "border-slate-600 bg-slate-900/45 text-slate-300 hover:border-slate-500 hover:text-white"
              )}
            >
              {language === "zh" ? item.zhLabel ?? item.label : item.label}
            </Link>
          ))}
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
          {children && (
            <div className="hidden min-w-max items-center justify-end gap-2 2xl:flex">
              {children}
            </div>
          )}
          <div className="flex shrink-0 rounded border border-slate-600 bg-slate-900/70 p-0.5">
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
            className="h-[calc(var(--ui-button-height)-4px)] min-w-12 shrink-0 whitespace-nowrap rounded-md border border-slate-600 bg-slate-900/45 px-2.5 font-mono text-[11px] font-semibold uppercase text-slate-200 transition hover:border-slate-500 hover:text-white"
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

      <nav className="flex h-10 items-center gap-1.5 overflow-x-auto border-t border-slate-700 px-4 lg:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "shrink-0 whitespace-nowrap rounded border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase leading-none",
              active === item.href
                ? "border-[var(--accent)]/55 bg-[var(--accent)]/15 text-slate-100"
                : "border-slate-600 bg-slate-900/45 text-slate-300"
            )}
          >
            {language === "zh" ? item.zhLabel ?? item.label : item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
