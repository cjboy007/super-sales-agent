/**
 * 订单状态变更 API
 * 
 * POST /api/orders/[orderId]/status
 * - 变更订单状态
 * - 验证状态流转合法性
 * - 事务：更新 orders.status + 插入 order_status_history
 * - 发送通知（Discord + 飞书）
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../db/connection';
import { OrderStatus, isValidStatusTransition, getStatusTransitionReason, OrderStatusLabels } from '../../../../enums/order-status';
import { sendDiscordNotification, sendFeishuNotification } from '../../../../lib/utils/notification-service';

// ==================== 类型定义 ====================

interface UpdateStatusRequest {
  status: OrderStatus;
  notes?: string;
  skip_notification?: boolean;
}

// ==================== POST - 变更订单状态 ====================

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const orderId = (await params).orderId;
  
  try {
    const body = await request.json();
    const data: UpdateStatusRequest = body;
    
    // 验证必填字段
    if (!data.status) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_STATUS',
          message: '缺少状态字段'
        },
        { status: 400 }
      );
    }
    
    // 验证状态值是否合法
    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(data.status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_STATUS',
          message: `无效的状态值：${data.status}`
        },
        { status: 400 }
      );
    }
    
    // 查询当前订单状态
    const order: any = db.prepare(`
      SELECT * FROM orders 
      WHERE order_id = ? AND deleted_at IS NULL
    `).get(orderId);
    
    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: '订单不存在'
        },
        { status: 404 }
      );
    }
    
    const currentStatus = order.status as OrderStatus;
    const targetStatus = data.status;
    
    // 验证状态流转是否合法
    if (!isValidStatusTransition(currentStatus, targetStatus)) {
      const reason = getStatusTransitionReason(currentStatus, targetStatus);
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_STATUS_TRANSITION',
          message: reason,
          details: {
            current_status: OrderStatusLabels[currentStatus],
            target_status: OrderStatusLabels[targetStatus],
            allowed_transitions: getOrderStatusTransitions(currentStatus)
          }
        },
        { status: 400 }
      );
    }
    
    // 执行事务：更新订单状态 + 记录历史
    const updateOrder = db.transaction(() => {
      // 1. 更新订单状态
      const updateStmt = db.prepare(`
        UPDATE orders
        SET 
          status = ?,
          updated_at = ?
        WHERE order_id = ?
      `);
      
      updateStmt.run(targetStatus, new Date().toISOString(), orderId);
      
      // 2. 插入状态历史记录
      const historyStmt = db.prepare(`
        INSERT INTO order_status_history (
          order_id, 
          status, 
          changed_by, 
          notes, 
          notification_sent
        ) VALUES (?, ?, ?, ?, ?)
      `);
      
      const notes = data.notes || `状态更新：${OrderStatusLabels[currentStatus].zh} → ${OrderStatusLabels[targetStatus].zh}`;
      
      historyStmt.run(
        orderId,
        targetStatus,
        'user',
        notes,
        0  // 通知发送后更新
      );
      
      // 3. 获取状态历史记录 ID（用于更新 notification_sent）
      const historyId: any = db.prepare('SELECT last_insert_rowid() as id').get();
      
      return { historyId: historyId.id };
    });
    
    const { historyId } = updateOrder();
    
    // 4. 发送通知（可选）
    let notification_result = { discord: false, feishu: false };
    
    if (data.skip_notification !== true) {
      try {
        const notificationData = {
          order_id: orderId,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          old_status: currentStatus,
          new_status: targetStatus,
          changed_by: 'user',
          notes: data.notes,
          timestamp: new Date().toISOString()
        };
        
        // Discord 通知
        try {
          await sendDiscordNotification(notificationData);
          notification_result.discord = true;
        } catch (discordError) {
          console.error('Discord 通知发送失败:', discordError);
        }
        
        // 飞书通知
        try {
          await sendFeishuNotification(notificationData);
          notification_result.feishu = true;
        } catch (feishuError) {
          console.error('飞书通知发送失败:', feishuError);
        }
        
        // 更新 notification_sent 标记
        if (notification_result.discord || notification_result.feishu) {
          db.prepare(`
            UPDATE order_status_history
            SET notification_sent = ?
            WHERE id = ?
          `).run(1, historyId);
        }
      } catch (notificationError) {
        console.error('发送通知失败:', notificationError);
        // 通知失败不影响主流程
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        order_id: orderId,
        old_status: currentStatus,
        old_status_label: OrderStatusLabels[currentStatus],
        new_status: targetStatus,
        new_status_label: OrderStatusLabels[targetStatus],
        transition_reason: getStatusTransitionReason(currentStatus, targetStatus),
        notification_sent: notification_result,
        message: '订单状态更新成功'
      }
    });
    
  } catch (error: any) {
    console.error('POST /api/orders/[orderId]/status - 变更订单状态失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      },
      { status: 500 }
    );
  }
}

// ==================== 辅助函数 ====================

/**
 * 获取允许的状态流转列表
 */
function getOrderStatusTransitions(fromStatus: OrderStatus): string[] {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING_PRODUCTION]: [
      OrderStatus.IN_PRODUCTION,
      OrderStatus.CANCELLED
    ],
    [OrderStatus.IN_PRODUCTION]: [
      OrderStatus.READY_TO_SHIP,
      OrderStatus.CANCELLED
    ],
    [OrderStatus.READY_TO_SHIP]: [
      OrderStatus.SHIPPED,
      OrderStatus.CANCELLED
    ],
    [OrderStatus.SHIPPED]: [
      OrderStatus.COMPLETED
    ],
    [OrderStatus.COMPLETED]: [],
    [OrderStatus.CANCELLED]: []
  };
  
  return transitions[fromStatus]?.map(s => OrderStatusLabels[s].zh) || [];
}
