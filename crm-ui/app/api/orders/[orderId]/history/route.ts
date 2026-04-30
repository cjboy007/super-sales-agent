/**
 * 订单状态历史查询 API
 * 
 * GET /api/orders/[orderId]/history
 * - 获取订单状态历史记录
 * - 支持分页
 * - 包含变更人、时间、备注等信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../db/connection';
import { OrderStatusLabels, OrderStatusColors } from '../../../../enums/order-status';

// ==================== GET - 获取状态历史 ====================

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const orderId = (await params).orderId;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    // 验证订单是否存在
    const order: any = db.prepare(`
      SELECT order_id, customer_name, customer_email, status 
      FROM orders 
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
    
    // 分页计算
    const offset = (page - 1) * limit;
    
    // 查询总数
    const countResult: any = db.prepare(`
      SELECT COUNT(*) as total 
      FROM order_status_history 
      WHERE order_id = ?
    `).get(orderId);
    
    // 查询历史记录（按时间倒序，最新的在前）
    const history = db.prepare(`
      SELECT 
        id,
        order_id,
        status,
        changed_at,
        changed_by,
        notes,
        notification_sent
      FROM order_status_history
      WHERE order_id = ?
      ORDER BY changed_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(orderId, limit, offset);
    
    // 格式化历史记录
    const formattedHistory = history.map((record: any) => ({
      id: record.id,
      order_id: record.order_id,
      status: record.status,
      status_label: OrderStatusLabels[record.status as keyof typeof OrderStatusLabels],
      status_color: OrderStatusColors[record.status as keyof typeof OrderStatusColors],
      changed_at: record.changed_at,
      changed_by: record.changed_by,
      notes: record.notes,
      notification_sent: record.notification_sent === 1
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        order: {
          order_id: order.order_id,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          current_status: order.status,
          current_status_label: OrderStatusLabels[order.status as keyof typeof OrderStatusLabels]
        },
        history: formattedHistory,
        pagination: {
          page,
          limit,
          total: countResult.total,
          total_pages: Math.ceil(countResult.total / limit)
        }
      }
    });
    
  } catch (error: any) {
    console.error('GET /api/orders/[orderId]/history - 查询状态历史失败:', error);
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
