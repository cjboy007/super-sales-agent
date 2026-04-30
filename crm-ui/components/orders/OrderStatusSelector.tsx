'use client';

/**
 * 订单状态下拉选择器
 * 
 * 功能：
 * - 显示当前状态
 * - 提供合法的状态流转选项
 * - 禁止选择终态（已完成/已取消）的非法流转
 */

import { OrderStatus, OrderStatusLabels, OrderStatusColors, isValidStatusTransition } from '../../enums/order-status';

interface OrderStatusSelectorProps {
  currentStatus: OrderStatus;
  onStatusChange: (newStatus: OrderStatus) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function OrderStatusSelector({
  currentStatus,
  onStatusChange,
  disabled = false,
  size = 'md'
}: OrderStatusSelectorProps) {
  // 获取允许的状态流转选项
  const allowedTransitions = getAllowedTransitions(currentStatus);
  
  // 尺寸映射
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2 text-base'
  };
  
  return (
    <div className="relative inline-block">
      <select
        value={currentStatus}
        onChange={(e) => onStatusChange(e.target.value as OrderStatus)}
        disabled={disabled || allowedTransitions.length === 0}
        className={`
          ${sizeClasses[size]}
          rounded-md
          border-2
          font-medium
          transition-all
          duration-200
          focus:outline-none
          focus:ring-2
          focus:ring-offset-2
          disabled:opacity-50
          disabled:cursor-not-allowed
          ${getSelectBorderClass(currentStatus)}
          ${getSelectBackgroundClass(currentStatus)}
        `}
      >
        {/* 当前状态 */}
        <option value={currentStatus}>
          {OrderStatusLabels[currentStatus].zh} (当前)
        </option>
        
        {/* 允许流转的状态 */}
        {allowedTransitions.map((status) => (
          <option key={status} value={status}>
            → {OrderStatusLabels[status].zh}
          </option>
        ))}
        
        {/* 无可用选项时的提示 */}
        {allowedTransitions.length === 0 && (
          <option disabled>
            {currentStatus === OrderStatus.COMPLETED ? '✓ 订单已完成' : '✗ 订单已取消'}
          </option>
        )}
      </select>
      
      {/* 终态提示 */}
      {allowedTransitions.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">
          {currentStatus === OrderStatus.COMPLETED 
            ? '订单已完成，无法继续流转' 
            : '订单已取消，无法继续流转'}
        </p>
      )}
    </div>
  );
}

// ==================== 辅助函数 ====================

/**
 * 获取允许的状态流转选项
 */
function getAllowedTransitions(currentStatus: OrderStatus): OrderStatus[] {
  const allStatuses = Object.values(OrderStatus);
  return allStatuses.filter(status => 
    status !== currentStatus && isValidStatusTransition(currentStatus, status)
  );
}

/**
 * 获取选择器边框颜色
 */
function getSelectBorderClass(status: OrderStatus): string {
  const borderClasses: Record<OrderStatus, string> = {
    [OrderStatus.PENDING_PRODUCTION]: 'border-gray-400',
    [OrderStatus.IN_PRODUCTION]: 'border-blue-500',
    [OrderStatus.READY_TO_SHIP]: 'border-yellow-500',
    [OrderStatus.SHIPPED]: 'border-purple-500',
    [OrderStatus.COMPLETED]: 'border-green-500',
    [OrderStatus.CANCELLED]: 'border-red-500'
  };
  
  return borderClasses[status] || 'border-gray-300';
}

/**
 * 获取选择器背景颜色
 */
function getSelectBackgroundClass(status: OrderStatus): string {
  const bgClasses: Record<OrderStatus, string> = {
    [OrderStatus.PENDING_PRODUCTION]: 'bg-gray-50 hover:bg-gray-100',
    [OrderStatus.IN_PRODUCTION]: 'bg-blue-50 hover:bg-blue-100',
    [OrderStatus.READY_TO_SHIP]: 'bg-yellow-50 hover:bg-yellow-100',
    [OrderStatus.SHIPPED]: 'bg-purple-50 hover:bg-purple-100',
    [OrderStatus.COMPLETED]: 'bg-green-50 hover:bg-green-100',
    [OrderStatus.CANCELLED]: 'bg-red-50 hover:bg-red-100'
  };
  
  return bgClasses[status] || 'bg-white';
}
