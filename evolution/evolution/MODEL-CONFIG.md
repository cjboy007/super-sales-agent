# Auto Evolution 模型配置

**更新日期：** 2026-03-28 18:10  
**配置文件：** `evolution/config/models.json`

---

## 📄 配置文件位置

**主配置文件：** `/Users/wilson/.openclaw/workspace/evolution/config/models.json`

```json
{
  "roles": {
    "reviewer": "google/gemini-3.1-pro",
    "executor": "aiberm/gpt-5.4",
    "auditor": "google/gemini-3.1-pro",
    "coordinator": "bailian/qwen3.5-plus"
  }
}
```

**规则：** 所有脚本和文档使用角色名称（reviewer/executor/auditor/coordinator），不硬编码具体模型 ID。

---

## 🎯 模型分配策略

---

## 🎯 模型分配策略

| 角色 | 模型 | 渠道 | 价格 | 用途 |
|------|------|------|------|------|
| **Reviewer（审阅）** | `gemini-3.1-pro` | Google | 🆓 免费 | 任务分析、指令生成、技术选型审查 |
| **Executor（执行）** | `gpt-5.4` | Aiberm | $0.675/$5.40 | 代码编写、文件修改、命令执行 |
| **Auditor（审核）** | `gemini-3.1-pro` | Google | 🆓 免费 | 结果验证、质量检查、通过/重试决策 |
| **Coordinator（协调）** | `qwen3.5-plus` | Bailian | 🆓 免费 | 任务扫描、状态更新、子 agent 调度 |

---

## 💰 成本估算（按 Task 001-007，39 小时工作量）

| 角色 | Token 用量 | 成本 |
|------|-----------|------|
| Reviewer (Gemini) | 2M in / 1M out | $0 |
| Executor (GPT-5.4) | 3M in / 1M out | ~$7.43 |
| Auditor (Gemini) | 1M in / 0.5M out | $0 |
| Coordinator (Qwen) | 1M in / 0.5M out | $0 |
| **总计** | | **~$7.43** |

**对比全用 Sonnet：** ~$25+  
**节省：** ~70%

---

## 📝 Spawn 子 Agent 时的模型参数

### 读取配置文件
```javascript
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config/models.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 使用角色名称获取模型
const reviewerModel = config.roles.reviewer;
const executorModel = config.roles.executor;
const auditorModel = config.roles.auditor;
```

### Reviewer 子 Agent
```javascript
sessions_spawn({
  model: config.roles.reviewer,  // 从配置文件读取
  task: '审阅任务...',
  ...
})
```

### Executor 子 Agent
```javascript
sessions_spawn({
  model: config.roles.executor,  // 从配置文件读取
  task: '执行代码修改...',
  ...
})
```

### Auditor 子 Agent
```javascript
sessions_spawn({
  model: config.roles.auditor,  // 从配置文件读取
  task: '审核执行结果...',
  ...
})
```

---



## 📊 模型能力对比

| 模型 | 代码能力 | 分析能力 | Context | 价格 |
|------|----------|----------|---------|------|
| GPT-5.4 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 400k | $$ |
| Gemini 3.1 Pro | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 2M | 🆓 |
| Qwen3.5-Plus | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 1M | 🆓 |
| Claude Sonnet 4.6 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 1M | $$ |

---

**最后更新：** 2026-03-28 17:55  
**维护者：** WILSON
