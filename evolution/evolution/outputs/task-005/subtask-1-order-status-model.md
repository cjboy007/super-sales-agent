# 订单状态模型 (Order Status Model)

## 订单生命周期状态枚举

| 状态 Key | 中文名称 | 说明 |
|----------|----------|------|
| `pending_production` | 待生产 | 订单已确认，等待安排生产 |
| `in_production` | 生产中 | 订单正在生产中 |
| `ready_to_ship` | 待发货 | 生产完成，等待发货 |
| `shipped` | 已发货 | 已发货，运输中 |
| `completed` | 已完成 | 客户已收货，订单完成 |
| `cancelled` | 已取消 | 订单已取消 |

## 状态流转规则

```
pending_production → in_production → ready_to_ship → shipped → completed
       ↓                    ↓              ↓
   cancelled            cancelled      cancelled
```

### 允许的状态转换

| 当前状态 | 允许转换到的状态 | 触发条件 |
|----------|------------------|----------|
| `pending_production` | `in_production` | 生产计划确认 |
| `pending_production` | `cancelled` | 客户取消或内部决定取消 |
| `in_production` | `ready_to_ship` | 生产完成，质检通过 |
| `in_production` | `cancelled` | 客户取消或生产异常 |
| `ready_to_ship` | `shipped` | 物流揽收，获取运单号 |
| `ready_to_ship` | `cancelled` | 客户取消（罕见） |
| `shipped` | `completed` | 客户确认收货 |
| `shipped` | `cancelled` | 退货/退款（罕见，需特殊处理） |
| `completed` | — | 终态，不可转换 |
| `cancelled` | — | 终态，不可转换 |

## 客户通知模板触发条件

| 状态转换 | 通知模板 | 触发时机 | 通知渠道 |
|----------|----------|----------|----------|
| `pending_production` → `in_production` | `order_production_started` | 生产开始时 | 邮件 |
| `in_production` → `ready_to_ship` | `order_ready_to_ship` | 生产完成时 | 邮件 |
| `ready_to_ship` → `shipped` | `order_shipped` | 发货时（附运单号） | 邮件 |
| `shipped` → `completed` | `order_completed` | 确认收货时 | 邮件 |
| `*` → `cancelled` | `order_cancelled` | 取消时 | 邮件 |

## 订单数据结构 (JSON Schema)

详见 `order-schema.json` 文件。

### 核心字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `order_id` | string | 是 | 订单唯一标识（UUID 或自定义编号） |
| `customer_name` | string | 是 | 客户名称 |
| `customer_email` | string | 是 | 客户邮箱（用于通知） |
| `product_list` | array | 是 | 产品清单（含 SKU、名称、数量、单价） |
| `quantity` | integer | 是 | 总数量 |
| `unit_price` | number | 是 | 单价 |
| `currency` | string | 是 | 货币单位（USD/CNY/EUR 等） |
| `delivery_date` | string | 是 | 预计交期（ISO 8601 日期） |
| `status` | string | 是 | 当前状态（见状态枚举） |
| `status_history` | array | 是 | 状态变更历史记录 |
| `created_at` | string | 是 | 订单创建时间 |
| `updated_at` | string | 是 | 最后更新时间 |
| `notes` | string | 否 | 备注信息 |

### 状态历史记录结构

```json
{
  "status": "in_production",
  "changed_at": "2026-03-24T10:00:00+08:00",
  "changed_by": "manual",
  "notes": "生产计划确认，开始生产"
}
```

## 文件输出

- 状态模型文档：`subtask-1-order-status-model.md`（本文件）
- JSON Schema：`order-schema.json`

---

**版本：** 1.0  
**创建日期：** 2026-03-24  
**任务：** task-005 (订单管理：本地订单跟踪 + 状态管理 + 客户通知)
