# Evolution Scripts - 进化系统工具集

**位置：** `/Users/wilson/.openclaw/workspace/evolution/scripts/`

---

## 🔒 原子锁管理

### atomic-lock.sh

使用 POSIX `mkdir` 原子操作管理任务锁，彻底消除 TOCTOU 竞态。

```bash
# 获取锁（成功返回 0，失败返回 1）
./scripts/atomic-lock.sh acquire task-001

# 释放锁
./scripts/atomic-lock.sh release task-001

# 检查锁状态
./scripts/atomic-lock.sh check task-001

# 检查锁是否超时（超时返回 0）
./scripts/atomic-lock.sh timeout task-001
```

**原理：**
- `mkdir` 是原子操作 — 如果目录已存在，操作失败
- 两个心跳同时执行 `mkdir`，只有一个会成功
- 锁目录包含 `pid` 和 `timestamp` 文件

---

## 🔓 强制解锁

### force-unlock.sh

用于死锁恢复（锁超时 5 分钟未释放）。

```bash
# 强制解锁
./scripts/force-unlock.sh task-001

# 带备注解锁
./scripts/force-unlock.sh task-001 --note "死锁超时恢复"
```

**执行操作：**
1. 删除 `.lock.d` 目录
2. 状态回写：`blocked`/`reviewing`/`executing` → `pending`
3. 增加 `current_iteration`
4. 记录到 `history[]`
5. 写入 `events.log`

---

## 🔄 Blocked 状态恢复

### unblock-task.sh

人工介入后恢复 blocked 任务。

```bash
# 恢复 blocked 任务
./scripts/unblock-task.sh task-001

# 带备注恢复
./scripts/unblock-task.sh task-001 --note "修复了 JSON 解析错误"

# 恢复前验证
./scripts/unblock-task.sh task-001 --note "已修复" --verify
```

**执行操作：**
1. 删除锁目录（如果存在）
2. 状态回写：`blocked` → `pending`
3. 增加 `current_iteration`
4. 记录到 `history[]`
5. 清除 `blocked_at`/`blocked_reason` 字段
6. 写入 `events.log`

---

## 🛡️ 安全扫描

### security-scan.js

检测执行指令中的危险命令模式。

```bash
# 扫描任务文件
node scripts/security-scan.js tasks/task-001.json

# 从 stdin 读取指令
echo "rm -rf /" | node scripts/security-scan.js --stdin

# 扫描多行指令
node scripts/security-scan.js --stdin << 'EOF'
mkdir test
cd test
npm init -y
EOF
```

**检测的危险模式：**
- `rm -rf /` — 删除根目录（CRITICAL）
- `curl | sh` — 远程代码执行（CRITICAL）
- `sudo` — 提权操作（HIGH）
- `chmod 777` — 全权限设置（MEDIUM）
- 反向 Shell、Fork Bomb 等

**退出码：**
- `0` — 安全，无危险命令
- `1` — 发现危险命令

**输出格式：**
```json
{
  "task_id": "task-001",
  "safe": false,
  "flags": [
    {
      "pattern": "rm\\s+-rf\\s+/",
      "reason": "删除根目录",
      "line": "rm -rf /tmp/test",
      "severity": "CRITICAL"
    }
  ],
  "scanned_at": "2026-03-28T10:00:00.000Z"
}
```

---

## 📝 事件日志

### log-event.js

追加式 JSONL 日志写入工具。

```bash
# 记录事件
node scripts/log-event.js task_created task_id=task-004 status=queued

# 带多个字段
node scripts/log-event.js status_changed task_id=task-001 from=pending to=reviewing agent=wilson

# 自动解析类型（数字、布尔值）
node scripts/log-event.js execution_completed task_id=task-001 tests_passed=12 success=true
```

**日志位置：** `logs/events.log`

**查询示例：**
```bash
# 查看某个任务的所有事件
grep '"task_id":"task-001"' logs/events.log | jq

# 查看所有 blocked 事件
grep '"event":"blocked"' logs/events.log | jq

# 统计各状态任务数量
cat logs/events.log | jq -r 'select(.event=="status_changed") | .to' | sort | uniq -c
```

---

## 🔗 依赖激活器

### activate-queued-tasks.js

检查所有 `queued` 状态的任务，激活依赖已完成的任务。

```bash
# 运行激活器
node scripts/activate-queued-tasks.js
```

**工作流程：**
1. 扫描 `tasks/` 目录下所有 `.json` 文件
2. 筛选 `status: "queued"` 的任务
3. 检查 `depends_on` 列表中的所有依赖
4. 如果依赖全部为 `completed` 或 `packaged`，激活任务（`queued` → `pending`）
5. 记录到 `history[]` 和 `events.log`

**集成到 Wilson 心跳：**
```javascript
// Wilson 心跳伪代码
function heartbeat() {
  // 1. 激活依赖完成的任务
  run('node scripts/activate-queued-tasks.js');
  
  // 2. 处理 pending 任务（审阅）
  processPendingTasks();
}
```

---

## 📋 事件类型参考

| 事件类型 | 说明 | 必填字段 |
|----------|------|----------|
| `task_created` | 任务创建 | `task_id`, `status` |
| `task_activated` | 任务激活（queued→pending） | `task_id`, `dependencies` |
| `status_changed` | 状态变更 | `task_id`, `from`, `to` |
| `review_completed` | 审阅完成 | `task_id`, `verdict`, `agent` |
| `execution_started` | 执行开始 | `task_id`, `agent` |
| `execution_completed` | 执行完成 | `task_id`, `status`, `tests_passed` |
| `execution_failed` | 执行失败 | `task_id`, `error` |
| `force_unlock` | 强制解锁 | `task_id`, `note` |
| `task_unblocked` | Blocked 恢复 | `task_id`, `note` |
| `skill_packaged` | Skill 打包完成 | `task_id`, `skill_name` |

---

## 🔧 维护命令

```bash
# 查看所有脚本
ls -la scripts/

# 测试原子锁
./scripts/atomic-lock.sh acquire test-001
./scripts/atomic-lock.sh check test-001
./scripts/atomic-lock.sh release test-001

# 测试安全扫描
echo "rm -rf /" | node scripts/security-scan.js --stdin

# 查看日志
tail -f logs/events.log | jq
```

---

**维护者：** WILSON 🧠  
**最后更新：** 2026-03-28
