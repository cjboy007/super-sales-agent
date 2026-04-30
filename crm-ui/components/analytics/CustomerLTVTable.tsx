'use client';

import type { CustomerLTVItem } from '../../lib/analytics/order-data-service';

interface Props {
  data: CustomerLTVItem[];
}

export default function CustomerLTVTable({ data }: Props) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">客户 LTV 排行</h2>
          <p className="text-sm text-gray-500">LTV = 累计金额 / 合作月数（已排除 cancelled）</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          Top {data.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['客户', '订单数', '累计金额', '合作月数', 'LTV', '最近订单'].map((label) => (
                <th key={label} className="px-4 py-3 text-left font-medium text-gray-500">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {data.map((item) => (
              <tr key={item.customer_key} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{item.customer_label}</div>
                  <div className="text-xs text-gray-500">{item.customer_email}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">{item.order_count}</td>
                <td className="px-4 py-3 text-gray-700">${item.total_amount.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-700">{item.cooperation_months}</td>
                <td className="px-4 py-3 font-semibold text-blue-600">${item.ltv.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-700">{formatDate(item.last_order_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
