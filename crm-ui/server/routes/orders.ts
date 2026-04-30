/**
 * 订单管理 API 路由
 * 
 * 功能:
 * 1. 创建订单（手动）
 * 2. 查询订单列表
 * 3. 查询订单详情
 * 4. 更新订单状态
 * 5. 更新订单信息
 * 6. 删除订单（软删除）
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { generateUniqueOrderNumber, isValidOrderNumber } from '../utils/order-number-generator';
import { matchOkkiCompany } from '../utils/okki-company-matcher';
import { createOrderTrail } from '../utils/okki-trail-writer';
import { OrderStatus, isValidStatusTransition } from '../enums/order-status';

const router = Router();

// ==================== 类型定义 ====================

interface CreateOrderRequest {
  quotation_no?: string;
  okki_company_id?: string;
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

interface UpdateOrderStatusRequest {
  status: OrderStatus;
  notes?: string;
}

// ==================== 路由处理 ====================

/**
 * POST /api/orders
 * 创建订单（手动）
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateOrderRequest = req.body;
    
    // 验证必填字段
    if (!data.customer_name || !data.customer_email || !data.delivery_date) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少必填字段：customer_name, customer_email, delivery_date'
      });
    }
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.customer_email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL_FORMAT',
        message: '客户邮箱格式错误'
      });
    }
    
    // 验证产品清单
    if (!data.product_list || data.product_list.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_PRODUCT_LIST',
        message: '产品清单不能为空'
      });
    }
    
    // 生成订单编号
    const order_id = await generateUniqueOrderNumber();
    const send_okki_trail = data.send_okki_trail !== false;

    // 匹配 OKKI 客户（允许前端显式传入）
    let okki_company_id: string | null = data.okki_company_id || null;
    try {
      const matchResult = await matchOkkiCompany(
        data.customer_email,
        data.customer_company,
        data.customer_name
      );
      if (matchResult) {
        okki_company_id = matchResult.company_id;
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
    
    // 插入数据库
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

    let okki_trail_result: any = null;
    if (send_okki_trail && okki_company_id) {
      try {
        okki_trail_result = await createOrderTrail(okki_company_id, {
          uid: `manual-order-${order.order_id}`,
          orderNo: order.order_id,
          date: order.created_at.split('T')[0],
          totalAmount: `${order.currency} ${Number(order.total_amount).toFixed(2)}`,
          deliveryDate: order.delivery_date,
          products: data.product_list.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            unit_price: p.unit_price
          })),
          filePaths: []
        });
      } catch (trailError) {
        console.error('手动创建订单后写入 OKKI 跟进失败:', trailError);
      }
    }
    
    res.status(201).json({
      success: true,
      data: {
        order_id: order.order_id,
        okki_company_id,
        okki_match_type: okki_company_id ? 'auto' : 'manual_required',
        okki_trail_created: !!okki_trail_result?.success,
        okki_trail_id: okki_trail_result?.trail_id,
        message: '订单创建成功'
      }
    });
    
  } catch (error: any) {
    console.error('创建订单失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/orders
 * 查询订单列表
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const {
      status,
      okki_company_id,
      page = '1',
      limit = '20',
      sort = 'created_at_desc'
    } = req.query;
    
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
    else if (sort === 'delivery_date_asc') orderBy = 'delivery_date ASC';
    else if (sort === 'delivery_date_desc') orderBy = 'delivery_date DESC';
    
    // 分页
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    
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
    
    const orders = db.prepare(query).all(...params, limitNum, offset);
    
    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult.total,
          total_pages: Math.ceil(countResult.total / limitNum)
        }
      }
    });
    
  } catch (error: any) {
    console.error('查询订单列表失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/:orderId
 * 查询订单详情
 */
router.get('/:orderId', (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    // 查询订单
    const order: any = db.prepare('SELECT * FROM orders WHERE order_id = ? AND deleted_at IS NULL').get(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: '订单不存在'
      });
    }
    
    // 解析产品清单
    order.product_list = JSON.parse(order.product_list);
    
    // 查询状态历史
    const history = db.prepare(`
      SELECT * FROM order_status_history
      WHERE order_id = ?
      ORDER BY changed_at DESC
    `).all(orderId);
    
    res.json({
      success: true,
      data: {
        order,
        status_history: history
      }
    });
    
  } catch (error: any) {
    console.error('查询订单详情失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/orders/:orderId/status
 * 更新订单状态
 */
router.put('/:orderId/status', (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, notes }: UpdateOrderStatusRequest = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_STATUS',
        message: '缺少状态字段'
      });
    }
    
    // 查询当前订单状态
    const order: any = db.prepare('SELECT * FROM orders WHERE order_id = ? AND deleted_at IS NULL').get(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: '订单不存在'
      });
    }
    
    // 验证状态流转
    if (!isValidStatusTransition(order.status, status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS_TRANSITION',
        message: `不允许从 ${order.status} 流转到 ${status}`
      });
    }
    
    // 更新订单状态
    const updateStmt = db.prepare(`
      UPDATE orders
      SET status = ?, updated_at = ?
      WHERE order_id = ?
    `);
    
    updateStmt.run(status, new Date().toISOString(), orderId);
    
    // 记录状态历史
    const historyStmt = db.prepare(`
      INSERT INTO order_status_history (order_id, status, changed_by, notes, notification_sent)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    historyStmt.run(
      orderId,
      status,
      'user',
      notes || `状态更新：${order.status} → ${status}`,
      0
    );
    
    res.json({
      success: true,
      data: {
        order_id: orderId,
        old_status: order.status,
        new_status: status,
        message: '订单状态更新成功'
      }
    });
    
  } catch (error: any) {
    console.error('更新订单状态失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/orders/:orderId
 * 更新订单信息
 */
router.put('/:orderId', (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const data = req.body;
    
    // 查询订单
    const order: any = db.prepare('SELECT * FROM orders WHERE order_id = ? AND deleted_at IS NULL').get(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: '订单不存在'
      });
    }
    
    // 构建更新字段
    const updateFields: string[] = [];
    const updateParams: any[] = [];
    
    const allowedFields = [
      'customer_name', 'customer_email', 'customer_company',
      'quantity', 'unit_price', 'total_amount', 'currency',
      'delivery_date', 'product_list',
      'shipping_country', 'shipping_state', 'shipping_city',
      'shipping_address_line1', 'shipping_address_line2', 'shipping_postal_code',
      'tracking_number', 'carrier', 'notes'
    ];
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateParams.push(
          field === 'product_list' ? JSON.stringify(data[field]) : data[field]
        );
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_FIELDS_TO_UPDATE',
        message: '没有可更新的字段'
      });
    }
    
    // 添加 updated_at 和 order_id
    updateParams.push(new Date().toISOString(), orderId);
    
    // 执行更新
    const updateStmt = db.prepare(`
      UPDATE orders
      SET ${updateFields.join(', ')}, updated_at = ?
      WHERE order_id = ?
    `);
    
    updateStmt.run(...updateParams);
    
    res.json({
      success: true,
      data: {
        order_id: orderId,
        message: '订单信息更新成功'
      }
    });
    
  } catch (error: any) {
    console.error('更新订单信息失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/orders/:orderId
 * 删除订单（软删除）
 */
router.delete('/:orderId', (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    // 查询订单
    const order: any = db.prepare('SELECT * FROM orders WHERE order_id = ? AND deleted_at IS NULL').get(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: '订单不存在'
      });
    }
    
    // 软删除
    const deleteStmt = db.prepare(`
      UPDATE orders
      SET deleted_at = ?, updated_at = ?
      WHERE order_id = ?
    `);
    
    deleteStmt.run(new Date().toISOString(), new Date().toISOString(), orderId);
    
    res.json({
      success: true,
      data: {
        order_id: orderId,
        message: '订单已删除'
      }
    });
    
  } catch (error: any) {
    console.error('删除订单失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

export default router;
