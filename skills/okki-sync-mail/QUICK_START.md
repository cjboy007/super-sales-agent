# 📧 OKKI Sync Mail 快速开始指南

**版本：** v2.0  
**更新日期：** 2026-03-29

---

## ⚡ 5 分钟快速上手

### Step 1: 配置 `.env` 文件

```bash
cd /Users/wilson/.openclaw/workspace/skills/imap-smtp-email
vi .env
```

**必填配置：**
```bash
# SMTP 配置（发送邮件 - 必填）
SMTP_HOST=smtphz.qiye.163.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=sale-9@farreach-electronic.com
SMTP_PASS=你的 SMTP 授权码  # ⚠️ 替换为真实授权码

# 发件人姓名（用于签名替换）
SMTP_SENDER_NAME=Your Name
```

**可选配置（用于 --reply-to 功能）：**
```bash
# IMAP 配置（接收邮件 - 可选）
IMAP_HOST=imaphz.qiye.163.com
IMAP_PORT=993
IMAP_USER=sale-9@farreach-electronic.com
IMAP_PASS=你的 IMAP 授权码  # ⚠️ 替换为真实授权码
IMAP_TLS=true
```

---

### Step 2: 测试连接

```bash
# 测试 SMTP 连接
node scripts/smtp.js test
```

**预期输出：**
```json
{
  "success": true,
  "message": "SMTP connection successful",
  "messageId": "<xxx@mail>"
}
```

---

### Step 3: 发送第一封邮件

#### 方法 1: 简单邮件（不带附件）

```bash
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "你好" \
  --body "这是一封测试邮件" \
  --confirm-send
```

#### 方法 2: 带附件的邮件

```bash
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "报价单" \
  --body "请查收附件" \
  --attach "/Users/wilson/.openclaw/workspace/skills/quotation-workflow/data/QT-E2E-001-HTML.pdf" \
  --confirm-send
```

#### 方法 3: 回复邮件（带原文引用）

```bash
# Step 1: 查看收件箱，获取邮件 UID
node scripts/imap.js check --limit 5

# Step 2: 回复邮件（自动引用原文）
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "Re: 原主题" \
  --body "感谢您的邮件..." \
  --reply-to <邮件 UID> \
  --confirm-send
```

---

## 📋 常用命令速查

### 发送邮件

```bash
# 发送简单邮件
node scripts/smtp.js send --to "a@b.com" --subject "Hi" --body "Hello" --confirm-send

# 发送带附件的邮件
node scripts/smtp.js send --to "a@b.com" --subject "Hi" --body "Hello" --attach "/path/to/file.pdf" --confirm-send

# 发送 HTML 邮件
node scripts/smtp.js send --to "a@b.com" --subject "Hi" --html --body "<h1>Hello</h1>" --confirm-send

# 从文件读取正文
node scripts/smtp.js send --to "a@b.com" --subject "Hi" --body-file email.txt --confirm-send

# 使用签名模板
node scripts/smtp.js send --to "a@b.com" --subject "Hi" --body "Hello" --signature "en-sales" --confirm-send

# 预览但不发送（dry-run）
node scripts/smtp.js send --to "a@b.com" --subject "Hi" --body "Hello" --dry-run

# 保存到草稿（不发送）
node scripts/smtp.js send --to "a@b.com" --subject "Hi" --body "Hello"
```

### 草稿管理

```bash
# 列出所有草稿
node scripts/smtp.js list-drafts

# 查看草稿详情
node scripts/smtp.js show-draft <DRAFT-ID>

# 发送草稿
node scripts/smtp.js send-draft <DRAFT-ID> --confirm-send

# 编辑草稿
node scripts/smtp.js draft-edit <DRAFT-ID> --body "新正文"

# 删除草稿
node scripts/smtp.js delete-draft <DRAFT-ID>
```

### 回复邮件

```bash
# 查看收件箱
node scripts/imap.js check --limit 10

# 回复发件人（自动引用原文）
node scripts/smtp.js send --to "a@b.com" --subject "Re: ..." --body "..." --reply-to <UID> --confirm-send

# 回复全部（自动包含所有收件人）
node scripts/smtp.js reply-all --message-id <UID> --body "..." --confirm-send

# 排除特定收件人
node scripts/smtp.js send --reply-to <UID> --remove "noreply@example.com" --confirm-send
```

### 定时发送

```bash
# 定时发送邮件
node scripts/smtp.js send \
  --to "a@b.com" \
  --subject "Hi" \
  --body "Hello" \
  --send-at "2026-03-30 09:00" \
  --confirm-send

# 列出定时任务
node scripts/smtp.js list-scheduled
```

---

## ⚠️ 常见问题

### 问题 1: "SMTP configuration is incomplete"

**原因：** `.env` 文件中的密码是占位符

**解决：**
```bash
vi /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/.env
# 替换 SMTP_PASS=your_smtp_password_here 为真实授权码
```

### 问题 2: 附件没有发送

**原因 1:** 没有使用 `--confirm-send` 参数
```bash
# 错误：只保存草稿
node scripts/smtp.js send --attach "file.pdf"

# 正确：实际发送
node scripts/smtp.js send --attach "file.pdf" --confirm-send
```

**原因 2:** 附件路径有空格但没有用引号包裹
```bash
# 错误
node scripts/smtp.js send --attach /path/with spaces/file.pdf

# 正确
node scripts/smtp.js send --attach "/path/with spaces/file.pdf"
```

### 问题 3: --reply-to 不工作

**原因：** IMAP 配置不完整

**解决：**
```bash
vi .env
# 配置 IMAP_HOST, IMAP_USER, IMAP_PASS
```

### 问题 4: 签名显示 `[Your Name]`

**原因：** 未配置 `SMTP_SENDER_NAME`

**解决：**
```bash
vi .env
# 添加 SMTP_SENDER_NAME=Your Name
```

---

## 📚 更多文档

- **完整技能文档：** [SKILL.md](SKILL.md)
- **工作流检查清单：** [WORKFLOW_CHECKLIST.md](WORKFLOW_CHECKLIST.md)
- **参考文档：** [references/](references/)

---

**最后更新：** 2026-03-29  
**维护者：** WILSON
