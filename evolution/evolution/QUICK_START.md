# 快速开始 - Test-Driven Revolution

**位置：** `/Users/wilson/.openclaw/workspace/evolution/QUICK_START.md`

---

## 🚀 5 分钟上手

### 1. 配置 Cron（一次性）

```bash
# Wilson 心跳 - 每 5 分钟
openclaw cron add --agent wilson \
  --name "evolution-heartbeat" \
  --schedule "*/5 * * * *" \
  --message "node /Users/wilson/.openclaw/workspace/evolution/scripts/heartbeat-coordinator.js"

# Iron 心跳 - 每 5 分钟
openclaw cron add --agent iron \
  --name "evolution-iron-heartbeat" \
  --schedule "*/5 * * * *" \
  --message "node /Users/wilson/.openclaw/workspace/evolution/scripts/iron-heartbeat.js"
```

### 2. 创建第一个任务

```bash
cat > tasks/task-010.json << 'EOF'
{
  "task_id": "task-010",
  "title": "测试任务 - 创建 Hello World 脚本",
  "description": "创建一个 Node.js 脚本，输出 Hello World",
  "priority": "P1",
  "status": "pending",
  "depends_on": [],
  "current_subtask": 0,
  "current_iteration": 0,
  "max_iterations": 3,
  "subtasks": [
    "创建 scripts/hello.js 文件",
    "添加测试验证输出",
    "运行测试确保通过"
  ],
  "reference_files": [
    "/Users/wilson/.openclaw/workspace/evolution/scripts/"
  ],
  "history": []
}
EOF
```

### 3. 等待心跳执行

```bash
# 或者手动触发
node scripts/heartbeat-coordinator.js
```

### 4. 查看进度

```bash
# 查看任务状态
cat tasks/task-010.json | jq '.status, .current_subtask'

# 查看事件日志
tail -f logs/events.log | jq
```

---

## 📋 常用命令

### 任务管理

```bash
# 列出所有任务
ls tasks/*.json | xargs -I {} node -e "const t=JSON.parse(require('fs').readFileSync('{}')); console.log(t.task_id, t.status)"

# 查看某个任务详情
cat tasks/task-010.json | jq

# 查看任务历史
cat tasks/task-010.json | jq '.history'
```

### 锁管理

```bash
# 获取锁
./scripts/atomic-lock.sh acquire task-010

# 检查锁
./scripts/atomic-lock.sh check task-010

# 释放锁
./scripts/atomic-lock.sh release task-010

# 强制解锁（死锁恢复）
./scripts/force-unlock.sh task-010 --note "死锁超时"
```

### 安全扫描

```bash
# 扫描任务文件
node scripts/security-scan.js tasks/task-010.json

# 扫描指令字符串
echo "rm -rf /" | node scripts/security-scan.js --stdin
```

### 事件日志

```bash
# 查看某任务的所有事件
grep '"task_id":"task-010"' logs/events.log | jq

# 查看最新 20 条事件
tail -20 logs/events.log | jq

# 统计状态变更
grep '"event":"status_changed"' logs/events.log | jq -r '.to' | sort | uniq -c
```

### Blocked 恢复

```bash
# 恢复 blocked 任务
./scripts/unblock-task.sh task-010 --note "已修复"

# 带验证恢复
./scripts/unblock-task.sh task-010 --note "已修复" --verify
```

---

## 🔍 监控面板

### 任务状态分布

```bash
ls tasks/*.json | xargs -I {} node -e "console.log(JSON.parse(require('fs').readFileSync('{}')).status)" | sort | uniq -c
```

### 待处理任务

```bash
ls tasks/*.json | xargs -I {} node -e "
const t = JSON.parse(require('fs').readFileSync('{}'));
if (t.status === 'pending' || t.status === 'reviewed') {
  console.log(t.task_id, t.status, t.current_subtask);
}
"
```

### 实时日志

```bash
tail -f logs/events.log | jq
```

---

## 🐛 故障排查

### 任务卡住不动

```bash
# 1. 检查锁状态
./scripts/atomic-lock.sh check task-010

# 2. 如果是死锁，强制解锁
./scripts/force-unlock.sh task-010 --note "死锁恢复"

# 3. 手动触发心跳
node scripts/heartbeat-coordinator.js
```

### 安全扫描失败

```bash
# 1. 查看扫描结果
node scripts/security-scan.js tasks/task-010.json

# 2. 如果是误报，手动标记为安全
node -e "
const task = JSON.parse(require('fs').readFileSync('tasks/task-010.json'));
task.security_override = true;
task.security_override_reason = '误报，已人工审查';
fs.writeFileSync('tasks/task-010.json', JSON.stringify(task, null, 2));
"

# 3. 重新触发
node scripts/heartbeat-coordinator.js
```

### 执行失败

```bash
# 1. 查看错误信息
cat tasks/task-010.json | jq '.history[-1]'

# 2. 恢复任务
./scripts/unblock-task.sh task-010 --note "修复执行错误"

# 3. 重新执行
node scripts/iron-heartbeat.js
```

---

## 📖 文档索引

| 文档 | 说明 |
|------|------|
| `DESIGN.md` | 系统架构设计 |
| `HEARTBEAT_INSTRUCTIONS.md` | 心跳详细流程 |
| `scripts/README.md` | 脚本使用文档 |
| `FIXES_SUMMARY.md` | P0/P1 修复总结 |
| `QUICK_START.md` | 本文档 |

---

**最后更新：** 2026-03-28  
**维护者：** WILSON 🧠
