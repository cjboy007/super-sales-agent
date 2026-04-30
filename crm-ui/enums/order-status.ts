/**
 * 订单状态枚举 (Order Status Enum)
 * 
 * 定义订单生命周期的 6 个核心状态
 */

export enum OrderStatus {
  /** 待生产 - 订单已确认，等待安排生产 */
  PENDING_PRODUCTION = 'pending_production',
  
  /** 生产中 - 正在生产制造 */
  IN_PRODUCTION = 'in_production',
  
  /** 待发货 - 生产完成，等待发货 */
  READY_TO_SHIP = 'ready_to_ship',
  
  /** 已发货 - 已交付物流 */
  SHIPPED = 'shipped',
  
  /** 已完成 - 客户已收货，订单完成 */
  COMPLETED = 'completed',
  
  /** 已取消 - 订单被取消 */
  CANCELLED = 'cancelled'
}

/**
 * 订单状态显示名称（中英文）
 */
export const OrderStatusLabels: Record<OrderStatus, { zh: string; en: string }> = {
  [OrderStatus.PENDING_PRODUCTION]: { zh: '待生产', en: 'Pending Production' },
  [OrderStatus.IN_PRODUCTION]: { zh: '生产中', en: 'In Production' },
  [OrderStatus.READY_TO_SHIP]: { zh: '待发货', en: 'Ready to Ship' },
  [OrderStatus.SHIPPED]: { zh: '已发货', en: 'Shipped' },
  [OrderStatus.COMPLETED]: { zh: '已完成', en: 'Completed' },
  [OrderStatus.CANCELLED]: { zh: '已取消', en: 'Cancelled' }
}

/**
 * 订单状态颜色（用于 UI 展示）
 */
export const OrderStatusColors: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PRODUCTION]: 'gray',
  [OrderStatus.IN_PRODUCTION]: 'blue',
  [OrderStatus.READY_TO_SHIP]: 'yellow',
  [OrderStatus.SHIPPED]: 'purple',
  [OrderStatus.COMPLETED]: 'green',
  [OrderStatus.CANCELLED]: 'red'
}

/**
 * 订单状态流转规则表
 * 
 * 定义哪些状态可以流转到哪些状态
 * key: 当前状态
 * value: 允许流转到的目标状态数组
 */
export const OrderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  // 待生产 → 生产中 / 已取消
  [OrderStatus.PENDING_PRODUCTION]: [
    OrderStatus.IN_PRODUCTION,
    OrderStatus.CANCELLED
  ],
  
  // 生产中 → 待发货 / 已取消
  [OrderStatus.IN_PRODUCTION]: [
    OrderStatus.READY_TO_SHIP,
    OrderStatus.CANCELLED
  ],
  
  // 待发货 → 已发货 / 已取消
  [OrderStatus.READY_TO_SHIP]: [
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED
  ],
  
  // 已发货 → 已完成
  [OrderStatus.SHIPPED]: [
    OrderStatus.COMPLETED
  ],
  
  // 已完成 → (无，终态)
  [OrderStatus.COMPLETED]: [],
  
  // 已取消 → (无，终态)
  [OrderStatus.CANCELLED]: []
}

/**
 * 检查状态流转是否合法
 * @param fromStatus 当前状态
 * @param toStatus 目标状态
 * @returns 是否允许流转
 */
export function isValidStatusTransition(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  const allowedTransitions = OrderStatusTransitions[fromStatus];
  return allowedTransitions?.includes(toStatus) ?? false;
}

/**
 * 获取状态流转的说明
 * @param fromStatus 当前状态
 * @param toStatus 目标状态
 * @returns 流转说明或 null
 */
export function getStatusTransitionReason(fromStatus: OrderStatus, toStatus: OrderStatus): string | null {
  if (!isValidStatusTransition(fromStatus, toStatus)) {
    return `不允许从 ${OrderStatusLabels[fromStatus].zh} 流转到 ${OrderStatusLabels[toStatus].zh}`;
  }
  
  if (toStatus === OrderStatus.CANCELLED) {
    return '订单被取消';
  }
  
  if (toStatus === OrderStatus.COMPLETED) {
    return '订单已完成';
  }
  
  return '正常流程流转';
}

/**
 * 终态检查
 * @param status 订单状态
 * @returns 是否为终态（不可再流转）
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED;
}
