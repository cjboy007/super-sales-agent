#!/bin/bash
# test-fixes.sh - 测试所有 P0/P1 修复
# 验证原子锁、安全扫描、依赖激活等功能

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧪 测试进化系统修复..."
echo ""

# 测试 1: 原子锁
echo "📋 测试 1: 原子锁"
echo "----------------------------------------"
./scripts/atomic-lock.sh acquire test-lock-001
./scripts/atomic-lock.sh check test-lock-001
./scripts/atomic-lock.sh release test-lock-001
./scripts/atomic-lock.sh check test-lock-001 || true
echo "✅ 原子锁测试通过"
echo ""

# 测试 2: 安全扫描 - 安全指令
echo "📋 测试 2: 安全扫描（安全指令）"
echo "----------------------------------------"
SAFE_INSTRUCTIONS="mkdir test
cd test
npm init -y
echo 'hello world'"

echo "$SAFE_INSTRUCTIONS" | node scripts/security-scan.js --stdin
echo "✅ 安全指令扫描通过"
echo ""

# 测试 3: 安全扫描 - 危险指令
echo "📋 测试 3: 安全扫描（危险指令）"
echo "----------------------------------------"
DANGEROUS_INSTRUCTIONS="rm -rf /"

if echo "$DANGEROUS_INSTRUCTIONS" | node scripts/security-scan.js --stdin 2>/dev/null; then
  echo "❌ 危险指令未被检测到"
  exit 1
else
  echo "✅ 危险指令检测通过"
fi
echo ""

# 测试 4: 事件日志
echo "📋 测试 4: 事件日志"
echo "----------------------------------------"
node scripts/log-event.js test_event task_id=test-001 status=pending
echo "✅ 事件日志测试通过"
echo ""

# 测试 5: 依赖激活器（需要实际任务文件）
echo "📋 测试 5: 依赖激活器"
echo "----------------------------------------"
# 创建测试任务
cat > tasks/test-dep-parent.json << 'EOF'
{
  "task_id": "test-dep-parent",
  "title": "测试父任务",
  "status": "completed",
  "depends_on": [],
  "history": []
}
EOF

cat > tasks/test-dep-child.json << 'EOF'
{
  "task_id": "test-dep-child",
  "title": "测试子任务",
  "status": "queued",
  "depends_on": ["test-dep-parent"],
  "history": []
}
EOF

echo "创建测试任务..."
node scripts/activate-queued-tasks.js

# 检查子任务是否激活
CHILD_STATUS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('tasks/test-dep-child.json')).status)")
if [ "$CHILD_STATUS" = "pending" ]; then
  echo "✅ 依赖激活测试通过"
else
  echo "❌ 依赖激活失败，当前状态：$CHILD_STATUS"
  exit 1
fi

# 清理测试文件
rm -f tasks/test-dep-parent.json tasks/test-dep-child.json
echo ""

# 测试 6: unblock 脚本（dry-run）
echo "📋 测试 6: unblock 脚本（语法检查）"
echo "----------------------------------------"
bash -n scripts/unblock-task.sh
bash -n scripts/force-unlock.sh
echo "✅ 脚本语法检查通过"
echo ""

echo "========================================"
echo "✅ 所有测试通过！"
echo "========================================"
echo ""
echo "修复摘要："
echo "  P0 🔴 原子锁 - ✅ 已实现（mkdir 原子操作）"
echo "  P0 🔴 安全扫描 - ✅ 已实现（20+ 危险模式检测）"
echo "  P1 🟡 blocked 恢复 - ✅ 已实现（unblock-task.sh）"
echo "  P1 🟡 依赖激活 - ✅ 已实现（activate-queued-tasks.js）"
echo "  P2 🟢 事件日志 - ✅ 已实现（log-event.js）"
echo ""
echo "下一步：更新 Wilson 心跳集成这些脚本"
