# smtp.js send-status

> **前置条件：** 先阅读 [`../INTEGRATION.md`](../INTEGRATION.md) 了解认证、配置和安全规则。

查询邮件发送状态，支持：
- 查看最近发送记录
- 按索引查询
- 按收件人查询
- 按主题查询
- 按 Message-ID 查询

本命令对应：`node smtp.js send-status`

## 说明

此命令用于查询已发送邮件的发送记录和状态。

发送记录存储在 `mail-archive/sent/sent-log.json` 文件中。

## 命令

```bash
# 查看最近 10 封发送记录（默认）
node smtp.js send-status

# 查看最近 N 封记录
node smtp.js send-status 5
node smtp.js send-status 20

# 按索引查询（0-based，0 表示最新）
node smtp.js send-status 0 index
node smtp.js send-status 1 index
node smtp.js send-status 5 index

# 按收件人查询
node smtp.js send-status "customer@example.com" to
node smtp.js send-status "team@example.com" to

# 按主题查询
node smtp.js send-status "Product Inquiry" subject
node smtp.js send-status "Quotation" subject

# 按 Message-ID 查询
node smtp.js send-status "<abc123@mail.server.com>" messageId
node smtp.js send-status "abc123@mail.server.com" messageId
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| （无参数） | 否 | 显示最近 10 封发送记录 |
| `<number>` | 否 | 显示指定数量的记录（如 `5` 表示最近 5 封） |
| `<index> index` | 否 | 按索引查询（0-based，0 表示最新） |
| `<email> to` | 否 | 按收件人查询 |
| `<subject> subject` | 否 | 按主题查询（支持模糊匹配） |
| `<message-id> messageId` | 否 | 按 Message-ID 查询（精确匹配） |

## 返回值

**列表模式（无参数或指定数量）：**

```json
{
  "success": true,
  "count": 10,
  "records": [
    {
      "index": 0,
      "timestamp": "2026-03-29T08:00:00.000Z",
      "messageId": "<abc123@mail.server.com>",
      "to": "customer@example.com",
      "subject": "Product Inquiry",
      "status": "sent"
    },
    {
      "index": 1,
      "timestamp": "2026-03-29T07:30:00.000Z",
      "messageId": "<def456@mail.server.com>",
      "to": "team@example.com",
      "subject": "Team Update",
      "status": "sent"
    }
  ]
}
```

**单条记录模式（按索引/收件人/主题/Message-ID 查询）：**

```json
{
  "success": true,
  "record": {
    "index": 0,
    "timestamp": "2026-03-29T08:00:00.000Z",
    "messageId": "<abc123@mail.server.com>",
    "to": "customer@example.com",
    "cc": "manager@example.com",
    "subject": "Product Inquiry",
    "status": "sent",
    "error": null,
    "attachments": [
      {
        "filename": "quotation.pdf",
        "size": 123456
      }
    ]
  }
}
```

**未找到记录：**

```json
{
  "success": false,
  "error": "No records found matching: customer@example.com"
}
```

## 典型场景

### 场景 1：用户说"查看最近发送的邮件"
```bash
# 查看最近 10 封
node smtp.js send-status

# → 返回最近 10 封发送记录列表
```

### 场景 2：用户说"查看刚才发给客户的邮件状态"
```bash
# 按收件人查询
node smtp.js send-status "customer@example.com" to

# → 返回该收件人的所有发送记录
```

### 场景 3：用户说"查找那封关于报价的邮件"
```bash
# 按主题查询
node smtp.js send-status "Quotation" subject

# → 返回主题包含 "Quotation" 的发送记录
```

### 场景 4：用户说"确认邮件是否发送成功"
```bash
# 按 Message-ID 查询（最精确）
node smtp.js send-status "<abc123@mail.server.com>" messageId

# → 返回该邮件的详细发送状态
```

### 场景 5：用户说"查看第 3 封发送的邮件"
```bash
# 按索引查询（0-based）
node smtp.js send-status 2 index

# → 返回索引为 2 的发送记录（第 3 封）
```

## 状态码说明

### P0-3: 状态语义修正

⚠️ **重要：** 状态码 `4` 表示 "SMTP 已接收" (smtp_accepted)，**不是**真实投递成功！

| 状态码 | 文本 | 英文 | 说明 |
|--------|------|------|------|
| `1` | 正在投递 | sending | 邮件正在投递中 |
| `2` | 重试 | retrying | 投递失败，正在重试 |
| `3` | 退信 | bounced | 投递失败，已退信 |
| `4` | SMTP 已接收 | smtp_accepted | ⚠️ **P0-3**: SMTP 服务器已接收，**不保证**进入收件箱 |
| `5` | 待审批 | pending_approval | 等待审批 |
| `6` | 拒绝 | rejected | 审批被拒绝 |

**⚠️ P0-3 重要说明：**
- 状态 `4=smtp_accepted` 仅表示邮件已被我们的 SMTP 服务器接受
- **不保证**邮件最终进入收件箱（可能被对方服务器标记为垃圾邮件、拒收等）
- 真实投递确认需要 DSN（Delivery Status Notification）或回执

### 旧版状态码（向后兼容）

| 状态 | 说明 | 对应新码 |
|------|------|---------|
| `sent` | 发送成功（旧版） | `4` |
| `failed` | 发送失败（旧版） | `3` |
| `pending` | 等待发送（定时邮件） | `5` |
| `scheduled` | 已安排定时发送 | `5` |

## 查询模式详解

### 列表模式

无参数或指定数字时，返回最近 N 封发送记录的列表。

```bash
# 最近 10 封（默认）
node smtp.js send-status

# 最近 5 封
node smtp.js send-status 5
```

### 索引模式

按索引查询单条记录（0-based，0 表示最新）。

```bash
# 最新的记录
node smtp.js send-status 0 index

# 第 2 新的记录
node smtp.js send-status 1 index
```

### 收件人模式

按收件人邮箱查询所有相关记录。

```bash
node smtp.js send-status "customer@example.com" to
```

**说明：**
- 精确匹配收件人邮箱
- 返回该收件人的所有发送记录（按时间倒序）

### 主题模式

按主题查询所有相关记录。

```bash
node smtp.js send-status "Product Inquiry" subject
```

**说明：**
- 模糊匹配（包含即命中）
- 不区分大小写
- 返回所有匹配的发送记录（按时间倒序）

### Message-ID 模式

按 Message-ID 查询单条记录。

```bash
node smtp.js send-status "<abc123@mail.server.com>" messageId
```

**说明：**
- 精确匹配 Message-ID
- Message-ID 通常包含在 `<>` 中，查询时可带可不带
- 返回单条记录

## 实现说明

- 发送记录存储在 `mail-archive/sent/sent-log.json`
- 记录按时间倒序排列（最新的在前）
- 每次发送邮件自动追加记录
- 日志文件格式为 JSON 数组

## 相关命令

- `node smtp.js send` — 发送新邮件
- `node smtp.js reply` — 回复邮件
- `node smtp.js forward` — 转发邮件
- `node smtp.js send-draft` — 发送草稿
- `node smtp.js list-scheduled` — 列出定时邮件
- `node smtp.js send-due` — 发送到期的定时邮件
