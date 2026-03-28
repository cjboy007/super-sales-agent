---
name: Sample Workflow
slug: sample-workflow
version: 1.0.0
description: 生成专业样品申请单，支持 HTML/PDF 格式，管理样品寄送流程
metadata: {"clawdbot":{"emoji":"📦","requires":{"bins":["python3"]},"os":["darwin"]}}
---

# 📦 Sample Workflow (样品单工作流)

生成专业样品申请单（Sample Order），支持 HTML/PDF 格式，管理样品寄送全流程。

## 🚀 快速开始

### 方式 1：一键生成（最简单 ⭐）

```bash
# 生成样品单
skills/sample-workflow/scripts/generate_sample.py \
  --data sample_data.json \
  --output SPL-20260327-001.html
```

### 方式 2：使用标准模板

```bash
# 复制标准模板
cp skills/sample-workflow/template-standard.json \
   data/customer_sample.json

# 编辑文件，填入真实客户信息

# 生成样品单
python3 skills/sample-workflow/scripts/generate_sample.py \
  --data data/customer_sample.json \
  --output SPL-20260327-001.html
```

## 📋 数据格式

### 完整示例

```json
{
  "customer": {
    "company_name": "客户公司全称",
    "contact": "联系人姓名",
    "email": "customer@example.com",
    "phone": "+1-234-567-8900",
    "address": "客户地址",
    "country": "客户国家"
  },
  "sample": {
    "sample_no": "SPL-20260327-001",
    "date": "2026-03-27",
    "purpose": "Testing / Evaluation / Exhibition"
  },
  "shipping_address": {
    "company_name": "收货公司（如与客户相同可留空）",
    "contact": "收货联系人",
    "phone": "收货电话",
    "address": "详细收货地址",
    "country": "收货国家",
    "postal_code": "邮政编码"
  },
  "products": [
    {
      "description": "HDMI 2.1 Ultra High Speed Cable",
      "specification": "8K@60Hz, 48Gbps, 2m",
      "quantity": 2,
      "unit_price": 8.50,
      "remarks": "样品测试用"
    }
  ],
  "shipping": {
    "method": "DHL",
    "account_no": "123456789",
    "freight_collect": true,
    "freight_amount": 0
  },
  "terms": {
    "sample_charge": "Free / Charged",
    "lead_time": "3-5 days after confirmation",
    "remarks": "1. Sample lead time: 3-5 days.\n2. Courier account preferred for freight collect.\n3. Sample charge can be refunded upon bulk order."
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `customer.company_name` | string | ✅ | 客户公司名称 |
| `customer.contact` | string | ✅ | 联系人姓名 |
| `customer.email` | string | ✅ | 联系邮箱 |
| `customer.phone` | string | ❌ | 联系电话 |
| `customer.address` | string | ❌ | 客户地址 |
| `sample.sample_no` | string | ✅ | 样品单编号 |
| `sample.date` | string | ✅ | 样品单日期 |
| `sample.purpose` | string | ❌ | 样品用途 |
| `shipping_address` | object | ❌ | 收货地址信息 |
| `products` | array | ✅ | 样品列表 |
| `products[].description` | string | ✅ | 样品名称 |
| `products[].specification` | string | ✅ | 规格参数 |
| `products[].quantity` | number | ✅ | 数量 |
| `products[].unit_price` | number | ❌ | 单价 |
| `shipping.method` | string | ❌ | 快递方式 (DHL/FedEx/UPS/TNT) |
| `shipping.account_no` | string | ❌ | 快递到付账号 |
| `shipping.freight_collect` | boolean | ❌ | 是否到付 |
| `shipping.freight_amount` | number | ❌ | 运费金额 |
| `terms.sample_charge` | string | ❌ | 样品收费 (Free/Charged) |
| `terms.lead_time` | string | ❌ | 交期 |
| `terms.remarks` | string | ❌ | 备注 |

## 常用命令

### 生成样品单
```bash
python3 skills/sample-workflow/scripts/generate_sample.py \
  --data data/customer.json \
  --output SPL-20260327-001.html
```

### 快速测试
```bash
python3 skills/sample-workflow/scripts/generate_sample.py \
  --output test.html \
  --quick-test
```

### 在浏览器打开
```bash
open SPL-20260327-001.html
```

### 导出 PDF
```bash
# 脚本自动生成 PDF（无页眉页脚）
# 或使用 Chrome 命令行手动导出：
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=SPL-20260327-001.pdf \
  file://$(pwd)/SPL-20260327-001.html
```

## 依赖

- **Python 3** (已安装)

## 示例文件

```
skills/sample-workflow/
├── template-standard.json       # 标准模板
├── scripts/
│   └── generate_sample.py      # 样品单生成脚本
└── examples/
    └── sample_order.json       # 示例数据
```

## 相关文档

- **PI 工作流：** `../pi-workflow/SKILL.md`
- **收款通知工作流：** `../payment-notice-workflow/SKILL.md`
- **报价单工作流：** `../quotation-workflow/SKILL.md`

## 版本历史

- **1.0.0** (2026-03-27) - 初始版本
  - ✅ 样品单生成（专业模板）
  - ✅ 收货地址管理
  - ✅ 快递方式选择
  - ✅ 数据验证
  - ✅ PDF 导出支持
