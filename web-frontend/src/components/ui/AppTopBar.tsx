"use client";

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
      <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:px-4 lg:h-12 lg:grid-cols-[minmax(160px,260px)_minmax(0,1fr)_auto] lg:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="grid h-7 w-7 shrink-0 place-items-center rounded bg-emerald-500 font-mono text-[10px] font-black text-slate-950"
            aria-label="JadenOS home"
          >
            JO
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xs font-semibold tracking-[0.12em] text-slate-100">
              {language === "zh" ? zhTitle ?? title : title}
            </h1>
            <p className="truncate font-mono text-[10px] text-slate-400">
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
                "shrink-0 whitespace-nowrap rounded border px-2 py-1 font-mono text-[10px] font-semibold uppercase leading-none transition xl:px-2.5",
                active === item.href
                  ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
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
                  "min-w-8 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold transition sm:px-2",
                  language === item
                    ? "bg-emerald-500 text-slate-950"
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
            className="h-7 min-w-10 shrink-0 whitespace-nowrap rounded-md border border-slate-600 bg-slate-900/45 px-2 font-mono text-[10px] font-semibold uppercase text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            {themeLabel}
          </button>
        </div>
      </div>

      {children && (
        <div className="flex min-h-8 flex-wrap items-center gap-2 border-t border-slate-700 px-3 py-1 2xl:hidden">
          {children}
        </div>
      )}

      <nav className="flex h-8 items-center gap-1 overflow-x-auto border-t border-slate-700 px-4 lg:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "shrink-0 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none",
              active === item.href
                ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
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
