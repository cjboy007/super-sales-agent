# Evolution 心跳指令（2026-03-28 更新）

_集成原子锁、安全扫描、依赖激活、事件日志_

---

## Wilson 心跳（Qwen + Sonnet）⭐

**触发频率：** 每 5 分钟  
**模型：** Qwen（包月）+ Sonnet（审阅时按次计费）  
**入口脚本：** `scripts/heartbeat-coordinator.js`

### 完整流程

```
Step 1: 激活依赖完成的任务
   ↓
Step 2: 检测 pending 任务
   ↓
Step 3: 获取原子锁（mkdir）
   ↓
Step 4: 安全扫描（security-scan.js）
   ↓
Step 5: Sonnet 审阅
   ↓
Step 6: 更新任务状态
   ↓
Step 7: 释放锁 + 记录事件
```

### Step 1: 激活依赖完成的任务

```bash
node scripts/activate-queued-tasks.js
```

- 扫描所有 `queued` 状态任务
- 检查 `depends_on` 列表
- 依赖全部 `completed`/`packaged` → 激活（`queued` → `pending`）
- 记录到 `history[]` 和 `events.log`

### Step 2-4: 检测 + 锁 + 安全扫描

```javascript
// 伪代码
for (task of listTasks()) {
  if (task.status !== 'pending') continue;
  
  // 原子锁
  if (!acquireLock(task.task_id)) continue;
  
  try {
    // 安全扫描
    const security = scanTaskSecurity(task.task_id);
    if (!security.safe) {
      task.status = 'blocked';
      task.blocked_reason = 'security_scan_failed';
      writeTask(task);
      continue;
    }
    
    // 继续审阅...
  } finally {
    releaseLock(task.task_id);
  }
}
```

**安全扫描检测：**
- 20+ 危险命令模式（`rm -rf /`、`curl | sh`、`sudo` 等）
- 严重等级：CRITICAL / HIGH / MEDIUM
- 发现危险 → `blocked` 状态，记录 `blocked_flags`

### Step 5: Sonnet 审阅

**Prompt 模板：**
```
你是 Revolution 系统审阅员。请审阅以下任务的执行结果。

## 任务信息
{task JSON}

## 输出格式（严格 JSON Schema）
{
  "verdict": "approve|revise|reject|complete",
  "confidence": 0.0-1.0,
  "feedback": "审阅意见",
  "next_instructions": "详细执行指令",
  "acceptance_criteria": ["验收标准 1"],
  "risk_flags": [],
  "technical_review": "技术选型审查"
}
```

**Verdict 含义：**
- `approve` → `reviewed` 状态，Iron 执行
- `revise` → `reviewed` 状态，带修改意见
- `reject` → `pending` 状态，重新执行（迭代 +1）
- `complete` → `completed` 状态，触发打包

### Step 6-7: 更新 + 释放

```javascript
task.review = review;
task.status = getNewStatus(review.verdict);
task.history.push({ action: 'review_completed', verdict: review.verdict });
writeTask(task);

logEvent('review_completed', { task_id, verdict, from, to });
releaseLock(task_id);
```

### 命令行执行

```bash
# 手动运行 Wilson 心跳
node scripts/heartbeat-coordinator.js

# OpenClaw Cron 配置
openclaw cron add --agent wilson \
  --name "evolution-heartbeat" \
  --schedule "*/5 * * * *" \
  --message "node /Users/wilson/.openclaw/workspace/evolution/scripts/heartbeat-coordinator.js"
```

---

## Iron 心跳（Qwen）⭐

**触发频率：** 每 5 分钟  
**模型：** Qwen（包月）  
**入口脚本：** `scripts/iron-heartbeat.js`

### 完整流程

```
Step 1: 检测 reviewed 任务
   ↓
Step 2: 获取原子锁
   ↓
Step 3: 执行 next_instructions（沙箱内）
   ↓
Step 4: 验证验收标准
   ↓
Step 5: 更新任务状态
   ↓
Step 6: 释放锁 + 记录事件
```

### Step 1-2: 检测 + 锁

```javascript
for (task of listTasks()) {
  if (task.status !== 'reviewed') continue;
  if (!acquireLock(task.task_id)) continue;
  
  try {
    // 执行...
  } finally {
    releaseLock(task.task_id);
  }
}
```

### Step 3: 沙箱执行

**开发环境（当前）：**
```bash
cd outputs/{task_id}
{next_instructions}
```

**生产环境（推荐）：**
```bash
# Docker 沙箱
docker run --rm \
  -v ./tasks:/workspace/tasks:ro \
  -v ./outputs:/workspace/outputs \
  node:20-alpine \
  sh -c "{next_instructions}"

# 或 nsjail 沙箱
nsjail --chroot /tmp/nsjail-root \
  --cwd /workspace \
  --user nobody --group nogroup \
  -- /bin/sh -c "{next_instructions}"
```

### Step 4: 验证验收标准

```javascript
const verification = verifyAcceptanceCriteria(
  review.acceptance_criteria,
  task
);

if (!verification.allPassed) {
  result.success = false;
  result.error = '验收标准未通过';
}
```

### Step 5-6: 更新 + 释放

```javascript
if (result.success) {
  task.status = 'pending';  // 下一轮
  task.current_subtask++;
} else {
  task.status = 'blocked';
  task.blocked_reason = result.error;
}

task.history.push({ action: 'execution_completed', status: result.success ? 'success' : 'failed' });
writeTask(task);

logEvent('status_changed', { task_id, from: 'reviewed', to: task.status });
releaseLock(task_id);
```

### 命令行执行

```bash
# 手动运行 Iron 心跳
node scripts/iron-heartbeat.js

# OpenClaw Cron 配置
openclaw cron add --agent iron \
  --name "evolution-iron-heartbeat" \
  --schedule "*/5 * * * *" \
  --message "node /Users/wilson/.openclaw/workspace/evolution/scripts/iron-heartbeat.js"
```

---

## 事件日志

**位置：** `logs/events.log`（JSONL 格式）

**事件类型：**

| 事件 | 说明 | 触发时机 |
|------|------|----------|
| `heartbeat_started` | 心跳开始 | Wilson/Iron 心跳启动 |
| `heartbeat_completed` | 心跳完成 | 心跳正常结束 |
| `queued_tasks_activated` | 任务激活 | 依赖完成，queued→pending |
| `security_scan_failed` | 安全扫描失败 | 发现危险命令 |
| `task_blocked` | 任务 blocked | 安全问题/执行失败 |
| `review_started` | 审阅开始 | Wilson Sonnet 开始审阅 |
| `review_completed` | 审阅完成 | Sonnet 输出 verdict |
| `execution_started` | 执行开始 | Iron 开始执行 |
| `execution_completed` | 执行成功 | Iron 执行完成 |
| `execution_failed` | 执行失败 | Iron 执行出错 |
| `status_changed` | 状态变更 | 任何状态变化 |
| `task_unblocked` | Blocked 恢复 | 人工 unblock |
| `force_unlock` | 强制解锁 | 死锁超时恢复 |

**查询示例：**

```bash
# 查看某个任务的所有事件
grep '"task_id":"task-001"' logs/events.log | jq

# 查看所有 blocked 事件
grep '"event":"task_blocked"' logs/events.log | jq

# 统计各状态任务数量
cat logs/events.log | jq -r 'select(.event=="status_changed") | .to' | sort | uniq -c

# 实时日志
tail -f logs/events.log | jq
```

---

## 错误恢复

### Blocked 状态恢复

```bash
# 人工介入后恢复
./scripts/unblock-task.sh task-001 --note "修复了 JSON 解析错误"

# 死锁超时恢复
./scripts/force-unlock.sh task-001 --note "死锁超时恢复"
```

### 手动触发审阅

```bash
# 将任务设为 pending
node -e "
const task = JSON.parse(require('fs').readFileSync('tasks/task-001.json'));
task.status = 'pending';
fs.writeFileSync('tasks/task-001.json', JSON.stringify(task, null, 2));
"

# 运行 Wilson 心跳
node scripts/heartbeat-coordinator.js
```

---

## 监控命令

```bash
# 查看当前任务状态分布
ls tasks/*.json | xargs -I {} node -e "console.log(JSON.parse(require('fs').readFileSync('{}')).status)" | sort | uniq -c

# 查看待处理任务
ls tasks/*.json | xargs -I {} node -e "const t=JSON.parse(require('fs').readFileSync('{}')); if(t.status==='pending'||t.status==='reviewed') console.log(t.task_id, t.status)"

# 查看最新 10 条事件
tail -10 logs/events.log | jq

# 检查锁状态
for lock in tasks/*.lock.d; do echo "🔒 $lock"; cat $lock/pid 2>/dev/null; done
```

---

**维护者：** WILSON 🧠  
**最后更新：** 2026-03-28  
**相关文档：** `DESIGN.md` | `scripts/README.md` | `FIXES_SUMMARY.md`
