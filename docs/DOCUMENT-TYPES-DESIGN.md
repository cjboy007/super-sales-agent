# 文档类型扩展架构设计

**日期：** 2026-03-27  
**状态：** 设计阶段

---

## 📋 支持的文档类型

| 类型 | 英文 | 用途 | 优先级 | 预计工时 |
|------|------|------|--------|----------|
| **报价单** | Quotation | 产品报价 | ✅ 已完成 | - |
| **形式发票** | Proforma Invoice (PI) | 客户付款依据 | 🔴 P0 | 2h |
| **样品单** | Sample Request | 寄样确认 | 🟡 P1 | 1.5h |
| **收款通知** | Payment Notice | 付款提醒 | 🟡 P1 | 1h |
| **商业发票** | Commercial Invoice | 清关发票 | 🟢 P2 | 1.5h |
| **装箱单** | Packing List | 清关箱单 | 🟢 P2 | 1h |
| **销售合同** | Sales Contract | 正式合同 | 🟢 P2 | 3h |

---

## 🏗️ 架构设计

### 统一入口

```bash
node generate-document.js \
  --type <文档类型> \
  --customer-id <OKKI 客户 ID> \
  --output <文件名> \
  [其他参数]
```

### 文档类型注册表

```javascript
// config/document-types.js
module.exports = {
  'quotation': {
    name: '报价单',
    template: 'templates/quotation-template.html',
    script: 'scripts/generate-quotation.js',
    requires: ['products', 'bank_info'],
    outputFormats: ['html', 'pdf', 'xlsx', 'docx']
  },
  'pi': {
    name: '形式发票',
    template: 'templates/pi-template.html',
    script: 'scripts/generate-pi.js',
    requires: ['products', 'bank_info'],
    outputFormats: ['html', 'pdf']
  },
  'sample': {
    name: '样品单',
    template: 'templates/sample-template.html',
    script: 'scripts/generate-sample.js',
    requires: ['products', 'shipping_address'],
    outputFormats: ['html', 'pdf']
  },
  'payment-notice': {
    name: '收款通知',
    template: 'templates/payment-notice-template.html',
    script: 'scripts/generate-payment-notice.js',
    requires: ['invoice_no', 'amount', 'bank_info'],
    outputFormats: ['html', 'pdf']
  },
  'commercial-invoice': {
    name: '商业发票',
    template: 'templates/commercial-invoice-template.html',
    script: 'scripts/generate-commercial-invoice.js',
    requires: ['invoice_no', 'products', 'shipping_info'],
    outputFormats: ['html', 'pdf']
  },
  'packing-list': {
    name: '装箱单',
    template: 'templates/packing-list-template.html',
    script: 'scripts/generate-packing-list.js',
    requires: ['products', 'carton_info'],
    outputFormats: ['html', 'pdf']
  },
  'sales-contract': {
    name: '销售合同',
    template: 'templates/sales-contract-template.html',
    script: 'scripts/generate-sales-contract.js',
    requires: ['products', 'terms_conditions'],
    outputFormats: ['html', 'pdf', 'docx']
  }
};
```

---

## 📁 目录结构

```
monorepo/super-sales-agent/
├── config/
│   ├── bank-accounts.json           ← 银行配置
│   └── document-types.js            ← 文档类型注册表 ⭐ 新增
├── templates/
│   ├── quotation-template.html      ← 报价单模板
│   ├── pi-template.html             ← PI 模板 ⭐ 新增
│   ├── sample-template.html         ← 样品单模板 ⭐ 新增
│   ├── payment-notice-template.html ← 收款通知模板 ⭐ 新增
│   ├── commercial-invoice-template.html
│   ├── packing-list-template.html
│   └── sales-contract-template.html
├── scripts/
│   ├── generate-document.js         ← 统一入口
│   ├── generate-quotation.js        ← 报价单生成
│   ├── generate-pi.js               ← PI 生成 ⭐ 新增
│   ├── generate-sample.js           ← 样品单生成 ⭐ 新增
│   ├── generate-payment-notice.js   ← 收款通知生成 ⭐ 新增
│   ├── generate-commercial-invoice.js
│   ├── generate-packing-list.js
│   └── generate-sales-contract.js
└── skills/
    └── quotation-workflow/
        └── config/
            └── bank-accounts.json   ← 银行配置引用
```

---

## 🔧 统一入口逻辑

```javascript
// generate-document.js 核心逻辑
const documentTypes = require('../config/document-types');

async function generateDocument(type, options) {
  // 1. 验证文档类型
  const docConfig = documentTypes[type];
  if (!docConfig) {
    throw new Error(`不支持的文档类型：${type}`);
  }
  
  // 2. 加载客户数据（OKKI 缓存）
  const customer = await loadCustomer(options.customerId);
  
  // 3. 加载产品数据
  const products = await loadProducts(options.products);
  
  // 4. 加载银行信息（统一配置）
  const bankInfo = bankConfig.getPrimaryBank();
  
  // 5. 生成文档数据
  const docData = {
    customer,
    products,
    bank_info: bankInfo,
    ...options.extra
  };
  
  // 6. 调用对应的生成脚本
  const generator = require(docConfig.script);
  await generator.generate(docData, options.output);
  
  // 7. OKKI 同步（创建跟进记录）
  await okkiSync.createTrail(type, customer.okki_customer_id, options.output);
}
```

---

## 📊 各文档类型数据结构

### 1. 报价单 (Quotation) ✅ 已完成

```json
{
  "customer": { "company_name", "contact", "email", "address" },
  "quotation": { "quotation_no", "date", "valid_until" },
  "products": [{ "description", "quantity", "unit_price" }],
  "bank_info": { "beneficiary", "bank_name", "account_no", "swift_code" }
}
```

### 2. 形式发票 (PI) 🔴 P0

```json
{
  "customer": { "company_name", "contact", "email", "address" },
  "pi": { "pi_no", "date", "valid_until" },
  "products": [{ "description", "quantity", "unit_price", "amount" }],
  "total_amount": 1000.00,
  "bank_info": { "beneficiary", "bank_name", "account_no", "swift_code" },
  "shipping_info": { "port", "delivery_time" },
  "terms": { "payment", "packaging" }
}
```

### 3. 样品单 (Sample Request) 🟡 P1

```json
{
  "customer": { "company_name", "contact", "email", "address" },
  "sample": { "sample_no", "date" },
  "products": [{ "description", "quantity", "unit_price" }],
  "shipping_address": { "name", "phone", "address", "country" },
  "shipping_method": "DHL/FedEx/UPS",
  "freight_collect": true/false,
  "notes": "样品说明"
}
```

### 4. 收款通知 (Payment Notice) 🟡 P1

```json
{
  "customer": { "company_name", "contact", "email" },
  "notice": { "notice_no", "date", "due_date" },
  "invoice_no": "PI-20260327-001",
  "amount": 1000.00,
  "currency": "USD",
  "bank_info": { "beneficiary", "bank_name", "account_no", "swift_code" },
  "payment_terms": "T/T 30% deposit, 70% before shipment"
}
```

### 5. 商业发票 (Commercial Invoice) 🟢 P2

```json
{
  "customer": { "company_name", "address", "country" },
  "invoice": { "invoice_no", "date" },
  "products": [{ "description", "hs_code", "quantity", "unit_price", "amount" }],
  "total_amount": 1000.00,
  "shipping_info": { "port_of_loading", "port_of_destination" },
  "origin_country": "China"
}
```

### 6. 装箱单 (Packing List) 🟢 P2

```json
{
  "customer": { "company_name", "address" },
  "packing": { "packing_no", "date" },
  "cartons": [{
    "carton_no": "1-10",
    "products": [{ "description", "quantity" }],
    "gross_weight": "10kg",
    "net_weight": "9kg",
    "dimensions": "50x40x30cm"
  }],
  "total_cartons": 10,
  "total_weight": "100kg"
}
```

### 7. 销售合同 (Sales Contract) 🟢 P2

```json
{
  "customer": { "company_name", "address", "country" },
  "contract": { "contract_no", "date", "sign_date" },
  "products": [{ "description", "quantity", "unit_price", "amount" }],
  "total_amount": 1000.00,
  "terms_conditions": {
    "payment": "T/T 30% deposit, 70% before shipment",
    "delivery": "30 days after deposit",
    "quality": "ISO9001 standard",
    "warranty": "12 months"
  },
  "signatures": { "seller", "buyer" }
}
```

---

## 🚀 实施计划

### Phase 1: P0 - 形式发票 (PI)
**工时：** 2 小时  
**内容：**
- 创建 PI 模板（HTML）
- 实现 `generate-pi.js`
- 更新统一入口支持 `--type pi`
- 测试完整流程

### Phase 2: P1 - 样品单 + 收款通知
**工时：** 2.5 小时  
**内容：**
- 创建样品单模板和生成脚本
- 创建收款通知模板和生成脚本
- 集成 OKKI 同步（创建跟进记录）

### Phase 3: P2 - 清关文档 + 合同
**工时：** 5.5 小时  
**内容：**
- 商业发票
- 装箱单
- 销售合同

---

## 📝 下一步

**立即实施 Phase 1 (PI)？**

PI 是最常用的文档类型，客户付款必须用。

**确认要点：**
1. PI 模板设计（现代风格 vs 传统风格）
2. 是否需要多语言支持（英文/中文）
3. 是否需要与报价单数据互通（从 quotation 生成 PI）

**你的需求？** 🤔
