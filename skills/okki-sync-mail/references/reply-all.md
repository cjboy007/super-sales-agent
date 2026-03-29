# smtp.js reply-all

> **前置条件：** 先阅读 [`../INTEGRATION.md`](../INTEGRATION.md) 了解认证、配置和安全规则。

回复全部邮件（与 `reply` 命令完全相同，为了向后兼容）。

支持：
- 自动继承原邮件主题（加 `Re:` 前缀）
- 自动继承原邮件所有收件人（To + CC）
- 自动添加引用区（原邮件内容）
- 使用签名模板
- 排除特定收件人
- 草稿模式（保存不发送）

本命令对应：`node smtp.js reply-all`

## 说明

`reply-all` 命令与 `reply` 命令**功能完全相同**，都是为了回复全部收件人。

**推荐使用 `reply` 命令**，`reply-all` 仅保留用于向后兼容。

## 命令

```bash
# 回复全部邮件
node smtp.js reply-all --message-id 12345 --body 'Thank you everyone...'

# 回复全部并自定义主题
node smtp.js reply-all --message-id 12345 --subject 'Re: Team Update' --body 'Thanks for the update...'

# 回复全部并使用签名模板
node smtp.js reply-all --message-id 12345 --body 'Hi team...' --signature en-sales

# 回复全部但排除特定收件人
node smtp.js reply-all --message-id 12345 --body 'Hi everyone...' --remove 'noreply@example.com'

# 预览回复但不发送
node smtp.js reply-all --message-id 12345 --body 'Thanks!' --dry-run

# 保存为草稿
node smtp.js reply-all --message-id 12345 --body 'Draft reply...' --draft
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `--message-id <UID>` | 是 | 原邮件 UID（通过 `imap.js check` 获取） |
| `--body <text>` | 是 | 回复正文 |
| `--body-file <file>` | 否 | 从文件读取回复正文 |
| `--subject <text>` | 否 | 自定义主题（默认：`Re: 原主题`） |
| `--signature <name>` | 否 | 使用签名模板 |
| `--remove <email>` | 否 | 排除特定收件人，多个用逗号分隔 |
| `--draft` | 否 | 保存为草稿，不实际发送 |
| `--dry-run` | 否 | 预览邮件内容但不实际发送 |
| `--confirm-send` | 否 | 确认发送 |

## 返回值

与 `reply` 命令相同。

## 典型场景

与 `reply` 命令相同。

## 安全规则

与 `reply` 命令相同。

## 实现说明

- 此命令是 `reply` 的别名，内部调用相同的实现
- 保留此命令是为了向后兼容旧脚本和工作流

## 相关命令

- `node smtp.js reply` — 回复邮件（**推荐**）
- `node smtp.js send` — 发送新邮件
- `node smtp.js forward` — 转发邮件
- `node smtp.js draft` — 保存草稿
- `node smtp.js send-status` — 查询发送状态
