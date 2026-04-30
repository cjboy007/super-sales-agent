'use client';

import type { LTVTrendItem } from '../../lib/analytics/order-data-service';

interface Props {
  data: LTVTrendItem[];
}

export default function LTVTrendBarChart({ data }: Props) {
  const maxValue = Math.max(...data.map((item) => item.average_ltv), 1);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">LTV 趋势</h2>
        <p className="text-sm text-gray-500">按首单月份聚合的平均 LTV 柱状图</p>
      </div>

      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.period}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{item.period}</span>
              <span className="text-gray-500">${item.average_ltv.toFixed(2)} · {item.customer_count} 客户</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                style={{ width: `${Math.max(6, (item.average_ltv / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
