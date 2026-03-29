# 🚀 智能邮件发送（推荐）

**简单、智能、人性化** - 这才是邮件 skill 应该有的样子！

---

## ⚡ 30 秒上手

### 场景 1: 发送报价单

```bash
# 智能模式 - 自动添加产品目录 + 报价单 + 签名
node scripts/smart-send.js \
  --to "customer@example.com" \
  --subject "报价单 - HDMI 2.1 线缆" \
  --quotation "QT-20260329-001"
```

**自动处理：**
- ✅ 自动添加产品目录
- ✅ 自动查找并添加报价单
- ✅ 自动使用英文销售签名
- ✅ 自动确认发送

---

### 场景 2: 回复客户

```bash
# 智能回复 - 自动引用原邮件
node scripts/smart-send.js \
  --to "customer@example.com" \
  --subject "Re: 询价" \
  --reply-to "12345" \
  --quotation "QT-20260329-001"
```

**自动处理：**
- ✅ 自动从 IMAP 获取原邮件
- ✅ 自动引用原文
- ✅ 自动回复全部（包含所有收件人）
- ✅ 自动添加报价单

---

### 场景 3: 简单邮件

```bash
# 简单邮件 - 使用默认模板
node scripts/smart-send.js \
  --to "customer@example.com" \
  --subject "你好"
```

**自动处理：**
- ✅ 使用默认英文模板
- ✅ 自动添加产品目录
- ✅ 自动使用签名

---

## 📋 参数说明

### 必填参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--to` | 收件人邮箱 | `customer@example.com` |
| `--subject` | 邮件主题 | `报价单` |

### 可选参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--quotation` | 报价单号（自动查找） | 无 |
| `--body` | 自定义正文 | 使用默认模板 |
| `--body-file` | 从文件读取正文 | 使用默认模板 |
| `--attach` | 手动添加附件 | 无 |
| `--signature` | 签名模板 | `en-sales` |
| `--language` | 语言（en/cn） | `en` |
| `--reply-to` | 回复原邮件 UID | 无 |
| `--draft` | 保存为草稿（不发送） | 自动发送 |
| `--dry-run` | 预览模式 | 无 |

---

## 🎯 智能特性

### 1. 自动附件

```bash
# 自动添加产品目录 + 报价单
node scripts/smart-send.js \
  --to "customer@example.com" \
  --subject "报价单" \
  --quotation "QT-20260329-001"

# 手动添加额外附件
node scripts/smart-send.js \
  --to "customer@example.com" \
  --subject "资料" \
  --attach "/path/to/file.pdf"
```

### 2. 自动引用

```bash
# 自动从 IMAP 获取原邮件并引用
node scripts/smart-send.js \
  --to "customer@example.com" \
  --subject "Re: 询价" \
  --reply-to "12345"
```

### 3. 自动确认

```bash
# 默认自动确认发送
node scripts/smart-send.js --to "..." --subject "..."

# 保存为草稿（不发送）
node scripts/smart-send.js --to "..." --subject "..." --draft
```

---

## 📚 模板

### 默认模板位置

`templates/default-email.html`

**内容：**
- 英文专业模板
- Farreach 公司介绍
- 核心优势列表
- 标准签名

### 自定义模板

```bash
# 使用自定义模板
node scripts/smart-send.js \
  --to "customer@example.com" \
  --subject "报价单" \
  --body-file "/path/to/custom-template.html"
```

---

## ⚠️ 常见问题

### 问题 1: "SMTP configuration is incomplete"

**解决：**
```bash
vi /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/.env
# 替换 SMTP_PASS=your_smtp_password_here 为真实授权码
```

### 问题 2: 找不到报价单

**解决：**
```bash
# 检查报价单是否存在
ls /Users/wilson/.openclaw/workspace/skills/quotation-workflow/data/QT-*

# 生成报价单
cd /Users/wilson/.openclaw/workspace/skills/quotation-workflow
bash scripts/generate-all.sh data/customer.json QT-20260329-001
```

### 问题 3: 想保存草稿不发送

**解决：**
```bash
# 添加 --draft 参数
node scripts/smart-send.js --to "..." --subject "..." --draft
```

---

## 🆚 对比传统模式

### 传统模式（复杂）

```bash
node scripts/smtp.js send \
  --to "customer@example.com" \
  --subject "报价单" \
  --body "请查收附件" \
  --attach "/Users/wilson/.openclaw/workspace/obsidian-vault/Farreach 知识库/02-产品目录/SKW 2026 catalogue-15M.pdf,/Users/wilson/.openclaw/workspace/skills/quotation-workflow/data/QT-20260329-001-Final.pdf" \
  --signature "en-sales" \
  --confirm-send
```

### 智能模式（简单）

```bash
node scripts/smart-send.js \
  --to "customer@example.com" \
  --subject "报价单" \
  --quotation "QT-20260329-001"
```

**智能模式优势：**
- ✅ 自动查找附件
- ✅ 自动确认发送
- ✅ 自动使用签名
- ✅ 代码量少 80%

---

**最后更新：** 2026-03-29  
**维护者：** WILSON
