# 规则语法参考

## 概述

规则语法用于定义工作流引擎中的条件表达式。支持逻辑运算符、比较运算符、变量引用和函数调用。

---

## 逻辑运算符

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `AND` / `all` | 所有条件都必须满足 | `{"type": "all", "checks": [...]}` |
| `OR` / `any` | 至少一个条件满足 | `{"type": "any", "checks": [...]}` |
| `NOT` | 条件取反 | `{"operator": "not_equals", ...}` |

---

## 比较运算符

| 运算符 | 别名 | 说明 | 示例 |
|--------|------|------|------|
| `equals` | `==` | 等于 | `{"field": "payload.intent", "operator": "equals", "value": "inquiry"}` |
| `not_equals` | `!=` | 不等于 | `{"field": "payload.tier", "operator": "not_equals", "value": "vip"}` |
| `greater_than` | `>` | 大于 | `{"field": "payload.amount", "operator": "greater_than", "value": 10000}` |
| `less_than` | `<` | 小于 | `{"field": "payload.amount", "operator": "less_than", "value": 1000}` |
| `greater_than_or_equal` | `>=` | 大于等于 | `{"field": "payload.amount", "operator": "greater_than_or_equal", "value": 5000}` |
| `less_than_or_equal` | `<=` | 小于等于 | `{"field": "payload.amount", "operator": "less_than_or_equal", "value": 50000}` |
| `contains` | - | 包含 | `{"field": "payload.subject", "operator": "contains", "value": "urgent"}` |
| `regex` | `matches` | 正则匹配 | `{"field": "payload.from", "operator": "regex", "value": ".*@vip\\.com$"}` |
| `exists` | - | 字段存在 | `{"field": "payload.attachments", "operator": "exists", "value": true}` |
| `in` | - | 在数组中 | `{"field": "payload.tier", "operator": "in", "value": ["vip", "gold"]}` |
| `not_in` | - | 不在数组中 | `{"field": "payload.status", "operator": "not_in", "value": ["cancelled"]}` |

---

## 变量引用

使用 `${path}` 语法引用上下文中的变量：

```javascript
// 引用事件数据
${event.type}
${event.payload.from}
${event.payload.customer.id}

// 引用上下文
${context.last_contact_days}
${context.user.role}

// 引用动作输出
${actions[0].quotation_no}
${actions[1].sent_at}
```

**支持的路径格式：**
- 简单路径：`payload.from`
- 嵌套路径：`payload.customer.email`
- 数组索引：`actions[0].result`
- 混合路径：`event.payload.items[0].price`

---

## 内置函数

### 日期时间函数

| 函数 | 参数 | 返回值 | 示例 |
|------|------|--------|------|
| `daysSince(date)` | 日期字符串 | 天数 | `daysSince("2026-01-01")` → `91` |
| `formatDate(date, format)` | 日期字符串，格式 | 格式化字符串 | `formatDate("2026-04-02", "YYYY-MM-DD")` |
| `now()` | 无 | 当前时间戳 | `now()` → `1712044800000` |

### 字符串函数

| 函数 | 参数 | 返回值 | 示例 |
|------|------|--------|------|
| `contains(str, substr)` | 原字符串，子串 | boolean | `contains("Hello World", "World")` → `true` |
| `matches(str, pattern)` | 原字符串，正则 | boolean | `matches("abc123", "\\d+")` → `true` |
| `upper(str)` | 字符串 | 大写字符串 | `upper("hello")` → `"HELLO"` |
| `lower(str)` | 字符串 | 小写字符串 | `lower("HELLO")` → `"hello"` |
| `length(str)` | 字符串或数组 | 长度 | `length("hello")` → `5` |

### 其他函数

| 函数 | 参数 | 返回值 | 示例 |
|------|------|--------|------|
| `exists(value)` | 任意值 | boolean | `exists(null)` → `false` |

---

## 完整示例

### 示例 1：简单条件

```json
{
  "type": "all",
  "checks": [
    {
      "field": "payload.intent",
      "operator": "equals",
      "value": "inquiry"
    },
    {
      "field": "payload.customer.tier",
      "operator": "equals",
      "value": "vip"
    }
  ]
}
```

### 示例 2：OR 条件

```json
{
  "type": "any",
  "checks": [
    {
      "field": "payload.amount",
      "operator": "greater_than",
      "value": 50000
    },
    {
      "field": "payload.customer.tier",
      "operator": "equals",
      "value": "vip"
    }
  ]
}
```

### 示例 3：使用函数

```json
{
  "type": "all",
  "checks": [
    {
      "field": "payload.intent",
      "operator": "equals",
      "value": "inquiry"
    },
    {
      "field": "daysSince(payload.customer.last_contact)",
      "operator": "greater_than",
      "value": 30
    }
  ]
}
```

### 示例 4：使用变量引用

```json
{
  "type": "all",
  "checks": [
    {
      "field": "payload.customer.id",
      "operator": "equals",
      "value": "${context.target_customer_id}"
    },
    {
      "field": "payload.amount",
      "operator": "greater_than",
      "value": "${context.min_amount}"
    }
  ]
}
```

### 示例 5：复杂嵌套条件

```json
{
  "type": "all",
  "checks": [
    {
      "field": "payload.intent",
      "operator": "equals",
      "value": "inquiry"
    },
    {
      "type": "any",
      "checks": [
        {
          "field": "payload.customer.tier",
          "operator": "equals",
          "value": "vip"
        },
        {
          "field": "payload.amount",
          "operator": "greater_than",
          "value": 100000
        }
      ]
    },
    {
      "field": "daysSince(payload.customer.last_contact)",
      "operator": "less_than",
      "value": 7
    }
  ]
}
```

---

## 错误处理

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Unknown operator: xxx` | 使用了不支持的运算符 | 检查运算符拼写，参考运算符列表 |
| `Unknown function: xxx` | 调用了不存在的函数 | 检查函数名，参考函数列表 |
| `Failed to evaluate expression` | 表达式语法错误 | 检查表达式语法，确保括号匹配 |
| `Field not found: xxx` | 引用的字段不存在 | 检查字段路径是否正确 |

### 调试技巧

1. **打印上下文**：在执行前输出 `console.log(context)` 查看可用字段
2. **简化表达式**：先测试简单条件，再逐步添加复杂逻辑
3. **使用 exists 检查**：在访问嵌套字段前先用 `exists` 检查

---

## 最佳实践

1. **使用明确的字段路径** - 避免使用模糊的路径
2. **添加 exists 检查** - 在访问可能不存在的字段前先检查
3. **避免复杂嵌套** - 超过 3 层嵌套考虑拆分规则
4. **使用有意义的 ID** - 规则 ID 应该清晰描述用途
5. **添加注释** - 在复杂规则中添加 `description` 字段

---

## 参考资料

- 数据模型文档：`docs/data-model.md`
- Rule Parser 实现：`lib/rule-parser.js`
- Expression Evaluator 实现：`lib/expression-evaluator.js`
