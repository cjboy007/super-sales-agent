# smtp.js draft-create

> **前置条件：** 先阅读 [`../INTEGRATION.md`](../INTEGRATION.md) 了解认证、配置和安全规则。

创建新邮件草稿（从零开始），支持：
- 纯文本或 HTML 正文
- 抄送/密送
- 本地文件附件（`--attach`）
- 内嵌图片（`--inline`，CID 引用）
- 使用签名模板
- 草稿元数据（语言、意图、备注）

本命令对应：`node smtp.js draft-create`（`draft` 的别名）

## 说明

`draft-create` 命令与 `draft` 命令**功能完全相同**，都是为了创建新邮件草稿。

**推荐使用 `draft` 命令**，`draft-create` 仅保留用于向后兼容。

## CRITICAL — 草稿工作流（必须遵循）

此命令**只保存草稿，不发送邮件**。需要发送时，使用 `send-draft` 命令。

**Step 1** — 创建草稿：
```bash
node smtp.js draft-create --to <收件人> --subject '<主题>' --body '<正文>'
```
→ 返回 `draft_id`

**Step 2** — 向用户展示草稿摘要（收件人、主题、正文预览、附件列表）

**Step 3** — 用户需要发送时，使用 `send-draft` 命令：
```bash
node smtp.js send-draft <draft-id> --confirm-send
```

**Step 4** — 发送后查询投递状态：
```bash
node smtp.js send-status <message-id> messageId
```

**禁止在用户未明确同意的情况下执行 Step 3 发送草稿。**

## 命令

```bash
# 创建简单草稿
node smtp.js draft-create --to customer@example.com --subject 'Quote' --body 'Draft quotation content...'

# 创建 HTML 草稿
node smtp.js draft-create --to customer@example.com --subject 'Product Catalog' --html --body '<h1>Catalog 2026</h1><p>Please find our latest products...</p>'

# 创建带抄送的草稿
node smtp.js draft-create --to team@example.com --cc manager@example.com --subject 'Update' --body 'Draft team update...'

# 创建带附件的草稿
node smtp.js draft-create --to customer@example.com --subject 'Quotation' --body 'Please see attached' --attach '/path/to/quotation.pdf'

# 创建带多个附件的草稿
node smtp.js draft-create --to customer@example.com --subject 'Documents' --body 'Attached documents' --attach '/path/to/file1.pdf,/path/to/file2.xlsx'

# 从文件读取正文创建草稿
node smtp.js draft-create --to customer@example.com --subject 'Report' --body-file '/path/to/email-body.txt'

# 创建 HTML 草稿带内嵌图片
node smtp.js draft-create --to customer@example.com --subject 'Newsletter' --html --body-file newsletter.html --inline '[{"cid":"logo123","path":"./logo.png"}]'

# 使用签名模板创建草稿
node smtp.js draft-create --to customer@example.com --subject 'Inquiry' --body 'Thank you for your inquiry...' --signature en-sales

# 创建草稿带备注（用于记录上下文）
node smtp.js draft-create --to customer@example.com --subject 'Follow up' --body 'Checking in...' --notes 'Customer asked about pricing on 2026-03-25'
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `--to <email>` | 是 | 收件人邮箱，多个用逗号分隔 |
| `--subject <text>` | 是 | 邮件主题（或使用 `--subject-file <file>` 从文件读取） |
| `--body <text>` | 是 | 邮件正文（或使用 `--body-file <file>` 从文件读取）。支持纯文本和 HTML（自动检测） |
| `--from <email>` | 否 | 发件人邮箱地址（默认读取 `.env` 中的 `SMTP_USER`） |
| `--cc <email>` | 否 | 抄送邮箱，多个用逗号分隔 |
| `--bcc <email>` | 否 | 密送邮箱，多个用逗号分隔 |
| `--html` | 否 | 强制 HTML 格式 |
| `--plain-text` | 否 | 强制纯文本格式，禁用 HTML 自动检测。不可与 `--inline` 同时使用 |
| `--attach <paths>` | 否 | 附件文件路径，多个用逗号分隔。路径必须在 `ALLOWED_READ_DIRS` 允许范围内 |
| `--inline <json>` | 否 | 内嵌图片 JSON 数组，每项包含 `cid` 和 `path`。格式：`'[{"cid":"logo123","path":"./logo.png"}]'`。不可与 `--plain-text` 同时使用 |
| `--signature <name>` | 否 | 使用签名模板（如 `en-sales`, `cn-sales`） |
| `--language <lang>` | 否 | 语言（如 `en`, `zh`）。用于多语言场景 |
| `--intent <type>` | 否 | 意图类型（如 `inquiry`, `quotation`, `followup`）。用于分类 |
| `--notes <text>` | 否 | 备注。记录草稿的上下文信息 |
| `--no-approval` | 否 | 移除审批要求。草稿发送时不需要人工确认 |

## 返回值

**草稿创建成功：**

```json
{
  "success": true,
  "draft_id": "DRAFT-20260329080000-G",
  "file_path": "/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/drafts/DRAFT-20260329080000-G.json",
  "draft": {
    "draft_id": "DRAFT-20260329080000-G",
    "subject": "Product Inquiry",
    "body": "Draft content...",
    "to": "customer@example.com",
    "cc": null,
    "bcc": null,
    "html": true,
    "attachments": [],
    "signature": "en-sales",
    "language": "en",
    "intent": "inquiry",
    "requires_human_approval": true,
    "created_at": "2026-03-29T08:00:00.000Z",
    "updated_at": "2026-03-29T08:00:00.000Z",
    "notes": "Customer asked about pricing"
  }
}
```

## 典型场景

### 场景 1：用户说"帮我写一封邮件给客户，先保存草稿"
```bash
# 创建草稿
node smtp.js draft-create --to customer@example.com --subject 'Quotation' --body 'Thank you for your inquiry. Please find attached...' --signature en-sales

# → 返回 draft_id，告知用户草稿已保存
# 用户查看并确认后发送
node smtp.js send-draft DRAFT-20260329080000-G --confirm-send
```

### 场景 2：用户说"写一封跟进邮件，带备注提醒"
```bash
# 创建草稿带备注
node smtp.js draft-create --to customer@example.com --subject 'Follow up' --body 'Checking in on your inquiry...' --notes 'Customer showed interest in HDMI cables on 2026-03-25' --signature en-sales
```

### 场景 3：用户说"创建 HTML 邮件草稿，带公司 logo"
```bash
# HTML 草稿带内嵌图片
node smtp.js draft-create --to customer@example.com --subject 'Newsletter' --html --body-file newsletter.html --inline '[{"cid":"logo123","path":"./logo.png"}]' --signature en-sales
```

### 场景 4：用户说"写邮件带附件，但先别发"
```bash
# 创建草稿带附件
node smtp.js draft-create --to customer@example.com --subject 'Quotation' --body 'Please see attached quotation...' --attach '/path/to/QT-2026-001.pdf' --signature en-sales
```

## 草稿元数据

草稿文件包含以下元数据字段：

| 字段 | 说明 |
|------|------|
| `draft_id` | 唯一草稿 ID（格式：`DRAFT-YYYYMMDDHHmmss-{type}`） |
| `subject` | 邮件主题 |
| `body` | 邮件正文 |
| `to`, `cc`, `bcc` | 收件人列表 |
| `html` | 是否 HTML 格式 |
| `attachments` | 附件列表 |
| `signature` | 签名模板名称 |
| `language` | 语言（`en`, `zh` 等） |
| `intent` | 意图类型（`inquiry`, `quotation`, `followup`, `general` 等） |
| `confidence` | AI 置信度（0-1） |
| `requires_human_approval` | 是否需要人工审批（默认 `true`） |
| `created_at`, `updated_at` | 创建和更新时间 |
| `notes` | 备注信息 |

## 安全规则

### 文件访问限制

附件和正文文件路径必须在 `ALLOWED_READ_DIRS` 环境变量允许的目录范围内。

### 草稿审批

- **默认需要人工审批** — `requires_human_approval: true`
- **发送前必须用户确认** — 使用 `send-draft` 时必须加 `--confirm-send`
- **`--no-approval` 参数用于移除审批** — 仅用于可信的自动化场景

### 速率限制

- 草稿创建无速率限制
- 草稿发送遵循发送速率限制（≤50 封/小时）

## 实现说明

- 草稿保存到 `drafts/` 目录（JSON 格式）
- 草稿 ID 格式：`DRAFT-YYYYMMDDHHmmss-{type}`（type: I=inquiry, C=confirmation, R=reply, G=general）
- 草稿文件包含完整邮件内容和元数据
- 支持后续使用 `draft-edit` 命令修改草稿

## 相关命令

- `node smtp.js draft` — 保存草稿（`draft-create` 的别名，**推荐**）
- `node smtp.js draft-edit` — 编辑草稿
- `node smtp.js send-draft` — 发送草稿
- `node smtp.js list-drafts` — 列出草稿
- `node smtp.js show-draft` — 显示草稿详情
- `node smtp.js delete-draft` — 删除草稿
- `node smtp.js send` — 发送新邮件
