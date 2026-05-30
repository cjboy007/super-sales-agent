"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject, PROJECTS } from "@/lib/project";
import type { ProjectId } from "@/lib/project";

const ALL_MENU_ITEMS = [
  { name: "Dashboard", icon: "📊", href: "/" },
  { name: "Throw Anything", icon: "🧲", href: "/intake" },
  { name: "线索库", icon: "👥", href: "/leads" },
  { name: "邮件", icon: "📧", href: "/emails" },
  { name: "收件箱", icon: "📥", href: "/inbox", badge: true },
  { name: "报价单", icon: "📋", href: "/quotations" },
  { name: "单证", icon: "📦", href: "/documents" },
  { name: "Agent 状态", icon: "🤖", href: "/agent-status" },
  { name: "情报中心", icon: "🔍", href: "/intelligence" },
  { name: "设置", icon: "⚙️", href: "/settings" },
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
      className={`h-screen md:h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] transition-all duration-300 flex flex-col ${
        collapsed ? "w-16 md:w-16" : "w-60 md:w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[var(--border-color)]">
        <button
          onClick={onToggle}
          className="text-lg font-bold text-white hover:text-[var(--accent)] transition-colors w-full text-left truncate"
        >
          {collapsed ? "JO" : "JadenOS"}
        </button>
        <button
          onClick={onCloseMobile}
          className="md:hidden text-white text-xl ml-2"
        >
          ✕
        </button>
      </div>

      {/* Project Switcher */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex gap-1 bg-[var(--sidebar-hover)]/50 rounded-lg p-1">
          {(Object.values(PROJECTS) as Array<{ id: ProjectId; name: string; emoji: string }>).map((p) => (
            <button
              key={p.id}
              onClick={() => setProjectId(p.id)}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                project.id === p.id
                  ? "bg-[var(--accent)] text-white shadow"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {collapsed ? p.emoji : `${p.emoji} ${p.name}`}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => onCloseMobile?.()}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                    isActive
                      ? "bg-[var(--accent)] text-white shadow-lg shadow-blue-500/20"
                      : "text-gray-400 hover:bg-[var(--sidebar-hover)] hover:text-white"
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="text-sm font-medium truncate flex-1">{item.name}</span>
                      {"badge" in item && item.badge && !isActive && (
                        <span className="ml-auto text-xs bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                          5
                        </span>
                      )}
                      {isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
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
        <div className="p-4 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
              W
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">JadenOS</p>
              <p className="text-xs text-gray-500 truncate">OpenClaw for salespeople</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
