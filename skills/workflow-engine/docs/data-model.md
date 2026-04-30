# 工作流引擎 - 数据模型文档

## 概述

工作流引擎是一个通用的规则引擎，用于编排跨系统自动化流程（邮件→AI 意图识别→规则匹配→动作执行）。

### 设计目标

1. **通用性** - 支持多种事件类型和动作类型
2. **可扩展** - 易于添加新的事件/动作类型
3. **声明式** - 通过配置文件定义规则，无需编码
4. **可观测** - 完整的执行日志和性能监控

### 核心概念

| 概念 | 说明 |
|------|------|
| **事件（Event）** | 触发规则执行的业务事件（如收到邮件、报价单发送） |
| **规则（Rule）** | 定义何时触发（trigger）和执行什么动作（actions） |
| **动作（Action）** | 规则匹配后执行的具体操作（如发送邮件、创建 OKKI 跟进） |
| **工作流（Workflow）** | 多个动作按顺序/条件编排执行 |

---

## 事件模型

### 事件结构

```json
{
  "type": "email_received",
  "payload": { ... },
  "metadata": {
    "timestamp": "2026-04-02T21:00:00+08:00",
    "source": "imap-smtp-email",
    "correlation_id": "evt-123456"
  }
}
```

### 5 种核心事件类型

#### 1. email_received - 收到邮件

**触发场景：** IMAP 收到新邮件

**Payload 结构：**
```json
{
  "from": "customer@example.com",
  "to": "sales@your-domain.com",
  "subject": "Inquiry - HDMI Cable",
  "body": "Dear Sir/Madam, ...",
  "attachments": [...],
  "intent": "inquiry",
  "keywords": ["HDMI", "cable", "price"]
}
```

#### 2. quotation_sent - 报价单已发送

**触发场景：** 报价单生成并发送后

**Payload 结构：**
```json
{
  "quotation_no": "QT-20260402-001",
  "customer_id": "okki_12345",
  "amount": 50000,
  "currency": "USD",
  "items": [...],
  "sent_at": "2026-04-02T10:00:00+08:00"
}
```

#### 3. customer_created - 客户创建

**触发场景：** OKKI 创建新客户

**Payload 结构：**
```json
{
  "customer_id": "okki_12345",
  "name": "John Doe",
  "email": "john@example.com",
  "company": "ABC Trading",
  "source": "email",
  "created_at": "2026-04-02T10:00:00+08:00"
}
```

#### 4. order_updated - 订单更新

**触发场景：** OKKI 订单状态变更

**Payload 结构：**
```json
{
  "order_id": "ORD-20260402-001",
  "customer_id": "okki_12345",
  "status": "confirmed",
  "amount": 50000,
  "updated_fields": ["status", "amount"]
}
```

#### 5. trail_created - OKKI 跟进记录创建

**触发场景：** OKKI 创建新的跟进记录

**Payload 结构：**
```json
{
  "trail_id": "trail_12345",
  "customer_id": "okki_12345",
  "trail_type": 102,
  "content": "已发送报价单",
  "created_by": "sales_user_1"
}
```

---

## 动作模型

### 动作结构

```json
{
  "type": "send_email",
  "config": { ... },
  "retry_policy": {
    "max_retries": 3,
    "delay_seconds": 60,
    "backoff_multiplier": 2
  }
}
```

### 8 种核心动作类型

#### 1. send_email - 发送邮件

**用途：** 自动发送邮件（通知/跟进/确认）

**Config 参数：**
```json
{
  "to": "customer@example.com",
  "cc": "manager@example.com",
  "template": "inquiry-reply",
  "variables": {"customer_name": "John"},
  "attachments": [...]
}
```

#### 2. create_okki_trail - 创建 OKKI 跟进记录

**用途：** 同步自动化操作到 OKKI

**Config 参数：**
```json
{
  "customer_id": "okki_12345",
  "trail_type": 102,
  "content": "自动发送跟进邮件",
  "attachments": [...]
}
```

#### 3. generate_quotation - 生成报价单

**用途：** 自动创建报价单

**Config 参数：**
```json
{
  "customer_id": "okki_12345",
  "template": "standard",
  "items": [...],
  "pricing_rules": {"copper_price": 9200}
}
```

#### 4. update_customer - 更新客户信息

**用途：** 同步客户数据

**Config 参数：**
```json
{
  "customer_id": "okki_12345",
  "fields": {"tier": "vip", "tags": ["high-value"]},
  "merge_strategy": "merge"
}
```

#### 5. call_api - 调用外部 API

**用途：** 集成第三方系统

**Config 参数：**
```json
{
  "url": "https://api.example.com/webhook",
  "method": "POST",
  "headers": {"Authorization": "Bearer xxx"},
  "body": {"event": "${event.type}"},
  "timeout": 30000
}
```

**安全限制：**
- URL 白名单（防止 SSRF）
- 超时限制（默认 30 秒）
- 速率限制（最多 10 次/分钟）

#### 6. wait - 等待

**用途：** 延迟执行后续动作

**Config 参数：**
```json
{
  "duration_minutes": 60,
  "until_condition": "${customer.replied} == true"
}
```

#### 7. branch - 条件分支

**用途：** 根据条件执行不同动作序列

**Config 参数：**
```json
{
  "condition": "${event.payload.amount} > 10000",
  "true_actions": [
    {"type": "send_email", "config": {"template": "vip-ack"}}
  ],
  "false_actions": [
    {"type": "send_email", "config": {"template": "standard-ack"}}
  ]
}
```

#### 8. loop - 循环执行

**用途：** 批量处理

**Config 参数：**
```json
{
  "items": "${event.payload.contacts}",
  "action": {"type": "send_email", "config": {...}},
  "max_iterations": 100
}
```

---

## 规则模型

### 规则结构

```json
{
  "id": "vip-inquiry-auto-reply",
  "name": "VIP 客户询盘自动回复",
  "description": "当 VIP 客户发送询盘邮件时，自动创建报价单草稿并通知销售总监",
  "priority": 90,
  "enabled": true,
  "trigger": {
    "event_type": "email_received",
    "conditions": {...}
  },
  "actions": [...],
  "metadata": {
    "created_at": "2026-04-02T10:00:00+08:00",
    "created_by": "admin",
    "version": "1.0",
    "tags": ["vip", "auto-reply"]
  }
}
```

### 条件表达式

**支持的操作符：**

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `equals` | 等于 | `{"field": "payload.intent", "operator": "equals", "value": "inquiry"}` |
| `not_equals` | 不等于 | `{"field": "payload.customer.tier", "operator": "not_equals", "value": "vip"}` |
| `greater_than` | 大于 | `{"field": "payload.amount", "operator": "greater_than", "value": 10000}` |
| `less_than` | 小于 | `{"field": "payload.amount", "operator": "less_than", "value": 1000}` |
| `contains` | 包含 | `{"field": "payload.subject", "operator": "contains", "value": "urgent"}` |
| `regex` | 正则匹配 | `{"field": "payload.from", "operator": "regex", "value": ".*@vip\\.com$"}` |
| `exists` | 字段存在 | `{"field": "payload.attachments", "operator": "exists", "value": true}` |

**逻辑组合：**

```json
{
  "type": "all",  // AND
  "checks": [
    {"field": "payload.intent", "operator": "equals", "value": "inquiry"},
    {"field": "payload.customer.tier", "operator": "equals", "value": "vip"}
  ]
}
```

```json
{
  "type": "any",  // OR
  "checks": [
    {"field": "payload.amount", "operator": "greater_than", "value": 50000},
    {"field": "payload.customer.tier", "operator": "equals", "value": "vip"}
  ]
}
```

### 优先级和冲突解决

**优先级规则：**
- 优先级范围：1-100（数字越大优先级越高）
- 同一事件触发多个规则时，按优先级降序执行
- 优先级相同时，按规则 ID 字母顺序执行

**冲突解决策略：**
- `first-match` - 执行第一个匹配的规则（默认）
- `all-match` - 执行所有匹配的规则

---

## 控制流

### Branch（分支）

**语义：** 根据条件执行不同的动作序列

**示例：**
```json
{
  "type": "branch",
  "config": {
    "condition": "${payload.amount} > 10000",
    "true_actions": [
      {"type": "send_email", "config": {"template": "vip-ack"}}
    ],
    "false_actions": [
      {"type": "send_email", "config": {"template": "standard-ack"}}
    ]
  }
}
```

**嵌套分支：**
```json
{
  "type": "branch",
  "config": {
    "condition": "${payload.customer.tier} == 'vip'",
    "true_actions": [
      {
        "type": "branch",
        "config": {
          "condition": "${payload.amount} > 50000",
          "true_actions": [...],
          "false_actions": [...]
        }
      }
    ],
    "false_actions": [...]
  }
}
```

### Loop（循环）

**语义：** 对数组中的每个元素执行动作

**示例：**
```json
{
  "type": "loop",
  "config": {
    "items": "${payload.contacts}",
    "action": {
      "type": "send_email",
      "config": {"to": "${item.email}", "template": "intro"}
    },
    "max_iterations": 100
  }
}
```

**并行循环（未来扩展）：**
```json
{
  "type": "loop",
  "config": {
    "items": "${payload.contacts}",
    "action": {...},
    "parallel": true,
    "max_concurrency": 10
  }
}
```

---

## 扩展性设计

### 添加新事件类型

1. 在 `schemas/event-schema.json` 的 `oneOf` 数组中添加新事件定义
2. 在事件发射器中实现新事件的触发逻辑
3. 更新本文档的事件模型章节

**示例：** 添加 `payment_received` 事件
```json
{
  "title": "Payment Received",
  "properties": {
    "type": {"const": "payment_received"},
    "payload": {
      "type": "object",
      "properties": {
        "payment_id": {"type": "string"},
        "amount": {"type": "number"},
        "currency": {"type": "string"},
        "paid_at": {"type": "string", "format": "date-time"}
      }
    }
  }
}
```

### 添加新动作类型

1. 在 `schemas/action-schema.json` 的 `oneOf` 数组中添加新动作定义
2. 在动作执行器中实现新动作的执行逻辑
3. 更新本文档的动作模型章节

**示例：** 添加 `send_wechat` 动作
```json
{
  "title": "Send WeChat Message",
  "properties": {
    "type": {"const": "send_wechat"},
    "config": {
      "type": "object",
      "properties": {
        "user_id": {"type": "string"},
        "template": {"type": "string"},
        "variables": {"type": "object"}
      }
    }
  }
}
```

### 插件机制（预留）

未来可支持插件化扩展：
```json
{
  "plugins": [
    {
      "name": "custom-actions",
      "path": "./plugins/custom-actions.js",
      "actions": ["send_sms", "create_jira_ticket"]
    }
  ]
}
```

---

## 完整示例

### 示例 1：VIP 客户询盘自动回复

```json
{
  "id": "vip-inquiry-auto-reply",
  "name": "VIP 客户询盘自动回复",
  "description": "当 VIP 客户发送询盘邮件时，自动创建报价单草稿并通知销售总监",
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
        "template": "vip-standard",
        "items": "${payload.inquiry.items}"
      }
    },
    {
      "type": "send_email",
      "config": {
        "to": "${payload.from}",
        "template": "vip-inquiry-ack",
        "variables": {"customer_name": "${payload.customer.name}"}
      }
    },
    {
      "type": "create_okki_trail",
      "config": {
        "customer_id": "${payload.customer.id}",
        "trail_type": 105,
        "content": "VIP 客户询盘，已自动生成报价单草稿"
      }
    },
    {
      "type": "send_email",
      "config": {
        "to": "sales-director@your-domain.com",
        "template": "vip-notify",
        "variables": {
          "customer_name": "${payload.customer.name}",
          "quotation_no": "${actions[0].quotation_no}"
        }
      }
    }
  ],
  "metadata": {
    "created_at": "2026-04-02T10:00:00+08:00",
    "created_by": "admin",
    "version": "1.0",
    "tags": ["vip", "auto-reply", "inquiry"]
  }
}
```

### 示例 2：报价单跟进序列

```json
{
  "id": "quote-followup-sequence",
  "name": "报价单跟进序列",
  "description": "报价单发送后 3 天未回复，自动发送跟进邮件；7 天未回复，升级为电话跟进",
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
      "config": {
        "duration_minutes": 4320
      }
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
              "template": "quote-followup-1",
              "variables": {
                "quotation_no": "${payload.quotation_no}",
                "amount": "${payload.amount}"
              }
            }
          },
          {
            "type": "wait",
            "config": {
              "duration_minutes": 5760
            }
          },
          {
            "type": "branch",
            "config": {
              "condition": "${payload.customer.replied} == false",
              "true_actions": [
                {
                  "type": "create_okki_trail",
                  "config": {
                    "customer_id": "${payload.customer.id}",
                    "trail_type": 105,
                    "content": "报价单 7 天未回复，建议电话跟进"
                  }
                },
                {
                  "type": "send_email",
                  "config": {
                    "to": "sales-manager@your-domain.com",
                    "template": "escalation-notify",
                    "variables": {
                      "customer_name": "${payload.customer.name}",
                      "quotation_no": "${payload.quotation_no}"
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
```

---

## 参考资料

- JSON Schema 官方文档：https://json-schema.org/
- follow-up-engine 配置：`/path/to/your/.openclaw/workspace/skills/follow-up-engine/config/`
- OKKI API 文档：`/path/to/your/.openclaw/workspace/xiaoman-okki/docs/`

---

**文档版本：** 1.0  
**最后更新：** 2026-04-02  
**维护者：** Super Sales Agent Team
