-- =====================================================
-- Migration: 002-add-logistics-payments.sql
-- Description: 扩展订单表 - 物流追踪 + 回款管理
-- Created: 2026-04-03
-- Author: Super Sales Agent CRM
-- =====================================================

-- -----------------------------------------------------
-- 表：order_logistics (订单物流追踪表)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS order_logistics (
  -- 主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 外键关联
  order_id TEXT NOT NULL UNIQUE,
  
  -- 运单信息
  tracking_number TEXT,                     -- 运单号
  carrier TEXT,                             -- 承运商 (dhl/fedex/ups/usps/sf/ems/aramex/tnt)
  carrier_name TEXT,                        -- 承运商显示名称
  
  -- 物流状态
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',                            -- 待发货
      'in_transit',                         -- 运输中
      'customs_clearance',                  -- 清关
      'out_for_delivery',                   -- 派送中
      'delivered',                          -- 已签收
      'returning',                          -- 退回中
      'returned',                           -- 已退回
      'lost',                               -- 丢失
      'customer_rejected'                   -- 客户拒收
    )
  ),
  
  -- 时间信息
  shipped_date TEXT,                        -- 发货日期
  estimated_delivery_date TEXT,             -- 预计送达日期
  actual_delivery_date TEXT,                -- 实际送达日期
  
  -- 收货地址
  shipping_country TEXT,
  shipping_state TEXT,
  shipping_city TEXT,
  shipping_address_line1 TEXT,
  shipping_address_line2 TEXT,
  shipping_postal_code TEXT,
  
  -- 17Track 集成
  last_check_time TEXT,                     -- 最后查询时间
  next_check_time TEXT,                     -- 下次查询时间
  check_count INTEGER DEFAULT 0,            -- 查询次数
  
  -- 备注
  notes TEXT,
  
  -- 时间戳
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- 外键约束
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- 表：order_logistics_events (物流事件时间线表)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS order_logistics_events (
  -- 主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 外键关联
  logistics_id INTEGER NOT NULL,
  
  -- 事件信息
  event_id TEXT NOT NULL,                   -- 17Track 事件 ID（用于去重）
  event_time TEXT NOT NULL,                 -- 事件发生时间
  location TEXT,                            -- 事件地点
  description TEXT NOT NULL,                -- 事件描述
  status TEXT,                              -- 事件对应的状态
  checkpoint_status TEXT,                   -- 17Track checkpoint 状态
  
  -- 元数据
  is_notified INTEGER DEFAULT 0,            -- 是否已通知客户
  notified_at TEXT,                         -- 通知时间
  
  -- 时间戳
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- 外键约束
  FOREIGN KEY (logistics_id) REFERENCES order_logistics(id) ON DELETE CASCADE,
  UNIQUE (logistics_id, event_id)           -- 防止重复事件
);

-- -----------------------------------------------------
-- 表：order_payments (订单回款记录表)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS order_payments (
  -- 主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 外键关联
  order_id TEXT NOT NULL,
  
  -- 回款信息
  payment_date TEXT NOT NULL,               -- 回款日期
  amount REAL NOT NULL DEFAULT 0,           -- 回款金额
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  payment_method TEXT CHECK (
    payment_method IS NULL OR
    payment_method IN (
      'tt',                                 -- 电汇
      'lc',                                 -- 信用证
      'paypal',
      'western_union',
      'credit_card',
      'alipay',
      'wechat_pay',
      'other'
    )
  ),
  payment_method_name TEXT,                 -- 支付方式显示名称
  
  -- 回款状态
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',                            -- 待确认
      'confirmed',                          -- 已确认
      'partial',                           -- 部分回款
      'overpaid',                          -- 超额付款
      'refunded',                          -- 已退款
      'cancelled'                          -- 已取消
    )
  ),
  
  -- 银行信息
  bank_name TEXT,
  bank_reference_no TEXT,                   -- 银行参考号
  
  -- 汇率信息
  exchange_rate REAL,                       -- 汇率（相对于 USD）
  amount_in_usd REAL,                       -- 折算后的 USD 金额
  
  -- 备注
  notes TEXT,
  
  -- 时间戳
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- 外键约束
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- 索引：order_logistics 表
-- -----------------------------------------------------

-- 订单 ID 查询优化
CREATE INDEX IF NOT EXISTS idx_logistics_order_id ON order_logistics(order_id);

-- 运单号查询优化
CREATE INDEX IF NOT EXISTS idx_logistics_tracking_number ON order_logistics(tracking_number);

-- 承运商查询优化
CREATE INDEX IF NOT EXISTS idx_logistics_carrier ON order_logistics(carrier);

-- 状态查询优化
CREATE INDEX IF NOT EXISTS idx_logistics_status ON order_logistics(status);

-- 最后查询时间优化（调度器查询）
CREATE INDEX IF NOT EXISTS idx_logistics_last_check ON order_logistics(last_check_time);

-- 下次查询时间优化（调度器查询）
CREATE INDEX IF NOT EXISTS idx_logistics_next_check ON order_logistics(next_check_time);

-- 复合索引：状态 + 最后查询时间（需要刷新的运单）
CREATE INDEX IF NOT EXISTS idx_logistics_status_check ON order_logistics(status, last_check_time);

-- -----------------------------------------------------
-- 索引：order_logistics_events 表
-- -----------------------------------------------------

-- 物流 ID 查询优化
CREATE INDEX IF NOT EXISTS idx_logistics_events_logistics_id ON order_logistics_events(logistics_id);

-- 事件时间排序优化
CREATE INDEX IF NOT EXISTS idx_logistics_events_time ON order_logistics_events(event_time DESC);

-- 复合索引：物流 ID + 事件时间（时间线查询）
CREATE INDEX IF NOT EXISTS idx_logistics_events_logistics_time ON order_logistics_events(logistics_id, event_time DESC);

-- 未通知事件查询优化
CREATE INDEX IF NOT EXISTS idx_logistics_events_notified ON order_logistics_events(is_notified) WHERE is_notified = 0;

-- -----------------------------------------------------
-- 索引：order_payments 表
-- -----------------------------------------------------

-- 订单 ID 查询优化
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON order_payments(order_id);

-- 回款日期查询优化
CREATE INDEX IF NOT EXISTS idx_payments_date ON order_payments(payment_date);

-- 状态查询优化
CREATE INDEX IF NOT EXISTS idx_payments_status ON order_payments(status);

-- 复合索引：订单 ID + 回款日期（订单回款历史）
CREATE INDEX IF NOT EXISTS idx_payments_order_date ON order_payments(order_id, payment_date);

-- 复合索引：状态 + 回款日期（待确认回款）
CREATE INDEX IF NOT EXISTS idx_payments_status_date ON order_payments(status, payment_date);

-- -----------------------------------------------------
-- 触发器：order_logistics 表更新时间戳
-- -----------------------------------------------------
CREATE TRIGGER IF NOT EXISTS update_order_logistics_updated_at
AFTER UPDATE ON order_logistics
BEGIN
  UPDATE order_logistics SET updated_at = datetime('now') WHERE order_id = NEW.order_id;
END;

-- -----------------------------------------------------
-- 触发器：order_payments 表更新时间戳
-- -----------------------------------------------------
CREATE TRIGGER IF NOT EXISTS update_order_payments_updated_at
AFTER UPDATE ON order_payments
BEGIN
  UPDATE order_payments SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- -----------------------------------------------------
-- 视图：logistics_with_events_count (物流统计视图)
-- -----------------------------------------------------
CREATE VIEW IF NOT EXISTS logistics_with_events_count AS
SELECT 
  ol.*,
  COUNT(ole.id) as event_count,
  MAX(ole.event_time) as last_event_time
FROM order_logistics ol
LEFT JOIN order_logistics_events ole ON ol.id = ole.logistics_id
GROUP BY ol.order_id;

-- -----------------------------------------------------
-- 视图：payments_by_order (订单回款汇总视图)
-- -----------------------------------------------------
CREATE VIEW IF NOT EXISTS payments_by_order AS
SELECT 
  order_id,
  COUNT(*) as payment_count,
  SUM(amount_in_usd) as total_paid_usd,
  MAX(payment_date) as last_payment_date,
  GROUP_CONCAT(
    CASE 
      WHEN status = 'confirmed' THEN amount_in_usd 
      ELSE 0 
    END
  ) as confirmed_amount_usd
FROM order_payments
GROUP BY order_id;

-- -----------------------------------------------------
-- 注释说明
-- -----------------------------------------------------
-- 
-- 使用方法：
-- 
-- 1. 创建物流记录：
--    INSERT INTO order_logistics (order_id, tracking_number, carrier, status) 
--    VALUES ('ORD-001', '1234567890', 'dhl', 'pending');
-- 
-- 2. 添加物流事件：
--    INSERT INTO order_logistics_events (logistics_id, event_id, event_time, description, status)
--    VALUES (1, 'evt_001', '2026-04-03T10:00:00Z', 'Shipment picked up', 'in_transit');
-- 
-- 3. 记录回款：
--    INSERT INTO order_payments (order_id, payment_date, amount, currency, payment_method, status)
--    VALUES ('ORD-001', '2026-04-03', 5000.00, 'USD', 'tt', 'confirmed');
-- 
-- 4. 查询订单物流：
--    SELECT * FROM order_logistics WHERE order_id = 'ORD-001';
-- 
-- 5. 查询物流时间线：
--    SELECT * FROM order_logistics_events 
--    WHERE logistics_id = (SELECT id FROM order_logistics WHERE order_id = 'ORD-001')
--    ORDER BY event_time DESC;
-- 
-- 6. 查询订单回款汇总：
--    SELECT * FROM payments_by_order WHERE order_id = 'ORD-001';
-- 
-- -----------------------------------------------------
