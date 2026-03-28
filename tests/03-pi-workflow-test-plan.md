# 形式发票工作流测试方案 (pi-workflow)

---

## 测试目标

验证形式发票 (PI) 文档生成的正确性、条款完整性和付款信息准确性。

---

## 模块概述

**核心文件：**
- `skills/pi-workflow/scripts/generate_pi.py` - PI 生成脚本
- `skills/pi-workflow/template-standard.json` - 传统风格模板
- `config/bank-accounts.json` - 银行账户配置

**依赖：**
- Python 3 + Jinja2
- 银行账户配置

---

## 1. 单元测试

### 1.1 数据验证测试

| 测试用例 | 输入数据 | 预期结果 | 通过标准 |
|---------|---------|---------|---------|
| TC-VALIDATE-001 | 有效 PI 数据 | 验证通过 | 无错误 |
| TC-VALIDATE-002 | PI 编号格式错误 | 验证失败 | 错误：PI-YYYYMMDD-XXX |
| TC-VALIDATE-003 | 付款条款为空 | 验证失败 | 错误：条款必填 |
| TC-VALIDATE-004 | 金额为负数 | 验证失败 | 错误：金额无效 |
| TC-VALIDATE-005 | 有效期早于日期 | 验证失败 | 错误：日期逻辑 |

### 1.2 HTML 生成测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-HTML-001 | 标准数据 | 生成.html 文件 | 文件存在 |
| TC-HTML-002 | 银行信息 | 正确显示 | 账户完整 |
| TC-HTML-003 | 付款条款 | 完整展示 | 条款清晰 |
| TC-HTML-004 | 产品列表 | 表格格式 | 对齐正确 |
| TC-HTML-005 | 总金额计算 | 自动汇总 | 计算准确 |

### 1.3 银行信息测试

| 测试用例 | 配置 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-BANK-001 | 单一账户 | 正确加载 | 5 字段完整 |
| TC-BANK-002 | 受益人名称 | 正确显示 | FARREACH ELECTRONIC |
| TC-BANK-003 | SWIFT 代码 | 正确显示 | HSBCHKHHHKH |
| TC-BANK-004 | 银行地址 | 完整显示 | 无截断 |
| TC-BANK-005 | 账户号码 | 正确显示 | 411-758097-838 |

### 1.4 金额计算测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-CALC-001 | 单价×数量 | 正确计算 | 无舍入误差 |
| TC-CALC-002 | 多产品汇总 |  subtotal 正确 | 累加准确 |
| TC-CALC-003 | 定金 30% | 计算正确 | 2580.00 (8600×0.3) |
| TC-CALC-004 | 尾款 70% | 计算正确 | 6020.00 (8600×0.7) |
| TC-CALC-005 | 货币格式化 | 两位小数 | $8,600.00 |

---

## 2. 集成测试

### 2.1 完整 PI 生成流程

**测试数据：**
```json
{
  "customer": {
    "company_name": "Global Tech Ltd",
    "contact": "Sarah Smith",
    "email": "sarah@globaltech.com",
    "address": "456 Tech Park, London, UK"
  },
  "pi": {
    "pi_no": "PI-20260327-001",
    "date": "2026-03-27",
    "valid_until": "2026-04-26"
  },
  "products": [
    {"description": "Product A", "quantity": 500, "unit_price": 8.50},
    {"description": "Product B", "quantity": 1000, "unit_price": 5.20}
  ],
  "terms": {
    "payment": "T/T 30% deposit, 70% before shipment",
    "packaging": "Standard export packaging",
    "delivery": "15-20 days after deposit"
  },
  "total_amount": 9450.00,
  "currency": "USD"
}
```

**预期流程：**
1. 数据验证
2. 加载银行配置
3. 渲染模板
4. 生成 HTML
5. 输出到 output/

**通过标准：** PI 文件生成，所有信息准确

### 2.2 与报价单数据联动

**测试场景：** 基于报价单生成 PI

**预期流程：**
1. 引用 QT 编号
2. 产品数据一致
3. 价格一致
4. 添加付款条款

**通过标准：** QT → PI 数据一致

---

## 3. 端到端测试

### 3.1 E2E-001: 完整 PI 流程

**前置条件：**
- 报价单已确认
- 银行账户配置完成

**步骤：**
1. 从确认的 QT 创建 PI 数据
2. 运行 generate_pi.py
3. 检查 HTML 输出
4. 导出 PDF
5. 发送给客户
6. 写入 OKKI 跟进记录

**预期结果：**
- PI 文件正确
- 银行信息准确
- 付款条款清晰
- OKKI 有记录

**通过标准：** 客户可依据 PI 付款

### 3.2 E2E-002: 定金通知流程

**步骤：**
1. 生成 PI
2. 提取定金金额
3. 创建收款通知
4. 发送客户

**预期结果：** 定金金额与 PI 一致

---

## 4. 边界条件测试

### 4.1 异常输入

| 测试用例 | 输入 | 预期处理 |
|---------|------|---------|
| TC-BOUND-001 | 总金额 = 0 | 验证失败 |
| TC-BOUND-002 | 付款条款缺失 | 验证失败 |
| TC-BOUND-003 | 银行配置为空 | 生成失败 |
| TC-BOUND-004 | 客户邮箱无效 | 警告但继续 |
| TC-BOUND-005 | 产品列表空 | 验证失败 |

### 4.2 极端值

| 测试用例 | 场景 | 预期处理 |
|---------|------|---------|
| TC-EXTREME-001 | 金额 = $0.01 | 正常处理 |
| TC-EXTREME-002 | 金额 = $10,000,000 | 正常处理 |
| TC-EXTREME-003 | 定金比例 = 100% | 正常处理 |
| TC-EXTREME-004 | 定金比例 = 0% | 正常处理 |
| TC-EXTREME-005 | 50 个产品 | 分页显示 |

---

## 5. 性能测试

### 5.1 生成时间

| 指标 | 目标值 |
|-----|-------|
| PI 生成 | < 2s |
| PDF 导出 | < 5s |
| 全流程 | < 7s |

### 5.2 并发能力

| 场景 | 并发数 | 成功率 |
|-----|-------|--------|
| 正常 | 10 个/分钟 | 100% |
| 峰值 | 30 个/分钟 | > 95% |

---

## 测试数据样例

```json
{
  "customer": {
    "company_name": "Global Tech Ltd",
    "contact": "Sarah Smith",
    "email": "sarah@globaltech.com",
    "phone": "+44-20-1234-5678",
    "address": "456 Tech Park, London, SW1A 1AA, UK",
    "country": "United Kingdom"
  },
  "pi": {
    "pi_no": "PI-20260327-001",
    "date": "2026-03-27",
    "valid_until": "2026-04-26"
  },
  "products": [
    {
      "description": "Wireless Bluetooth Headphones",
      "specification": "BT 5.0, 30h battery, ANC",
      "quantity": 500,
      "unit_price": 8.50
    }
  ],
  "terms": {
    "payment": "T/T 30% deposit, 70% before shipment",
    "packaging": "Standard export packaging",
    "delivery": "15-20 days after deposit"
  },
  "total_amount": 4250.00,
  "currency": "USD",
  "deposit_amount": 1275.00,
  "balance_due": 2975.00
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
