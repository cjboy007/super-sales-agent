"use client";

import Link from "next/link";

interface AttentionItem {
  id: string;
  type: "reply" | "failed" | "pending" | "quotation";
  title: string;
  subtitle?: string;
  href?: string;
  urgency: "high" | "medium" | "low";
}

interface NeedsAttentionProps {
  items: AttentionItem[];
  loading?: boolean;
}

const urgencyDot = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

const typeIcon = {
  reply: "💬",
  failed: "❌",
  pending: "⏳",
  quotation: "📋",
};

const typeLabel = {
  reply: "新回复",
  failed: "发送失败",
  pending: "待发送",
  quotation: "待报价",
};

export default function NeedsAttention({ items, loading = false }: NeedsAttentionProps) {
  if (loading) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-5">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <span>🔔</span> 需要关注
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-[var(--sidebar-hover)] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border border-green-500/20 p-5">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <span>🔔</span> 需要关注
        </h2>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <span className="text-4xl mb-3">✅</span>
          <p className="text-green-400 font-medium">一切正常</p>
          <p className="text-sm text-gray-500 mt-1">没有待处理的事项</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-yellow-500/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <span>🔔</span> 需要关注
          <span className="ml-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
            {items.length}
          </span>
        </h2>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const content = (
            <div
              className={`flex items-center gap-3 p-3 rounded-lg bg-[var(--sidebar-hover)]/50 ${
                item.href ? "hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer" : ""
              }`}
            >
              <div className="relative flex-shrink-0">
                <span className="text-xl">{typeIcon[item.type]}</span>
                <span
                  className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${urgencyDot[item.urgency]}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{item.title}</p>
                {item.subtitle && (
                  <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
                )}
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0 bg-[var(--sidebar-hover)] px-2 py-0.5 rounded-full">
                {typeLabel[item.type]}
              </span>
            </div>
          );

          return item.href ? (
            <Link key={item.id} href={item.href}>
              {content}
            </Link>
          ) : (
            <div key={item.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
