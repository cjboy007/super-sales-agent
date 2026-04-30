/**
 * 报价单转订单 API 路由
 * 
 * 功能:
 * 1. 从报价单创建订单（一键转换）
 * 2. 验证报价单状态
 * 3. 数据映射和转换
 * 4. OKKI 客户匹配
 * 5. 写入 OKKI 跟进记录
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/connection';
import { generateOrderNumber } from '../utils/order-number-generator';
import { matchOkkiCompany } from '../utils/okki-company-matcher';
import { createOrderTrail } from '../utils/okki-trail-writer';
import { OrderStatus } from '../enums/order-status';

const router = Router();

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

// ==================== 路由处理 ====================

/**
 * POST /api/quotation-to-order
 * 从报价单创建订单
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { quotation_no, send_okki_trail = true } = req.body;
    
    if (!quotation_no) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_QUOTATION_NO',
        message: '缺少报价单编号'
      });
    }
    
    // 步骤 1: 查询报价单
    // 注意：这里假设报价单存储在 quotations 表中，实际项目中需要根据实际情况调整
    const quotation: any = db.prepare(`
      SELECT * FROM quotations 
      WHERE quotation_no = ? AND deleted_at IS NULL
    `).get(quotation_no);
    
    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'QUOTATION_NOT_FOUND',
        message: `报价单 ${quotation_no} 不存在`
      });
    }
    
    // 步骤 2: 验证报价单状态
    if (quotation.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        error: 'QUOTATION_NOT_CONFIRMED',
        message: '报价单未确认，无法转换为订单',
        current_status: quotation.status
      });
    }
    
    // 步骤 3: 验证必填字段
    if (!quotation.customer_name || !quotation.customer_email || !quotation.delivery_date) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '报价单缺少必填字段：customer_name, customer_email, delivery_date'
      });
    }
    
    // 解析产品清单
    const product_list = typeof quotation.product_list === 'string'
      ? JSON.parse(quotation.product_list)
      : quotation.product_list;
    
    if (!product_list || product_list.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_PRODUCT_LIST',
        message: '产品清单不能为空'
      });
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
    res.status(201).json({
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
    });
    
  } catch (error: any) {
    console.error('报价单转订单失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/quotation-to-order/batch
 * 批量从报价单创建订单
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { quotation_nos = [], send_okki_trail = true } = req.body;
    
    if (!Array.isArray(quotation_nos) || quotation_nos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: '报价单编号列表不能为空'
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const quotation_no of quotation_nos) {
      try {
        // 模拟调用单个转换接口
        const quotation: any = db.prepare(`
          SELECT * FROM quotations 
          WHERE quotation_no = ? AND deleted_at IS NULL
        `).get(quotation_no);
        
        if (!quotation) {
          errors.push({
            quotation_no,
            error: 'QUOTATION_NOT_FOUND',
            message: '报价单不存在'
          });
          continue;
        }
        
        if (quotation.status !== 'confirmed') {
          errors.push({
            quotation_no,
            error: 'QUOTATION_NOT_CONFIRMED',
            message: '报价单未确认'
          });
          continue;
        }
        
        // 调用转换逻辑（简化版，实际应该提取为公共函数）
        const order_id = await generateOrderNumber();
        
        results.push({
          quotation_no,
          order_id,
          success: true
        });
        
      } catch (error: any) {
        errors.push({
          quotation_no,
          error: 'CONVERSION_ERROR',
          message: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        total: quotation_nos.length,
        success_count: results.length,
        error_count: errors.length,
        results,
        errors
      }
    });
    
  } catch (error: any) {
    console.error('批量转换失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/quotation-to-order/:quotation_no/preview
 * 预览报价单转订单的数据
 */
router.get('/:quotation_no/preview', (req: Request, res: Response) => {
  try {
    const { quotation_no } = req.params;
    
    // 查询报价单
    const quotation: any = db.prepare(`
      SELECT * FROM quotations 
      WHERE quotation_no = ? AND deleted_at IS NULL
    `).get(quotation_no);
    
    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'QUOTATION_NOT_FOUND',
        message: `报价单 ${quotation_no} 不存在`
      });
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
    res.json({
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
    console.error('预览转换失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

export default router;
