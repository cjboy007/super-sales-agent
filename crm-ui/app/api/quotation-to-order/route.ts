/**
 * 报价单转订单 API (Next.js App Router)
 * 
 * 功能:
 * 1. POST /api/quotation-to-order - 从报价单创建订单（一键转换）
 * 2. GET /api/quotation-to-order - 获取转换预览
 * 
 * 路径：/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/crm-ui/app/api/quotation-to-order/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../db/connection';
import { generateOrderNumber } from '../../../utils/order-number-generator';
import { matchOkkiCompany } from '../../../utils/okki-company-matcher';
import { createOrderTrail } from '../../../utils/okki-trail-writer';
import { OrderStatus } from '../../../enums/order-status';

// ==================== 类型定义 ====================

interface QuotationData {
  quotation_no: string;
  customer_name: string;
  customer_email: string;
  customer_company?: string;
  product_list: Array<{
    sku?: string;
    name: string;
    description?: string;
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
  status: string;
}

// ==================== GET - 获取转换预览 ====================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const quotation_no = searchParams.get('quotation_no');
    
    if (!quotation_no) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_QUOTATION_NO',
          message: '缺少报价单编号参数'
        },
        { status: 400 }
      );
    }
    
    // 查询报价单
    const quotation: any = db.prepare(`
      SELECT * FROM quotations 
      WHERE quotation_no = ? AND deleted_at IS NULL
    `).get(quotation_no);
    
    if (!quotation) {
      return NextResponse.json(
        {
          success: false,
          error: 'QUOTATION_NOT_FOUND',
          message: `报价单 ${quotation_no} 不存在`
        },
        { status: 404 }
      );
    }
    
    // 解析产品清单
    const product_list = typeof quotation.product_list === 'string'
      ? JSON.parse(quotation.product_list)
      : quotation.product_list;
    
    // 计算总金额
    const total_amount = quotation.total_amount || product_list.reduce((sum: number, p: any) => {
      return sum + (p.quantity * p.unit_price);
    }, 0);
    
    // 返回预览数据
    return NextResponse.json({
      success: true,
      data: {
        quotation_no: quotation.quotation_no,
        customer_name: quotation.customer_name,
        customer_email: quotation.customer_email,
        customer_company: quotation.customer_company,
        product_list,
        quantity: quotation.quantity || product_list.reduce((sum: number, p: any) => sum + p.quantity, 0),
        unit_price: quotation.unit_price || 0,
        total_amount,
        currency: quotation.currency || 'USD',
        delivery_date: quotation.delivery_date,
        shipping_address: quotation.shipping_address,
        notes: quotation.notes,
        can_convert: quotation.status === 'confirmed',
        current_status: quotation.status
      }
    });
    
  } catch (error: any) {
    console.error('GET /api/quotation-to-order - 预览转换失败:', error);
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

// ==================== POST - 从报价单创建订单 ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quotation_no, send_okki_trail = true } = body;
    
    if (!quotation_no) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_QUOTATION_NO',
          message: '缺少报价单编号'
        },
        { status: 400 }
      );
    }
    
    // 步骤 1: 查询报价单
    const quotation: any = db.prepare(`
      SELECT * FROM quotations 
      WHERE quotation_no = ? AND deleted_at IS NULL
    `).get(quotation_no);
    
    if (!quotation) {
      return NextResponse.json(
        {
          success: false,
          error: 'QUOTATION_NOT_FOUND',
          message: `报价单 ${quotation_no} 不存在`
        },
        { status: 404 }
      );
    }
    
    // 步骤 2: 验证报价单状态
    if (quotation.status !== 'confirmed') {
      return NextResponse.json(
        {
          success: false,
          error: 'QUOTATION_NOT_CONFIRMED',
          message: '报价单未确认，无法转换为订单',
          current_status: quotation.status
        },
        { status: 400 }
      );
    }
    
    // 步骤 3: 验证必填字段
    if (!quotation.customer_name || !quotation.customer_email || !quotation.delivery_date) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: '报价单缺少必填字段：customer_name, customer_email, delivery_date'
        },
        { status: 400 }
      );
    }
    
    // 解析产品清单
    const product_list = typeof quotation.product_list === 'string'
      ? JSON.parse(quotation.product_list)
      : quotation.product_list;
    
    if (!product_list || product_list.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'EMPTY_PRODUCT_LIST',
          message: '产品清单不能为空'
        },
        { status: 400 }
      );
    }
    
    // 步骤 4: 生成订单编号
    const order_id = await generateOrderNumber();
    
    // 步骤 5: 匹配 OKKI 客户
    let okki_company_id: string | null = null;
    let okki_match_type: string = 'none';
    
    try {
      const matchResult = await matchOkkiCompany(
        quotation.customer_email,
        quotation.customer_company,
        quotation.customer_name
      );
      
      if (matchResult) {
        okki_company_id = matchResult.company_id;
        okki_match_type = matchResult.match_type;
      }
    } catch (error) {
      console.error('OKKI 客户匹配失败:', error);
      // 不阻断流程，继续创建订单
    }
    
    // 步骤 6: 计算总金额
    const total_amount = quotation.total_amount || product_list.reduce((sum: number, p: any) => {
      return sum + (p.quantity * p.unit_price);
    }, 0);
    
    // 步骤 7: 构建订单对象
    const order = {
      order_id,
      quotation_no: quotation.quotation_no,
      okki_order_id: null,
      okki_company_id,
      customer_name: quotation.customer_name,
      customer_email: quotation.customer_email,
      customer_company: quotation.customer_company || null,
      quantity: quotation.quantity || product_list.reduce((sum: number, p: any) => sum + p.quantity, 0),
      unit_price: quotation.unit_price || 0,
      total_amount,
      currency: quotation.currency || 'USD',
      delivery_date: quotation.delivery_date,
      status: OrderStatus.PENDING_PRODUCTION,
      product_list: JSON.stringify(product_list),
      shipping_country: quotation.shipping_address?.country || null,
      shipping_state: quotation.shipping_address?.state || null,
      shipping_city: quotation.shipping_address?.city || null,
      shipping_address_line1: quotation.shipping_address?.address_line1 || null,
      shipping_address_line2: quotation.shipping_address?.address_line2 || null,
      shipping_postal_code: quotation.shipping_address?.postal_code || null,
      tracking_number: null,
      carrier: null,
      notes: quotation.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    };
    
    // 步骤 8: 插入数据库（使用事务）
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
        `订单由报价单 ${quotation.quotation_no} 转换创建`,
        0
      );
      
      // 更新报价单状态
      const updateQuotationStmt = db.prepare(`
        UPDATE quotations
        SET status = 'converted', updated_at = ?
        WHERE quotation_no = ?
      `);
      
      updateQuotationStmt.run(new Date().toISOString(), quotation.quotation_no);
    });
    
    insertOrder();
    
    // 步骤 9: 写入 OKKI 跟进记录（可选）
    let okki_trail_result: any = null;
    
    if (send_okki_trail && okki_company_id) {
      try {
        okki_trail_result = await createOrderTrail(okki_company_id, {
          uid: `order-${Date.now()}-${order_id}`,
          orderNo: order_id,
          date: new Date().toISOString().split('T')[0],
          totalAmount: `${order.currency} ${order.total_amount.toFixed(2)}`,
          deliveryDate: order.delivery_date,
          products: product_list.map((p: any) => ({
            name: p.name || p.description,
            quantity: p.quantity,
            unit_price: p.unit_price
          })),
          filePaths: [] // 可以在这里添加生成的 PDF 文件路径
        });
      } catch (error) {
        console.error('写入 OKKI 跟进记录失败:', error);
        // 不阻断流程
      }
    }
    
    // 返回结果
    return NextResponse.json(
      {
        success: true,
        data: {
          order_id: order.order_id,
          quotation_no: quotation.quotation_no,
          okki_company_id,
          okki_match_type,
          okki_trail_created: !!okki_trail_result?.success,
          okki_trail_id: okki_trail_result?.trail_id,
          message: '报价单已成功转换为订单'
        }
      },
      { status: 201 }
    );
    
  } catch (error: any) {
    console.error('POST /api/quotation-to-order - 报价单转订单失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
