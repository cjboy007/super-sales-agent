# 📁 Super Sales Agent — 共享模块

两个项目（Farreach / Hero Pumps）共用的基础设施。

## 目录结构

```
shared/
├── sales-state-db.js          # 本地 SQLite 状态数据库（核心）
├── follow-up-engine.js        # 自动跟进引擎
├── reply-processor.js         # 邮件回复处理器
├── state/
│   └── sales-state.db         # SQLite 数据库文件（自动生成）
└── logs/                       # 运行日志
```

## 数据库 Schema

```sql
leads              -- 线索（来源、邮箱、公司）
email_logs         -- 邮件发送记录
customer_stages    -- 客户阶段（核心调度表）
replies            -- 回复记录
```

## 客户阶段流转

```
新线索 → cold_email_sent (第1封开发信)
         ↓ 2天后
       follow_up_1 (第2封)
         ↓ 5天后  
       follow_up_2 (第3封)
         ↓ 10天后
       follow_up_3 (第4封，附目录)
         ↓ 20天后
       follow_up_4 (最后一封)
         ↓ 无回复 → 冷宫 90 天

收到回复后根据意图自动跳转：
  inquiry/technical → negotiating
  order → quoted
  positive → negotiating
  negative → lost
```

## 使用方式

### 1. 发送开发信
```bash
# Farreach
cd farreach && node sales-orchestrator.js --limit 10 --dry-run
cd farreach && node sales-orchestrator.js --limit 10

# Hero Pumps
cd hero-pumps/orchestrator && node hero-orchestrator.js --limit 10 --dry-run
cd hero-pumps/orchestrator && node hero-orchestrator.js --limit 10
```

### 2. 自动跟进
```bash
cd shared && node follow-up-engine.js --dry-run
cd shared && node follow-up-engine.js
cd shared && node follow-up-engine.js --project farreach
```

### 3. 回复处理
```bash
cd shared && node reply-processor.js --dry-run
cd shared && node reply-processor.js
```

### 4. 查看统计
```bash
# Node.js
node -e "const {SalesState} = require('./shared/sales-state-db'); console.log(SalesState.getStats('farreach'));"
node -e "const {SalesState} = require('./shared/sales-state-db'); console.log(SalesState.getStats('hero-pumps'));"
```

## Cron 配置建议

```bash
# 每天 9:00 发开发信（Farreach）
openclaw cron add --name "farreach-daily-send" --schedule "0 9 * * *" \
  --agent wilson --message "cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/farreach && node sales-orchestrator.js --limit 10"

# 每天 9:00 发开发信（Hero Pumps）
openclaw cron add --name "hero-pumps-daily-send" --schedule "0 9 * * *" \
  --agent wilson --message "cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/hero-pumps/orchestrator && node hero-orchestrator.js --limit 10"

# 每 4 小时检查跟进
openclaw cron add --name "follow-up-check" --schedule "0 */4 * * *" \
  --agent wilson --message "cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/shared && node follow-up-engine.js"

# 每 2 小时检查回复
openclaw cron add --name "reply-check" --schedule "0 */2 * * *" \
  --agent wilson --message "cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/shared && node reply-processor.js"
```
