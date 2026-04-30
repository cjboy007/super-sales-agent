'use client';

/**
 * 订单列表表格组件
 * 
 * 功能：
 * - 显示订单列表（5 列：订单号/客户/金额/状态/创建时间）
 * - 点击订单号跳转详情
 * - 使用 OrderStatusLabels 和 OrderStatusColors
 */

import Link from 'next/link';
import { OrderStatus, OrderStatusLabels, OrderStatusColors } from '../../enums/order-status';

interface Order {
  order_id: string;
  customer_name: string;
  customer_email: string;
  customer_company?: string;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  created_at: string;
}

interface OrderListTableProps {
  orders: Order[];
  loading?: boolean;
}

export default function OrderListTable({ orders, loading = false }: OrderListTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📦</div>
        <p className="text-gray-500 text-lg">暂无订单</p>
        <p className="text-gray-400 text-sm mt-2">创建您的第一个订单吧！</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              订单号
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              客户
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              金额
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              状态
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              创建时间
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {orders.map((order) => (
            <tr 
              key={order.order_id}
              className="hover:bg-gray-50 transition-colors duration-150"
            >
              {/* 订单号 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <Link
                  href={`/orders/${order.order_id}`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {order.order_id}
                </Link>
              </td>
              
              {/* 客户信息 */}
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900">{order.customer_name}</div>
                {order.customer_company && (
                  <div className="text-sm text-gray-500">{order.customer_company}</div>
                )}
                <div className="text-sm text-gray-400">{order.customer_email}</div>
              </td>
              
              {/* 金额 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {order.currency} {order.total_amount.toFixed(2)}
                </div>
              </td>
              
              {/* 状态 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${OrderStatusColors[order.status]}-100 text-${OrderStatusColors[order.status]}-800`}
                >
                  {OrderStatusLabels[order.status].zh}
                </span>
              </td>
              
              {/* 创建时间 */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(order.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==================== 辅助函数 ====================

/**
 * 格式化日期
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
