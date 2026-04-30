/**
 * 订单物流管理 API (Next.js App Router)
 * 
 * 功能:
 * 1. GET /api/orders/[orderId]/logistics - 获取订单物流信息
 * 2. POST /api/orders/[orderId]/logistics - 录入/更新物流信息
 * 
 * 路径：/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/crm-ui/app/api/orders/[orderId]/logistics/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../db/connection';

// ==================== 类型定义 ====================

interface LogisticsRequest {
  tracking_number?: string;
  carrier?: string;
  carrier_name?: string;
  shipping_address?: {
    country?: string;
    state?: string;
    city?: string;
    address_line1?: string;
    address_line2?: string;
    postal_code?: string;
  };
  notes?: string;
  sync_to_17track?: boolean;
}

interface LogisticsEvent {
  event_id: string;
  event_time: string;
  location?: string;
  description: string;
  status?: string;
  checkpoint_status?: string;
}

// ==================== 辅助函数 ====================

/**
 * 获取订单物流信息（含事件时间线）
 */
function getOrderLogistics(orderId: string) {
  // 查询物流主记录
  const logistics = db.prepare(`
    SELECT * FROM order_logistics WHERE order_id = ?
  `).get(orderId) as any;

  if (!logistics) {
    return null;
  }

  // 查询物流事件时间线
  const events = db.prepare(`
    SELECT * FROM order_logistics_events 
    WHERE logistics_id = ? 
    ORDER BY event_time DESC
  `).all(logistics.id) as any[];

  return {
    ...logistics,
    events
  };
}

/**
 * 创建或更新物流记录
 */
function upsertLogistics(orderId: string, data: LogisticsRequest) {
  const existing = db.prepare(`
    SELECT * FROM order_logistics WHERE order_id = ?
  `).get(orderId) as any;

  const now = new Date().toISOString();

  if (existing) {
    // 更新现有记录
    const updateStmt = db.prepare(`
      UPDATE order_logistics SET
        tracking_number = ?,
        carrier = ?,
        carrier_name = ?,
        shipping_country = ?,
        shipping_state = ?,
        shipping_city = ?,
        shipping_address_line1 = ?,
        shipping_address_line2 = ?,
        shipping_postal_code = ?,
        notes = ?,
        updated_at = ?
      WHERE order_id = ?
    `);

    updateStmt.run(
      data.tracking_number || null,
      data.carrier || null,
      data.carrier_name || null,
      data.shipping_address?.country || null,
      data.shipping_address?.state || null,
      data.shipping_address?.city || null,
      data.shipping_address?.address_line1 || null,
      data.shipping_address?.address_line2 || null,
      data.shipping_address?.postal_code || null,
      data.notes || null,
      now,
      orderId
    );

    return getOrderLogistics(orderId);
  } else {
    // 创建新记录
    const insertStmt = db.prepare(`
      INSERT INTO order_logistics (
        order_id, tracking_number, carrier, carrier_name,
        shipping_country, shipping_state, shipping_city,
        shipping_address_line1, shipping_address_line2, shipping_postal_code,
        status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      orderId,
      data.tracking_number || null,
      data.carrier || null,
      data.carrier_name || null,
      data.shipping_address?.country || null,
      data.shipping_address?.state || null,
      data.shipping_address?.city || null,
      data.shipping_address?.address_line1 || null,
      data.shipping_address?.address_line2 || null,
      data.shipping_address?.postal_code || null,
      'pending',
      data.notes || null,
      now,
      now
    );

    return getOrderLogistics(orderId);
  }
}

/**
 * 添加物流事件
 */
function addLogisticsEvent(orderId: string, event: LogisticsEvent) {
  const logistics = db.prepare(`
    SELECT id FROM order_logistics WHERE order_id = ?
  `).get(orderId) as any;

  if (!logistics) {
    throw new Error('物流记录不存在');
  }

  const insertStmt = db.prepare(`
    INSERT INTO order_logistics_events (
      logistics_id, event_id, event_time, location, 
      description, status, checkpoint_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    logistics.id,
    event.event_id,
    event.event_time,
    event.location || null,
    event.description,
    event.status || null,
    event.checkpoint_status || null,
    new Date().toISOString()
  );

  // 更新物流主记录的状态
  if (event.status) {
    db.prepare(`
      UPDATE order_logistics SET 
        status = ?, 
        updated_at = datetime('now'),
        last_check_time = datetime('now')
      WHERE order_id = ?
    `).run(event.status, orderId);
  }

  return true;
}

// ==================== GET - 获取订单物流信息 ====================

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const orderId = params.orderId;

    // 验证订单是否存在
    const order = db.prepare(`
      SELECT order_id, customer_name, customer_email FROM orders 
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

    // 获取物流信息
    const logistics = getOrderLogistics(orderId);

    return NextResponse.json({
      success: true,
      data: {
        order_id: orderId,
        logistics,
        customer: {
          name: (order as any).customer_name,
          email: (order as any).customer_email
        }
      }
    });

  } catch (error: any) {
    console.error('GET /api/orders/[orderId]/logistics - 查询物流信息失败:', error);
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

// ==================== POST - 录入/更新物流信息 ====================

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const orderId = params.orderId;
    const body = await request.json();
    const data: LogisticsRequest = body;

    // 验证订单是否存在
    const order = db.prepare(`
      SELECT order_id FROM orders 
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

    // 验证必填字段
    if (!data.tracking_number && !data.carrier) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: '至少需要提供 tracking_number 或 carrier'
        },
        { status: 400 }
      );
    }

    // 更新物流记录
    const logistics = upsertLogistics(orderId, data);

    // 同步到 17Track（可选）
    let sync_result: any = null;
    if (data.sync_to_17track && data.tracking_number) {
      try {
        // TODO: 集成 logistics-tracker 的 registerTracking API
        // const { registerTracking } = await import('../../../../../lib/utils/logistics-integration');
        // sync_result = await registerTracking([data.tracking_number]);
        sync_result = { pending: '17Track 集成待实现' };
      } catch (error) {
        console.error('同步到 17Track 失败:', error);
        // 不阻断流程
      }
    }

    // 如果订单状态是 pending_production 且有运单号，更新为 ready_to_ship
    if (data.tracking_number) {
      const orderStatus = db.prepare(`
        SELECT status FROM orders WHERE order_id = ?
      `).get(orderId) as any;

      if (orderStatus?.status === 'pending_production') {
        db.prepare(`
          UPDATE orders SET status = 'ready_to_ship', updated_at = datetime('now')
          WHERE order_id = ?
        `).run(orderId);

        // 记录状态历史
        db.prepare(`
          INSERT INTO order_status_history (order_id, status, changed_by, notes, notification_sent)
          VALUES (?, ?, ?, ?, ?)
        `).run(orderId, 'ready_to_ship', 'system', '已录入运单号', 0);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          logistics,
          sync_to_17track: sync_result,
          message: '物流信息录入成功'
        }
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('POST /api/orders/[orderId]/logistics - 录入物流信息失败:', error);
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
