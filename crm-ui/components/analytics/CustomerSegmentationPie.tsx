'use client';

import type { CustomerSegmentationItem } from '../../lib/analytics/order-data-service';

interface Props {
  data: CustomerSegmentationItem[];
}

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444'];

export default function CustomerSegmentationPie({ data }: Props) {
  const total = data.reduce((sum, item) => sum + item.customer_count, 0) || 1;
  let accumulated = 0;

  const segments = data.map((item, index) => {
    const percentage = item.customer_count / total;
    const start = accumulated;
    accumulated += percentage;
    return {
      ...item,
      percentage,
      dashArray: `${percentage * 100} ${100 - percentage * 100}`,
      dashOffset: -start * 100,
      color: COLORS[index % COLORS.length],
    };
  });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">客户分层占比</h2>
        <p className="text-sm text-gray-500">高价值 / 潜力 / 一般 / 流失</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
        <div className="mx-auto h-52 w-52">
          <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
            <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e5e7eb" strokeWidth="6" />
            {segments.map((item) => (
              <circle
                key={item.segment}
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke={item.color}
                strokeWidth="6"
                strokeDasharray={item.dashArray}
                strokeDashoffset={item.dashOffset}
              />
            ))}
          </svg>
        </div>

        <div className="space-y-3">
          {segments.map((item) => (
            <div key={item.segment} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <div>
                  <div className="font-medium text-gray-900">{item.segment_label}</div>
                  <div className="text-xs text-gray-500">平均 RFM 分数 {item.average_score.toFixed(1)}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900">{item.customer_count} 个</div>
                <div className="text-xs text-gray-500">{(item.percentage * 100).toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
