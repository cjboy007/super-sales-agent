-- =====================================================
-- Migration: 001-create-orders-table.sql
-- Description: 创建订单主表 + 订单状态历史表
-- Created: 2026-04-03
-- Author: Super Sales Agent CRM
-- =====================================================

-- -----------------------------------------------------
-- 表：orders (订单主表)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  -- 主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  
  -- OKKI 集成字段
  quotation_no TEXT,                    -- 关联报价单编号
  okki_order_id TEXT,                   -- OKKI 订单 ID
  okki_company_id TEXT,                 -- OKKI 客户公司 ID
  
  -- 客户信息
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_company TEXT,
  
  -- 订单金额
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  
  -- 交期
  delivery_date TEXT NOT NULL,          -- ISO 8601 日期格式：YYYY-MM-DD
  
  -- 订单状态
  status TEXT NOT NULL DEFAULT 'pending_production' CHECK (
    status IN (
      'pending_production',
      'in_production',
      'ready_to_ship',
      'shipped',
      'completed',
      'cancelled'
    )
  ),
  
  -- 产品清单 (JSON 格式存储)
  product_list TEXT NOT NULL,           -- JSON 数组：[{sku, name, quantity, unit_price, ...}]
  
  -- 收货地址
  shipping_country TEXT,
  shipping_state TEXT,
  shipping_city TEXT,
  shipping_address_line1 TEXT,
  shipping_address_line2 TEXT,
  shipping_postal_code TEXT,
  
  -- 物流信息
  tracking_number TEXT,
  carrier TEXT,
  
  -- 备注
  notes TEXT,
  
  -- 时间戳
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- 软删除标记
  deleted_at TEXT,
  
  -- 约束
  CONSTRAINT chk_order_id_format CHECK (order_id GLOB 'ORD-*' OR order_id GLOB '*-*-*'),
  CONSTRAINT chk_quotation_no_format CHECK (quotation_no IS NULL OR quotation_no GLOB 'QT-*'),
  CONSTRAINT chk_email_format CHECK (customer_email LIKE '%@%.%'),
  CONSTRAINT chk_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT chk_total_amount_non_negative CHECK (total_amount IS NULL OR total_amount >= 0)
);

-- -----------------------------------------------------
-- 表：order_status_history (订单状态历史表)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS order_status_history (
  -- 主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 外键关联
  order_id TEXT NOT NULL,
  
  -- 状态信息
  status TEXT NOT NULL CHECK (
    status IN (
      'pending_production',
      'in_production',
      'ready_to_ship',
      'shipped',
      'completed',
      'cancelled'
    )
  ),
  
  -- 变更元数据
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_by TEXT NOT NULL DEFAULT 'system',
  
  -- 备注和通知
  notes TEXT,
  notification_sent INTEGER NOT NULL DEFAULT 0,  -- 0=false, 1=true
  
  -- 外键约束
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- 索引：orders 表
-- -----------------------------------------------------

-- 状态查询优化（常用筛选条件）
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- OKKI 客户公司 ID 查询优化（关联客户）
CREATE INDEX IF NOT EXISTS idx_orders_okki_company_id ON orders(okki_company_id);

-- 订单 ID 查询优化（精确查找）
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);

-- 报价单编号查询优化（报价单转订单）
CREATE INDEX IF NOT EXISTS idx_orders_quotation_no ON orders(quotation_no);

-- OKKI 订单 ID 查询优化（同步查询）
CREATE INDEX IF NOT EXISTS idx_orders_okki_order_id ON orders(okki_order_id);

-- 创建时间排序优化（列表展示）
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 交期查询优化（即将到期订单）
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);

-- 复合索引：状态 + 创建时间（常用组合查询）
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders(status, created_at DESC);

-- 复合索引：客户公司 + 状态（客户订单筛选）
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON orders(okki_company_id, status);

-- -----------------------------------------------------
-- 索引：order_status_history 表
-- -----------------------------------------------------

-- 订单 ID 查询优化（查看某订单的历史）
CREATE INDEX IF NOT EXISTS idx_status_history_order_id ON order_status_history(order_id);

-- 变更时间排序优化（时间线展示）
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON order_status_history(changed_at DESC);

-- 复合索引：订单 ID + 变更时间（按时间顺序获取历史）
CREATE INDEX IF NOT EXISTS idx_status_history_order_changed ON order_status_history(order_id, changed_at DESC);

-- -----------------------------------------------------
-- 触发器：orders 表更新时间戳
-- -----------------------------------------------------
CREATE TRIGGER IF NOT EXISTS update_orders_updated_at
AFTER UPDATE ON orders
BEGIN
  UPDATE orders SET updated_at = datetime('now') WHERE order_id = NEW.order_id;
END;

-- -----------------------------------------------------
-- 视图：orders_with_status_count (订单统计视图)
-- -----------------------------------------------------
CREATE VIEW IF NOT EXISTS orders_with_status_count AS
SELECT 
  o.*,
  COUNT(osh.id) as status_change_count,
  MAX(osh.changed_at) as last_status_change_at
FROM orders o
LEFT JOIN order_status_history osh ON o.order_id = osh.order_id
WHERE o.deleted_at IS NULL
GROUP BY o.order_id;

-- -----------------------------------------------------
-- 注释说明
-- -----------------------------------------------------
-- 
-- 使用方法：
-- 1. 创建订单：INSERT INTO orders (order_id, customer_name, customer_email, ...) VALUES (...)
-- 2. 更新状态：UPDATE orders SET status = 'in_production' WHERE order_id = 'ORD-xxx'
-- 3. 记录历史：INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (...)
-- 4. 查询订单：SELECT * FROM orders WHERE deleted_at IS NULL
-- 5. 查询历史：SELECT * FROM order_status_history WHERE order_id = 'ORD-xxx' ORDER BY changed_at DESC
--
-- 软删除：UPDATE orders SET deleted_at = datetime('now') WHERE order_id = 'ORD-xxx'
-- 恢复删除：UPDATE orders SET deleted_at = NULL WHERE order_id = 'ORD-xxx'
--
-- -----------------------------------------------------
