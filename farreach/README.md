# 🚀 Super Sales Agent Orchestrator

自动化开发信发送系统 — 从 OKKI 筛选客户 → 匹配模板 → 个性化邮件 → 间隔发送 → 状态记录

## 快速开始

```bash
cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/orchestrator

# 预览模式（不实际发送）
node sales-orchestrator.js --dry-run --limit 5

# 实际发送（限制 10 封）
node sales-orchestrator.js --limit 10

# 回复处理
node reply-processor.js
```

## 功能

### sales-orchestrator.js — 主调度器

| 功能 | 说明 |
|------|------|
| 拉取客户 | OKKI → 列表 + 详情（含邮箱/国家/标签） |
| 筛选规则 | 欧美国家 + AiReach 标签，排除跟进 ≥4 次，冷却 90 天 |
| 模板匹配 | 4 套模板按行业关键词自动匹配 |
| 个性化 | 替换客户名、公司名、国家等占位符 |
| 间隔发送 | 每 2-3 分钟一封，避免 spam |
| 状态记录 | campaign-state.json 记录已发送客户 |
| OKKI 同步 | 发送后自动写入跟进记录 |

### reply-processor.js — 回复处理器

| 功能 | 说明 |
|------|------|
| 检查收件箱 | IMAP 拉取最新 20 封 |
| 意图识别 | inquiry/technical/order/delivery/complaint/positive/negative |
| 生成草稿 | 根据意图生成个性化回复草稿 |
| 输出 JSON | stdout 输出供飞书推送 |

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--limit N` | 发送量上限 | 20 |
| `--dry-run` | 预览模式，不实际发送 | false |

## 模板

| 模板 | 适用行业 | 匹配关键词 |
|------|----------|-----------|
| template-a-electronics | 消费电子/影音 | consumer electronics, audio, video, home theater |
| template-b-retail | 大型商超/零售 | retail, supermarket, wholesale, distribution |
| template-c-computer | 计算机/IT | computer, IT, data center, networking, server |
| template-d-general | 通用 | 其他 |

## 状态管理

`state/campaign-state.json`:
```json
{
  "sent_emails": [{"email": "...", "company_name": "...", "sent_at": "...", "follow_up_count": 1}],
  "cold_customers": [{"email": "...", "reason": "...", "cold_until": "..."}],
  "last_run_at": "..."
}
```

## Cron 配置

```bash
# 每天 9:00 自动发送开发信（10 封）
openclaw cron add --name "daily-cold-email" --schedule "0 9 * * *" \
  --agent wilson --message "node sales-orchestrator.js --limit 10"

# 每 4 小时检查回复
openclaw cron add --name "reply-check" --schedule "0 */4 * * *" \
  --agent wilson --message "node reply-processor.js"
```
