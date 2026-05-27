"use client";

// ─── PipelineFunnel — G1 Milestone 3 ───
// Visualizes sales pipeline stages as a funnel
// Zero dependencies — pure CSS + data-driven

interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  color: string; // CSS class for gradient
}

interface PipelineFunnelProps {
  stages: FunnelStage[];
  totalConversionRate?: number;
  loading?: boolean;
}

const STAGE_COLORS = [
  "from-blue-500 to-blue-400",
  "from-violet-500 to-violet-400",
  "from-cyan-500 to-cyan-400",
  "from-emerald-500 to-emerald-400",
  "from-amber-500 to-amber-400",
];

export default function PipelineFunnel({ stages, totalConversionRate, loading }: PipelineFunnelProps) {
  if (loading) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-5">
        <div className="h-5 w-24 bg-[var(--sidebar-hover)] rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-20 h-4 bg-[var(--sidebar-hover)] rounded animate-pulse" />
              <div className="flex-1 h-8 bg-[var(--sidebar-hover)] rounded animate-pulse" style={{ width: `${100 - i * 15}%` }} />
              <div className="w-12 h-4 bg-[var(--sidebar-hover)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stages || stages.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-5 text-center text-gray-400 text-sm">
        <div className="text-2xl mb-2">🔻</div>
        <p>暂无漏斗数据</p>
      </div>
    );
  }

  const maxCount = Math.max(...stages.map((s) => s.count));
  const conversionRate =
    totalConversionRate ??
    (stages.length >= 2 ? ((stages[stages.length - 1].count / stages[0].count) * 100).toFixed(1) : "0");

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-1">🔻 销售漏斗</h3>
      <p className="text-xs text-gray-500 mb-4">当前 pipeline 各阶段线索数量</p>

      <div className="space-y-2">
        {stages.map((stage, index) => {
          const widthPercent = Math.max((stage.count / maxCount) * 100, 15);
          const colorClass = stage.color || STAGE_COLORS[index % STAGE_COLORS.length];

          return (
            <div key={stage.stage} className="flex items-center gap-2 sm:gap-3">
              <div className="w-14 sm:w-20 text-right text-[10px] sm:text-xs text-gray-400 flex-shrink-0">{stage.label}</div>
              <div className="flex-1 min-w-0">
                <div
                  className={`h-6 sm:h-8 rounded-md bg-gradient-to-r ${colorClass} flex items-center px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-white transition-all duration-500`}
                  style={{ width: `${widthPercent}%`, minWidth: "40px" }}
                >
                  {stage.count}
                </div>
              </div>
              <div className="w-8 sm:w-12 text-[10px] sm:text-xs font-semibold text-white text-right">{stage.count}</div>
            </div>
          );
        })}
      </div>

      {/* Overall conversion */}
      <div className="mt-4 p-3 bg-[var(--sidebar-hover)] rounded-lg">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">整体转化率</span>
          <span className="text-green-400 font-semibold">{conversionRate}%</span>
        </div>
        <div className="h-1.5 bg-[var(--border-color)] rounded-full mt-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-500 to-cyan-500 transition-all duration-700"
            style={{ width: `${Math.min(Number(conversionRate) * 5, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
