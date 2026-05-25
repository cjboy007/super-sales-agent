"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject, PROJECTS } from "@/lib/project";
import type { ProjectId } from "@/lib/project";

const ALL_MENU_ITEMS = [
  { name: "Battle Station", icon: "SSA", href: "/" },
  { name: "线索雷达", icon: "LD", href: "/leads" },
  { name: "邮件中心", icon: "EM", href: "/emails" },
  { name: "收件队列", icon: "IN", href: "/inbox", badge: true },
  { name: "报价指挥", icon: "QT", href: "/quotations" },
  { name: "单证工位", icon: "DC", href: "/documents" },
  { name: "Agent 运行", icon: "AG", href: "/agent-status" },
  { name: "情报雷达", icon: "IX", href: "/intelligence" },
  { name: "系统设置", icon: "CF", href: "/settings" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}

export default function Sidebar({ collapsed, onToggle, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { project, setProjectId } = useProject();

  // Filter menu items based on project capabilities
  const menuItems = ALL_MENU_ITEMS.filter((item) => {
    if (item.href === "/emails" && !project.hasEmailSync) return false;
    if (item.href === "/quotations" && !project.hasQuotations) return false;
    return true;
  });

  return (
    <aside
      className={`h-screen md:h-full bg-slate-950 border-r border-slate-800 transition-all duration-300 flex flex-col ${
        collapsed ? "w-16 md:w-16" : "w-60 md:w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex h-12 items-center px-3 border-b border-slate-800">
        <button
          onClick={onToggle}
          className="w-full truncate text-left font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300 transition-colors hover:text-emerald-200"
        >
          {collapsed ? "SSA" : "SSA Battle Station"}
        </button>
        <button
          onClick={onCloseMobile}
          className="ml-2 rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-slate-400 md:hidden"
        >
          close
        </button>
      </div>

      {/* Project Switcher */}
      <div className="px-2 pt-3 pb-1">
        <div className="flex gap-1 rounded border border-slate-800 bg-slate-900/60 p-1">
          {(Object.values(PROJECTS) as Array<{ id: ProjectId; name: string; code: string }>).map((p) => (
            <button
              key={p.id}
              onClick={() => setProjectId(p.id)}
              className={`flex-1 rounded px-2 py-1.5 font-mono text-[10px] font-semibold transition-all ${
                project.id === p.id
                  ? "bg-emerald-600 text-white"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              {collapsed ? p.code : p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => onCloseMobile?.()}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 group ${
                    isActive
                      ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border border-transparent text-slate-500 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <span className={`grid h-6 w-8 flex-shrink-0 place-items-center rounded border font-mono text-[9px] font-bold ${
                    isActive ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-slate-800 bg-slate-900 text-slate-500"
                  }`}>
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="text-xs font-semibold truncate flex-1">{item.name}</span>
                      {"badge" in item && item.badge && !isActive && (
                        <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 font-mono text-[9px] font-bold leading-none text-white">
                          5
                        </span>
                      )}
                      {isActive && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      )}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded border border-emerald-500/35 bg-emerald-500/10 font-mono text-xs font-bold text-emerald-300">
              W
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-xs font-semibold text-slate-200">Wilson</p>
              <p className="truncate font-mono text-[10px] text-slate-500">operator</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
