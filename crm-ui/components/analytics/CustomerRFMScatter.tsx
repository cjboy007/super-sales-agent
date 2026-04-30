'use client';

import type { CustomerRFMItem } from '../../lib/analytics/order-data-service';

interface Props {
  data: CustomerRFMItem[];
}

export default function CustomerRFMScatter({ data }: Props) {
  const maxMonetary = Math.max(...data.map((item) => item.monetary), 1);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">RFM 客户散点图</h2>
        <p className="text-sm text-gray-500">横轴 = Frequency，纵轴 = Recency Score，气泡大小 = Monetary</p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-slate-50 to-white p-4">
        <div className="relative h-80 w-full overflow-hidden rounded-lg border border-dashed border-gray-200 bg-white">
          {data.map((item) => {
            const left = `${Math.max(8, Math.min(92, (item.frequency / Math.max(...data.map((row) => row.frequency), 1)) * 100))}%`;
            const bottom = `${Math.max(8, Math.min(92, (item.r_score / 5) * 100))}%`;
            const size = 16 + (item.monetary / maxMonetary) * 34;

            return (
              <div
                key={item.customer_key}
                className="group absolute -translate-x-1/2 translate-y-1/2"
                style={{ left, bottom }}
              >
                <div
                  className="rounded-full border border-blue-300 bg-blue-500/70 shadow-lg transition-transform group-hover:scale-110"
                  style={{ width: `${size}px`, height: `${size}px` }}
                />
                <div className="pointer-events-none absolute left-1/2 top-full z-10 hidden w-44 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-xl group-hover:block">
                  <div className="font-semibold">{item.customer_label}</div>
                  <div>R/F/M: {item.r_score}/{item.f_score}/{item.m_score}</div>
                  <div>Score: {item.total_score}</div>
                  <div>金额: ${item.monetary.toFixed(2)}</div>
                </div>
              </div>
            );
          })}

          <div className="absolute bottom-2 left-4 text-xs text-gray-400">低 Frequency</div>
          <div className="absolute bottom-2 right-4 text-xs text-gray-400">高 Frequency</div>
          <div className="absolute left-2 top-4 -rotate-90 text-xs text-gray-400">高 Recency Score</div>
          <div className="absolute left-2 bottom-10 -rotate-90 text-xs text-gray-400">低 Recency Score</div>
        </div>
      </div>
    </section>
  );
}
