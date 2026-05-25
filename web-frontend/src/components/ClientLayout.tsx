"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname === "/") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:static md:w-fit z-50 transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          onCloseMobile={() => setMobileOpen(false)}
        />
      </div>

      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex h-12 items-center border-b border-slate-800 bg-slate-950 px-3 sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="-ml-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-slate-300 transition-colors active:opacity-60"
            aria-label="Open menu"
          >
            nav
          </button>
          <span className="ml-2 text-sm font-semibold text-white truncate">Super Sales Agent</span>
        </div>
        {children}
      </main>
    </div>
  );
}
