"use client";

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  trend?: { value: string; up: boolean } | null;
  status?: "green" | "yellow" | "red" | "neutral";
  loading?: boolean;
  onClick?: () => void;
}

export default function StatCard({
  icon,
  label,
  value,
  trend,
  status = "neutral",
  loading = false,
  onClick,
}: StatCardProps) {
  const statusBorder = {
    green: "border-green-500/30",
    yellow: "border-yellow-500/30",
    red: "border-red-500/30",
    neutral: "border-[var(--border-color)]",
  }[status];

  const statusGlow = {
    green: "shadow-green-500/5",
    yellow: "shadow-yellow-500/5",
    red: "shadow-red-500/5",
    neutral: "",
  }[status];

  const trendColor = trend?.up ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10";

  return (
    <div
      className={`bg-[var(--card-bg)] rounded-xl border ${statusBorder} p-5 shadow-lg ${statusGlow} ${
        onClick ? "cursor-pointer hover:border-[var(--accent)]/50 transition-all duration-200" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${trendColor}`}>
            {trend.up ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-white mb-1 tabular-nums">
        {loading ? (
          <span className="inline-block w-16 h-8 bg-[var(--sidebar-hover)] rounded animate-pulse" />
        ) : (
          value
        )}
      </p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}
