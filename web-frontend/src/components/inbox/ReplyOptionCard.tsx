"use client";

import { Badge, type Tone } from "@/components/ui/BattleTokens";
import type { ReplyOption, ReplyStyle } from "@/types/inbox";

interface ReplyOptionCardProps {
  option: ReplyOption;
  selected: boolean;
  onSelect: () => void;
  loading?: boolean;
}

const styleTone: Record<ReplyStyle, Tone> = {
  steady: "blue",
  aggressive: "red",
  creative: "purple",
};

const styleLabels: Record<ReplyStyle, string> = {
  steady: "Steady",
  aggressive: "Aggressive",
  creative: "Creative",
};

const riskTone = {
  low: "emerald",
  medium: "amber",
  high: "red",
} as const;

export default function ReplyOptionCard({ option, selected, onSelect, loading = false }: ReplyOptionCardProps) {
  const tone = styleTone[option.style];

  return (
    <button
      onClick={onSelect}
      disabled={loading}
      className={`w-full overflow-hidden rounded-md border text-left transition-colors ${
        selected
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-slate-800 bg-slate-900/75 hover:border-slate-700"
      } ${loading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-200">{option.title || styleLabels[option.style]}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase text-slate-600">{option.style}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Badge tone={tone}>{styleLabels[option.style]}</Badge>
            <Badge tone={riskTone[option.risk_level]}>{option.risk_level}</Badge>
            {selected && <Badge tone="emerald">selected</Badge>}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{option.subtitle}</p>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Strategy</p>
          <ol className="mt-2 space-y-1.5">
            {option.outline.map((point, index) => (
              <li key={point} className="flex gap-2 text-xs text-slate-300">
                <span className="font-mono text-[10px] text-slate-600">{index + 1}</span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            ["Discount", option.key_metrics.discount],
            ["Margin", option.key_metrics.margin],
            ["Lead", option.key_metrics.lead_time],
            ["Special", option.key_metrics.special],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
              <p className="text-[10px] text-slate-600">{label}</p>
              <p className="truncate font-mono text-[11px] text-slate-300">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
          <p className="text-[10px] text-slate-600">Expected outcome</p>
          <p className="mt-1 text-xs text-slate-300">{option.expected_outcome}</p>
        </div>

        {loading && selected && (
          <div className="font-mono text-[10px] uppercase text-blue-400">Generating draft</div>
        )}
      </div>
    </button>
  );
}
