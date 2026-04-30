# Workflow Engine - 工作流引擎

**版本：** 1.0.0  
**状态：** ✅ 核心功能完成

通用工作流规则引擎，用于编排跨系统自动化流程（邮件→AI 意图识别→规则匹配→动作执行）。

---

## 🚀 快速开始

### 安装

```bash
cd /path/to/your/.openclaw/workspace/monorepo/super-sales-agent/skills/workflow-engine
npm install
```

### 基本使用

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
    customer: { tier: 'vip' }
  }
};

const result = await engine.handleEvent(event);
console.log(`Matched: ${result.matched}, Executed: ${result.executed}`);
```

---

## 📁 目录结构

```
workflow-engine/
├── schemas/                    # JSON Schema 定义
│   ├── rule-schema.json        # 规则结构
│   ├── event-schema.json       # 事件类型
│   └── action-schema.json      # 动作类型
├── lib/                        # 核心库
│   ├── rule-engine.js          # 规则引擎核心
│   ├── rule-matcher.js         # 规则匹配器
│   ├── rule-parser.js          # 规则解析器
│   ├── expression-evaluator.js # 表达式求值器
│   ├── action-executor.js      # 动作执行器
│   ├── workflow-orchestrator.js# 工作流编排器
│   └── actions/                # 动作实现
│       ├── send-email-action.js
│       ├── create-okki-trail-action.js
│       └── ...
├── config/
│   ├── rules/                  # 规则配置
│   │   ├── email-rules.json    # 邮件处理规则
│   │   └── customer-rules.json # 客户管理规则
│   └── rule-syntax.md          # 规则语法参考
├── test/
│   ├── e2e/                    # E2E 测试
│   │   └── email-to-quotation.test.js
│   └── fixtures/               # 测试数据
└── docs/
    └── data-model.md           # 数据模型文档
```

---

## 📖 核心概念

### 事件（Event）

触发规则执行的业务事件。

**5 种核心事件类型：**
- `email_received` - 收到邮件
- `quotation_sent` - 报价单已发送
- `customer_created` - 客户创建
- `order_updated` - 订单更新
- `trail_created` - OKKI 跟进记录创建

### 规则（Rule）

定义何时触发和执行什么动作。

**规则结构：**
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
    {"type": "generate_quotation", "config": {...}},
    {"type": "send_email", "config": {...}},
    {"type": "create_okki_trail", "config": {...}}
  ]
}
```

### 动作（Action）

规则匹配后执行的具体操作。

**8 种核心动作类型：**
1. `send_email` - 发送邮件
2. `create_okki_trail` - 创建 OKKI 跟进记录
3. `generate_quotation` - 生成报价单
4. `update_customer` - 更新客户信息
5. `call_api` - 调用外部 API
6. `wait` - 等待（延迟执行）
7. `branch` - 条件分支
8. `loop` - 循环执行

---

## 🎯 功能特性

### ✅ 已完成

- [x] 规则加载和验证
- [x] 事件触发规则匹配
- [x] 规则优先级排序
- [x] 规则冲突解决（first-match / all-match）
- [x] 动作序列编排
- [x] 上下文传递
- [x] 支持分支和循环控制流
- [x] 错误处理和重试机制
- [x] Dry-run 模式
- [x] 执行日志记录

### 🔄 进行中

- [ ] 性能优化（规则缓存）
- [ ] 监控仪表盘
- [ ] 可视化规则编辑器

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [数据模型](docs/data-model.md) | 事件/动作/规则的完整数据模型 |
| [规则语法](config/rule-syntax.md) | 条件表达式语法参考 |
| [示例规则](config/rules/) | 邮件/客户管理规则示例 |

---

## 🧪 测试

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

---

## 🔧 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `rulesDir` | string | `./config/rules` | 规则目录路径 |
| `schemasDir` | string | `./schemas` | Schema 目录路径 |
| `dryRun` | boolean | `false` | Dry-run 模式（不实际执行） |
| `conflictResolution` | string | `first-match` | 冲突解决策略（`first-match` / `all-match`） |
| `maxRetries` | number | `3` | 动作失败最大重试次数 |
| `retryDelay` | number | `1000` | 重试延迟（毫秒） |

---

## 📝 示例

### 示例 1：VIP 客户询盘自动回复

```javascript
const event = {
  type: 'email_received',
  payload: {
    intent: 'inquiry',
    customer: { tier: 'vip', id: 'okki_123' },
    from: 'vip@customer.com'
  }
};

const result = await engine.handleEvent(event);
// 执行动作：
// 1. 生成报价单草稿
// 2. 发送确认邮件
// 3. 创建 OKKI 跟进记录
```

### 示例 2：动态添加规则

```javascript
const newRule = {
  id: 'custom-rule',
  name: 'Custom Rule',
  priority: 50,
  trigger: { event_type: 'email_received' },
  actions: [{ type: 'send_email', config: {...} }]
};

engine.rules.set('custom-rule', newRule);
await engine.reloadRules();
```

### 示例 3：监听事件

```javascript
engine.on('event:received', (event) => {
  console.log('Received event:', event.type);
});

engine.on('rule:executed', (result) => {
  console.log('Rule executed:', result.rule_id);
});
```

---

## 🚨 故障排查

### 规则未匹配

**问题：** 事件发送后没有规则执行

**检查：**
1. 规则是否启用（`enabled: true`）
2. 事件类型是否匹配（`trigger.event_type`）
3. 条件是否满足（检查 `payload` 结构）

```javascript
// 调试：查看已加载的规则
console.log(engine.getRules());

// 调试：查看匹配的规则
const matched = engine.matchRules(event);
console.log('Matched rules:', matched);
```

### 动作执行失败

**问题：** 规则匹配但动作执行失败

**检查：**
1. 动作参数是否完整
2. 依赖的外部服务是否可用
3. 查看执行日志

```javascript
// 查看执行日志
const log = engine.getExecutionLog();
console.log(log);
```

---

## 📊 性能基准

| 指标 | 目标 | 当前 |
|------|------|------|
| 规则匹配耗时 | < 10ms | ~5ms |
| 事件处理速率 | > 10 事件/秒 | ~20 事件/秒 |
| 规则缓存命中率 | > 80% | N/A（待实现） |

---

## 🤝 贡献

### 添加新事件类型

1. 在 `schemas/event-schema.json` 中添加新事件定义
2. 在事件发射器中实现触发逻辑
3. 更新 [数据模型文档](docs/data-model.md)

### 添加新动作类型

1. 创建 `lib/actions/xxx-action.js`
2. 实现 `execute(config, context)` 方法
3. 在 `action-schema.json` 中添加定义
4. 更新 [数据模型文档](docs/data-model.md)

---

## 📄 许可证

MIT

---

**最后更新：** 2026-04-02  
**维护者：** Super Sales Agent Team
