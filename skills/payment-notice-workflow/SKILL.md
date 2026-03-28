---
name: Payment Notice Workflow
slug: payment-notice-workflow
version: 1.0.0
description: 生成专业收款通知，支持 HTML/PDF 格式，自动集成银行账户信息
metadata: {"clawdbot":{"emoji":"💰","requires":{"bins":["python3"]},"os":["darwin"]}}
---

# 💰 Payment Notice Workflow (收款通知工作流)

生成专业收款通知（Payment Notice），支持 HTML/PDF 格式，自动集成银行账户信息，用于提醒客户付款。

## 🚀 快速开始

### 方式 1：一键生成（最简单 ⭐）

```bash
# 生成收款通知
skills/payment-notice-workflow/scripts/generate_payment_notice.py \
  --data payment_data.json \
  --output PN-20260327-001.html
```

### 方式 2：使用标准模板

```bash
# 复制标准模板
cp skills/payment-notice-workflow/template-standard.json \
   data/customer_payment.json

# 编辑文件，填入真实客户和订单信息

# 生成收款通知
python3 skills/payment-notice-workflow/scripts/generate_payment_notice.py \
  --data data/customer_payment.json \
  --output PN-20260327-001.html
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
  "notice": {
    "notice_no": "PN-20260327-001",
    "date": "2026-03-27",
    "due_date": "2026-04-10"
  },
  "reference": {
    "pi_no": "PI-20260327-001",
    "quotation_no": "QT-20260327-001",
    "order_no": "PO-12345"
  },
  "payment": {
    "total_amount": 8600.00,
    "currency": "USD",
    "deposit_amount": 2580.00,
    "deposit_date": "2026-03-20",
    "balance_due": 6020.00
  },
  "terms": {
    "payment_terms": "T/T 30% deposit, 70% before shipment",
    "remarks": "1. Please arrange payment before the due date.\n2. Send payment slip to your-email@company.com.\n3. Goods will be shipped after payment confirmation."
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
| `notice.notice_no` | string | ✅ | 收款通知编号 |
| `notice.date` | string | ✅ | 通知日期 (YYYY-MM-DD) |
| `notice.due_date` | string | ✅ | 付款截止日期 |
| `reference.pi_no` | string | ❌ | 关联 PI 编号 |
| `reference.quotation_no` | string | ❌ | 关联报价单编号 |
| `reference.order_no` | string | ❌ | 关联订单编号 |
| `payment.total_amount` | number | ✅ | 总金额 |
| `payment.currency` | string | ❌ | 币别 (默认：USD) |
| `payment.deposit_amount` | number | ❌ | 已付定金 |
| `payment.deposit_date` | string | ❌ | 定金日期 |
| `payment.balance_due` | number | ❌ | 尾款金额 |
| `terms.payment_terms` | string | ❌ | 付款条款 |
| `terms.remarks` | string | ❌ | 备注 |

## 🏦 银行账户

银行账户信息从统一配置文件自动加载：
- 配置文件：`config/bank-accounts.json`
- 自动集成：无需手动填写银行信息
- 统一更新：修改配置文件，所有通知自动更新

## 常用命令

### 生成收款通知
```bash
python3 skills/payment-notice-workflow/scripts/generate_payment_notice.py \
  --data data/customer.json \
  --output PN-20260327-001.html
```

### 快速测试
```bash
python3 skills/payment-notice-workflow/scripts/generate_payment_notice.py \
  --output test.html \
  --quick-test
```

### 在浏览器打开
```bash
open PN-20260327-001.html
```

### 导出 PDF
```bash
# 脚本自动生成 PDF（无页眉页脚）
# 或使用 Chrome 命令行手动导出：
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=PN-20260327-001.pdf \
  file://$(pwd)/PN-20260327-001.html
```

## 依赖

- **Python 3** (已安装)

## 示例文件

```
skills/payment-notice-workflow/
├── template-standard.json           # 标准模板
├── scripts/
│   └── generate_payment_notice.py   # 收款通知生成脚本
└── examples/
    └── sample_payment.json         # 示例数据
```

## 相关文档

- **PI 工作流：** `../pi-workflow/SKILL.md`
- **报价单工作流：** `../quotation-workflow/SKILL.md`
- **银行账户配置：** `../../config/bank-accounts.json`

## 版本历史

- **1.0.0** (2026-03-27) - 初始版本
  - ✅ 收款通知生成（专业模板）
  - ✅ 银行账户自动集成
  - ✅ 数据验证
  - ✅ PDF 导出支持
  - ✅ 关联 PI/报价单/订单
