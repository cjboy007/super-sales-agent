'use client';

/**
 * 订单状态历史时间线
 * 
 * 功能：
 * - 可视化展示订单状态变更历史
 * - 显示每次变更的时间、操作人、备注
 * - 支持加载更多（分页）
 */

import { useState, useEffect } from 'react';
import { OrderStatusLabels, OrderStatusColors } from '../../enums/order-status';

interface StatusHistoryItem {
  id: number;
  order_id: string;
  status: string;
  status_label: { zh: string; en: string };
  status_color: string;
  changed_at: string;
  changed_by: string;
  notes: string | null;
  notification_sent: boolean;
}

interface OrderStatusTimelineProps {
  orderId: string;
  initialHistory?: StatusHistoryItem[];
}

export default function OrderStatusTimeline({
  orderId,
  initialHistory = []
}: OrderStatusTimelineProps) {
  const [history, setHistory] = useState<StatusHistoryItem[]>(initialHistory);
  const [loading, setLoading] = useState(!initialHistory.length);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  // 加载历史记录
  useEffect(() => {
    if (initialHistory.length === 0) {
      loadHistory(1);
    }
  }, [orderId]);
  
  const loadHistory = async (pageNum: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/orders/${orderId}/history?page=${pageNum}&limit=20`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || '加载失败');
      }
      
      if (pageNum === 1) {
        setHistory(result.data.history);
      } else {
        setHistory(prev => [...prev, ...result.data.history]);
      }
      
      setHasMore(result.data.pagination.page < result.data.pagination.total_pages);
    } catch (err: any) {
      setError(err.message || '加载历史记录失败');
    } finally {
      setLoading(false);
    }
  };
  
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadHistory(nextPage);
  };
  
  if (loading && history.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error && history.length === 0) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <p className="text-sm text-red-700">❌ {error}</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">📋 状态历史</h3>
      
      {/* 时间线 */}
      <div className="relative">
        {/* 垂直线 */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        
        {/* 历史项 */}
        <div className="space-y-4">
          {history.map((item, index) => (
            <StatusTimelineItem
              key={item.id}
              item={item}
              isLatest={index === 0}
            />
          ))}
        </div>
      </div>
      
      {/* 加载更多 */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
      
      {/* 没有更多 */}
      {!hasMore && history.length > 0 && (
        <p className="text-center text-sm text-gray-500 pt-4">
          已显示全部历史记录
        </p>
      )}
    </div>
  );
}

// ==================== 时间线项组件 ====================

function StatusTimelineItem({
  item,
  isLatest
}: {
  item: StatusHistoryItem;
  isLatest: boolean;
}) {
  return (
    <div className="relative flex items-start space-x-4">
      {/* 圆点 */}
      <div className={`
        relative z-10 w-8 h-8 rounded-full flex items-center justify-center
        ${isLatest ? 'ring-4 ring-offset-2' : ''}
        ${getRingClass(item.status_color)}
        ${getBackgroundClass(item.status_color)}
      `}>
        {isLatest && (
          <span className="text-white text-xs">✓</span>
        )}
      </div>
      
      {/* 内容卡片 */}
      <div className={`
        flex-1 rounded-lg border p-4
        ${isLatest ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}
      `}>
        {/* 头部 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className={`
              px-2 py-1 rounded text-xs font-medium
              ${getBadgeClass(item.status_color)}
            `}>
              {item.status_label.zh}
            </span>
            {isLatest && (
              <span className="text-xs text-blue-600 font-medium">当前状态</span>
            )}
          </div>
          
          <span className="text-xs text-gray-500">
            {formatDate(item.changed_at)}
          </span>
        </div>
        
        {/* 备注 */}
        {item.notes && (
          <p className="text-sm text-gray-700 mb-2">
            {item.notes}
          </p>
        )}
        
        {/* 元数据 */}
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <span>👤 {item.changed_by}</span>
          {item.notification_sent && (
            <span title="已发送通知">📬 已通知</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 辅助函数 ====================

function getRingClass(color: string): string {
  const ringClasses: Record<string, string> = {
    gray: 'ring-gray-400',
    blue: 'ring-blue-500',
    yellow: 'ring-yellow-500',
    purple: 'ring-purple-500',
    green: 'ring-green-500',
    red: 'ring-red-500'
  };
  
  return ringClasses[color] || 'ring-gray-400';
}

function getBackgroundClass(color: string): string {
  const bgClasses: Record<string, string> = {
    gray: 'bg-gray-400',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    red: 'bg-red-500'
  };
  
  return bgClasses[color] || 'bg-gray-400';
}

function getBadgeClass(color: string): string {
  const badgeClasses: Record<string, string> = {
    gray: 'bg-gray-200 text-gray-800',
    blue: 'bg-blue-200 text-blue-800',
    yellow: 'bg-yellow-200 text-yellow-800',
    purple: 'bg-purple-200 text-purple-800',
    green: 'bg-green-200 text-green-800',
    red: 'bg-red-200 text-red-800'
  };
  
  return badgeClasses[color] || 'bg-gray-200 text-gray-800';
}

function formatDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return timestamp;
  }
}
