"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject } from "@/lib/project";

const ALL_MENU_ITEMS = [
  { name: "工作台", icon: "📊", href: "/" },
  { name: "待确认", icon: "✓", href: "/reviews", badge: true },
  { name: "线索开发", icon: "↗", href: "/growth" },
  { name: "客户", icon: "👥", href: "/leads" },
  { name: "邮件草稿", icon: "📧", href: "/emails" },
  { name: "报价中心", icon: "📋", href: "/quotations" },
  { name: "任务进度", icon: "🤖", href: "/agent-status" },
  { name: "设置", icon: "⚙️", href: "/settings" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}

export default function Sidebar({ collapsed, onToggle, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { project, setProjectId, allowedWorkspaces, canSwitchWorkspace } = useProject();

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
          className="flex min-w-0 flex-1 items-center rounded-md border border-transparent text-left transition hover:border-white/10 hover:bg-white/5 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
          aria-label="Toggle sidebar"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <Image
              src="/brand/ssa-icon-192.png"
              alt="SSA"
              width={32}
              height={32}
              className="h-8 w-8 rounded-md object-contain"
              priority
            />
          ) : (
            <Image
              src="/brand/ssa-logo-horizontal.png"
              alt="SSA Super Sales Agent"
              width={168}
              height={44}
              className="h-11 w-auto object-contain"
              priority
            />
          )}
        </button>
        <button
          onClick={onCloseMobile}
          className="ml-2 rounded-md border border-transparent px-2 py-1 text-xl text-white transition hover:border-white/15 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 md:hidden"
          aria-label="Close menu"
          title="Close menu"
        >
          ✕
        </button>
      </div>

      {/* Project Switcher */}
      {allowedWorkspaces.length > 0 && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex gap-1 bg-[var(--sidebar-hover)]/50 rounded-lg p-1">
            {canSwitchWorkspace ? (
              allowedWorkspaces.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProjectId(p.id)}
                  title={p.name}
                  className={`flex-1 rounded-md border border-transparent px-2 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 ${
                    project.id === p.id
                      ? "bg-[var(--accent)] text-white shadow"
                      : "text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {collapsed ? p.emoji : `${p.emoji} ${p.name}`}
                </button>
              ))
            ) : (
              <div className="min-w-0 flex-1 px-2 py-1.5 text-xs font-medium text-gray-300">
                {collapsed ? project.emoji : `${project.emoji} ${project.name}`}
              </div>
            )}
          </div>
        </div>
      )}

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
                  aria-current={isActive ? "page" : undefined}
                  title={item.name}
                  className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 ${
                    isActive
                      ? "border-blue-400/30 bg-[var(--accent)] text-white shadow-lg shadow-blue-500/20"
                      : "border-transparent text-gray-400 hover:border-white/10 hover:bg-[var(--sidebar-hover)] hover:text-white"
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
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-white">
              SSA
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">SSA</p>
              <p className="text-xs text-gray-500 truncate">Super Sales Agent</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
