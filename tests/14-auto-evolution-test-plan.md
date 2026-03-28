# Revolution 自动进化测试方案 (auto-evolution)

---

## 测试目标

验证系统自我迭代升级的准确性、任务执行可靠性和代码质量保障。

---

## 模块概述

**核心文件：**
- `skills/auto-evolution/` - 自动进化模块
- `skills/auto-evolution/heartbeat-coordinator.js` - 心跳协调
- `skills/auto-evolution/pack-skill.js` - 技能打包

**依赖：**
- 多个 LLM 模型 (Sonnet/GPT-4o/Qwen/Haiku)
- Git 版本控制
- ClawHub 发布

---

## 1. 单元测试

### 1.1 任务创建测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-TASK-001 | 有效任务描述 | 任务创建成功 | task-XXX.json |
| TC-TASK-002 | 任务优先级 | 优先级设置 | P0-P3 |
| TC-TASK-003 | 任务拆分 | subtasks 生成 | 子任务列表 |
| TC-TASK-004 | 依赖定义 | 依赖关系 | 顺序正确 |
| TC-TASK-005 | 无效任务 | 验证失败 | 错误提示 |

### 1.2 任务调度测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-SCHED-001 | 多任务队列 | 优先级排序 | P0 优先 |
| TC-SCHED-002 | 心跳触发 | 每 5 分钟扫描 | cron 正确 |
| TC-SCHED-003 | 任务选择 | 选择最高优先 | 逻辑正确 |
| TC-SCHED-004 | 任务锁定 | lock 文件创建 | 防止并发 |
| TC-SCHED-005 | 任务释放 | 完成/超时释放 | 死锁预防 |

### 1.3 Reviewer 测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-REV-001 | 审阅计划 | 生成执行指令 | 指令清晰 |
| TC-REV-002 | 代码审查 | 发现问题 | 问题列表 |
| TC-REV-003 | 质量评估 | 评分输出 | 1-5 分 |
| TC-REV-004 | 安全审查 | 检测漏洞 | 安全报告 |
| TC-REV-005 | 拒绝计划 | 说明原因 | 反馈清晰 |

### 1.4 Executor 测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-EXEC-001 | 执行指令 | 代码实现 | 功能正确 |
| TC-EXEC-002 | 文件修改 | 文件更新 | 内容正确 |
| TC-EXEC-003 | 新建文件 | 文件创建 | 路径正确 |
| TC-EXEC-004 | 运行测试 | 测试通过 | 全部通过 |
| TC-EXEC-005 | 执行失败 | 错误报告 | 原因清晰 |

### 1.5 Auditor 测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-AUD-001 | 验收通过 | pass 决定 | 更新状态 |
| TC-AUD-002 | 验收失败 | retry 决定 | 反馈问题 |
| TC-EXEC-003 | 部分通过 | 部分 pass | 列出问题 |
| TC-AUD-004 | 质量检查 | 代码规范 | 符合标准 |
| TC-AUD-005 | 文档检查 | 文档完整 | SKILL.md 等 |

### 1.6 技能打包测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-PACK-001 | 完成的任务 | 生成 SKILL.md | 格式正确 |
| TC-PACK-002 | 生成 README.md | 文档完整 | 使用说明 |
| TC-PACK-003 | 归档到 archive/ | 目录结构 | 正确归档 |
| TC-PACK-004 | 元数据记录 | task 元数据 | 完整记录 |
| TC-PACK-005 | ClawHub 发布 | 发布成功 | 可安装 |

---

## 2. 集成测试

### 2.1 完整进化流程

**测试场景：** 任务创建 → 审阅 → 执行 → 审核 → 打包

**测试数据：**
```json
{
  "task": {
    "task_id": "task-001",
    "title": "添加新功能：邮件签名生成",
    "description": "实现自动邮件签名生成功能",
    "priority": "P1",
    "subtasks": [
      {"id": "st-001", "title": "设计签名模板", "status": "pending"},
      {"id": "st-002", "title": "实现生成逻辑", "status": "pending"},
      {"id": "st-003", "title": "编写测试用例", "status": "pending"}
    ]
  }
}
```

**预期流程：**
1. 心跳扫描任务
2. 选择 task-001
3. Phase 1: Reviewer 审阅
4. Phase 2: Executor 执行 subtask-001
5. Phase 3: Auditor 验收
6. 重复直到所有 subtasks 完成
7. pack-skill 打包
8. 归档到 archive/

**通过标准：** 全流程自动化

### 2.2 多模型协作

**测试场景：** Reviewer/Executor/Auditor 使用不同模型

**预期流程：**
1. Reviewer: Sonnet (强模型)
2. Executor: Qwen (经济模型)
3. Auditor: GPT-4o (强模型)
4. 各司其职，成本优化

**通过标准：** 模型分工正确

### 2.3 与 Git 集成

**测试场景：** 代码变更自动提交

**预期流程：**
1. Executor 修改代码
2. 自动 Git add/commit
3. 提交信息规范
4. 可选 Push

**通过标准：** 版本控制正确

---

## 3. 端到端测试

### 3.1 E2E-001: 简单功能开发

**步骤：**
1. 创建任务：添加工具函数
2. 系统自动执行
3. 生成代码
4. 运行测试
5. 打包归档

**预期结果：** 功能完整可用

### 3.2 E2E-002: Bug 修复流程

**步骤：**
1. 创建任务：修复已知 Bug
2. 系统分析原因
3. 生成修复代码
4. 运行回归测试
5. 验证修复

**预期结果：** Bug 修复且无回归

### 3.3 E2E-003: 技能改进流程

**步骤：**
1. 创建任务：优化现有技能
2. 系统分析代码
3. 生成优化版本
4. 对比测试
5. 性能提升验证

**预期结果：** 性能提升

### 3.4 E2E-004: ClawHub 发布

**步骤：**
1. 任务完成
2. pack-skill 打包
3. clawhub publish
4. 验证可安装
5. 更新文档

**预期结果：** 发布成功

---

## 4. 边界条件测试

| 测试用例 | 场景 | 预期处理 |
|---------|------|---------|
| TC-BOUND-001 | 任务执行超时 | 超时终止，标记失败 |
| TC-BOUND-002 | 模型 API 异常 | 重试或切换模型 |
| TC-BOUND-003 | 代码冲突 | 报告人工介入 |
| TC-BOUND-004 | 测试失败 | 自动修复或报告 |
| TC-BOUND-005 | 循环依赖 | 检测并报告 |
| TC-BOUND-006 | 资源不足 | 暂停任务，告警 |
| TC-BOUND-007 | 安全风险 | 阻止提交，告警 |

---

## 5. 性能测试

| 指标 | 目标值 |
|-----|-------|
| 心跳扫描延迟 | < 5min |
| 单 subtask 执行 | < 10min |
| 完整任务 (5 subtasks) | < 1h |
| 模型调用成功率 | > 95% |
| 代码生成质量 | > 80% 一次通过 |
| 并发任务处理 | 3 任务并行 |

---

## 测试数据样例

### 任务定义

```json
{
  "task": {
    "task_id": "task-20260327-001",
    "title": "添加邮件模板管理功能",
    "description": "实现邮件模板的 CRUD 操作，支持变量替换",
    "priority": "P1",
    "created_at": "2026-03-27T09:00:00Z",
    "status": "pending",
    "subtasks": [
      {
        "id": "st-001",
        "title": "设计模板数据结构",
        "description": "定义模板的 JSON schema",
        "status": "pending",
        "estimated_time": "30min"
      },
      {
        "id": "st-002",
        "title": "实现模板存储模块",
        "description": "CRUD 操作实现",
        "status": "pending",
        "estimated_time": "1h"
      },
      {
        "id": "st-003",
        "title": "实现变量替换引擎",
        "description": "支持{{variable}}语法",
        "status": "pending",
        "estimated_time": "1h"
      },
      {
        "id": "st-004",
        "title": "编写单元测试",
        "description": "覆盖率>80%",
        "status": "pending",
        "estimated_time": "30min"
      }
    ],
    "dependencies": [],
    "tags": ["email", "template", "feature"]
  }
}
```

### 执行日志

```json
{
  "execution_log": {
    "task_id": "task-20260327-001",
    "phases": [
      {
        "phase": "review",
        "model": "sonnet",
        "status": "completed",
        "duration": "2min",
        "output": "执行指令生成"
      },
      {
        "phase": "execute",
        "model": "qwen",
        "subtask": "st-001",
        "status": "completed",
        "duration": "5min",
        "output": "代码实现"
      },
      {
        "phase": "audit",
        "model": "gpt-4o",
        "status": "passed",
        "duration": "1min",
        "feedback": "代码质量良好"
      }
    ],
    "final_status": "completed",
    "archived_at": "2026-03-27T10:30:00Z"
  }
}
```

---

## 通过标准汇总

| 测试类型 | 通过率要求 | 关键指标 |
|---------|-----------|---------|
| 单元测试 | 100% | 所有用例通过 |
| 集成测试 | 100% | 三阶段协作正常 |
| 端到端测试 | > 90% | 任务完成率高 |
| 边界测试 | > 95% | 异常处理正确 |
| 性能测试 | 满足目标 | 执行时间达标 |

---

## 安全红线

| 操作 | 确认要求 | 审批要求 |
|------|----------|----------|
| 删除文件 | 二次确认 | >10 文件需人工 |
| 修改配置 | 审核通过 | 关键配置需人工 |
| 外部发布 | 测试通过 | ClawHub 发布需人工 |
| 依赖安装 | 来源验证 | 新依赖需人工 |

---

## 测试环境要求

- **多模型 API Key** - Sonnet/GPT-4o/Qwen/Haiku
- **Git 仓库** - 测试用代码库
- **ClawHub 账号** - 发布测试
- **隔离环境** - 防止影响生产

---

**文档版本：** 1.0.0  
**创建日期：** 2026-03-27  
**维护者：** Super Sales Agent QA Team
