# 全自动进化系统 (Auto-Evolution)

_Agent 间通过本地文件交流进度，自动循环进化。_

**设计日期：** 2026-03-24
**设计者：** WARDEN 🏛️
**确认者：** Jaden

---

## 架构概览

```
┌──────────────┐      ┌───────────────┐      ┌──────────────┐
│  Qwen 心跳   │ ───→ │  Sonnet 审阅  │ ───→ │  Iron 执行   │
│  (Wilson)    │      │  (Wilson)     │      │  (Qwen)      │
│  检测文件变化 │      │  决策+指示    │      │  按指示干活   │
└──────────────┘      └───────────────┘      └──────────────┘
       ↑                                           │
       └───────────────────────────────────────────┘
                     结果 → 待审阅
```

## 状态机

```
                  ┌──────────┐
                  │  pending  │  ← Iron 提交结果 / 初始创建
                  └────┬─────┘
                       │ Wilson 心跳检测到
                       ▼
                  ┌──────────┐
                  │ reviewing │  ← Sonnet 开始审阅
                  └────┬─────┘
                       │ 审阅完成
                       ▼
                  ┌──────────┐
                  │ reviewed  │  ← 已审阅，含下一步指示
                  └────┬─────┘
                       │ Iron 心跳检测到
                       ▼
                  ┌──────────┐
                  │ executing │  ← Iron 开始执行
                  └────┬─────┘
                       │
                  ┌────┴─────┐
                  ▼          ▼
            ┌──────────┐ ┌──────────┐
            │ pending  │ │  blocked │  ← 遇到问题，等待人工
            │(新一轮)  │ └──────────┘
            └──────────┘

特殊状态：
  completed  ← 进化目标达成，流程终止
  blocked    ← 遇到错误/需要人工介入
```

## 状态说明

| 状态 | 含义 | 谁写入 | 谁监听 |
|------|------|--------|--------|
| `queued` | 排队等待（依赖未完成） | 人工创建 | 无（依赖完成后激活） |
| `pending` | 待审阅（有新结果或初始任务） | Iron / 人工创建 | Wilson 心跳 (Qwen) |
| `reviewing` | 审阅中（Sonnet 已接手） | Wilson (Sonnet) | 无（防止重复触发） |
| `reviewed` | 已审阅，含下一步指示 | Wilson (Sonnet) | Iron 心跳 (Qwen) |
| `executing` | 执行中 | Iron (Qwen) | 无（防止重复触发） |
| `blocked` | 遇到问题，需人工介入 | Iron / Wilson | 人工 |
| `completed` | 进化目标达成，等待打包 | Wilson (Sonnet) | Wilson 心跳（触发打包） |
| `packaged` | 已打包为 skill，归档完成 | Wilson (Sonnet) | 无 |

## 模型分工

| 角色 | 模型 | 职责 | 成本 |
|------|------|------|------|
| Wilson 心跳 | Qwen（包月） | 轮询检测 `pending`/`queued` 状态、原子锁管理 | 无额外成本 |
| Wilson 审阅 | Sonnet/Opus | 读取结果、评估、安全扫描、生成下一步指示 | 按次计费 |
| Iron 心跳 | Qwen（包月） | 轮询检测 `reviewed` 状态文件 | 无额外成本 |
| Iron 执行 | Qwen（包月） | 按指示执行任务、沙箱内运行代码、输出结果 | 无额外成本 |

**成本控制：** 只有审阅环节用付费模型，其余全部 Qwen 包月。

## 安全沙箱机制 ⭐

**P0 修复（2026-03-28）：** 所有生成的代码必须在沙箱内执行，防止恶意/错误代码影响宿主机。

### 执行前安全扫描

Sonnet 审阅时必须检查以下危险模式：

```javascript
// 危险命令黑名单
const DANGEROUS_PATTERNS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  'curl .* \\|.* sh',
  'wget .* \\|.* sh',
  'chmod 777',
  'sudo',
  'dd if=/dev/zero',
  ':(){ :|:& };:',  // fork bomb
  'mkfs',
  'fdisk',
  'echo.*>.*(/etc|/proc|/sys)'
];
```

**扫描流程：**
1. Sonnet 审阅时提取 `next_instructions` 中的所有 shell 命令
2. 逐条匹配危险模式
3. 发现危险命令 → `verdict: "reject"`，`risk_flags` 说明原因
4. 无危险命令 → `verdict: "approve"`，继续执行

### 沙箱执行

**方案 A：Docker 沙箱（推荐）**
```bash
# 创建临时容器
docker run --rm \
  --name evolution-sandbox-task-001 \
  -v /Users/wilson/.openclaw/workspace/evolution/tasks:/workspace/tasks:ro \
  -v /Users/wilson/.openclaw/workspace/evolution/outputs:/workspace/outputs \
  node:20-alpine \
  sh -c "<next_instructions>"
```

**方案 B：nsjail 沙箱（轻量）**
```bash
nsjail --chroot /tmp/nsjail-root \
  --cwd /workspace \
  --user nobody --group nogroup \
  --rlimit_cpu 60 --rlimit_as 1073741824 \
  -- /bin/sh -c "<next_instructions>"
```

**方案 C：文件权限隔离（最小可用）**
- 只允许修改 `reference_files` 指定的目录
- 执行前备份目标文件
- 执行后 diff 检查变更

### 执行后验证

```bash
# 验证脚本
./scripts/verify-execution.sh task-001
# 检查：
# 1. 输出文件是否存在
# 2. JSON 格式是否正确
# 3. 无意外文件修改
```

## 文件锁机制（原子锁）⭐

**P0 修复（2026-03-28）：** 使用 POSIX 原子操作 `mkdir` 替代 `echo`，彻底消除 TOCTOU 竞态。

每个任务文件同目录下维护一个 `.lock.d` 目录（注意是目录，不是文件）：

```bash
# 写入前创建锁（原子操作）
mkdir tasks/task-001.lock.d 2>/dev/null && echo $$ > tasks/task-001.lock.d/pid

# 写入完成后删除锁
rm -rf tasks/task-001.lock.d
```

**原子性原理：**
- `mkdir` 是原子操作 — 如果目录已存在，操作失败（返回非零）
- 两个心跳同时执行 `mkdir`，只有一个会成功，另一个自动失败
- 无需额外的文件锁或互斥量

**规则：**
- 检测到 `.lock.d` 目录存在 → 跳过本次心跳，等下一轮
- 锁超过 5 分钟未释放 → 视为死锁，执行 `scripts/force-unlock.sh task-001` 强制清除并标记 `blocked`
- 获取锁失败 → 静默跳过，不重试，不阻塞

**辅助脚本：**
```bash
# 获取锁（返回 0=成功，1=失败）
./scripts/atomic-lock.sh acquire task-001

# 释放锁
./scripts/atomic-lock.sh release task-001

# 强制解锁（死锁恢复）
./scripts/force-unlock.sh task-001
```

## 迭代限制

每个任务文件内有 `max_iterations` 和 `current_iteration` 字段：

- 达到上限 → 自动标记 `completed`，附带总结报告
- 默认上限：10 轮
- 可在创建任务时自定义

## Blocked 状态恢复流程 ⭐

**P1 修复（2026-03-28）：** 定义人工介入后的标准恢复流程。

### 进入 blocked 状态的场景

- 执行失败（验证不通过）
- 安全扫描发现危险命令
- 死锁超时（5 分钟）
- 人工介入标记

### 恢复流程

```bash
# 1. 人工分析问题，修复根本原因
# 2. 执行恢复脚本
./scripts/unblock-task.sh task-001 --note "修复了 JSON 解析错误"

# 3. 脚本自动执行：
#    - 验证问题已修复（可选）
#    - 删除 .lock.d 目录
#    - 状态回写：blocked → pending
#    - 记录恢复信息到 history[]
```

### unblock-task.sh 脚本

```bash
#!/bin/bash
# scripts/unblock-task.sh

TASK_ID=$1
NOTE=$2

TASK_FILE="tasks/${TASK_ID}.json"
LOCK_DIR="tasks/${TASK_ID}.lock.d"

# 检查任务文件存在
if [ ! -f "$TASK_FILE" ]; then
  echo "❌ 任务文件不存在：$TASK_FILE"
  exit 1
fi

# 强制删除锁
if [ -d "$LOCK_DIR" ]; then
  rm -rf "$LOCK_DIR"
  echo "✅ 已删除锁目录"
fi

# 状态回写 pending
node -e "
const fs = require('fs');
const task = JSON.parse(fs.readFileSync('$TASK_FILE'));
task.status = 'pending';
task.current_iteration++;
task.history.push({
  timestamp: new Date().toISOString(),
  action: 'unblocked',
  note: '$NOTE',
  resolved_by: 'manual'
});
fs.writeFileSync('$TASK_FILE', JSON.stringify(task, null, 2));
"

echo "✅ 任务 $TASK_ID 已恢复到 pending 状态"
```

### 任务文件新增字段

```json
{
  "blocked_at": "2026-03-28T10:00:00+08:00",  // 进入 blocked 的时间
  "blocked_reason": "执行失败：JSON 解析错误",
  "resolved_by": "manual",  // manual / auto-timeout
  "resolved_at": "2026-03-28T10:30:00+08:00",
  "resolved_note": "修复了 JSON 解析错误"
}
```

## 目录结构

```
/Users/wilson/.openclaw/workspace/evolution/
├── DESIGN.md           ← 本文件（系统设计文档）
├── tasks/              ← 任务文件目录
│   ├── task-001.json   ← 单个进化任务
│   ├── task-001.lock   ← 文件锁（临时）
│   └── ...
└── archive/            ← 已完成的任务归档
    └── task-001.json
```

## 心跳配置建议

```bash
# Wilson 心跳：每 5 分钟检测 pending/queued 状态
openclaw cron add --agent wilson \
  --schedule "*/5 * * * *" \
  --session isolated \
  --message "检查 /Users/wilson/.openclaw/workspace/evolution/tasks/ 目录，找到 status=pending 的任务文件，切换模型到 Sonnet 进行审阅；同时检查 queued 任务的 depends_on 依赖是否已完成"

# Iron 心跳：每 5 分钟检测 reviewed 状态
openclaw cron add --agent iron \
  --schedule "*/5 * * * *" \
  --session isolated \
  --message "检查 /Users/wilson/.openclaw/workspace/evolution/tasks/ 目录，找到 status=reviewed 的任务文件，按指示执行"
```

## 任务依赖管理 ⭐

**P1 修复（2026-03-28）：** Wilson 心跳负责检查依赖链并激活 queued 任务。

### depends_on 字段

```json
{
  "task_id": "task-003",
  "depends_on": ["task-001", "task-002"],  // 依赖的任务 ID 列表
  "status": "queued"  // 初始状态为 queued
}
```

### 激活逻辑（Wilson 心跳）

```javascript
// Wilson 心跳伪代码
function checkQueuedTasks() {
  const queuedTasks = listTasks({ status: 'queued' });
  
  for (const task of queuedTasks) {
    const deps = task.depends_on || [];
    const allCompleted = deps.every(depId => {
      const depTask = readTask(depId);
      return depTask && (depTask.status === 'completed' || depTask.status === 'packaged');
    });
    
    if (allCompleted) {
      // 激活任务
      task.status = 'pending';
      task.activated_at = new Date().toISOString();
      task.history.push({
        timestamp: task.activated_at,
        action: 'activated',
        note: `依赖已完成：${deps.join(', ')}`
      });
      writeTask(task);
      log(`✅ ${task.task_id} 已激活（依赖完成）`);
    }
  }
}
```

### 依赖链拓扑排序（可选）

创建多任务时，自动计算执行顺序：

```bash
# 批量创建任务（自动排序）
./scripts/create-tasks-batch.json

# 脚本自动：
# 1. 解析所有任务的 depends_on
# 2. 拓扑排序
# 3. 设置初始状态（无依赖→pending，有依赖→queued）
```

## 审阅输出 JSON Schema ⭐

**P2 修复（2026-03-28）：** 定义结构化输出格式，Iron 解析字段而非自由文本。

### Review 对象 Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["verdict", "next_instructions"],
  "properties": {
    "verdict": {
      "type": "string",
      "enum": ["approve", "revise", "reject", "complete"],
      "description": "审阅结论"
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "置信度"
    },
    "next_instructions": {
      "type": "string",
      "description": "下一步执行指令（详细、可操作）"
    },
    "acceptance_criteria": {
      "type": "array",
      "items": {"type": "string"},
      "description": "验收标准列表"
    },
    "risk_flags": {
      "type": "array",
      "items": {"type": "string"},
      "description": "风险标记（危险命令、安全问题等）"
    },
    "feedback": {
      "type": "string",
      "description": "审阅意见（人类可读）"
    },
    "technical_review": {
      "type": "string",
      "description": "技术选型审查说明"
    }
  }
}
```

### Iron 解析逻辑

```javascript
// Iron 心跳伪代码
function executeTask(task) {
  const review = task.review;
  
  // 验证 Schema
  if (!['approve', 'complete'].includes(review.verdict)) {
    log(`❌ 审阅未通过：${review.verdict}`);
    log(review.feedback);
    return;
  }
  
  // 安全检查
  if (review.risk_flags && review.risk_flags.length > 0) {
    log(`⚠️ 发现风险：${review.risk_flags.join(', ')}`);
    task.status = 'blocked';
    task.blocked_reason = '安全扫描失败';
    writeTask(task);
    return;
  }
  
  // 执行指令
  task.status = 'executing';
  writeTask(task);
  
  try {
    const result = runInSandbox(review.next_instructions);
    
    // 验证验收标准
    const passed = review.acceptance_criteria.every(criteria => {
      return verify(criteria, result);
    });
    
    if (passed) {
      task.status = 'pending';  // 下一轮
      task.history.push({ /* 成功记录 */ });
    } else {
      task.status = 'blocked';
      task.history.push({ /* 失败记录 */ });
    }
  } catch (error) {
    task.status = 'blocked';
    task.history.push({ /* 错误记录 */ });
  }
  
  writeTask(task);
}
```

## 可观测性增强 ⭐

**P2 修复（2026-03-28）：** 全局 JSONL 日志，方便审计和调试。

### events.log 格式

```
/Users/wilson/.openclaw/workspace/evolution/logs/events.log

# 每行一个 JSON 对象（JSONL）
{"timestamp":"2026-03-28T09:30:00Z","event":"task_created","task_id":"task-004","status":"queued"}
{"timestamp":"2026-03-28T09:35:00Z","event":"status_changed","task_id":"task-001","from":"pending","to":"reviewing","agent":"wilson"}
{"timestamp":"2026-03-28T09:40:00Z","event":"review_completed","task_id":"task-001","verdict":"approve","agent":"wilson:sonnet"}
{"timestamp":"2026-03-28T09:45:00Z","event":"execution_started","task_id":"task-001","agent":"iron"}
{"timestamp":"2026-03-28T09:50:00Z","event":"execution_completed","task_id":"task-001","status":"success","tests_passed":12}
{"timestamp":"2026-03-28T09:55:00Z","event":"task_activated","task_id":"task-003","dependencies":["task-001","task-002"]}
{"timestamp":"2026-03-28T10:00:00Z","event":"lock_timeout","task_id":"task-002","lock_age_minutes":6,"action":"force_unlock"}
```

### 日志写入函数

```javascript
function logEvent(event, data) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...data
  });
  fs.appendFileSync('logs/events.log', line + '\n');
}
```

### 查询命令

```bash
# 查看某个任务的所有事件
grep '"task_id":"task-001"' logs/events.log | jq

# 查看所有 blocked 事件
grep '"event":"blocked"' logs/events.log | jq

# 统计各状态任务数量
cat logs/events.log | jq -r 'select(.event=="status_changed") | .to' | sort | uniq -c
```

## Skill 自动打包（Phase 完成时）

**触发条件：** Wilson 审阅时 verdict=complete，任务进入 `completed` 状态。

### 打包流程

Wilson Sonnet 子 agent 在写入 `completed` 状态后，执行以下步骤：

**1. 确定输出目录**
```
/Users/wilson/.openclaw/workspace/skills/<skill-name>/
```
skill-name 由任务目标自动命名（如 task-001 → `email-smart-reply`）。

**2. 创建 skill 目录结构**
```
skills/<skill-name>/
├── SKILL.md          ← 技能说明（功能、使用方法、依赖）
├── scripts/          ← 所有脚本文件
│   ├── *.js / *.py   ← 从 result.files_changed 汇总
│   └── ...
├── config/           ← 配置文件
│   └── *.json
└── README.md         ← 快速入门
```

**3. SKILL.md 内容（自动生成）**
```markdown
# <skill-name>

## 功能描述
<来自 task.goal>

## 核心模块
<来自各 iteration 的 history 总结>

## 使用方法
<来自 review.next_instructions 最后一轮的验收标准>

## 依赖
<从脚本 require/import 自动提取>

## 开发历史
<迭代次数、完成时间>
```

**4. 注册到 TOOLS.md**
在 TOOLS.md 对应分类下添加新 skill 的条目（路径、用途、调用方式）。

**5. 任务归档**
- 将任务文件移动到 `evolution/archive/<task-id>.json`
- 状态改为 `packaged`

**6. 通知**
发送消息到 #🏛️-warden-基石：`✅ Skill <name> 已打包完成，路径：skills/<name>/`

---

_维护者：WARDEN 🏛️_
