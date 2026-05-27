"use client";

// ─── KpiCard v2 — Redesigned for G1 Milestone 3 ───
// Replaces StatCard with: sparkline trends, colored top borders, enhanced hover states
// Zero dependencies — pure SVG sparkline

interface KpiCardProps {
  icon: string;
  label: string;
  value: string | number;
  trend?: { label: string; direction: "up" | "down" | "neutral" } | null;
  status?: "green" | "yellow" | "red" | "blue" | "neutral";
  sparklineData?: number[]; // 8 data points for sparkline
  loading?: boolean;
  onClick?: () => void;
}

// ─── Sparkline SVG Component ───

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;

  const w = 100;
  const h = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Build path
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2; // 2px padding
    return [x, y];
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h}Z`;

  const gradientId = `spark-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-8">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Main Component ───

export default function KpiCard({
  icon,
  label,
  value,
  trend,
  status = "neutral",
  sparklineData,
  loading = false,
  onClick,
}: KpiCardProps) {
  const statusBorder = {
    green: "border-green-500/30",
    yellow: "border-yellow-500/30",
    red: "border-red-500/30",
    blue: "border-blue-500/30",
    neutral: "border-[var(--border-color)]",
  }[status];

  const topBarColor = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    neutral: "bg-gray-500",
  }[status];

  const iconBg = {
    green: "bg-green-500/15",
    yellow: "bg-yellow-500/15",
    red: "bg-red-500/15",
    blue: "bg-blue-500/15",
    neutral: "bg-gray-500/15",
  }[status];

  const trendStyle = {
    up: "text-green-400 bg-green-500/15",
    down: "text-red-400 bg-red-500/15",
    neutral: "text-gray-400 bg-gray-500/15",
  }[trend?.direction || "neutral"];

  const sparkColor = {
    green: "#10b981",
    yellow: "#f59e0b",
    red: "#ef4444",
    blue: "#3b82f6",
    neutral: "#64748b",
  }[status];

  return (
    <div
      className={`relative bg-[var(--card-bg)] rounded-xl border ${statusBorder} p-3 sm:p-5 shadow-lg overflow-hidden transition-all duration-200 ${
        onClick ? "cursor-pointer hover:border-[var(--accent)]/50 hover:-translate-y-0.5 hover:shadow-xl" : ""
      }`}
      onClick={onClick}
    >
      {/* Top color bar */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${topBarColor}`} />

      {/* Header */}
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${iconBg} flex items-center justify-center text-lg sm:text-xl`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full ${trendStyle}`}>
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.label}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="text-xl sm:text-3xl font-bold text-white leading-tight mb-0.5 sm:mb-1 tabular-nums">
        {loading ? (
          <span className="inline-block w-12 sm:w-16 h-5 sm:h-8 bg-[var(--sidebar-hover)] rounded animate-pulse" />
        ) : (
          value
        )}
      </div>

      {/* Label */}
      <p className="text-xs sm:text-sm text-gray-400">{label}</p>

      {/* Sparkline */}
      {!loading && sparklineData && (
        <div className="mt-2 sm:mt-3">
          <Sparkline data={sparklineData} color={sparkColor} />
        </div>
      )}
    </div>
  );
}
