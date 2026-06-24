"use client";

import Link from "next/link";

interface Lead {
  name: string;
  email: string;
  status: string;
  time: string;
  score: number;
}

interface RecentLeadsProps {
  leads: Lead[];
  loading?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  "新线索": "bg-blue-500/20 text-blue-400",
  "跟进中": "bg-yellow-500/20 text-yellow-400",
  "重点": "bg-red-500/20 text-red-400",
  "潜力": "bg-purple-500/20 text-purple-400",
  "潜在": "bg-gray-500/20 text-gray-400",
};

function scoreColor(score: number) {
  if (score >= 85) return "text-green-400";
  if (score >= 65) return "text-yellow-400";
  return "text-gray-500";
}

function avatarGradient(name: string) {
  const gradients = [
    "from-blue-500/40 to-purple-500/40",
    "from-green-500/40 to-teal-500/40",
    "from-orange-500/40 to-red-500/40",
    "from-pink-500/40 to-rose-500/40",
    "from-indigo-500/40 to-blue-500/40",
  ];
  const idx = name.charCodeAt(0) % gradients.length;
  return gradients[idx];
}

export default function RecentLeads({ leads, loading = false }: RecentLeadsProps) {
  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <span>👥</span> 最近线索
        </h2>
        <Link
          href="/leads"
          className="text-xs text-[var(--accent)] hover:text-blue-300 transition-colors"
        >
          查看全部 →
        </Link>
      </div>

      {loading ? (
        <div className="divide-y divide-[var(--border-color)]">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[var(--sidebar-hover)] animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-[var(--sidebar-hover)] rounded animate-pulse w-1/2" />
                <div className="h-3 bg-[var(--sidebar-hover)] rounded animate-pulse w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-5">
          <span className="text-4xl mb-3">🌱</span>
          <p className="text-sm font-medium text-gray-400">还没有线索</p>
          <p className="text-xs text-gray-600 mt-1">导入 CSV 或让 AI 助手发现潜在客户</p>
          <Link
            href="/leads"
            className="mt-4 text-xs px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            前往线索库
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-color)]">
          {leads.map((lead, index) => (
            <div
              key={`${lead.email || "no-email"}-${lead.name || "no-name"}-${index}`}
              className="px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--sidebar-hover)]/40 transition-colors"
            >
              <div
                className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(lead.name || "?")} flex items-center justify-center text-sm font-bold text-white flex-shrink-0`}
              >
                {lead.name ? lead.name[0].toUpperCase() : "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{lead.name || "未知"}</p>
                <p className="text-xs text-gray-500 truncate">{lead.email || "—"}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    STATUS_COLOR[lead.status] || "bg-gray-500/20 text-gray-400"
                  }`}
                >
                  {lead.status}
                </span>
                <span className={`text-xs font-bold tabular-nums ${scoreColor(lead.score)}`}>
                  {lead.score}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
