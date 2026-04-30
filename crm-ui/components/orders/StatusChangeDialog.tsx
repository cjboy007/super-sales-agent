'use client';

/**
 * 状态变更确认弹窗
 * 
 * 功能：
 * - 显示状态变更信息
 * - 添加备注
 * - 选择是否发送通知
 * - 确认/取消操作
 */

import { useState } from 'react';
import { OrderStatus, OrderStatusLabels, getStatusTransitionReason } from '../../enums/order-status';

interface StatusChangeDialogProps {
  orderId: string;
  currentStatus: OrderStatus;
  newStatus: OrderStatus;
  onConfirm: (notes: string, sendNotification: boolean) => Promise<void>;
  onCancel: () => void;
}

export default function StatusChangeDialog({
  orderId,
  currentStatus,
  newStatus,
  onConfirm,
  onCancel
}: StatusChangeDialogProps) {
  const [notes, setNotes] = useState('');
  const [sendNotification, setSendNotification] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onConfirm(notes, sendNotification);
    } catch (err: any) {
      setError(err.message || '状态更新失败，请重试');
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onCancel}
      />
      
      {/* 弹窗内容 */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:max-w-lg sm:p-6">
          
          {/* 标题 */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              📦 确认状态变更
            </h3>
          </div>
          
          {/* 订单信息 */}
          <div className="mb-4 rounded-md bg-gray-50 p-4">
            <div className="text-sm text-gray-600">
              <p className="mb-2"><strong>订单编号：</strong>{orderId}</p>
              
              {/* 状态变更 */}
              <div className="flex items-center space-x-2 my-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(currentStatus)}`}>
                  {OrderStatusLabels[currentStatus].zh}
                </span>
                <span className="text-gray-400">→</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(newStatus)}`}>
                  {OrderStatusLabels[newStatus].zh}
                </span>
              </div>
              
              {/* 流转说明 */}
              <p className="text-xs text-gray-500 mt-2">
                {getStatusTransitionReason(currentStatus, newStatus)}
              </p>
            </div>
          </div>
          
          {/* 备注输入 */}
          <div className="mb-4">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              备注（可选）
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="添加变更说明，例如：客户确认交期、质检完成等"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          
          {/* 通知选项 */}
          <div className="mb-6">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                发送通知到 Discord 和飞书
              </span>
            </label>
          </div>
          
          {/* 错误提示 */}
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          
          {/* 操作按钮 */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className={`
                flex-1 rounded-md px-4 py-2 text-sm font-medium text-white
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                ${getStatusButtonClass(newStatus)}
              `}
            >
              {isSubmitting ? '处理中...' : '确认变更'}
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
}

// ==================== 辅助函数 ====================

/**
 * 获取状态徽章样式
 */
function getStatusBadgeClass(status: OrderStatus): string {
  const classes: Record<OrderStatus, string> = {
    [OrderStatus.PENDING_PRODUCTION]: 'bg-gray-200 text-gray-800',
    [OrderStatus.IN_PRODUCTION]: 'bg-blue-200 text-blue-800',
    [OrderStatus.READY_TO_SHIP]: 'bg-yellow-200 text-yellow-800',
    [OrderStatus.SHIPPED]: 'bg-purple-200 text-purple-800',
    [OrderStatus.COMPLETED]: 'bg-green-200 text-green-800',
    [OrderStatus.CANCELLED]: 'bg-red-200 text-red-800'
  };
  
  return classes[status] || 'bg-gray-100 text-gray-800';
}

/**
 * 获取按钮颜色
 */
function getStatusButtonClass(status: OrderStatus): string {
  const classes: Record<OrderStatus, string> = {
    [OrderStatus.PENDING_PRODUCTION]: 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500',
    [OrderStatus.IN_PRODUCTION]: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    [OrderStatus.READY_TO_SHIP]: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    [OrderStatus.SHIPPED]: 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500',
    [OrderStatus.COMPLETED]: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
    [OrderStatus.CANCELLED]: 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
  };
  
  return classes[status] || 'bg-gray-600 hover:bg-gray-700';
}
