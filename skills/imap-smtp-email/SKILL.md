---
name: okki-sync-mail
description: 完整的邮件自动化解决方案，集成 OKKI CRM。支持 IMAP 邮件自动捕获、SMTP 发送邮件、dry-run 模式、发送日志、速率限制、定时发送、签名模板、邮件规则、连接池优化等功能。自动同步 inbound/outbound 邮件到 OKKI 创建跟进记录（remark_type=102）。
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
        - OKKI_CLI_PATH
        - VECTOR_SEARCH_PATH
      bins:
        - node
        - npm
        - python3
    primaryEnv: SMTP_PASS
---

# 📧 OKKI Sync Mail

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

## 📧 邮件管理命令（高级）

### create-mailbox - 创建文件夹

创建新的邮箱文件夹，用于分类归档邮件。

```bash
node scripts/imap.js create-mailbox <文件夹名>
```

**示例：**
```bash
# 创建简单文件夹
node scripts/imap.js create-mailbox 'Important'

# 创建嵌套文件夹
node scripts/imap.js create-mailbox 'Projects/ClientA'
node scripts/imap.js create-mailbox 'Archive/2026'
```

---

### move-mail - 移动邮件

将邮件移动到指定文件夹。

```bash
node scripts/imap.js move-mail <UID> <目标文件夹> [--from <源文件夹>]
```

**参数：**
- `UID`: 邮件 UID（通过 `check` 或 `search` 命令获取）
- `目标文件夹`: 目标邮箱文件夹名称
- `--from`: 可选，源文件夹（默认 INBOX）

**示例：**
```bash
# 移动邮件到 Archive 文件夹
node scripts/imap.js move-mail 12345 'Archive'

# 指定源文件夹
node scripts/imap.js move-mail 12345 'Projects/ClientA' --from INBOX
```

---

### delete-mail - 删除邮件

永久删除指定邮件。

```bash
node scripts/imap.js delete-mail <UID> [--mailbox <文件夹>] --confirm
```

**参数：**
- `UID`: 邮件 UID
- `--mailbox`: 可选，邮件所在文件夹（默认 INBOX）
- `--confirm`: **必需**，确认删除操作

**示例：**
```bash
# 删除 INBOX 中的邮件
node scripts/imap.js delete-mail 12345 --confirm

# 删除指定文件夹中的邮件
node scripts/imap.js delete-mail 12345 --mailbox 'Spam' --confirm
```

⚠️ **注意：**
- 删除操作**不可逆**，必须添加 `--confirm` 标志确认
- 如果不添加 `--confirm`，命令会拒绝执行并显示警告

---

### flag-mail - 标记星标

为邮件添加或移除星标（IMAP `\Flagged` 标志）。

```bash
node scripts/imap.js flag-mail <UID> [--starred|--unstarred] [--mailbox <文件夹>]
```

**参数：**
- `UID`: 邮件 UID
- `--starred`: 添加星标
- `--unstarred`: 移除星标
- `--mailbox`: 可选，邮件所在文件夹（默认 INBOX）

**示例：**
```bash
# 标记星标
node scripts/imap.js flag-mail 12345 --starred

# 取消星标
node scripts/imap.js flag-mail 12345 --unstarred

# 标记指定文件夹中的邮件
node scripts/imap.js flag-mail 12345 --starred --mailbox 'Important'
```

---

### 完整工作流示例

```bash
# 1. 查看邮箱目录
node scripts/imap.js list-mailboxes

# 2. 创建新文件夹
node scripts/imap.js create-mailbox 'Important'

# 3. 检查新邮件，获取 UID
node scripts/imap.js check --limit 5

# 4. 标记重要邮件为星标
node scripts/imap.js flag-mail 12345 --starred

# 5. 移动邮件到文件夹
node scripts/imap.js move-mail 12345 'Important'

# 6. 删除垃圾邮件（需确认）
node scripts/imap.js delete-mail 67890 --confirm
```

---

### 注意事项

1. **UID 获取**：使用 `check` 或 `search` 命令获取邮件 UID
2. **删除确认**：`delete-mail` 必须添加 `--confirm` 标志，防止误删
3. **文件夹存在性**：移动邮件前建议先用 `list-mailboxes` 确认目标文件夹存在
4. **星标标准**：使用 IMAP 标准 `\Flagged` 标志，与邮件客户端兼容
5. **嵌套文件夹**：使用 `/` 分隔符创建嵌套文件夹结构

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
- `--dry-run`: Preview email without actually sending (for testing and verification)
- `--bcc <email>`: BCC recipients
- `--attach <file>`: Attachments (comma-separated)
- `--from <email>`: Override default sender
- `--send-at "YYYY-MM-DD HH:mm"`: Schedule the email for later delivery
- `--reply-to <UID>`: Reply to email by UID (auto-fetch and quote original email, adds In-Reply-To header)
- `--quote <text|@file>`: Append quoted text to email (use @filepath to read from file)
- `--cc <email>`: Override auto-CC (by default, --reply-to enables "Reply All")

**Scheduled sending (定时发送):**
- Pending jobs are stored in `scheduled/` under this skill directory
- `node scripts/smtp.js list-scheduled` lists all scheduled jobs
- `node scripts/smtp.js send-due` sends all pending jobs whose scheduled time has arrived
- If `--send-at` is in the past, the email is sent immediately and the schedule record is still written for audit
- **Time format:** `"YYYY-MM-DD HH:mm"` (e.g., `"2026-03-29 09:30"`)
- **Use case:** Schedule emails for business hours in recipient's timezone, follow-ups, or delayed delivery
- **Audit trail:** All scheduled jobs are logged even if sent immediately (past time)

**Scheduled sending examples:**
```bash
# Schedule for next business day at 9:30 AM
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Follow-up" \
  --body "Hi, following up on our discussion..." \
  --send-at "2026-03-29 09:30"

# Schedule for Monday morning (send on Friday)
node scripts/smtp.js send \
  --to "team@example.com" \
  --subject "Weekly Update" \
  --body "Weekly summary..." \
  --send-at "2026-03-31 08:00"

# List all scheduled jobs
node scripts/smtp.js list-scheduled

# Send all due jobs (typically run by cron)
node scripts/smtp.js send-due
```

**Reply/Threading Support:**
- `--reply-to` automatically fetches the original email from IMAP and appends it as quoted text
- Adds proper `In-Reply-To` and `References` headers for email threading
- **Auto "Reply All"** - automatically CCs all original recipients (sender + to + cc), excluding self
- To reply only to sender (not all), use `--cc ""` to override
- Use `node scripts/imap.js check --limit 10` to find email UIDs

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

# Schedule an email
node scripts/smtp.js send --to recipient@example.com --subject "Later" --body "Send later" --send-at "2026-03-29 09:30"

# Process due scheduled jobs
node scripts/smtp.js send-due

# Reply to email (auto-fetch and quote original, auto "Reply All")
node scripts/smtp.js send --to customer@example.com --subject "Re: Inquiry" --reply-to 12345 --body "Thanks for your email..."

# Reply with custom quote from file
node scripts/smtp.js send --to customer@example.com --subject "Re: Order" --reply-to 12345 --quote "@quoted.txt" --html --body "<p>Please see below...</p>"

# Reply to sender only (override auto "Reply All")
node scripts/smtp.js send --to customer@example.com --subject "Re: Inquiry" --reply-to 12345 --cc "" --body "Just replying to you..."

# Dry-run mode - preview without sending (recommended before sending to customers)
node scripts/smtp.js send --to customer@example.com --subject "Product Inquiry" --body "Test email" --dry-run
```

---

## 🎯 交互式模式 (Interactive Mode)

### 介绍

交互式模式允许你逐步构建和预览邮件内容，适合需要多次调整的场景。通过分步操作，你可以先预览邮件效果，确认无误后再实际发送。

### 使用场景

- ✅ 需要多次修改邮件内容和格式
- ✅ 不确定附件是否正确
- ✅ 需要确认收件人列表和抄送设置
- ✅ 首次使用新签名模板
- ✅ 批量发送前的最终验证

### 交互式工作流程

```bash
cd /Users/wilson/.openclaw/workspace/skills/imap-smtp-email

# 步骤 1: 使用 --dry-run 预览邮件
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Product Inquiry" \
  --body "Dear Customer, ..." \
  --signature en-sales \
  --dry-run

# 输出示例：
# 📧 [DRY RUN] Email preview (not sent):
# To: customer@example.com
# Subject: Product Inquiry
# From: sale-9@farreach-electronic.com
# Body: Dear Customer, ...
# Signature: en-sales (applied)
# Attachments: (none)
# ✅ Ready to send (remove --dry-run to actually send)

# 步骤 2: 检查预览内容，确认无误
# - 检查收件人是否正确
# - 检查主题是否清晰
# - 检查正文内容和格式
# - 检查签名是否正确应用
# - 检查附件路径是否正确

# 步骤 3: 移除 --dry-run 正式发送
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Product Inquiry" \
  --body "Dear Customer, ..." \
  --signature en-sales
```

### 高级交互式用法

**带附件预览：**
```bash
# 预览带附件的邮件（不实际发送）
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Product Catalog" \
  --body "Please find attached our latest catalog." \
  --attach "/path/to/catalogue.pdf" \
  --dry-run

# 输出会显示附件路径和大小信息
```

**HTML 邮件预览：**
```bash
# 预览 HTML 邮件
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Newsletter" \
  --html \
  --body-file "/path/to/email.html" \
  --dry-run

# 输出会显示 HTML 内容摘要
```

**定时发送预览：**
```bash
# 预览定时发送设置
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Follow-up" \
  --body "Following up..." \
  --send-at "2026-03-29 09:30" \
  --dry-run

# 输出会显示计划发送时间
```

### 交互式模式最佳实践

1. **始终先用 --dry-run 预览** - 特别是首次使用新模板或新签名
2. **检查所有细节** - 收件人、主题、正文、附件、签名
3. **确认无误再发送** - 移除 --dry-run 标志正式发送
4. **保留预览习惯** - 即使很熟悉的配置也建议预览

### 注意事项

- ✅ `--dry-run` 模式下不会实际发送邮件
- ✅ `--dry-run` 模式下不会写入发送日志
- ✅ `--dry-run` 模式下不会触发 OKKI 同步
- ✅ 适合安全测试和验证
- ❌ 不要依赖 `--dry-run` 测试实际发送功能（如附件大小限制、服务器连接等）

---

## 📝 邮件签名模板 (Signature Templates)

### 介绍

邮件签名模板功能允许你使用预定义的签名格式，快速为邮件添加专业、统一的签名。签名模板以 JSON 格式存储在 `signatures/` 目录中，支持多语言和多角色。

### 可用签名模板列表

当前可用的签名模板：

| 模板名称 | 语言 | 角色 | 用途 |
|----------|------|------|------|
| `en-sales` | 英文 | 销售 | 标准英文销售签名 |
| `cn-sales` | 中文 | 销售 | 标准中文销售签名 |
| `en-tech` | 英文 | 技术支持 | 英文技术支持签名 |

**查看签名模板详情：**
```bash
# 列出所有可用签名模板
node scripts/smtp.js list-signatures

# 查看特定签名模板内容
node scripts/smtp.js show-signature en-sales
```

### 使用 --signature 参数

在发送邮件时，使用 `--signature` 参数指定签名模板名称：

```bash
# 使用英文销售签名
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Product Inquiry" \
  --body "Dear Customer, ..." \
  --signature en-sales

# 使用中文销售签名
node scripts/smtp.js send \
  --to "customer@china.com" \
  --subject "产品询价" \
  --body "尊敬的客户，..." \
  --signature cn-sales

# 使用技术支持签名
node scripts/smtp.js send \
  --to "tech@example.com" \
  --subject "Technical Support" \
  --body "Dear Customer, ..." \
  --signature en-tech
```

**注意事项：**
- ✅ 签名会自动附加到邮件正文末尾
- ✅ HTML 邮件会自动渲染签名 HTML 格式
- ✅ 纯文本邮件会转换为文本格式签名
- ❌ 签名模板名称不需要 `.json` 后缀

### 签名模板管理 CLI 命令

```bash
# 列出所有可用签名模板
node scripts/smtp.js list-signatures

# 查看特定签名模板的详细内容
node scripts/smtp.js show-signature <name>

# 示例：查看 en-sales 签名
node scripts/smtp.js show-signature en-sales
```

### 签名模板文件结构

签名模板文件位于 `signatures/` 目录，文件命名格式：`signature-<name>.json`

**示例模板 (signature-en-sales.json)：**
```json
{
  "name": "en-sales",
  "language": "en",
  "role": "sales",
  "greeting": "Best regards,",
  "name_field": "[Your Name]",
  "title": "Sales Manager",
  "company": "Farreach Electronic Co., Limited",
  "address_cn": "No. 56, Xingwang Road, Pingshan Town, Jinwan District, Zhuhai, Guangdong, China",
  "address_vn": "Van Lam Industrial Park, Yen My District, Hung Yen Province, Vietnam",
  "email": "sale-9@farreach-electronic.com",
  "phone": "+86 (756) 8699660",
  "website": "www.farreach-cable.com",
  "tagline": "18 Years | HDMI Certified | ISO9001 | China + Vietnam Dual Base"
}
```

### 完整发送示例

```bash
cd /Users/wilson/.openclaw/workspace/skills/imap-smtp-email

# 开发信 - 使用英文销售签名
node scripts/smtp.js send \
  --to "info@label-italy.com" \
  --subject "🔌 Premium Cable Solutions from Farreach Electronic" \
  --html \
  --body-file "/Users/wilson/.openclaw/workspace/mail-attachments/development.html" \
  --attach "/Users/wilson/.openclaw/workspace/obsidian-vault/Farreach 知识库/02-产品目录/SKW 2026 catalogue-15M.pdf" \
  --signature en-sales

# 回复客户询价 - 使用英文销售签名
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Re: Product Inquiry" \
  --reply-to 12345 \
  --body "Thank you for your inquiry..." \
  --signature en-sales

# 中文邮件 - 使用中文销售签名
node scripts/smtp.js send \
  --to "customer@china.com" \
  --subject "回复：产品询价" \
  --body "感谢您的咨询..." \
  --signature cn-sales
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
| 意大利 | 提及工业传统、设计美学 | "I trust business is thriving in [city/region]. Italy has a renowned reputation for design excellence..." |
| 澳大利亚 | 提及地理位置、电信基建 | "I noticed you're based in Queensland – beautiful area! I trust your telecommunications infrastructure projects are going strong." |
| 美国 | 直接、效率导向 | "I'm reaching out to explore how Farreach can support your upcoming projects with competitive pricing and fast turnaround." |
| 德国 | 强调质量、认证、可靠性 | "Our HDMI 2.1 certification and ISO9001 quality management ensure consistent performance for your demanding applications." |

---

## 邮件签名规范（统一格式）

### 英文签名（标准格式）

```
Best regards,

[Your Name]
Sales Manager
Farreach Electronic Co., Limited

Add: No. 56, Xingwang Road, Pingshan Town, Jinwan District, Zhuhai, Guangdong, China
Add: Van Lam Industrial Park, Yen My District, Hung Yen Province, Vietnam
Email: sale-9@farreach-electronic.com
Tel: +86 (756) 8699660
Website: www.farreach-cable.com

18 Years | HDMI Certified | ISO9001 | China + Vietnam Dual Base
```

### 中文签名（标准格式）

```
此致

[你的名字]
销售经理
福睿电子科技有限公司

地址：中国广东省珠海市金湾区平沙镇星旺路 56 号 1、3、4 楼
地址：越南兴安省文林工业区
邮箱：sale-9@farreach-electronic.com
电话：+86 (756) 8699660
网站：www.farreach-cable.com

18 年经验 | HDMI 认证 | ISO9001 | 中越双基地
```

### 签名要素说明

| 要素 | 标签 | 说明 |
|------|------|------|
| 姓名 | （无标签） | 英文/中文全名 |
| 职位 | （无标签） | Sales Manager / 销售经理 |
| 公司 | （无标签） | Farreach Electronic Co., Limited |
| 地址 | `Add:` / `地址：` | 中国 + 越南双基地地址 |
| 邮箱 | `Email:` / `邮箱：` | 公司邮箱 |
| 电话 | `Tel:` / `电话：` | +86 (756) 8699660 |
| 网站 | `Website:` / `网站：` | www.farreach-cable.com |
| 核心优势 | （无标签） | 18 Years \| HDMI Certified... |

### 签名规则

- ✅ 使用标准标签：`Add:` / `Email:` / `Tel:` / `Website:`
- ✅ 必须包含中国 + 越南双基地地址
- ✅ 专业正式，适合商务邮件
- ❌ 不使用 emoji 或图标符号
- ❌ 不省略任何必填要素

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

## 📧 邮件规则/过滤器（自动分类）

### 功能介绍

邮件规则引擎可自动识别邮件类型、设置优先级和分类。规则配置文件位于 `rules.json`，规则引擎已集成到 `auto-capture.js` 邮件捕获流程中。

**核心功能：**
- 🎯 自动识别邮件类型（询价/投诉/订单/技术支持/广告/物流）
- 📊 设置优先级（urgent/high/normal/low）
- 📁 自动分类（inquiry/complaint/order/technical/logistics/spam）
- 🔍 支持发件人/主题/正文内容匹配

### CLI 命令用法

```bash
cd /Users/wilson/.openclaw/workspace/skills/imap-smtp-email

# 列出所有规则
node auto-capture.js list-rules

# 测试指定规则
node auto-capture.js test-rule <rule-id>
node auto-capture.js test-rule rule-001

# 检查邮件（自动应用规则）
node auto-capture.js check 10
node auto-capture.js check --unseen
```

### 规则配置格式

规则配置文件位于 `rules.json`，格式如下：

```json
{
  "id": "rule-001",
  "name": "规则名称",
  "enabled": true,
  "priority": 1,
  "conditions": {
    "from": ["customer@example.com"],
    "subject": ["RFQ", "询价"],
    "contains": ["quotation", "MOQ"]
  },
  "actions": {
    "set_priority": "high",
    "set_category": "inquiry"
  }
}
```

**条件类型：**
- `from`: 发件人邮箱/域名匹配（数组，OR 逻辑）
- `subject`: 主题关键词匹配（数组，OR 逻辑，不区分大小写）
- `contains`: 正文内容匹配（数组，OR 逻辑，不区分大小写）

**优先级：**
- 数字越小优先级越高（1=最高，999=最低）
- 规则按优先级排序，首次匹配即停止

**动作类型：**
- `set_priority`: urgent | high | normal | low
- `set_category`: inquiry | complaint | order | technical | logistics | spam | general

### 默认规则列表

系统预置 6 条 Farreach 业务规则：

| ID | 规则名称 | 优先级 | 条件 | 动作 |
|----|---------|--------|------|------|
| rule-001 | 询价邮件高优先级 | P1 | 主题含 RFQ/inquiry/quote/询价 | priority=high, category=inquiry |
| rule-002 | 投诉邮件紧急处理 | P1 | 主题含 complaint/投诉/索赔 | priority=urgent, category=complaint |
| rule-003 | 订单确认/合同 | P1 | 主题含 PO/订单/合同 | priority=urgent, category=order |
| rule-004 | 技术支持请求 | P2 | 主题含 technical/技术/支持 | priority=high, category=technical |
| rule-005 | 物流/发货通知 | P3 | 主题含 shipping/物流/发货 | priority=normal, category=logistics |
| rule-006 | 广告邮件低优先级 | P10 | 主题含 promotion/广告/促销 | priority=low, category=spam |

### 使用示例

**自定义规则：**

编辑 `rules.json` 添加新规则：

```json
{
  "id": "rule-007",
  "name": "VIP 客户邮件",
  "enabled": true,
  "priority": 1,
  "conditions": {
    "from": ["vip@customer.com", "@important-client.com"]
  },
  "actions": {
    "set_priority": "urgent",
    "set_category": "vip"
  }
}
```

**测试规则：**

```bash
# 测试询价规则
node auto-capture.js test-rule rule-001

# 输出示例：
# 🧪 测试规则：询价邮件高优先级
# 1. 询价邮件 → ✅ 匹配
# 2. 投诉邮件 → ❌ 不匹配
# ...
```

**规则匹配逻辑：**

- ✅ 所有条件同时满足才算匹配（AND 逻辑）
- ✅ 同一条件内多个关键词为 OR 逻辑
- ✅ 不区分大小写
- ✅ 规则按优先级排序，首次匹配即停止
- ✅ 无匹配规则时使用默认值（priority=normal, category=general）

### 邮件归档中的规则信息

规则匹配结果会写入邮件 Markdown 归档文件：

```markdown
---
date: 2026-03-28T10:00:00.000Z
from: customer@example.com
subject: RFQ for HDMI cables
rule_matched: true
rule_id: rule-001
rule_name: 询价邮件高优先级
rule_priority: high
rule_category: inquiry
---

## 📋 规则匹配详情

**规则名称:** 询价邮件高优先级
**优先级:** high
**分类:** inquiry
**匹配规则:** 是
```

---

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

## 📋 Sending Log & Rate Limiting

### Sending Log
All sent emails are automatically recorded in:
```
/Users/wilson/.openclaw/workspace/mail-archive/sent/sent-log.json
```

Each log entry includes:
- Timestamp
- Recipient(s)
- Subject
- Message ID
- Status (sent/failed)

### Rate Limiting
To prevent abuse and comply with email provider limits:

- **Default limit:** 50 emails/hour
- **Configuration:** Set `SMTP_RATE_LIMIT` in `.env`
- **Enforcement:** Checked before each send (skipped in dry-run mode)
- **Error:** `Rate limit exceeded: X/50 emails sent in the last hour`

### Best Practices
1. ✅ Use `--dry-run` before sending to customers (verify content, attachments, recipients)
   - **What --dry-run shows:** Recipients, subject, body preview, attachments list, signature applied, scheduled time
   - **What --dry-run skips:** Actual SMTP transmission, sent-log entry, OKKI sync, rate limit check
   - **Recommended workflow:** Always dry-run first → review output → remove --dry-run → send
2. ✅ Check sending log for audit trail
3. ✅ Respect rate limits for bulk sending
4. ✅ Personalize each email (no copy-paste templates)

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
