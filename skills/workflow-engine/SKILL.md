---
name: workflow-engine
description: 工作流引擎 - 通用规则引擎，用于编排跨系统自动化流程（邮件→AI 意图识别→规则匹配→动作执行）。支持事件驱动、规则匹配、动作编排、分支循环控制流。
---

# Workflow Engine - 工作流引擎

## 功能概述

`workflow-engine` 是一个通用的工作流规则引擎，用于编排跨系统自动化流程。

**核心能力：**

- **事件驱动** - 支持 5 种核心业务事件（邮件/报价单/客户/订单/跟进记录）
- **规则匹配** - 基于条件表达式的智能规则匹配
- **动作编排** - 支持 8 种动作类型，可编排复杂工作流
- **控制流** - 支持分支（branch）和循环（loop）
- **可扩展** - 插件化架构，易于添加新事件/动作类型

**适用场景：**

- 邮件自动处理（询盘→报价→跟进）
- 客户生命周期管理（新客户→活跃→休眠）
- 订单状态追踪（下单→生产→发货→回款）
- 跨系统自动化（OKKI + 邮件 + 报价单 + 物流）

## 安装说明

### 目录位置

```
/path/to/your/.openclaw/workspace/monorepo/super-sales-agent/skills/workflow-engine/
```

### 依赖安装

```bash
cd /path/to/your/.openclaw/workspace/monorepo/super-sales-agent/skills/workflow-engine
npm install
```

### 依赖项

- `ajv` - JSON Schema 验证
- Node.js 18+

## 配置说明

### 主配置文件

`config/rules/*.json` - 规则配置文件

**示例：** `config/rules/email-rules.json`
```json
[
  {
    "id": "vip-inquiry-auto-reply",
    "name": "VIP 客户询盘自动回复",
    "priority": 90,
    "enabled": true,
    "trigger": {
      "event_type": "email_received",
      "conditions": {
        "type": "all",
        "checks": [
          {"field": "payload.intent", "operator": "equals", "value": "inquiry"},
          {"field": "payload.customer.tier", "operator": "equals", "value": "vip"}
        ]
      }
    },
    "actions": [
      {"type": "generate_quotation", "config": {...}},
      {"type": "send_email", "config": {...}},
      {"type": "create_okki_trail", "config": {...}}
    ]
  }
]
```

### 环境变量（可选）

```bash
# .env 文件
WORKFLOW_RULES_DIR=./config/rules
WORKFLOW_SCHEMAS_DIR=./schemas
WORKFLOW_DRY_RUN=false
```

## 使用方式

### Node.js API

```javascript
const { RuleEngine } = require('./lib/rule-engine');

// 创建引擎实例
const engine = new RuleEngine({
  rulesDir: './config/rules',
  schemasDir: './schemas',
  dryRun: false
});

// 初始化（加载规则）
await engine.initialize();

// 处理事件
const event = {
  type: 'email_received',
  payload: {
    intent: 'inquiry',
    customer: { tier: 'vip', id: 'okki_123' },
    from: 'vip@customer.com'
  }
};

const result = await engine.handleEvent(event);
console.log(`Matched: ${result.matched}, Executed: ${result.executed}`);
```

### 命令行工具

```bash
# 运行规则引擎
node cli/workflow-cli.js run --event event.json

# 验证规则配置
node cli/workflow-cli.js validate --rules config/rules/

# 列出已加载的规则
node cli/workflow-cli.js list-rules

# Dry-run 测试
node cli/workflow-cli.js run --event event.json --dry-run
```

### OpenClaw 集成

```javascript
// 在 OpenClaw Agent 中使用
const { RuleEngine } = require('workflow-engine');

const engine = new RuleEngine();
await engine.initialize();

// 监听邮件事件
engine.on('event:received', (event) => {
  if (event.type === 'email_received') {
    // 自动处理邮件
  }
});
```

## 核心概念

### 事件（Event）

触发规则执行的业务事件。

**5 种核心事件类型：**

| 事件类型 | 说明 | 触发场景 |
|---------|------|---------|
| `email_received` | 收到邮件 | IMAP 收到新邮件 |
| `quotation_sent` | 报价单已发送 | 报价单生成并发送 |
| `customer_created` | 客户创建 | OKKI 创建新客户 |
| `order_updated` | 订单更新 | OKKI 订单状态变更 |
| `trail_created` | 跟进记录创建 | OKKI 创建跟进记录 |

### 规则（Rule）

定义何时触发和执行什么动作。

**规则结构：**
```json
{
  "id": "rule-id",
  "name": "规则名称",
  "priority": 50,
  "enabled": true,
  "trigger": {
    "event_type": "email_received",
    "conditions": {...}
  },
  "actions": [...]
}
```

### 动作（Action）

规则匹配后执行的具体操作。

**8 种核心动作类型：**

| 动作类型 | 说明 | 配置参数 |
|---------|------|---------|
| `send_email` | 发送邮件 | to, template, variables |
| `create_okki_trail` | 创建 OKKI 跟进 | customer_id, trail_type, content |
| `generate_quotation` | 生成报价单 | customer_id, template, items |
| `update_customer` | 更新客户 | customer_id, fields |
| `call_api` | 调用 API | url, method, headers, body |
| `wait` | 等待 | duration_minutes |
| `branch` | 分支 | condition, true_actions, false_actions |
| `loop` | 循环 | items, action |

## 规则语法

### 条件表达式

**支持的运算符：**

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `equals` | 等于 | `{"field": "payload.intent", "operator": "equals", "value": "inquiry"}` |
| `not_equals` | 不等于 | `{"field": "payload.tier", "operator": "not_equals", "value": "vip"}` |
| `greater_than` | 大于 | `{"field": "payload.amount", "operator": "greater_than", "value": 10000}` |
| `less_than` | 小于 | `{"field": "payload.amount", "operator": "less_than", "value": 1000}` |
| `contains` | 包含 | `{"field": "payload.subject", "operator": "contains", "value": "urgent"}` |
| `regex` | 正则匹配 | `{"field": "payload.from", "operator": "regex", "value": ".*@vip\\.com$"}` |
| `exists` | 字段存在 | `{"field": "payload.attachments", "operator": "exists", "value": true}` |

### 逻辑组合

```json
{
  "type": "all",  // AND 逻辑
  "checks": [
    {"field": "payload.intent", "operator": "equals", "value": "inquiry"},
    {"field": "payload.customer.tier", "operator": "equals", "value": "vip"}
  ]
}
```

```json
{
  "type": "any",  // OR 逻辑
  "checks": [
    {"field": "payload.amount", "operator": "greater_than", "value": 50000},
    {"field": "payload.customer.tier", "operator": "equals", "value": "vip"}
  ]
}
```

### 变量引用

```javascript
${payload.customer.email}
${context.last_contact_days}
${actions[0].quotation_no}
```

### 内置函数

```javascript
daysSince("2026-01-01")  // 计算天数
contains("Hello", "ell") // 检查包含
matches("abc123", "\\d+") // 正则匹配
```

## 完整示例

### 示例 1：VIP 客户询盘自动回复

```json
{
  "id": "vip-inquiry-auto-reply",
  "name": "VIP 客户询盘自动回复",
  "priority": 90,
  "enabled": true,
  "trigger": {
    "event_type": "email_received",
    "conditions": {
      "type": "all",
      "checks": [
        {"field": "payload.intent", "operator": "equals", "value": "inquiry"},
        {"field": "payload.customer.tier", "operator": "equals", "value": "vip"}
      ]
    }
  },
  "actions": [
    {
      "type": "generate_quotation",
      "config": {
        "customer_id": "${payload.customer.id}",
        "template": "vip-standard"
      }
    },
    {
      "type": "send_email",
      "config": {
        "to": "${payload.from}",
        "template": "vip-inquiry-ack"
      }
    },
    {
      "type": "create_okki_trail",
      "config": {
        "customer_id": "${payload.customer.id}",
        "trail_type": 105,
        "content": "VIP 客户询盘，已自动生成报价单"
      }
    }
  ]
}
```

### 示例 2：报价单跟进序列

```json
{
  "id": "quote-followup-sequence",
  "name": "报价单跟进序列",
  "priority": 70,
  "enabled": true,
  "trigger": {
    "event_type": "quotation_sent",
    "conditions": {
      "type": "all",
      "checks": [
        {"field": "payload.amount", "operator": "greater_than", "value": 10000}
      ]
    }
  },
  "actions": [
    {
      "type": "wait",
      "config": {"duration_minutes": 4320}  // 3 天
    },
    {
      "type": "branch",
      "config": {
        "condition": "${payload.customer.replied} == false",
        "true_actions": [
          {
            "type": "send_email",
            "config": {
              "to": "${payload.customer.email}",
              "template": "quote-followup-1"
            }
          }
        ]
      }
    }
  ]
}
```

## 测试

### 单元测试

```bash
npm test
```

### E2E 测试

```bash
bash test/e2e.sh
```

### 测试覆盖率

```bash
npm run test:coverage
```

## 故障排查

### 规则未匹配

**检查：**
1. 规则是否启用（`enabled: true`）
2. 事件类型是否匹配
3. 条件是否满足

```javascript
// 调试
console.log(engine.getRules());
const matched = engine.matchRules(event);
console.log('Matched rules:', matched);
```

### 动作执行失败

**检查：**
1. 动作参数是否完整
2. 依赖的外部服务是否可用
3. 查看执行日志

```javascript
const log = engine.getExecutionLog();
console.log(log);
```

## 性能优化

### 规则缓存

```javascript
const engine = new RuleEngine({
  enableCache: true,
  cacheMaxSize: 1000
});
```

### 批量处理

```javascript
// 批量处理事件
const events = [...];
const results = await Promise.all(
  events.map(event => engine.handleEvent(event))
);
```

## 扩展指南

### 添加新事件类型

1. 在 `schemas/event-schema.json` 添加定义
2. 实现事件发射器
3. 更新文档

### 添加新动作类型

1. 创建 `lib/actions/xxx-action.js`
2. 实现 `execute(config, context)` 方法
3. 在 `action-schema.json` 添加定义

## 参考资料

- [数据模型文档](docs/data-model.md)
- [规则语法参考](config/rule-syntax.md)
- [示例规则](config/rules/)
- [E2E 测试](test/e2e/)

---

**版本：** 1.0.0  
**最后更新：** 2026-04-02  
**维护者：** Super Sales Agent Team
