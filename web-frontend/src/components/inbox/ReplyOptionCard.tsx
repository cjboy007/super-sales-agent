"use client";

import type { ReplyOption } from "@/types/inbox";

interface ReplyOptionCardProps {
  option: ReplyOption;
  selected: boolean;
  onSelect: () => void;
  loading?: boolean;
}

const styleGlow = {
  steady: "shadow-blue-500/30 border-blue-500/60",
  aggressive: "shadow-red-500/30 border-red-500/60",
  creative: "shadow-purple-500/30 border-purple-500/60",
};

const styleAccent = {
  steady: "text-blue-400",
  aggressive: "text-red-400",
  creative: "text-purple-400",
};

const styleBg = {
  steady: "bg-blue-500/5",
  aggressive: "bg-red-500/5",
  creative: "bg-purple-500/5",
};

const riskColors = {
  low: "text-green-400 bg-green-500/10 border-green-500/20",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  high: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function ReplyOptionCard({
  option,
  selected,
  onSelect,
  loading = false,
}: ReplyOptionCardProps) {
  return (
    <button
      onClick={onSelect}
      disabled={loading}
      className={`w-full text-left rounded-2xl border transition-all duration-300 overflow-hidden ${
        selected
          ? `border-2 ${styleGlow[option.style]} shadow-xl ${styleBg[option.style]}`
          : "border border-[var(--border-color)] bg-[var(--card-bg)] hover:border-white/20 hover:shadow-md"
      } ${loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {/* Card header */}
      <div className={`px-5 py-4 border-b border-[var(--border-color)] ${selected ? styleBg[option.style] : ""}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{option.icon}</span>
            <span className={`text-lg font-bold ${styleAccent[option.style]}`}>{option.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${riskColors[option.risk_level]}`}>
              {option.risk_level} risk
            </span>
            {selected && (
              <span className={`text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white font-medium`}>
                ✓ Selected
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-300">{option.subtitle}</p>
      </div>

      {/* Strategy outline */}
      <div className="px-5 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Strategy</p>
        <ul className="space-y-1.5 mb-4">
          {option.outline.map((point, i) => (
            <li key={i} className="text-xs text-gray-300 flex gap-2">
              <span className={`flex-shrink-0 font-bold ${styleAccent[option.style]}`}>{i + 1}.</span>
              {point}
            </li>
          ))}
        </ul>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: "Discount", value: option.key_metrics.discount },
            { label: "Margin", value: option.key_metrics.margin },
            { label: "Lead Time", value: option.key_metrics.lead_time },
            { label: "Special", value: option.key_metrics.special },
          ].map((m) => (
            <div key={m.label} className="bg-white/5 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">{m.label}</p>
              <p className={`text-xs font-semibold ${styleAccent[option.style]}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Expected outcome */}
        <div className={`rounded-lg px-3 py-2 ${styleBg[option.style]} border border-white/5`}>
          <p className="text-xs text-gray-400 mb-0.5">Expected outcome</p>
          <p className="text-xs text-gray-200">{option.expected_outcome}</p>
        </div>
      </div>

      {/* Loading state */}
      {loading && selected && (
        <div className="px-5 pb-4 flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-xs text-gray-400">Generating full email...</span>
        </div>
      )}
    </button>
  );
}
