---
name: 报价单工作流
slug: quotation-workflow
version: 2.1.0
description: 自动化生成报价单（Excel/Word/HTML/PDF），支持页码添加、标准 A4 打印
metadata: {"clawdbot":{"emoji":"📋","requires":{"bins":["chrome","python3"]},"os":["darwin"]}}
---

# 📋 报价单工作流

自动化生成专业报价单，支持 Excel/Word/PDF 三种格式，可集成 OKKI CRM 客户数据。

## ⚠️ 重要教训（必读！）

### 教训 1：邮件附件必须使用 HTML 转换的 PDF

```
✅ 邮件附件 = HTML 转换的 PDF（现代设计，专业美观）
⚠️ Excel PDF  = 内部存档（传统风格，不发送客户）
```

### 教训 2：禁止使用示例报价单发送给客户 ⭐⭐⭐

**事件：** 2026-03-15 给美国客户发开发信时，直接使用了 `examples/QT-TEST-001-Final.pdf` 示例文件。

**问题：**
- ❌ 报价单上没有客户公司名称和地址
- ❌ 产品列表不是针对客户需求定制的
- ❌ 显得不专业，像群发垃圾邮件

**正确流程（必须遵守）：**
```markdown
1. 收集客户信息（公司名、地址、行业、联系人）
2. 创建报价单数据文件（JSON 格式）
   位置：data/<客户简称>.json
3. 调用报价单生成 skill
   bash scripts/generate-all.sh data/<客户数据>.json QT-<日期>-<客户简称>
4. 确认生成的 PDF 文件（*-Final.pdf 或 *-HTML.pdf）
5. 发送邮件时附上这份专属报价单
```

**原则：**
> **每次开发信必须生成新的专属报价单，禁止使用示例文件。**  
> 示例文件仅用于测试和演示，绝对不能发送给真实客户。

**记忆口诀：**
```
开发信三件套：个性化正文 + 产品目录 + 专属报价单 ⭐
示例文件 = 测试用，禁止发给客户 ❌
```

---

**错误案例（不要这样做）：**
```bash
# ❌ 错误：发送 Excel 转换的 PDF
soffice --headless --convert-to pdf QT-001.xlsx
# 问题：设计简单，不够专业
```

**正确流程（必须这样做）：**
```bash
# ✅ 正确：发送 HTML 转换的 PDF
python3 generate_quotation_html.py --data data.json -o QT-001.html
chrome --headless --no-pdf-header-footer \
  --print-to-pdf=QT-001.pdf file://QT-001.html
python3 add-pagenumbers.py QT-001.pdf QT-001-Final.pdf
# 邮件附件：QT-001-Final.pdf ⭐
```

**记忆口诀：**
```
邮件附件 = HTML 的 PDF ⭐
Excel PDF = 内部存档
```

---

## 📧 邮件发送规则

**重要：邮件附件使用 HTML 转换的 PDF**

```
✅ 邮件附件 = HTML 转换的 PDF（现代设计，专业美观）
⚠️ 不是 Excel 转换的 PDF（传统风格，仅内部存档）
```

---

## 🚀 快速开始（标准工作流）

### 方式 1：一键生成（最简单 ⭐）

```bash
# 一键生成所有格式（Excel + Word + HTML + PDF）
/Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/generate-all.sh \
  my_quotation.json \
  QT-20260314-001

# 邮件附件：QT-20260314-001-HTML.pdf ⭐
```

### 方式 2：标准流程（带页码）

```bash
# 1. 准备数据
cp /Users/wilson/.openclaw/workspace/skills/quotation-workflow/examples/farreach_sample.json \
   my_quotation.json

# 2. 生成 HTML
python3 /Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/generate_quotation_html.py \
  --data my_quotation.json \
  --output QT-20260314-001.html

# 3. Chrome 导出 PDF（无页眉页脚）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=QT-20260314-001.pdf \
  "file://$(pwd)/QT-20260314-001.html"

# 4. 添加页码（底部右侧）
python3 /Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/add-pagenumbers.py \
  QT-20260314-001.pdf \
  QT-20260314-001-Final.pdf

# 邮件附件：QT-20260314-001-Final.pdf ⭐
```

### 方式 3：单独生成

```bash
# Excel 版本
python3 /Users/wilson/.openclaw/workspace/skills/excel-xlsx/scripts/generate_quotation_traditional.py \
  --data my_quotation.json --output QT-001.xlsx

# Word 版本
python3 /Users/wilson/.openclaw/workspace/skills/word-docx/scripts/generate_quotation_docx.py \
  --data my_quotation.json --output QT-001.docx

# HTML 版本（现代设计，推荐 ⭐）
python3 /Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/generate_quotation_html.py \
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
| **Excel 生成** | `/Users/wilson/.openclaw/workspace/skills/excel-xlsx/scripts/generate_quotation.py` |
| **Excel 读取** | `/Users/wilson/.openclaw/workspace/skills/excel-xlsx/scripts/read_excel.py` |
| **Word 生成** | `/Users/wilson/.openclaw/workspace/skills/word-docx/scripts/generate_quotation_docx.py` |
| **Word 读取** | `/Users/wilson/.openclaw/workspace/skills/read-docx/read-docx.py` |
| **HTML 生成 ⭐** | `/Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/generate_quotation_html.py` |
| **PDF 转换** | `/Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/convert-to-pdf.sh` |
| **一键生成** | `/Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/generate-all.sh` |

## 📎 产品目录（Catalogue）

**统一位置：** `/Users/wilson/.openclaw/workspace/obsidian-vault/Farreach 知识库/02-产品目录/`

**可用目录：**
- `SKW 2026 catalogue-15M.pdf` - 2026 版完整产品目录

**邮件发送示例：**
```bash
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "🔌 Product Catalog & Quotation" \
  --html --body-file "email.html" \
  --attach "/Users/wilson/.openclaw/workspace/obsidian-vault/Farreach 知识库/02-产品目录/SKW 2026 catalogue-15M.pdf" \
  --attach "QT-20260314-001-Final.pdf"
```

## 示例文件

```
/Users/wilson/.openclaw/workspace/skills/quotation-workflow/examples/
├── farreach_sample.json                    # Farreach 产品示例
├── QT-20260314-001-Farreach.xlsx          # Excel 示例
├── QT-20260314-001-Farreach.docx          # Word 示例
├── QT-20260314-001-Farreach.html          # HTML 示例（现代设计 ⭐）
└── QT-20260314-001-Farreach.pdf           # PDF 示例
```

## 常用命令

### 读取 Excel 内容
```bash
python3 /Users/wilson/.openclaw/workspace/skills/excel-xlsx/scripts/read_excel.py \
  "QT-*.xlsx" --format table -v
```

### 批量转换 PDF
```bash
/Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/convert-to-pdf.sh \
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
- **工具集成：** `/Users/wilson/.openclaw/workspace/TOOLS.md`

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
  <location>/Users/wilson/.openclaw/workspace/skills/quotation-workflow</location>
