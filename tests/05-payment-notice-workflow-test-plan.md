# 收款通知工作流测试方案 (payment-notice-workflow)

---

## 测试目标

验证收款通知 (Payment Notice) 生成的正确性、金额准确性和付款信息完整性。

---

## 模块概述

**核心文件：**
- `skills/payment-notice-workflow/scripts/generate_payment_notice.py` - 收款通知生成
- `skills/payment-notice-workflow/template-standard.json` - 模板
- `config/bank-accounts.json` - 银行账户配置

---

## 1. 单元测试

### 1.1 数据验证测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-VALIDATE-001 | 有效付款数据 | 验证通过 | 无错误 |
| TC-VALIDATE-002 | 通知编号错误 | 验证失败 | PN-YYYYMMDD-XXX |
| TC-VALIDATE-003 | 金额为负数 | 验证失败 | 金额有效 |
| TC-VALIDATE-004 | 定金 + 尾款≠总额 | 验证失败 | 计算一致 |
| TC-VALIDATE-005 | 到期日早于当前 | 警告 | 允许但提示 |

### 1.2 金额计算测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-CALC-001 | 总额$10,000，定金 30% | 定金$3,000，尾款$7,000 | 计算准确 |
| TC-CALC-002 | 总额$8,600，定金$2,580 | 尾款$6,020 | 减法准确 |
| TC-CALC-003 | 多币种 | 货币符号正确 | USD/EUR/GBP |
| TC-CALC-004 | 小数精度 | 两位小数 | 无舍入误差 |
| TC-CALC-005 | 千分位格式化 | $10,000.00 | 格式正确 |

### 1.3 银行信息测试

| 测试用例 | 预期结果 | 通过标准 |
|---------|---------|---------|
| TC-BANK-001 | 受益人名称正确 | FARREACH ELECTRONIC |
| TC-BANK-002 | 银行名称正确 | HSBC Hong Kong |
| TC-BANK-003 | 账号正确 | YOUR-ACCOUNT-NUMBER |
| TC-BANK-004 | SWIFT 正确 | YOUR-SWIFT-CODE |
| TC-BANK-005 | 银行地址完整 | No.1 Queen's Road Central |

### 1.4 HTML 生成测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-HTML-001 | 标准数据 | 生成.html | 文件存在 |
| TC-HTML-002 | 付款明细 | 清晰展示 | 定金/尾款 |
| TC-HTML-003 | 银行信息 | 完整显示 | 可复制 |
| TC-HTML-004 | 到期日 | 醒目显示 | 红色/加粗 |
| TC-HTML-005 | PI 引用 | 链接正确 | PI-20260327-001 |

---

## 2. 集成测试

### 2.1 完整收款通知流程

**测试数据：**
```json
{
  "customer": {
    "company_name": "Acme Corporation",
    "contact": "John Doe",
    "email": "john@acme.com"
  },
  "notice": {
    "notice_no": "PN-20260327-001",
    "date": "2026-03-27",
    "due_date": "2026-04-10"
  },
  "reference": {
    "pi_no": "PI-20260327-001"
  },
  "payment": {
    "total_amount": 8600.00,
    "currency": "USD",
    "deposit_amount": 2580.00,
    "balance_due": 6020.00
  }
}
```

**预期流程：**
1. 数据验证
2. 加载银行配置
3. 渲染模板
4. 生成 HTML
5. 输出到 output/

**通过标准：** 收款通知完整准确

### 2.2 与 PI 数据联动

**测试场景：** 基于 PI 生成收款通知

**预期流程：**
1. 引用 PI 编号
2. 金额一致
3. 客户信息一致
4. 银行信息一致

**通过标准：** PI → PN 数据一致

---

## 3. 端到端测试

### 3.1 E2E-001: 定金收款流程

**步骤：**
1. PI 生成后自动创建收款通知
2. 提取定金金额
3. 发送客户
4. 客户付款
5. 确认收款
6. 更新 OKKI

**预期结果：** 定金正确收取

### 3.2 E2E-002: 尾款收款流程

**步骤：**
1. 生产完成后创建尾款通知
2. 发送客户
3. 客户付款
4. 安排发货

**预期结果：** 尾款正确收取

### 3.3 E2E-003: 逾期提醒流程

**步骤：**
1. 到期日未付款
2. 自动发送逾期提醒
3. 升级通知

**预期结果：** 逾期正确处理

---

## 4. 边界条件测试

| 测试用例 | 场景 | 预期处理 |
|---------|------|---------|
| TC-BOUND-001 | 总额 = 0 | 验证失败 |
| TC-BOUND-002 | 定金 = 0 | 尾款=总额 |
| TC-BOUND-003 | 定金 = 总额 | 尾款=0 |
| TC-BOUND-004 | 到期日缺失 | 使用默认 14 天 |
| TC-BOUND-005 | PI 引用缺失 | 允许但警告 |

---

## 5. 性能测试

| 指标 | 目标值 |
|-----|-------|
| 收款通知生成 | < 2s |
| PDF 导出 | < 5s |
| 批量生成 (50 个) | < 30s |

---

## 测试数据样例

```json
{
  "customer": {
    "company_name": "Acme Corporation",
    "contact": "John Doe",
    "email": "john@acme-corp.com",
    "phone": "+1-555-123-4567",
    "address": "123 Business Avenue, New York, NY 10001",
    "country": "USA"
  },
  "notice": {
    "notice_no": "PN-20260327-001",
    "date": "2026-03-27",
    "due_date": "2026-04-10"
  },
  "reference": {
    "pi_no": "PI-20260327-001",
    "quotation_no": "QT-20260327-001"
  },
  "payment": {
    "total_amount": 8600.00,
    "currency": "USD",
    "deposit_amount": 2580.00,
    "deposit_paid": false,
    "balance_due": 6020.00
  },
  "notes": "Please arrange payment by the due date."
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
