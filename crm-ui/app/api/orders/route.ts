/**
 * 订单管理 API (Next.js App Router)
 * 
 * 功能:
 * 1. POST /api/orders - 创建订单
 * 2. GET /api/orders - 获取订单列表
 * 
 * 路径：/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/crm-ui/app/api/orders/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../db/connection';
import { generateOrderNumber, isValidOrderNumber } from '../../../utils/order-number-generator';
import { matchOkkiCompany } from '../../../utils/okki-company-matcher';
import { createOrderTrail } from '../../../utils/okki-trail-writer';
import { OrderStatus, isValidStatusTransition } from '../../../enums/order-status';

// ==================== 类型定义 ====================

interface CreateOrderRequest {
  quotation_no?: string;
  customer_name: string;
  customer_email: string;
  customer_company?: string;
  product_list: Array<{
    sku?: string;
    name: string;
    quantity: number;
    unit_price: number;
  }>;
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
  currency?: string;
  delivery_date: string;
  shipping_address?: {
    country?: string;
    state?: string;
    city?: string;
    address_line1?: string;
    address_line2?: string;
    postal_code?: string;
  };
  notes?: string;
  send_okki_trail?: boolean;
}

// ==================== GET - 获取订单列表 ====================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const okki_company_id = searchParams.get('okki_company_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sort = searchParams.get('sort') || 'created_at_desc';
    
    // 构建查询条件
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (okki_company_id) {
      conditions.push('okki_company_id = ?');
      params.push(okki_company_id);
    }
    
    // 构建排序
    let orderBy = 'created_at DESC';
    if (sort === 'created_at_asc') orderBy = 'created_at ASC';
    else if (sort === 'created_at_desc') orderBy = 'created_at DESC';
    else if (sort === 'delivery_date_asc') orderBy = 'delivery_date ASC';
    else if (sort === 'delivery_date_desc') orderBy = 'delivery_date DESC';
    else if (sort === 'total_amount_asc') orderBy = 'total_amount ASC';
    else if (sort === 'total_amount_desc') orderBy = 'total_amount DESC';
    
    // 分页
    const offset = (page - 1) * limit;
    
    // 查询总数
    const countQuery = `SELECT COUNT(*) as total FROM orders WHERE ${conditions.join(' AND ')}`;
    const countResult: any = db.prepare(countQuery).get(...params);
    
    // 查询数据
    const query = `
      SELECT * FROM orders
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    
    const orders = db.prepare(query).all(...params, limit, offset);
    
    return NextResponse.json({
      success: true,
      data: {
        orders,
        pagination: {
          page,
          limit,
          total: countResult.total,
          total_pages: Math.ceil(countResult.total / limit)
        }
      }
    });
    
  } catch (error: any) {
    console.error('GET /api/orders - 查询订单列表失败:', error);
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

// ==================== POST - 创建订单 ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data: CreateOrderRequest = body;
    
    // 验证必填字段
    if (!data.customer_name || !data.customer_email || !data.delivery_date) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: '缺少必填字段：customer_name, customer_email, delivery_date'
        },
        { status: 400 }
      );
    }
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.customer_email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_EMAIL_FORMAT',
          message: '客户邮箱格式错误'
        },
        { status: 400 }
      );
    }
    
    // 验证产品清单
    if (!data.product_list || data.product_list.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'EMPTY_PRODUCT_LIST',
          message: '产品清单不能为空'
        },
        { status: 400 }
      );
    }
    
    // 生成订单编号
    const order_id = await generateOrderNumber();
    
    // 匹配 OKKI 客户
    let okki_company_id: string | null = null;
    let okki_match_type: string = 'none';
    
    try {
      const matchResult = await matchOkkiCompany(
        data.customer_email,
        data.customer_company,
        data.customer_name
      );
      if (matchResult) {
        okki_company_id = matchResult.company_id;
        okki_match_type = matchResult.match_type;
      }
    } catch (error) {
      console.error('OKKI 客户匹配失败:', error);
      // 不阻断流程，继续创建订单
    }
    
    // 计算总金额
    const total_amount = data.total_amount || data.product_list.reduce((sum, p) => {
      return sum + (p.quantity * p.unit_price);
    }, 0);
    
    // 构建订单对象
    const order = {
      order_id,
      quotation_no: data.quotation_no || null,
      okki_order_id: null,
      okki_company_id,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      customer_company: data.customer_company || null,
      quantity: data.quantity || data.product_list.reduce((sum, p) => sum + p.quantity, 0),
      unit_price: data.unit_price || 0,
      total_amount,
      currency: data.currency || 'USD',
      delivery_date: data.delivery_date,
      status: OrderStatus.PENDING_PRODUCTION,
      product_list: JSON.stringify(data.product_list),
      shipping_country: data.shipping_address?.country || null,
      shipping_state: data.shipping_address?.state || null,
      shipping_city: data.shipping_address?.city || null,
      shipping_address_line1: data.shipping_address?.address_line1 || null,
      shipping_address_line2: data.shipping_address?.address_line2 || null,
      shipping_postal_code: data.shipping_address?.postal_code || null,
      tracking_number: null,
      carrier: null,
      notes: data.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    };
    
    // 插入数据库（使用事务）
    const insertOrder = db.transaction(() => {
      // 插入订单
      const stmt = db.prepare(`
        INSERT INTO orders (
          order_id, quotation_no, okki_order_id, okki_company_id,
          customer_name, customer_email, customer_company,
          quantity, unit_price, total_amount, currency,
          delivery_date, status, product_list,
          shipping_country, shipping_state, shipping_city,
          shipping_address_line1, shipping_address_line2, shipping_postal_code,
          tracking_number, carrier, notes,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        order.order_id, order.quotation_no, order.okki_order_id, order.okki_company_id,
        order.customer_name, order.customer_email, order.customer_company,
        order.quantity, order.unit_price, order.total_amount, order.currency,
        order.delivery_date, order.status, order.product_list,
        order.shipping_country, order.shipping_state, order.shipping_city,
        order.shipping_address_line1, order.shipping_address_line2, order.shipping_postal_code,
        order.tracking_number, order.carrier, order.notes,
        order.created_at, order.updated_at, order.deleted_at
      );
      
      // 记录状态历史
      const historyStmt = db.prepare(`
        INSERT INTO order_status_history (order_id, status, changed_by, notes, notification_sent)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      historyStmt.run(
        order.order_id,
        order.status,
        'system',
        '订单创建',
        0
      );
    });
    
    insertOrder();
    
    // 写入 OKKI 跟进记录（可选）
    let okki_trail_result: any = null;
    
    if (data.send_okki_trail !== false && okki_company_id) {
      try {
        okki_trail_result = await createOrderTrail(okki_company_id, {
          uid: `order-${Date.now()}-${order_id}`,
          orderNo: order_id,
          date: new Date().toISOString().split('T')[0],
          totalAmount: `${order.currency} ${total_amount.toFixed(2)}`,
          deliveryDate: order.delivery_date,
          products: data.product_list.map(p => ({
            name: p.name,
            quantity: p.quantity,
            unit_price: p.unit_price
          })),
          filePaths: []
        });
      } catch (error) {
        console.error('写入 OKKI 跟进记录失败:', error);
        // 不阻断流程
      }
    }
    
    return NextResponse.json(
      {
        success: true,
        data: {
          order_id: order.order_id,
          okki_company_id,
          okki_match_type,
          okki_trail_created: !!okki_trail_result?.success,
          okki_trail_id: okki_trail_result?.trail_id,
          message: '订单创建成功'
        }
      },
      { status: 201 }
    );
    
  } catch (error: any) {
    console.error('POST /api/orders - 创建订单失败:', error);
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
