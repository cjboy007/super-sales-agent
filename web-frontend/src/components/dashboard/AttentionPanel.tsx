"use client";

import Link from "next/link";

interface AttentionItem {
  id: string;
  type: "reply" | "failed" | "pending" | "quotation";
  title: string;
  subtitle?: string;
  href: string;
  urgent?: boolean;
}

interface AttentionPanelProps {
  items: AttentionItem[];
  loading?: boolean;
}

const TYPE_CONFIG = {
  reply: { icon: "💬", color: "text-blue-400", bg: "bg-blue-500/10", label: "新回复" },
  failed: { icon: "❌", color: "text-red-400", bg: "bg-red-500/10", label: "发送失败" },
  pending: { icon: "⏳", color: "text-yellow-400", bg: "bg-yellow-500/10", label: "待发送" },
  quotation: { icon: "📋", color: "text-purple-400", bg: "bg-purple-500/10", label: "待报价" },
};

export default function AttentionPanel({ items, loading = false }: AttentionPanelProps) {
  if (loading) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-4 sm:p-5">
        <h2 className="text-sm sm:text-base font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
          <span>🔔</span> 需要关注
        </h2>
        <div className="space-y-2 sm:space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 sm:h-14 bg-[var(--sidebar-hover)] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border border-green-500/20 p-4 sm:p-5">
        <h2 className="text-sm sm:text-base font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
          <span>🔔</span> 需要关注
        </h2>
        <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
          <span className="text-3xl sm:text-4xl mb-2 sm:mb-3">✅</span>
          <p className="text-green-400 font-medium text-sm sm:text-base">一切正常</p>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">没有待处理的事项</p>
        </div>
      </div>
    );
  }

  const urgentItems = items.filter((i) => i.urgent);
  const normalItems = items.filter((i) => !i.urgent);

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-yellow-500/20 p-4 sm:p-5">
      <h2 className="text-sm sm:text-base font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
        <span>🔔</span> 需要关注
        <span className="ml-auto text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
          {items.length} 项
        </span>
      </h2>
      <div className="space-y-1.5 sm:space-y-2">
        {[...urgentItems, ...normalItems].map((item) => {
          const cfg = TYPE_CONFIG[item.type];
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--sidebar-hover)] transition-colors group"
            >
              <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                <span className="text-lg">{cfg.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate group-hover:text-[var(--accent)] transition-colors">
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
                {item.urgent && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
                <span className="text-gray-600 group-hover:text-gray-400 transition-colors">→</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
