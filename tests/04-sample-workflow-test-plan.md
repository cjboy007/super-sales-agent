# 样品单工作流测试方案 (sample-workflow)

---

## 测试目标

验证样品单 (Sample Request) 生成的正确性、 shipping 信息完整性和物流安排准确性。

---

## 模块概述

**核心文件：**
- `skills/sample-workflow/scripts/generate_sample.py` - 样品单生成
- `skills/sample-workflow/template-standard.json` - 模板

**依赖：**
- Python 3 + Jinja2
- 物流配置（可选）

---

## 1. 单元测试

### 1.1 数据验证测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-VALIDATE-001 | 有效样品数据 | 验证通过 | 无错误 |
| TC-VALIDATE-002 | 样品编号错误 | 验证失败 | SPL-YYYYMMDD-XXX |
| TC-VALIDATE-003 | 收货地址为空 | 验证失败 | 地址必填 |
| TC-VALIDATE-004 | 样品数量 <= 0 | 验证失败 | 数量有效 |
| TC-VALIDATE-005 | 物流方式无效 | 验证失败 | DHL/FedEx/UPS |

### 1.2 HTML 生成测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-HTML-001 | 标准数据 | 生成.html | 文件存在 |
| TC-HTML-002 | 收货地址 | 完整显示 | 格式正确 |
| TC-HTML-003 | 样品列表 | 表格展示 | 清晰 |
| TC-HTML-004 | 物流信息 | 正确显示 | 方式/账号 |
| TC-HTML-005 | 用途说明 | 完整展示 | Testing/Evaluation |

### 1.3 物流信息测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-SHIP-001 | DHL 到付 | freight_collect=true | 显示到付 |
| TC-SHIP-002 | DHL 预付 | freight_collect=false | 显示预付 |
| TC-SHIP-003 | FedEx 账号 | 账号显示 | 格式正确 |
| TC-SHIP-004 | 无物流账号 | 提示客户安排 | 友好提示 |

---

## 2. 集成测试

### 2.1 完整样品单流程

**测试数据：**
```json
{
  "customer": {
    "company_name": "Tech Innovations Inc",
    "contact": "Mike Johnson",
    "email": "mike@techinnovations.com"
  },
  "sample": {
    "sample_no": "SPL-20260327-001",
    "date": "2026-03-27",
    "purpose": "Product Evaluation"
  },
  "products": [
    {"description": "Product A Sample", "quantity": 2}
  ],
  "shipping_address": {
    "company_name": "Tech Innovations Inc",
    "contact": "Mike Johnson",
    "address": "789 Innovation Drive, San Jose, CA 95110"
  },
  "shipping": {
    "method": "DHL",
    "freight_collect": true,
    "account_no": "123456789"
  }
}
```

**预期流程：**
1. 数据验证
2. 渲染模板
3. 生成 HTML
4. 输出到 output/

**通过标准：** 样品单完整准确

---

## 3. 端到端测试

### 3.1 E2E-001: 完整样品申请流程

**步骤：**
1. 客户申请样品
2. 生成样品单
3. 安排仓库备货
4. 创建物流订单
5. 发送追踪号给客户

**预期结果：** 样品正确发出

### 3.2 E2E-002: 样品转订单流程

**步骤：**
1. 样品单生成
2. 客户确认样品
3. 创建正式订单
4. 关联样品单号

**预期结果：** SPL → Order 关联正确

---

## 4. 边界条件测试

| 测试用例 | 场景 | 预期处理 |
|---------|------|---------|
| TC-BOUND-001 | 样品数量 = 0 | 验证失败 |
| TC-BOUND-002 | 地址含特殊字符 | 正确显示 |
| TC-BOUND-003 | 国际地址 | 格式正确 |
| TC-BOUND-004 | 无联系人 | 使用公司名 |
| TC-BOUND-005 | 物流方式未知 | 默认 DHL |

---

## 5. 性能测试

| 指标 | 目标值 |
|-----|-------|
| 样品单生成 | < 2s |
| PDF 导出 | < 5s |

---

## 测试数据样例

```json
{
  "customer": {
    "company_name": "Tech Innovations Inc",
    "contact": "Mike Johnson",
    "email": "mike@techinnovations.com",
    "phone": "+1-408-555-1234",
    "address": "789 Innovation Drive, San Jose, CA 95110",
    "country": "USA"
  },
  "sample": {
    "sample_no": "SPL-20260327-001",
    "date": "2026-03-27",
    "purpose": "Product Evaluation and Testing"
  },
  "products": [
    {
      "description": "Wireless Bluetooth Headphones",
      "specification": "BT 5.0, Black",
      "quantity": 2
    }
  ],
  "shipping_address": {
    "company_name": "Tech Innovations Inc",
    "contact": "Mike Johnson",
    "address": "789 Innovation Drive, San Jose, CA 95110, USA"
  },
  "shipping": {
    "method": "DHL Express",
    "freight_collect": true,
    "account_no": "123456789"
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
