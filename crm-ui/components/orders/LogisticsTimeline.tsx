'use client';

/**
 * 物流时间线组件
 * 
 * 功能：
 * - 显示物流事件时间线
 * - 按时间倒序排列
 * - 状态图标和颜色
 * - 地点、时间、描述
 */

interface LogisticsEvent {
  event_id: string;
  event_time: string;
  location?: string | null;
  description: string;
  status?: string | null;
  checkpoint_status?: string | null;
}

interface LogisticsTimelineProps {
  events: LogisticsEvent[];
  isLoading?: boolean;
}

export default function LogisticsTimeline({
  events,
  isLoading = false,
}: LogisticsTimelineProps) {
  // 状态颜色映射
  const statusColors: Record<string, string> = {
    pending: 'border-gray-300 bg-gray-100 text-gray-600',
    in_transit: 'border-blue-500 bg-blue-100 text-blue-600',
    customs_clearance: 'border-yellow-500 bg-yellow-100 text-yellow-600',
    out_for_delivery: 'border-purple-500 bg-purple-100 text-purple-600',
    delivered: 'border-green-500 bg-green-100 text-green-600',
    returning: 'border-orange-500 bg-orange-100 text-orange-600',
    returned: 'border-red-500 bg-red-100 text-red-600',
    lost: 'border-red-500 bg-red-100 text-red-600',
    customer_rejected: 'border-red-500 bg-red-100 text-red-600',
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

  // 格式化时间
  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-200"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">暂无物流记录</p>
        <p className="text-sm text-gray-400 mt-2">
          发货后将显示物流追踪信息
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        📋 物流时间线
      </h3>
      
      <div className="relative">
        {/* 时间线 */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        {/* 事件列表 */}
        <div className="space-y-6">
          {events.map((event, index) => {
            const status = event.status || 'in_transit';
            const colorClass = statusColors[status] || statusColors.in_transit;
            const icon = statusIcons[status] || '📍';

            return (
              <div key={event.event_id} className="relative flex gap-4">
                {/* 时间点 */}
                <div
                  className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${colorClass}`}
                >
                  <span className="text-sm">{icon}</span>
                </div>

                {/* 事件内容 */}
                <div className="flex-1 pb-6">
                  {/* 时间 */}
                  <div className="text-sm text-gray-500 mb-1">
                    {formatTime(event.event_time)}
                  </div>

                  {/* 描述 */}
                  <div className="text-sm text-gray-900 font-medium mb-1">
                    {event.description}
                  </div>

                  {/* 地点 */}
                  {event.location && (
                    <div className="text-xs text-gray-500">
                      📍 {event.location}
                    </div>
                  )}

                  {/* 状态标签 */}
                  {event.checkpoint_status && (
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {event.checkpoint_status}
                      </span>
                    </div>
                  )}
                </div>

                {/* 分隔线（最后一个事件不显示） */}
                {index < events.length - 1 && (
                  <div className="absolute left-4 top-8 bottom-0 w-px bg-gray-100"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
