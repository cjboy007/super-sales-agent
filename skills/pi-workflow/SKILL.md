# 📄 PI 工作流 (Proforma Invoice)

生成传统风格形式发票，支持 HTML/PDF 格式，自动集成银行账户信息。

## 🚀 快速开始

### 方式 1：一键生成（最简单 ⭐）

```bash
# 生成 PI
skills/pi-workflow/scripts/generate_pi.py \
  --data pi_data.json \
  --output PI-20260327-001.html
```

### 方式 2：使用标准模板

```bash
# 复制标准模板
cp skills/pi-workflow/template-standard.json \
   data/customer_pi.json

# 编辑文件，填入真实客户信息

# 生成 PI
python3 skills/pi-workflow/scripts/generate_pi.py \
  --data data/customer_pi.json \
  --output PI-20260327-001.html
```

## 📋 数据格式

### 完整示例

```json
{
  "customer": {
    "company_name": "客户公司名称",
    "contact": "联系人姓名",
    "email": "customer@example.com",
    "phone": "+1-234-567-8900",
    "address": "客户地址",
    "country": "客户国家"
  },
  "pi": {
    "pi_no": "PI-20260327-001",
    "date": "2026-03-27",
    "valid_until": "2026-04-26"
  },
  "products": [
    {
      "description": "HDMI 2.1 Ultra High Speed Cable",
      "specification": "8K@60Hz, 48Gbps, 2m",
      "quantity": 500,
      "unit_price": 8.50
    }
  ],
  "currency": "USD",
  "freight": 150.00,
  "tax": 0,
  "terms": {
    "payment": "T/T 30% deposit, 70% before shipment",
    "packaging": "Standard export packaging",
    "remarks": "1. This PI is valid for 30 days.\n2. Goods will be shipped after payment confirmation."
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
| `pi.pi_no` | string | ✅ | PI 编号 |
| `pi.date` | string | ✅ | PI 日期 (YYYY-MM-DD) |
| `pi.valid_until` | string | ✅ | 有效期至 |
| `products` | array | ✅ | 产品列表 |
| `products[].description` | string | ✅ | 产品描述 |
| `products[].specification` | string | ✅ | 规格型号 |
| `products[].quantity` | number | ✅ | 数量 |
| `products[].unit_price` | number | ✅ | 单价 (USD) |
| `currency` | string | ❌ | 币别 (默认：USD) |
| `freight` | number | ❌ | 运费 |
| `tax` | number | ❌ | 税费 |
| `terms.payment` | string | ❌ | 付款条款 |
| `terms.packaging` | string | ❌ | 包装条款 |
| `terms.remarks` | string | ❌ | 备注 |

## 🏦 银行账户

银行账户信息从统一配置文件自动加载：
- 配置文件：`config/bank-accounts.json`
- 自动集成：无需手动填写银行信息
- 统一更新：修改配置文件，所有 PI 自动更新

## 常用命令

### 生成 PI
```bash
python3 skills/pi-workflow/scripts/generate_pi.py \
  --data data/customer.json \
  --output PI-20260327-001.html
```

### 快速测试
```bash
python3 skills/pi-workflow/scripts/generate_pi.py \
  --output test.html \
  --quick-test
```

### 在浏览器打开
```bash
open PI-20260327-001.html
```

### 导出 PDF
```bash
# 脚本自动生成 PDF（无页眉页脚）
# 或使用 Chrome 命令行手动导出：
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=PI-20260327-001.pdf \
  file://$(pwd)/PI-20260327-001.html
```

## 依赖

- **Python 3** (已安装)

## 示例文件

```
skills/pi-workflow/
├── template-standard.json       # 标准模板
├── scripts/
│   └── generate_pi.py          # PI 生成脚本
└── examples/
    └── sample.json    # Your Company 产品示例
```

## 相关文档

- **报价单工作流：** `../quotation-workflow/SKILL.md`
- **银行账户配置：** `../../config/bank-accounts.json`

## 版本历史

- **1.0.0** (2026-03-27) - 初始版本
  - ✅ PI 生成（传统风格）
  - ✅ 银行账户自动集成
  - ✅ 数据验证
  - ✅ PDF 导出支持
