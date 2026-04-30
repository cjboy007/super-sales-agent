# Evolution Task v2 — 设计方案

> 基于 Claude Sonnet 4.6 审核报告  
> 日期：2026-04-15  
> 状态：待审批

---

## 1. 设计目标

将 EvoMap Gene/Capsule 的核心思想（**经验存档 + 策略复用**）引入现有 auto-evolution 系统，使系统从"每次从零开始"升级为"积累历史经验"。

### 原则
- **向后兼容**：旧任务文件无需修改，零成本迁移
- **渐进式引入**：4 个 Phase 分步推进，每个 Phase 验证收益后再继续
- **最小改动**：现有脚本逻辑不变，新增可选字段

---

## 2. 任务文件 v2 格式

### 完整结构

```jsonc
{
  // ===== 现有字段（完全不变） =====
  "task_id": "task-045",
  "status": "pending",
  "priority": "medium",
  "goal": "Build a CLI tool that converts CSV files to JSON format",
  "created_at": "2026-04-15T21:00:00+08:00",
  "updated_at": "2026-04-15T21:00:00+08:00",
  "current_iteration": 0,
  "max_iterations": 10,
  "assigned_to": "iron",
  "context": {
    "background": "We frequently need to convert CSV exports to JSON for API ingestion.",
    "constraints": ["Node.js only, no external dependencies"],
    "reference_files": [],
    "execution_plan": [
      {
        "step": 1,
        "action": "Create core CSV parser module with streaming support",
        "validation": ["node tests/parser.test.js"],
        "estimated_complexity": 3
      },
      {
        "step": 2,
        "action": "Add CLI argument handling (--input, --output, --pretty)",
        "validation": ["node tests/cli.test.js"],
        "estimated_complexity": 2
      },
      {
        "step": 3,
        "action": "Write unit tests with edge cases",
        "validation": ["npm test"],
        "estimated_complexity": 4
      },
      {
        "step": 4,
        "action": "Add error handling for malformed CSV",
        "validation": ["node tests/error.test.js"],
        "estimated_complexity": 3
      }
    ]
  },
  "review": null,
  "result": null,
  "history": [],

  // ===== v2 新增字段（可选，null 表示未生成） =====
  "metadata": {
    "category": "build",
    "task_pattern": "CLI tool creation",
    "complexity_score": 12,
    "blast_radius": {
      "files": 5,
      "lines": 120,
      "dependencies": 0,
      "systems_affected": ["skills/csv-json-converter"]
    },
    "confidence_score": null,
    "validation_commands": ["npm test", "npm run lint"],
    "related_capsules": ["capsule-014"],
    "diff_summary": null
  },
  "capsule": null
}
```

### 字段说明

#### 新增 `context.execution_plan`

替代现有 `context.subtasks`，每个步骤附带验证指令和复杂度预估。

| 字段 | 类型 | 说明 |
|------|------|------|
| `step` | number | 步骤序号 |
| `action` | string | 执行内容 |
| `validation` | string[] | 验证命令列表（可选） |
| `estimated_complexity` | number | 1-5 复杂度预估（可选） |

**兼容策略**：`subtasks` 和 `execution_plan` 共存。如果有 `execution_plan` 则优先使用，否则用 `subtasks` 自动转换为 `execution_plan`。

#### 新增 `metadata` 块

| 字段 | 类型 | 何时填充 | 说明 |
|------|------|----------|------|
| `category` | enum | 任务创建时 | 任务分类（见下文） |
| `task_pattern` | string | 任务创建时 | 任务模式标签 |
| `complexity_score` | number | 任务创建时 | 5 维度总分（已有逻辑） |
| `blast_radius` | object | Executor 完成后 | 变更影响范围 |
| `confidence_score` | number | Auditor 完成后 | 置信度 0-1 |
| `validation_commands` | string[] | Reviewer 生成 | 验证指令清单 |
| `related_capsules` | string[] | Coordinator 匹配时 | 关联历史 Capsule |
| `diff_summary` | string | Executor 完成后 | 变更摘要 |

#### 新增 `capsule` 字段

任务完成并打包后自动生成，存储在任务文件中的 Capsule 摘要：

```jsonc
"capsule": {
  "capsule_id": "capsule-045",
  "created_at": "2026-04-15T23:00:00+08:00",
  "git_commit": "a1b2c3d4",
  "category": "build",
  "task_pattern": "CLI tool creation",
  "goal_summary": "CSV to JSON CLI converter with streaming support",
  "strategy": [
    "Streaming CSV parser to handle large files",
    "CLI with --input/--output/--pretty flags",
    "Edge case handling for quoted fields and unicode"
  ],
  "outcome": {
    "status": "success",
    "score": 0.85,
    "iterations": 4,
    "validation_passed": true
  },
  "blast_radius": { "files": 5, "lines": 120, "dependencies": 0 },
  "output_location": "/path/to/your/.openclaw/workspace/skills/csv-json-converter/"
}
```

---

## 3. 分类体系

### 扩展后的 6 类

| Category | 说明 | 示例 |
|----------|------|------|
| `build` | 构建新功能/Skill | 新建 CSV 转换工具、创建邮件 Skill |
| `refactor` | 重构现有代码 | 拆分大脚本、优化目录结构 |
| `optimize` | 性能/效率优化 | 减少 API 调用、缓存优化 |
| `repair` | 修复缺陷 | 修复 heartbeat 超时、修复 lock 泄漏 |
| `test` | 测试相关 | 编写单元测试、集成测试 |
| `integrate` | 集成外部服务 | 对接飞书 API、接入 OKKI CRM |

### 任务模式标签（task_pattern）

自由文本标签，用于经验匹配。常见模式：

```
CLI tool creation
Email intent classification
API wrapper generation
Skill scaffolding
Data pipeline setup
Document processing
Discord bot integration
```

---

## 4. Capsule 存档结构

### 目录结构

```
evolution/
├── tasks/                    # 现有（不变）
│   ├── task-001.json
│   └── ...
├── archive/                  # 现有（扩展）
│   ├── task-001.json         # 已完成任务（不变）
│   └── capsule-index.json    # 新增：Capsule 索引
└── capsules/                 # 新增：独立 Capsule 文件
    ├── capsule-001.json
    ├── capsule-014.json
    └── ...
```

### capsule-index.json

```jsonc
{
  "version": "2.0.0",
  "updated_at": "2026-04-15T23:00:00+08:00",
  "total": 14,
  "capsules": [
    {
      "capsule_id": "capsule-001",
      "task_id": "task-001",
      "category": "build",
      "task_pattern": "Email intent classification",
      "goal_summary": "邮件智能回复：intent 识别 + KB 匹配 + 自动发送",
      "outcome_score": 0.90,
      "blast_radius": { "files": 6, "lines": 450 },
      "confidence_score": 0.88,
      "git_commit": "e3f4a5b6",
      "created_at": "2026-03-24T12:30:00+08:00",
      "output_location": "/path/to/your/.openclaw/workspace/skills/email-smart-reply/"
    }
  ]
}
```

**设计意图**：Coordinator 扫描时只需加载索引文件（通常 <50KB），不需要加载所有 Capsule 详情。匹配到相关 Capsule 后再按需加载。

---

## 5. 经验匹配机制

### Phase 3 实现，Phase 1-2 不引入

**匹配逻辑（简单关键词，不用向量搜索）：**

```javascript
function matchCapsules(newTask, capsuleIndex) {
  const keywords = extractKeywords(newTask.goal);  // 提取关键词
  return capsuleIndex.capsules
    .filter(c => {
      // 分类匹配（权重 40%）
      const categoryMatch = c.category === newTask.metadata.category;
      // 模式匹配（权重 40%）
      const patternMatch = keywords.some(k => 
        c.task_pattern.toLowerCase().includes(k.toLowerCase()) ||
        c.goal_summary.toLowerCase().includes(k.toLowerCase())
      );
      // 复杂度接近（权重 20%）
      const complexityClose = Math.abs(c.complexity_score - newTask.metadata.complexity_score) <= 5;
      return categoryMatch || patternMatch || complexityClose;
    })
    .sort((a, b) => b.outcome_score - a.outcome_score)  // 高分优先
    .slice(0, 3);  // 最多返回 3 个
}
```

**匹配结果注入 Reviewer：**

```
任务：Build a CLI tool that converts CSV files to JSON format

历史参考（3 个相似 Capsule）：
1. capsule-014 - CSV 数据管道搭建 - 评分 0.88 - 参考策略：Streaming parser
2. capsule-007 - JSON 格式转换器 - 评分 0.82 - 参考策略：CLI 参数设计
3. capsule-003 - 命令行工具脚手架 - 评分 0.79 - 参考策略：依赖最小化

请结合以上历史经验，生成执行计划。
```

---

## 6. Phase 实施计划

### Phase 1：Schema 扩展（1-2 天）

**目标**：新增可选字段，不改动现有逻辑

**改动清单**：

| 文件 | 改动 |
|------|------|
| `config/task-schema.json` | 添加 metadata 块、execution_plan、capsule 定义 |
| `scripts/heartbeat-coordinator.js` | 创建任务时自动填充 category + task_pattern |
| `scripts/start-reviewer.js` | Reviewer 输出增加 validation_commands |

**具体改动**：

#### 6.1 task-schema.json 扩展

在现有 schema 基础上追加：

```jsonc
{
  "properties": {
    // ... 现有字段不变 ...

    "context": {
      "properties": {
        "subtasks": { "type": "array", "items": { "type": "string" } },
        "execution_plan": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "step": { "type": "integer" },
              "action": { "type": "string" },
              "validation": { "type": "array", "items": { "type": "string" } },
              "estimated_complexity": { "type": "integer", "minimum": 1, "maximum": 5 }
            },
            "required": ["step", "action"]
          }
        }
      }
    },

    "metadata": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "enum": ["build", "refactor", "optimize", "repair", "test", "integrate"]
        },
        "task_pattern": { "type": "string" },
        "complexity_score": { "type": "integer", "minimum": 5, "maximum": 25 },
        "blast_radius": {
          "type": "object",
          "properties": {
            "files": { "type": "integer" },
            "lines": { "type": "integer" },
            "dependencies": { "type": "integer" },
            "systems_affected": { "type": "array", "items": { "type": "string" } }
          }
        },
        "confidence_score": { "type": "number", "minimum": 0, "maximum": 1 },
        "validation_commands": { "type": "array", "items": { "type": "string" } },
        "related_capsules": { "type": "array", "items": { "type": "string" } },
        "diff_summary": { "type": "string" }
      }
    },

    "capsule": {
      "type": ["object", "null"],
      "properties": {
        "capsule_id": { "type": "string", "pattern": "^capsule-\\d{3,}$" },
        "created_at": { "type": "string", "format": "date-time" },
        "git_commit": { "type": "string" },
        "category": { "type": "string" },
        "task_pattern": { "type": "string" },
        "goal_summary": { "type": "string" },
        "strategy": { "type": "array", "items": { "type": "string" } },
        "outcome": {
          "type": "object",
          "properties": {
            "status": { "type": "string" },
            "score": { "type": "number" },
            "iterations": { "type": "integer" },
            "validation_passed": { "type": "boolean" }
          }
        },
        "blast_radius": { "type": "object" },
        "output_location": { "type": "string" }
      }
    }
  }
}
```

#### 6.2 Coordinator 改动

在创建任务时自动分类：

```javascript
// 新增：自动分类逻辑
function classifyTask(goal, constraints) {
  const goalLower = goal.toLowerCase();
  
  if (goalLower.includes('fix') || goalLower.includes('bug') || goalLower.includes('修复'))
    return 'repair';
  if (goalLower.includes('optim') || goalLower.includes('性能') || goalLower.includes('缓存'))
    return 'optimize';
  if (goalLower.includes('refactor') || goalLower.includes('重构') || goalLower.includes('拆分'))
    return 'refactor';
  if (goalLower.includes('test') || goalLower.includes('测试'))
    return 'test';
  if (goalLower.includes('integrat') || goalLower.includes('对接') || goalLower.includes('接入'))
    return 'integrate';
  
  return 'build';  // 默认
}

function extractTaskPattern(goal) {
  // 简单模式提取，Phase 3 再优化
  if (goal.includes('CLI') || goal.includes('命令行')) return 'CLI tool creation';
  if (goal.includes('邮件') || goal.includes('email')) return 'Email processing';
  if (goal.includes('API') || goal.includes('接口')) return 'API integration';
  if (goal.includes('Skill') || goal.includes('skill')) return 'Skill scaffolding';
  return 'General task';
}
```

### Phase 2：Capsule 存档生成（3-5 天）

**目标**：任务完成后自动生成 Capsule

**改动清单**：

| 文件 | 改动 |
|------|------|
| `scripts/pack-skill.js` | 打包完成后生成 Capsule 文件 + 更新索引 |
| `scripts/generate-capsule.js` | 新增：Capsule 生成脚本 |
| `evolution/capsules/` | 新建目录 |

#### Capsule 生成流程

```
pack-skill.js 完成打包
  ↓
读取任务文件（result + history + metadata）
  ↓
提取关键信息：
  - git commit hash（git rev-parse HEAD）
  - 变更文件数/行数（git diff --stat）
  - 迭代次数（history.length）
  - 最终评分（从 review.verdict 提取）
  ↓
生成 capsule-XXX.json
  ↓
更新 capsule-index.json
```

### Phase 3：经验索引（5-7 天）

**目标**：Coordinator 创建任务时自动匹配历史 Capsule

**改动清单**：

| 文件 | 改动 |
|------|------|
| `scripts/heartbeat-coordinator.js` | 扫描 capsule-index.json，匹配并注入 context |
| `scripts/capsule-matcher.js` | 新增：关键词匹配引擎 |
| `scripts/start-reviewer.js` | Reviewer 接收历史参考信息 |

### Phase 4：分类分析（7-10 天）

**目标**：按分类统计成功率和置信度

**改动清单**：

| 文件 | 改动 |
|------|------|
| `scripts/category-stats.js` | 新增：分类统计脚本 |
| `evolution/reports/` | 新增：进化分析报告 |

---

## 7. 现有脚本影响评估

| 脚本 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| `heartbeat-coordinator.js` | 小（+分类逻辑） | 无 | 中（+Capsule 匹配） | 无 |
| `start-reviewer.js` | 小（+validation 输出） | 无 | 小（+历史参考） | 无 |
| `monitor.js` | 无 | 无 | 无 | 无 |
| `pack-skill.js` | 无 | 中（+Capsule 生成） | 无 | 无 |

**总改动量估算**：约 300-400 行新增代码。

---

## 8. 历史数据迁移

### 零成本迁移方案

旧任务文件不需要任何修改。原因：
- 所有新增字段都是可选的（nullable）
- 现有脚本会忽略不认识的字段
- `execution_plan` 缺失时自动从 `subtasks` 转换

### 可选：批量补充 metadata

为已有 archive 中的任务补充 metadata（不强制）：

```bash
node scripts/backfill-metadata.js
```

这个脚本会：
1. 读取 archive/ 中所有已完成任务
2. 根据 goal 自动分类（category + task_pattern）
3. 根据 result 提取 blast_radius 估算
4. 写入 metadata 字段

---

## 9. 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| metadata 字段膨胀 | 低 | 设置 max 长度限制（diff_summary ≤ 500 字符） |
| 关键词匹配不准确 | 中 | 匹配结果仅作为参考，不强制应用；Phase 3 先灰度 |
| capsule-index 文件过大 | 低 | 超过 100 条时自动归档旧索引 |
| Reviewer 输出格式不稳定 | 中 | 定义严格的 JSON Schema 校验 validation_commands |
| 过度工程化 | 低 | 严格按 Phase 推进，每个 Phase 验证收益 |

---

## 10. 验收标准

### Phase 1 验收
- [ ] 新任务文件包含 metadata 块
- [ ] 旧任务文件仍可正常读取和处理
- [ ] heartbeat-coordinator.js 运行无报错

### Phase 2 验收
- [ ] 任务完成后自动在 capsules/ 目录生成 Capsule 文件
- [ ] capsule-index.json 正确更新
- [ ] 至少 3 个历史任务生成了 Capsule

### Phase 3 验收
- [ ] 新建任务时 Coordinator 能匹配到历史 Capsule
- [ ] Reviewer 的 context 中包含历史参考信息
- [ ] 匹配准确率 ≥ 60%（人工抽查 10 个任务）

### Phase 4 验收
- [ ] 能按分类输出成功率统计
- [ ] 能生成进化分析周报

---

## 实施状态（2026-04-15 更新）

| Phase | 状态 | 完成时间 |
|-------|------|----------|
| Phase 1: Schema 扩展 | ✅ 完成 | 2026-04-15 21:44 |
| Phase 2: Capsule 存档 | ✅ 完成 | 2026-04-15 21:47 |
| Phase 3: 经验索引 | ✅ 完成 | 2026-04-15 22:30 |
| Phase 4: 分类统计 | ✅ 完成 | 2026-04-15 22:39 |

### 已交付文件

| 文件 | 大小 | 说明 |
|------|------|------|
| `config/task-schema.json` | 5.3KB | v2 Schema |
| `scripts/heartbeat-coordinator.js` | ~600 行 | 分类+匹配+持久化 |
| `scripts/generate-capsule.js` | 250 行 | Capsule 生成器 |
| `scripts/capsule-matcher.js` | 220 行 | 独立匹配引擎 |
| `scripts/category-stats.js` | 240 行 | 分类统计+周报 |
| `scripts/test-matcher.js` | 50 行 | 匹配测试 |
| `evolution/capsules/capsule-index.json` | 3 Capsules | 快速检索索引 |
| `evolution/reports/2026-04-15-evolution-weekly.md` | 1 份周报 | 首份进化周报 |

_此文档待审批后进入 Phase 1 实施。_
