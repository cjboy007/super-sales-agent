# 🧪 Sonnet 模型测试报告

**测试日期：** 2026-03-28 17:17  
**测试目的：** 验证哪个 Sonnet 模型可用于子 agent 任务

---

## 可用模型列表 (models.json)

### Aiberm 渠道
| 模型 ID | 名称 | 价格 (输入/输出) | 状态 |
|--------|------|-----------------|------|
| `claude-sonnet-4-6` | Claude Sonnet 4.6 (Aiberm) | $0.56 / $2.79 | ❌ 不允许 |
| `anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 (官方) | $0.60 / $3.00 | ❌ 不允许 |
| `claude-opus-4-6` | Claude Opus 4.6 | $0.93 / $4.65 | 未测试 |

### N1N 渠道（免费）
| 模型 ID | 名称 | 价格 | 状态 |
|--------|------|------|------|
| `n1n-sonnet/claude-sonnet-4-6` | Claude Sonnet 4.6 (N1N) | 免费 | 未测试 |
| `n1n-hongkong/claude-sonnet-4-6` | Claude Sonnet 4.6 (HK) | 免费 | 未测试 |

### Bailian 渠道（当前使用）
| 模型 ID | 名称 | 价格 | 状态 |
|--------|------|------|------|
| `bailian/qwen3.5-plus` | Qwen3.5-Plus | 免费 | ✅ 正在使用 |
| `bailian/kimi-k2.5` | Kimi K2.5 | 免费 | 未测试 |

---

## 测试结果

| 尝试的模型 | 结果 | 错误信息 |
|-----------|------|----------|
| `aiberm/anthropic/claude-sonnet-4-6` | ❌ | model not allowed |
| `claude-sonnet-4-6` | ❌ | model not allowed |
| `anthropic/claude-sonnet-4-6` | ❌ | model not allowed |
| `bailian/claude-sonnet-4-6` | ❌ | model not allowed |
| `bailian/qwen3.5-plus` | ✅ | 当前会话正在使用 |

---

## 结论

**问题：** 子 agent 的模型限制来自 agent 的 allowlist，不是 models.json 中有就可以用。

**解决方案：**
1. 使用当前会话模型（Qwen3.5-Plus）直接执行任务
2. 或者配置 oracle agent 的 models.json 添加允许的 Sonnet 模型
3. 或者使用 openclaw spawn 命令时指定 `--model` 参数（如果支持）

**当前策略：** 使用 Qwen3.5-Plus 执行 Task 001-007，它是：
- ✅ 当前会话已验证可用
- ✅ 免费
- ✅ 1M context window
- ✅ 代码能力足够

---

**测试者：** WILSON  
**下一步：** 用 Qwen3.5-Plus 执行 Email Skill 改进任务
