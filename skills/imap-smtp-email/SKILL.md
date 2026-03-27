---
name: imap-smtp-email
description: Read and send email via IMAP/SMTP. Check for new/unread messages, fetch content, search mailboxes, mark as read/unread, and send emails with attachments. Works with any IMAP/SMTP server including Gmail, Outlook, 163.com, vip.163.com, 126.com, vip.126.com, 188.com, and vip.188.com.
metadata:
  openclaw:
    emoji: "📧"
    requires:
      env:
        - IMAP_HOST
        - IMAP_USER
        - IMAP_PASS
        - SMTP_HOST
        - SMTP_USER
        - SMTP_PASS
      bins:
        - node
        - npm
    primaryEnv: SMTP_PASS
---

# IMAP/SMTP Email Tool

Read, search, and manage email via IMAP protocol. Send email via SMTP. Supports Gmail, Outlook, 163.com, vip.163.com, 126.com, vip.126.com, 188.com, vip.188.com, and any standard IMAP/SMTP server.

## Configuration

Create `.env` in the skill folder or set environment variables:

```bash
# IMAP Configuration (receiving email)
IMAP_HOST=imap.gmail.com          # Server hostname
IMAP_PORT=993                     # Server port
IMAP_USER=your@email.com
IMAP_PASS=your_password
IMAP_TLS=true                     # Use TLS/SSL connection
IMAP_REJECT_UNAUTHORIZED=true     # Set to false for self-signed certs
IMAP_MAILBOX=INBOX                # Default mailbox

# SMTP Configuration (sending email)
SMTP_HOST=smtp.gmail.com          # SMTP server hostname
SMTP_PORT=587                     # SMTP port (587 for STARTTLS, 465 for SSL)
SMTP_SECURE=false                 # true for SSL (465), false for STARTTLS (587)
SMTP_USER=your@gmail.com          # Your email address
SMTP_PASS=your_password           # Your password or app password
SMTP_FROM=your@gmail.com          # Default sender email (optional)
SMTP_REJECT_UNAUTHORIZED=true     # Set to false for self-signed certs
```

## Common Email Servers

| Provider | IMAP Host | IMAP Port | SMTP Host | SMTP Port |
|----------|-----------|-----------|-----------|-----------|
| 163.com | imap.163.com | 993 | smtp.163.com | 465 |
| vip.163.com | imap.vip.163.com | 993 | smtp.vip.163.com | 465 |
| 126.com | imap.126.com | 993 | smtp.126.com | 465 |
| vip.126.com | imap.vip.126.com | 993 | smtp.vip.126.com | 465 |
| 188.com | imap.188.com | 993 | smtp.188.com | 465 |
| vip.188.com | imap.vip.188.com | 993 | smtp.vip.188.com | 465 |
| yeah.net | imap.yeah.net | 993 | smtp.yeah.net | 465 |
| Gmail | imap.gmail.com | 993 | smtp.gmail.com | 587 |
| Outlook | outlook.office365.com | 993 | smtp.office365.com | 587 |
| QQ Mail | imap.qq.com | 993 | smtp.qq.com | 587 |

**Important for Gmail:**
- Gmail does **not** accept your regular account password
- You must generate an **App Password**: https://myaccount.google.com/apppasswords
- Use the generated 16-character App Password as `IMAP_PASS` / `SMTP_PASS`
- Requires Google Account with 2-Step Verification enabled

**Important for 163.com:**
- Use **authorization code** (授权码), not account password
- Enable IMAP/SMTP in web settings first

## IMAP Commands (Receiving Email)

### check
Check for new/unread emails.

```bash
node scripts/imap.js check [--limit 10] [--mailbox INBOX] [--recent 2h]
```

Options:
- `--limit <n>`: Max results (default: 10)
- `--mailbox <name>`: Mailbox to check (default: INBOX)
- `--recent <time>`: Only show emails from last X time (e.g., 30m, 2h, 7d)

### fetch
Fetch full email content by UID.

```bash
node scripts/imap.js fetch <uid> [--mailbox INBOX]
```

### download
Download all attachments from an email, or a specific attachment.

```bash
node scripts/imap.js download <uid> [--mailbox INBOX] [--dir <path>] [--file <filename>]
```

Options:
- `--mailbox <name>`: Mailbox (default: INBOX)
- `--dir <path>`: Output directory (default: current directory)
- `--file <filename>`: Download only the specified attachment (default: download all)

### search
Search emails with filters.

```bash
node scripts/imap.js search [options]

Options:
  --unseen           Only unread messages
  --seen             Only read messages
  --from <email>     From address contains
  --subject <text>   Subject contains
  --recent <time>    From last X time (e.g., 30m, 2h, 7d)
  --since <date>     After date (YYYY-MM-DD)
  --before <date>    Before date (YYYY-MM-DD)
  --limit <n>        Max results (default: 20)
  --mailbox <name>   Mailbox to search (default: INBOX)
```

### mark-read / mark-unread
Mark message(s) as read or unread.

```bash
node scripts/imap.js mark-read <uid> [uid2 uid3...]
node scripts/imap.js mark-unread <uid> [uid2 uid3...]
```

### list-mailboxes
List all available mailboxes/folders.

```bash
node scripts/imap.js list-mailboxes
```

## SMTP Commands (Sending Email)

### send
Send email via SMTP.

```bash
node scripts/smtp.js send --to <email> --subject <text> [options]
```

**Required:**
- `--to <email>`: Recipient (comma-separated for multiple)
- `--subject <text>`: Email subject, or `--subject-file <file>`

**Optional:**
- `--body <text>`: Plain text body
- `--html`: Send body as HTML
- `--body-file <file>`: Read body from file
- `--html-file <file>`: Read HTML from file
- `--cc <email>`: CC recipients
- `--bcc <email>`: BCC recipients
- `--attach <file>`: Attachments (comma-separated)
- `--from <email>`: Override default sender

**Examples:**
```bash
# Simple text email
node scripts/smtp.js send --to recipient@example.com --subject "Hello" --body "World"

# HTML email
node scripts/smtp.js send --to recipient@example.com --subject "Newsletter" --html --body "<h1>Welcome</h1>"

# Email with attachment
node scripts/smtp.js send --to recipient@example.com --subject "Report" --body "Please find attached" --attach report.pdf

# Multiple recipients
node scripts/smtp.js send --to "a@example.com,b@example.com" --cc "c@example.com" --subject "Update" --body "Team update"
```

---

## ⭐ 开发信发送完整工作流（Farreach 外贸场景）

### ⚠️ 重要原则：禁止直接照抄模板！

**模板仅作为结构参考，每次发送前必须根据收件人信息生成个性化正文内容。**

**错误示例（禁止）：**
- ❌ 直接发送 `development-email.html` 给所有客户（内容写死了 "Paul and QUADNET Team"）
- ❌ 模板里的客户名、地点、行业信息不修改就发送
- ❌ 发送给意大利客户但内容提到 "Queensland, Australia"

**正确做法：**
- ✅ 模板只参考结构（问候 → 寒暄 → 公司介绍 → 附件说明 → 行动号召 → 签名）
- ✅ 根据客户信息（公司名、国家、行业）生成个性化寒暄内容
- ✅ 使用动态生成的 HTML 文件或 `--body` 参数发送定制内容

---

### 发送前检查清单 ✅

**必须按顺序执行，确保一次性发送完整邮件：**

```markdown
1. [ ] **收集客户信息**（从 OKKI 或其他来源）
   - 公司名称
   - 国家/地区
   - 行业/业务类型
   - 联系人姓名（如有）
   - 邮箱地址

2. [ ] **生成个性化邮件正文** ⭐
   - 根据客户信息定制寒暄内容（提及客户所在地/行业）
   - 调整语气和重点（不同市场关注点不同）
   - 生成 HTML 文件或准备 `--body` 内容
   - **禁止直接照抄模板中的特定客户信息**

3. [ ] 确认产品目录存在
   - 检查：`/Users/wilson/.openclaw/workspace/obsidian-vault/Farreach 知识库/02-产品目录/SKW 2026 catalogue-15M.pdf`
   - 路径包含空格，命令中需要用引号包裹

4. [ ] **生成专属报价单** ⭐⭐⭐（禁止使用示例文件）
   - **原则：** 每次开发信必须生成新的专属报价单，禁止使用示例文件
   - **步骤：**
     ```bash
     # 1. 创建客户专属数据文件
     # 位置：/Users/wilson/.openclaw/workspace/skills/quotation-workflow/data/<客户简称>.json
     # 内容：客户公司名、地址、产品列表、价格
     
     # 2. 调用报价单生成 skill
     cd /Users/wilson/.openclaw/workspace/skills/quotation-workflow
     bash scripts/generate-all.sh data/<客户数据>.json QT-<日期>-<客户简称>
     
     # 3. 确认生成的 PDF 文件
     ls data/QT-*.pdf
     ```
   - **重要：** 邮件附件必须使用 HTML 转换的 PDF（`*-HTML.pdf` 或 `*-Final.pdf`）
     - ✅ HTML 转换的 PDF = 邮件附件（现代设计，专业美观）
     - ⚠️ Excel 转换的 PDF = 内部存档（仅用于内部，不发送客户）
   - **禁止：** ❌ 不要使用 `examples/` 目录的示例报价单发送给客户

5. [ ] 确认所有附件路径正确且文件可读
   ```bash
   ls -la "/path/to/catalogue.pdf"
   ls -la "/path/to/quotation.pdf"
   ```

6. [ ] 一次性发送完整邮件（正文 + 目录 + 报价单）
```

### 个性化内容生成指南

**邮件结构模板（参考用，内容需定制）：**

```markdown
1. 问候 + 寒暄
   - 提及客户公司名称
   - 提及客户所在地（国家/城市）
   - 提及客户行业/业务（显示了解）

2. 公司介绍（Farreach 核心优势）
   - 18 年经验、HDMI 认证、ISO9001
   - 中越双基地（珠海 + 越南）
   - 产能优势（80 万件/月）

3. 附件说明
   - 产品目录（2026 版）
   - 报价单（针对性产品）

4. 行动号召
   - 邀请询价
   - 提供免费样品
   - 说明交期和 MOQ

5. 签名
   - 公司名称
   - 联系方式
   - 核心优势摘要
```

**不同国家客户的寒暄示例：**

| 国家 | 寒暄要点 | 示例 |
|------|----------|------|
| 🇮🇹 意大利 | 提及工业传统、设计美学 | "I trust business is thriving in [city/region]. Italy has a renowned reputation for design excellence..." |
| 🇦🇺 澳大利亚 | 提及地理位置、电信基建 | "I noticed you're based in Queensland – beautiful area! I trust your telecommunications infrastructure projects are going strong." |
| 🇺🇸 美国 | 直接、效率导向 | "I'm reaching out to explore how Farreach can support your upcoming projects with competitive pricing and fast turnaround." |
| 🇩🇪 德国 | 强调质量、认证、可靠性 | "Our HDMI 2.1 certification and ISO9001 quality management ensure consistent performance for your demanding applications." |

### 完整发送命令示例

```bash
cd /Users/wilson/.openclaw/workspace/skills/imap-smtp-email

# 方式 1：使用动态生成的 HTML 文件（推荐⭐）
node scripts/smtp.js send \
  --to "info@label-italy.com" \
  --subject "🔌 Premium Cable Solutions from Farreach Electronic - Quotation Attached" \
  --html \
  --body-file "/Users/wilson/.openclaw/workspace/mail-attachments/label_italy_development.html" \
  --attach "/Users/wilson/.openclaw/workspace/obsidian-vault/Farreach 知识库/02-产品目录/SKW 2026 catalogue-15M.pdf,/Users/wilson/.openclaw/workspace/skills/quotation-workflow/output/QT-20260315-001.pdf"

# 方式 2：直接用 --body 发送定制 HTML
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "🔌 Cable Solutions for [Company Name]" \
  --html \
  --body "<html><body><p>Dear [Name] Team,</p><p>I hope this email finds you well in [Country]...</p></body></html>" \
  --attach "catalogue.pdf,quotation.pdf"
```

### 常见错误与避免方法

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 只发了目录，没发报价单 | 没有检查 `examples/` 目录已有现成报价单 | 发送前必须检查 `output/` **和** `examples/` 两个目录 |
| 附件路径错误 | 路径包含空格未用引号包裹 | 路径有空格时用双引号包裹 |
| 报价单不存在 | 没有先生成就发送 | 运行 `generate-all.sh` 生成报价单 |
| 多次发送碎片邮件 | 没有做完整检查就发送 | 严格执行发送前检查清单 |

### 报价单生成快速参考

**使用报价单生成 skill（quotation-workflow）：**

```bash
# 查看已有报价单
ls /Users/wilson/.openclaw/workspace/skills/quotation-workflow/output/
ls /Users/wilson/.openclaw/workspace/skills/quotation-workflow/examples/

# 生成新报价单（一键生成 ⭐）
cd /Users/wilson/.openclaw/workspace/skills/quotation-workflow
bash scripts/generate-all.sh quotation_data.json QT-20260315-001

# 生成的文件：
# - QT-20260315-001.xlsx (Excel 版本)
# - QT-20260315-001.docx (Word 版本)
# - QT-20260315-001.html (HTML 版本，现代设计 ⭐)
# - QT-20260315-001-HTML.pdf (HTML 转换的 PDF，邮件附件 ⭐)

# 只生成 PDF（从 HTML）
bash scripts/convert-to-pdf.sh output/QT-20260315-001.html
```

**报价单数据模板：**
```json
{
  "customer": {
    "company_name": "LABEL ITALY",
    "contact": "联系人姓名",
    "email": "info@label-italy.com",
    "country": "Italy"
  },
  "quotation": {
    "quotation_no": "QT-20260315-001",
    "date": "2026-03-15",
    "valid_until": "2026-04-14"
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
  "lead_time": "15-20 days after deposit"
}
```

**相关 skill 文档：**
- 报价单生成：`/Users/wilson/.openclaw/workspace/skills/quotation-workflow/SKILL.md`
- 快速开始：`/Users/wilson/.openclaw/workspace/skills/quotation-workflow/QUICK_START.md`
- 示例数据：`/Users/wilson/.openclaw/workspace/skills/quotation-workflow/examples/farreach_sample.json`

---

## 教训与反思

### 📝 教训 1：报价单遗漏 (2026-03-15)

**事件：** 给意大利客户 LABEL ITALY 发开发信时，先发送了只有产品目录的邮件，被指出应该附带报价单一起发送。

**根本原因：**
1. 看到 `output/` 目录不存在，就默认"没有报价单"
2. 没有检查 `examples/` 目录里已经有现成的报价单（`QT-20260314-004.pdf` 等）
3. 急于完成任务，没有执行完整的发送前检查

**改进措施：**
- ✅ 在 SKILL.md 中添加发送前检查清单
- ✅ 明确报价单检查需要查看 `output/` **和** `examples/` 两个目录
- ✅ 添加完整工作流示例和常见错误表

**原则：** 发送前做完整检查，一次性发送完整邮件，避免碎片化沟通。

---

### 📝 教训 2：直接照抄模板内容 (2026-03-15) ⭐

**事件：** 给意大利客户 LABEL ITALY 发送开发信时，直接使用了 `development-email.html` 模板，内容中包含：
- "Hi Paul and the QUADNET Team"（澳洲客户名称）
- "West Gladstone, Queensland"（澳洲地点）
- 其他与意大利客户完全不相关的信息

**问题严重性：**
- ❌ 客户收到后会发现这是群发模板邮件，缺乏诚意
- ❌ 显得不专业，降低信任度
- ❌ 可能直接被客户标记为垃圾邮件

**根本原因：**
1. 把模板当成了"可以直接发送的成品"
2. 没有理解模板仅作为结构参考
3. 没有根据客户信息生成个性化内容

**改进措施：**
- ✅ 在 SKILL.md 中明确"禁止直接照抄模板"原则
- ✅ 添加发送前检查清单：必须生成个性化正文
- ✅ 提供不同国家客户的寒暄示例
- ✅ 说明模板的正确用法（结构参考，不是成品）

**原则：** 
> **模板只参考结构，内容必须定制。**  
> 每次发送前，根据客户信息（公司名、国家、行业）生成个性化正文。  
> 宁可多花 2 分钟定制内容，也不要发送千篇一律的模板邮件。

---

### 📝 教训 3：碎片化发送 (2026-03-15)

**事件：** 先发一封只有目录的邮件，后补发带报价单的邮件。

**问题：**
- 客户收到两封独立邮件，体验差
- 显得工作流程混乱
- 增加沟通成本

**原则：** 发送前做完整检查，一次性发送完整邮件。

---

### 📝 教训 4：使用示例报价单而非生成专属报价单 (2026-03-15) ⭐⭐⭐

**事件：** 给美国客户 SPECIALIZED COMPUTER PRODUCTS USA 发送开发信时，直接使用了 `examples/QT-TEST-001-Final.pdf` 这个示例文件，而不是为客户生成专属报价单。

**问题严重性：**
- ❌ 报价单上没有客户公司名称和地址
- ❌ 产品列表不是针对客户需求定制的
- ❌ 显得不专业，像群发垃圾邮件
- ❌ 客户无法用这份报价单做内部采购申请

**根本原因：**
1. **偷懒走捷径** - 看到 `examples/` 目录有现成的 PDF，就直接用了
2. **违反检查清单** - 没有执行"如报价单不存在，调用报价单生成 skill"这一步
3. **没有客户视角** - 为了快速完成任务，跳过定制环节

**正确流程（必须遵守）：**

```markdown
1. 收集客户信息（公司名、地址、行业、联系人）
2. 创建报价单数据文件（JSON 格式，包含客户信息和产品列表）
3. 调用报价单生成 skill 生成专属报价单：
   cd /Users/wilson/.openclaw/workspace/skills/quotation-workflow
   bash scripts/generate-all.sh data/<客户数据>.json QT-<日期>-<客户简称>
4. 确认生成的 PDF 文件存在（*-Final.pdf 或 *-HTML.pdf）
5. 发送邮件时附上这份专属报价单
```

**示例数据文件模板（复制后修改）：**
```json
{
  "quotationNo": "QT-20260315-002",
  "date": "2026-03-15",
  "validUntil": "2026-04-14",
  "customer": {
    "name": "客户公司名",
    "address": "客户地址",
    "country": "国家",
    "email": "客户邮箱",
    "phone": "客户电话"
  },
  "products": [
    {
      "description": "产品描述",
      "specification": "规格参数",
      "quantity": 1000,
      "unitPrice": 3.50
    }
  ],
  "terms": {
    "moq": "500 pcs (negotiable)",
    "delivery": "7-15 days for standard products",
    "payment": "T/T, L/C, PayPal",
    "packaging": "Gift box, kraft box, PE bag"
  }
}
```

**字段说明（脚本已兼容多种格式）：**
- `customer.name` 或 `customer.company_name` ✅ 都支持
- `product.unitPrice` 或 `product.unit_price` ✅ 都支持
- `terms` 可以是字典或列表 ✅ 都支持
- `quotationNo` 或 `quotation.quotation_no` ✅ 都支持

**模板文件位置：** `/Users/wilson/.openclaw/workspace/skills/quotation-workflow/examples/template-standard.json`

**改进措施：**
- ✅ 在 SKILL.md 中明确"禁止使用示例报价单"原则
- ✅ 在发送前检查清单中强调"必须生成专属报价单"
- ✅ 提供报价单数据文件模板和生成命令
- ✅ 将此教训记录到 MEMORY.md

**原则：**
> **每次开发信必须生成新的专属报价单，禁止使用示例文件。**  
> 报价单是正式商务文件，必须包含：客户公司名、地址、定制产品列表、有效报价。  
> 示例文件仅用于测试和演示，绝对不能发送给真实客户。

**记忆口诀：**
```
开发信三件套：个性化正文 + 产品目录 + 专属报价单 ⭐
示例文件 = 测试用，禁止发给客户 ❌
```

### test
Test SMTP connection by sending a test email to yourself.

```bash
node scripts/smtp.js test
```

## Dependencies

```bash
npm install
```

## Security Notes

- Store credentials in `.env` (add to `.gitignore`)
- **Gmail**: regular password is rejected — generate an App Password at https://myaccount.google.com/apppasswords
- For 163.com: use authorization code (授权码), not account password

## Troubleshooting

**Connection timeout:**
- Verify server is running and accessible
- Check host/port configuration

**Authentication failed:**
- Verify username (usually full email address)
- Check password is correct
- For 163.com: use authorization code, not account password
- For Gmail: regular password won't work — generate an App Password at https://myaccount.google.com/apppasswords

**TLS/SSL errors:**
- Match `IMAP_TLS`/`SMTP_SECURE` setting to server requirements
- For self-signed certs: set `IMAP_REJECT_UNAUTHORIZED=false` or `SMTP_REJECT_UNAUTHORIZED=false`
  
  <description>待补充描述</description>
  <location>/Users/wilson/.openclaw/workspace/skills/imap-smtp-email</location>
