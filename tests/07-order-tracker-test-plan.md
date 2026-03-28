# 订单追踪测试方案 (order-tracker)

---

## 测试目标

验证订单状态监控的准确性、状态流转正确性和通知及时性。

---

## 模块概述

**核心文件：**
- `skills/order-tracker/scripts/update-order-status.js` - 状态更新
- `skills/order-tracker/scripts/send-order-notification.js` - 通知发送
- `skills/order-tracker/scripts/order-dashboard.js` - 仪表板
- `skills/order-tracker/test/smoke-test.sh` - 冒烟测试

**依赖：**
- OKKI CRM API
- 物流追踪模块（可选）

---

## 1. 单元测试

### 1.1 订单状态测试

| 测试用例 | 输入状态 | 预期结果 | 通过标准 |
|---------|---------|---------|---------|
| TC-STATUS-001 | pending → confirmed | 状态更新成功 | OKKI 同步 |
| TC-STATUS-002 | confirmed → production | 状态更新成功 | 时间戳记录 |
| TC-STATUS-003 | production → qc | 状态更新成功 | QC 日期记录 |
| TC-STATUS-004 | qc → shipped | 状态更新成功 | 物流号必填 |
| TC-STATUS-005 | shipped → delivered | 状态更新成功 | 签收日期 |
| TC-STATUS-006 | 任意 → cancelled | 状态更新成功 | 取消原因 |

### 1.2 状态验证测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-VALIDATE-001 | 无效状态跳转 | 拒绝更新 | 错误提示 |
| TC-VALIDATE-002 | 缺少必填字段 | 拒绝更新 | 字段提示 |
| TC-VALIDATE-003 | 物流号格式错误 | 拒绝更新 | 格式验证 |
| TC-VALIDATE-004 | 日期逻辑错误 | 拒绝更新 | 日期验证 |
| TC-VALIDATE-005 | 订单不存在 | 拒绝更新 | 错误提示 |

### 1.3 通知生成测试

| 测试用例 | 触发条件 | 预期通知 | 通过标准 |
|---------|---------|---------|---------|
| TC-NOTIFY-001 | 订单确认 | 发送客户 | 邮件/WhatsApp |
| TC-NOTIFY-002 | 开始生产 | 发送客户 | 进度更新 |
| TC-NOTIFY-003 | 质检完成 | 发送客户 | 质检报告 |
| TC-NOTIFY-004 | 已发货 | 发送客户 | 物流信息 |
| TC-NOTIFY-005 | 已签收 | 发送销售 | 确认跟进 |

### 1.4 OKKI 同步测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-OKKI-001 | 状态更新 | OKKI 订单更新 | 字段一致 |
| TC-OKKI-002 | 添加备注 | OKKI trail 创建 | trail_type 正确 |
| TC-OKKI-003 | 上传文件 | OKKI 附件上传 | 文件可下载 |
| TC-OKKI-004 | API 异常 | 本地缓存 | 重试机制 |

---

## 2. 集成测试

### 2.1 完整订单生命周期

**测试场景：** 订单从创建到完成

**状态流转：**
```
pending → confirmed → production → qc → shipped → delivered
```

**预期流程：**
1. 订单创建（pending）
2. 定金收到（confirmed）
3. 开始生产（production）
4. 质检完成（qc）
5. 发货（shipped + 物流号）
6. 客户签收（delivered）

**通过标准：** 状态流转正确，通知及时

### 2.2 与物流追踪集成

**测试场景：** 发货后自动追踪

**预期流程：**
1. 订单状态 → shipped
2. 自动调用 logistics-tracker
3. 定期查询物流状态
4. 更新订单状态

**通过标准：** 物流状态自动同步

### 2.3 与售后管理集成

**测试场景：** 订单完成后自动创建售后任务

**预期流程：**
1. 订单状态 → delivered
2. 创建售后跟进任务（7 天后）
3. 询问客户满意度

**通过标准：** 售后任务正确创建

---

## 3. 端到端测试

### 3.1 E2E-001: 标准订单流程

**步骤：**
1. 客户确认订单
2. 定金支付
3. 订单状态 → confirmed
4. 生产开始
5. 质检完成
6. 发货
7. 客户签收
8. 售后跟进

**预期结果：** 全流程自动化

### 3.2 E2E-002: 订单变更流程

**步骤：**
1. 订单已确认
2. 客户要求修改数量
3. 更新订单
4. 重新确认
5. 继续生产

**预期结果：** 变更正确处理

### 3.3 E2E-003: 订单取消流程

**步骤：**
1. 订单生产中
2. 客户取消
3. 确认取消原因
4. 状态 → cancelled
5. 处理退款

**预期结果：** 取消流程完整

---

## 4. 边界条件测试

| 测试用例 | 场景 | 预期处理 |
|---------|------|---------|
| TC-BOUND-001 | 重复状态更新 | 忽略或警告 |
| TC-BOUND-002 | 回溯状态更新 | 允许但记录日志 |
| TC-BOUND-003 | 物流号缺失发货 | 拒绝或警告 |
| TC-BOUND-004 | 超时未发货 | 升级告警 |
| TC-BOUND-005 | 客户拒收 | 状态 → returned |

---

## 5. 性能测试

| 指标 | 目标值 |
|-----|-------|
| 状态更新延迟 | < 5s |
| 通知发送延迟 | < 1min |
| 并发订单处理 | 100 订单/分钟 |
| OKKI 同步延迟 | < 10s |

---

## 测试数据样例

```json
{
  "order": {
    "order_no": "ORD-20260327-001",
    "customer_id": "okki_12345",
    "customer_name": "Acme Corporation",
    "status": "confirmed",
    "created_date": "2026-03-27",
    "confirmed_date": "2026-03-28",
    "total_amount": 8600.00,
    "currency": "USD",
    "products": [
      {"description": "Product A", "quantity": 500}
    ],
    "shipping": {
      "method": "FOB Shenzhen",
      "destination": "New York, USA"
    }
  }
}
```

---

## 通过标准汇总

| 测试类型 | 通过率要求 |
|---------|-----------|
| 单元测试 | 100% |
| 集成测试 | 100% |
| 端到端测试 | 100% |
| 边界测试 | > 95% |
| 性能测试 | 满足目标 |

---

**文档版本：** 1.0.0  
**创建日期：** 2026-03-27  
**维护者：** Super Sales Agent QA Team
