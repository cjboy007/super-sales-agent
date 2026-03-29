# 🤖 Auto Revolution 混合模式设计

**创建日期：** 2026-03-29  
**模式：** 混合模式（简单任务手动 Subtask，复杂任务自动 Subtask）

---

## 📋 设计原则

### 任务分类标准

| 维度 | 简单任务（手动 Subtask） | 复杂任务（自动 Subtask） |
|------|------------------------|------------------------|
| **复杂度** | 单一功能、代码量<100 行 | 跨模块修改、代码量>500 行 |
| **风险** | 低风险、可回滚 | 高风险、核心功能 |
| **明确度** | 任务目标清晰、可执行 | 任务目标模糊、需要分析 |
| **依赖** | 无依赖或依赖已存在 | 多任务依赖、需要协调 |
| **创新性** | 常规功能、有先例 | 新功能、无先例 |

### 流程选择

```
创建任务
  ↓
任务复杂度评估
  ↓
┌─────────────────┬─────────────────┐
│  简单任务       │   复杂任务      │
│  (手动 Subtask) │  (自动 Subtask) │
└────────┬────────┴────────┬────────┘
         │                 │
         ↓                 ↓
    Executor 执行      Reviewer 分析
         │                 │
         │                 ↓
         │           生成详细 Subtasks
         │                 │
         └────────┬────────┘
                  │
                  ↓
            Executor 执行
                  │
                  ↓
            Auditor 审核（可选）
```

---

## 🔍 任务复杂度评估模型

### 评分维度（5 个维度，每个 1-5 分）

| 维度 | 1 分 | 3 分 | 5 分 |
|------|------|------|------|
| **代码量** | <100 行 | 100-500 行 | >500 行 |
| **文件数** | 1-2 个文件 | 3-5 个文件 | >5 个文件 |
| **风险** | 低风险（文档/测试） | 中风险（功能改进） | 高风险（核心逻辑） |
| **依赖** | 无依赖 | 1-2 个依赖 | >2 个依赖或跨模块 |
| **创新** | 常规功能（有先例） | 功能改进（部分先例） | 新功能（无先例） |

### 评分规则

**总分 = 5 个维度分数之和（5-25 分）**

| 总分 | 任务类型 | Subtask 设计 | 流程 |
|------|----------|-------------|------|
| **5-10 分** | 简单任务 | 手动定义 | 直接 Executor |
| **11-17 分** | 中等任务 | 手动定义（推荐）或 自动 | 可选 Reviewer |
| **18-25 分** | 复杂任务 | 必须自动 | Reviewer → Executor → Auditor |

---

## 📝 任务模板

### 简单任务模板（手动 Subtask）

```json
{
  "task_id": 31,
  "title": "简单任务示例",
  "description": "明确的任务描述",
  "complexity": {
    "code_lines": 1,
    "files": 1,
    "risk": 1,
    "dependencies": 1,
    "innovation": 1,
    "total": 5,
    "mode": "manual"
  },
  "subtasks": [
    {
      "id": 0,
      "title": "明确的子任务 1",
      "description": "详细描述"
    }
  ],
  "status": "pending"
}
```

### 复杂任务模板（自动 Subtask）

```json
{
  "task_id": 32,
  "title": "复杂任务示例",
  "description": "模糊的任务目标，需要 Reviewer 分析",
  "complexity": {
    "code_lines": 5,
    "files": 5,
    "risk": 5,
    "dependencies": 4,
    "innovation": 5,
    "total": 24,
    "mode": "auto"
  },
  "subtasks": [],
  "reviewer": {
    "model": "anthropic/claude-sonnet-4-6",
    "instructions": "请分析此任务并生成详细的 subtasks"
  },
  "status": "pending_review"
}
```

---

## 🤖 Reviewer 提示词模板

```markdown
你是 Auto Revolution Reviewer（高级代码架构师）。

## 任务目标
{task.description}

## 任务复杂度评分
- 代码量：{complexity.code_lines} 分
- 文件数：{complexity.files} 分
- 风险：{complexity.risk} 分
- 依赖：{complexity.dependencies} 分
- 创新：{complexity.innovation} 分
- **总分：{complexity.total} 分**

## 你的任务

### Step 1: 任务分析
1. 分析任务的核心目标
2. 识别关键挑战和风险点
3. 评估所需的技术栈和依赖

### Step 2: 拆解 Subtasks
将任务拆解为 3-7 个可执行的 subtasks，每个 subtask 应：
- 目标明确、可执行
- 工作量适中（~5-10 分钟）
- 有明确的验收标准

### Step 3: 生成执行指令
为每个 subtask 生成详细的执行指令，包括：
- 需要修改的文件
- 具体的代码实现
- 测试验证方法

## 输出格式

```json
{
  "analysis": {
    "core_goal": "...",
    "challenges": ["...", "..."],
    "tech_stack": ["...", "..."]
  },
  "subtasks": [
    {
      "id": 0,
      "title": "...",
      "description": "...",
      "estimated_minutes": 10,
      "files_to_modify": ["..."],
      "acceptance_criteria": ["..."]
    }
  ],
  "instructions": {
    "0": "详细的执行指令...",
    "1": "..."
  }
}
```

**模型：** {reviewer.model}
```

---

## 🔄 流程实现

### Step 1: 创建任务

```bash
# 简单任务（手动 Subtask）
node scripts/create-task.js \
  --title "修复 XXX bug" \
  --description "明确的描述" \
  --complexity 5 \
  --mode manual \
  --subtasks '[{"title": "...", "description": "..."}]'

# 复杂任务（自动 Subtask）
node scripts/create-task.js \
  --title "实现 XXX 功能" \
  --description "模糊的目标" \
  --complexity 20 \
  --mode auto \
  --reviewer-model "anthropic/claude-sonnet-4-6"
```

### Step 2: 任务路由

```javascript
// scripts/coordinator.js
if (task.complexity.total <= 10) {
  // 简单任务：直接 Executor
  spawnExecutor(task);
} else if (task.complexity.total >= 18) {
  // 复杂任务：Reviewer → Executor → Auditor
  spawnReviewer(task);
} else {
  // 中等任务：可选 Reviewer
  if (task.reviewer) {
    spawnReviewer(task);
  } else {
    spawnExecutor(task);
  }
}
```

### Step 3: Reviewer 分析（复杂任务）

```javascript
// scripts/reviewer.js
const analysis = await spawnSubagent({
  model: task.reviewer.model,
  task: buildReviewerPrompt(task)
});

// 更新任务 JSON
task.subtasks = analysis.subtasks;
task.instructions = analysis.instructions;
task.status = "pending_execution";

// 启动 Executor
spawnExecutor(task);
```

### Step 4: Executor 执行

```javascript
// scripts/executor.js
for (const subtask of task.subtasks) {
  const instruction = task.instructions[subtask.id];
  await executeSubtask(subtask, instruction);
  
  // 更新历史
  task.history.push({
    subtask_index: subtask.id,
    status: "success",
    completed_at: new Date().toISOString()
  });
}
```

### Step 5: Auditor 审核（复杂任务）

```javascript
// scripts/auditor.js
const audit = await spawnSubagent({
  model: "anthropic/claude-sonnet-4-6",
  task: buildAuditorPrompt(task)
});

if (audit.verdict === "pass") {
  task.status = "completed";
} else {
  task.status = "pending_revision";
  task.current_iteration++;
}
```

---

## 📊 使用示例

### 示例 1：简单任务（手动 Subtask）

**任务：** 修复邮箱地址解析 bug

```json
{
  "task_id": 31,
  "title": "修复 reply-all 邮箱解析 bug",
  "description": "当前使用 split(',') 解析邮箱地址，不支持 'Name <email>' 格式，需改用 address-rfc2822 库",
  "complexity": {
    "code_lines": 2,
    "files": 2,
    "risk": 2,
    "dependencies": 1,
    "innovation": 1,
    "total": 8,
    "mode": "manual"
  },
  "subtasks": [
    {
      "id": 0,
      "title": "安装 address-rfc2822 库",
      "description": "npm install address-rfc2822"
    },
    {
      "id": 1,
      "title": "创建 lib/email-parser.js",
      "description": "实现 parseEmails() 函数"
    },
    {
      "id": 2,
      "title": "更新 smtp.js 使用新解析器",
      "description": "替换 split(',') 为 parseEmails()"
    }
  ],
  "status": "pending"
}
```

**流程：** 直接 Executor 执行

---

### 示例 2：复杂任务（自动 Subtask）

**任务：** 实现邮件自动化工作流

```json
{
  "task_id": 32,
  "title": "实现邮件自动化工作流",
  "description": "根据邮件内容自动分类、自动回复、自动归档",
  "complexity": {
    "code_lines": 5,
    "files": 5,
    "risk": 4,
    "dependencies": 4,
    "innovation": 5,
    "total": 23,
    "mode": "auto"
  },
  "subtasks": [],
  "reviewer": {
    "model": "anthropic/claude-sonnet-4-6",
    "instructions": "请分析此任务并生成详细的 subtasks，包括意图识别、规则引擎、自动回复等模块"
  },
  "status": "pending_review"
}
```

**流程：** Reviewer 分析 → 生成 7 个 subtasks → Executor 执行 → Auditor 审核

---

## 🎯 最佳实践

### 什么时候用手动 Subtask？

✅ **适合场景：**
- Bug 修复（明确的问题和解决方案）
- 小功能改进（代码量<200 行）
- 文档更新
- 测试用例添加
- 库升级（有明确迁移指南）

### 什么时候用自动 Subtask？

✅ **适合场景：**
- 新功能开发（无先例）
- 架构重构（跨模块修改）
- 复杂集成（多系统对接）
- 性能优化（需要分析和测试）
- 安全加固（需要全面审查）

---

## 📈 效能对比

| 指标 | 手动 Subtask | 自动 Subtask |
|------|-------------|-------------|
| **创建时间** | 5-10 分钟 | 1-2 分钟 |
| **执行时间** | ~5 分钟/任务 | ~15 分钟/任务 |
| **成功率** | ~95% | ~90% |
| **质量** | 依赖创建者经验 | Reviewer 保证质量 |
| **适用场景** | 简单/明确任务 | 复杂/模糊任务 |

---

**最后更新：** 2026-03-29  
**维护者：** WILSON
