'use client';

/**
 * 物流信息卡片组件
 * 
 * 功能：
 * - 显示物流摘要信息
 * - 承运商、运单号、状态
 * - 预计/实际送达日期
 * - 查看物流详情链接
 */

import { useState } from 'react';

interface LogisticsCardProps {
  orderId: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  carrierName?: string | null;
  status?: string | null;
  statusDescription?: string | null;
  estimatedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  eventCount?: number;
  onRefresh?: () => void;
}

export default function LogisticsCard({
  orderId,
  trackingNumber,
  carrier,
  carrierName,
  status,
  statusDescription,
  estimatedDeliveryDate,
  actualDeliveryDate,
  eventCount = 0,
  onRefresh,
}: LogisticsCardProps) {
  const [refreshing, setRefreshing] = useState(false);

  // 状态颜色映射
  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    in_transit: 'bg-blue-100 text-blue-800',
    customs_clearance: 'bg-yellow-100 text-yellow-800',
    out_for_delivery: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    returning: 'bg-orange-100 text-orange-800',
    returned: 'bg-red-100 text-red-800',
    lost: 'bg-red-100 text-red-800',
    customer_rejected: 'bg-red-100 text-red-800',
  };

  // 状态图标映射
  const statusIcons: Record<string, string> = {
    pending: '📦',
    in_transit: '🚚',
    customs_clearance: '🛃',
    out_for_delivery: '📬',
    delivered: '✅',
    returning: '↩️',
    returned: '🔙',
    lost: '❌',
    customer_rejected: '❌',
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // 没有物流信息时
  if (!trackingNumber && !carrier) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🚚 物流信息</h3>
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">暂无物流信息</p>
          <p className="text-sm text-gray-400">订单发货后将显示物流追踪信息</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">🚚 物流信息</h3>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
          >
            {refreshing ? '刷新中...' : '🔄 刷新'}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* 物流状态 */}
        {status && (
          <div className="flex items-center gap-3">
            <span className="text-2xl">{statusIcons[status] || '📦'}</span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                statusColors[status] || 'bg-gray-100 text-gray-800'
              }`}
            >
              {statusDescription || status}
            </span>
          </div>
        )}

        {/* 承运商 */}
        {carrier && (
          <div>
            <dt className="text-sm font-medium text-gray-500">物流公司</dt>
            <dd className="mt-1 text-sm text-gray-900 font-medium">
              {carrierName || carrier}
            </dd>
          </div>
        )}

        {/* 运单号 */}
        {trackingNumber && (
          <div>
            <dt className="text-sm font-medium text-gray-500">运单号</dt>
            <dd className="mt-1 text-sm text-gray-900 font-mono">
              {trackingNumber}
            </dd>
          </div>
        )}

        {/* 送达日期 */}
        <div className="grid grid-cols-2 gap-4">
          {estimatedDeliveryDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">预计送达</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(estimatedDeliveryDate).toLocaleDateString('zh-CN')}
              </dd>
            </div>
          )}
          {actualDeliveryDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">实际送达</dt>
              <dd className="mt-1 text-sm text-green-700 font-medium">
                {new Date(actualDeliveryDate).toLocaleDateString('zh-CN')}
              </dd>
            </div>
          )}
        </div>

        {/* 事件数量 */}
        {eventCount > 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm text-gray-500">
              📋 共 {eventCount} 条物流记录
            </p>
          </div>
        )}

        {/* 17Track 链接 */}
        {trackingNumber && (
          <div className="pt-4 border-t">
            <a
              href={`https://t.17track.net/zh-cn#nums=${trackingNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              在 17Track 查看追踪 🔗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
