---
name: 报价单工作流
slug: quotation-workflow
version: 2.1.0
description: 自动化生成报价单（Excel/Word/HTML/PDF），支持页码添加、标准 A4 打印
metadata: {"clawdbot":{"emoji":"📋","requires":{"bins":["chrome","python3"]},"os":["darwin"]}}
---

# 📋 报价单工作流

自动化生成专业报价单，支持 Excel/Word/PDF 三种格式，可集成 OKKI CRM 客户数据。

## 🚨 报价单发送前检查（强制）

发送 quotation / PI / follow-up 前，先过这 4 项：

### 1. PDF 文件名必须是最终名
```text
✅ 正确：QT-20260330-001.pdf
❌ 错误：QT-20260330-001-Final.pdf
❌ 错误：QT-20260330-001-HTML.pdf
❌ 错误：QT-20260330-001-Excel.pdf
```

### 2. 附件只发这两种
```text
✅ QT-20260330-001.pdf   （HTML 转 PDF，Chrome 导出）
✅ QT-20260330-001.xlsx  （Excel 原文件）
❌ QT-20260330-001.docx
❌ Excel / LibreOffice 导出的 PDF
```

### 3. 正文必须是 HTML
```text
❌ **QUOTATION SUMMARY:**
✅ <strong>QUOTATION SUMMARY:</strong>
```

发送邮件时要显式加：
- `--html`
- `--body "<p>...</p>"` 或 `--body-file xxx.html`

### 4. Follow-up 必须挂原线程
```text
✅ --reply-to <原邮件 UID>
❌ 不带 --reply-to 直接发 Re: ...
```

### 快速自检
```text
[ ] PDF 名称是 QT-XXXX-XXX.pdf
[ ] 附件只有 PDF + xlsx
[ ] 正文是 HTML，不是 Markdown
[ ] follow-up 已带 --reply-to
```

---

## ⚠️ 重要教训（必读！）

### 教训 2：禁止使用示例报价单发送给客户 ⭐⭐⭐

示例报价单只用于测试和演示，**绝对不能发给真实客户**。

**必须遵守：**
```text
开发信 / follow-up / quotation 邮件前：
1. 先按客户信息生成专属报价单
2. 确认附件是 QT-XXXX-XXX.pdf + QT-XXXX-XXX.xlsx
3. 不要发送 examples/ 里的任何测试文件
```

---

## 🚀 快速开始（标准工作流）

### 方式 1：一键生成（最简单 ⭐）

```bash
# 一键生成所有格式（Excel + Word + HTML + PDF）
/path/to/your/.openclaw/workspace/skills/quotation-workflow/scripts/generate-all.sh \
  my_quotation.json \
  QT-20260314-001

# 邮件附件：QT-20260314-001.pdf + QT-20260314-001.xlsx ⭐
```

### 方式 2：标准流程（带页码）

```bash
# 1. 准备数据
cp /path/to/your/.openclaw/workspace/skills/quotation-workflow/examples/your-company_sample.json \
   my_quotation.json

# 2. 生成 HTML
python3 /path/to/your/.openclaw/workspace/skills/quotation-workflow/scripts/generate_quotation_html.py \
  --data my_quotation.json \
  --output QT-20260314-001.html

# 3. Chrome 导出 PDF（无页眉页脚）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=QT-20260314-001.pdf \
  "file://$(pwd)/QT-20260314-001.html"

# 4. 如需加页码，请直接覆写最终文件名或另存后重命名回最终名
python3 /path/to/your/.openclaw/workspace/skills/quotation-workflow/scripts/add-pagenumbers.py \
  QT-20260314-001.pdf \
  QT-20260314-001-paged.pdf
mv QT-20260314-001-paged.pdf QT-20260314-001.pdf

# 邮件附件：QT-20260314-001.pdf + QT-20260314-001.xlsx ⭐
```

### 方式 3：单独生成

```bash
# Excel 版本
python3 /path/to/your/.openclaw/workspace/skills/excel-xlsx/scripts/generate_quotation_traditional.py \
  --data my_quotation.json --output QT-001.xlsx

# Word 版本
python3 /path/to/your/.openclaw/workspace/skills/word-docx/scripts/generate_quotation_docx.py \
  --data my_quotation.json --output QT-001.docx

# HTML 版本（现代设计，推荐 ⭐）
python3 /path/to/your/.openclaw/workspace/skills/quotation-workflow/scripts/generate_quotation_html.py \
  --data my_quotation.json --output QT-001.html
```

## 数据格式

### 完整示例

```json
{
  "customer": {
    "company_name": "客户公司名称",
    "contact": "联系人姓名",
    "email": "customer@example.com",
    "phone": "+1-234-567-8900",
    "address": "客户地址"
  },
  "quotation": {
    "quotation_no": "QT-20260314-001",
    "date": "2026-03-14",
    "valid_until": "2026-04-13"
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
  "payment_terms": "T/T 30% deposit, 70% before shipment",
  "lead_time": "15-20 days after deposit",
  "freight": 150.00,
  "tax": 0,
  "notes": "1. 以上价格基于当前原材料成本\n2. 最终价格以确认为准"
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
| `quotation.quotation_no` | string | ✅ | 报价单号 |
| `quotation.date` | string | ✅ | 报价日期 (YYYY-MM-DD) |
| `quotation.valid_until` | string | ✅ | 有效期至 |
| `products` | array | ✅ | 产品列表 |
| `products[].description` | string | ✅ | 产品描述 |
| `products[].specification` | string | ✅ | 规格型号 |
| `products[].quantity` | number | ✅ | 数量 |
| `products[].unit_price` | number | ✅ | 单价 (USD) |
| `currency` | string | ❌ | 币别 (默认：USD) |
| `payment_terms` | string | ❌ | 付款条款 |
| `lead_time` | string | ❌ | 交货期 |
| `freight` | number | ❌ | 运费 |
| `tax` | number | ❌ | 税费 |
| `notes` | string | ❌ | 备注 |

## 脚本位置

| 功能 | 脚本路径 |
|------|----------|
| **Excel 生成** | `/path/to/your/.openclaw/workspace/skills/excel-xlsx/scripts/generate_quotation.py` |
| **Excel 读取** | `/path/to/your/.openclaw/workspace/skills/excel-xlsx/scripts/read_excel.py` |
| **Word 生成** | `/path/to/your/.openclaw/workspace/skills/word-docx/scripts/generate_quotation_docx.py` |
| **Word 读取** | `/path/to/your/.openclaw/workspace/skills/read-docx/read-docx.py` |
| **HTML 生成 ⭐** | `/path/to/your/.openclaw/workspace/skills/quotation-workflow/scripts/generate_quotation_html.py` |
| **PDF 转换** | `/path/to/your/.openclaw/workspace/skills/quotation-workflow/scripts/convert-to-pdf.sh` |
| **一键生成** | `/path/to/your/.openclaw/workspace/skills/quotation-workflow/scripts/generate-all.sh` |

## 📎 产品目录（Catalogue）

**统一位置：** `/path/to/your/.openclaw/workspace/obsidian-vault/Your Company 知识库/02-产品目录/`

**可用目录：**
- `SKW 2026 catalogue-15M.pdf` - 2026 版完整产品目录

**邮件发送示例：**
```bash
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Re: Product Catalog & Quotation" \
  --reply-to <原邮件 UID> \
  --html --body-file "email.html" \
  --attach "/path/to/your/.openclaw/workspace/obsidian-vault/Your Company 知识库/02-产品目录/SKW 2026 catalogue-15M.pdf" \
  --attach "QT-20260314-001.pdf" \
  --attach "QT-20260314-001.xlsx"
```

## 示例文件

```
/path/to/your/.openclaw/workspace/skills/quotation-workflow/examples/
├── your-company_sample.json                    # Your Company 产品示例
├── QT-20260314-001-Your Company.xlsx          # Excel 示例
├── QT-20260314-001-Your Company.docx          # Word 示例
├── QT-20260314-001-Your Company.html          # HTML 示例（现代设计 ⭐）
└── QT-20260314-001-Your Company.pdf           # PDF 示例
```

## 常用命令

### 读取 Excel 内容
```bash
python3 /path/to/your/.openclaw/workspace/skills/excel-xlsx/scripts/read_excel.py \
  "QT-*.xlsx" --format table -v
```

### 批量转换 PDF
```bash
/path/to/your/.openclaw/workspace/skills/quotation-workflow/scripts/convert-to-pdf.sh \
  *.xlsx *.docx
```

### 指定输出目录
```bash
OUTPUT_DIR=/path/to/output \
  ./convert-to-pdf.sh QT-20260314-001.xlsx
```

## 依赖

- **Python 3** (已安装)
- **openpyxl** (Excel 处理，已安装)
- **python-docx** (Word 处理，已安装)
- **LibreOffice** (PDF 导出，已安装 🍺)

## 集成 OKKI CRM（Phase 2）

待实现：
- [ ] 从 OKKI 自动读取客户信息
- [ ] 从 OKKI 产品库获取价格
- [ ] 报价单关联客户 ID
- [ ] 自动创建跟进记录

## 邮件发送（Phase 3）

## 待优化

- [ ] **Excel 列宽优化** — 序号列太宽，需要调窄（2026-03-26 反馈）
- [ ] 自动附加 PDF 报价单
- [ ] 邮件模板
- [ ] 发送记录归档

## 常见问题

### Q: 中文文件名乱码？
A: 使用 glob 通配符：
```bash
python3 read_excel.py "报价单*.xlsx"  # ✅
python3 read_excel.py "报价单 123.xlsx"  # ❌ 可能失败
```

### Q: PDF 转换失败？
A: 检查 LibreOffice 是否安装：
```bash
which soffice  # 应该输出 /opt/homebrew/bin/soffice
```

### Q: 如何批量生成？
```bash
for file in quotations/*.json; do
  python3 generate_quotation.py --data "$file" \
    --output "output/$(basename $file .json).xlsx"
done
```

## 相关文档

- **快速开始：** `QUICK_START.md`
- **完整文档：** `README.md`
- **工具集成：** `/path/to/your/.openclaw/workspace/TOOLS.md`

## 版本历史

- **1.1.0** (2026-03-14) - HTML 版本新增
  - ✅ HTML 报价单生成（现代设计，Tailwind CSS）
  - ✅ 一键生成脚本更新（支持 HTML）
  - ✅ 浏览器直接导出 PDF（高质量）

- **1.0.0** (2026-03-14) - 初始版本
  - ✅ Excel 生成/读取
  - ✅ Word 生成/读取
  - ✅ PDF 导出
  - ✅ 示例数据和模板
  
  <description>待补充描述</description>
  <location>/path/to/your/.openclaw/workspace/skills/quotation-workflow</location>
