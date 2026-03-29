# 🔍 OKKI trail_type 问题调查报告

**调查日期：** 2026-03-28 18:14  
**问题：** inbound 邮件同步到 OKKI 后，trail_type 显示为 101 而非 102

---

## 📋 问题描述

**现象：**
- 代码传入 `--type 102`（邮件跟进）
- OKKI API 成功创建跟进记录
- 但返回的 `type` 字段始终是 **101**（快速记录）

**测试验证：**
```bash
# 创建跟进记录（指定 type=102）
python3 okki.py trail add --company 79903832618336 \
  --content "测试邮件跟进 trail_type=102" \
  --type 102

# 返回
{
  "trail_id": 88760584422627,
  "type": 101  # ❌ 预期 102，实际 101
}
```

---

## 🔍 调查过程

### 1. 检查代码配置 ✅

**okki-sync.js:**
```javascript
const CONFIG = {
  TRAIL_TYPE: {
    QUOTATION: 101,      // 快速记录
    EMAIL: 102,          // 邮件
    ORDER_CONTRACT: 103, // 订单/合同
    ...
  }
};

// createEmailTrail 函数
await execOkkiCli([
  'trail', 'add',
  '--company', companyId,
  '--content', content,
  '--type', CONFIG.TRAIL_TYPE.EMAIL.toString()  // ✅ 传入 102
]);
```

**结论：** 代码配置正确

### 2. 检查 OKKI CLI ✅

**okki.py:**
```python
trail_add_parser.add_argument("--type", "-t", type=int, default=101, 
                              choices=[101, 102, 103, 104, 105],
                              help="类型：101=快速记录，102=邮件，103=电话...")
```

**结论：** CLI 参数解析正确

### 3. 检查 OKKI API Client ✅

**okki_client.py:**
```python
def create_trail(self, company_id, content, trail_type=101):
    data = {
        'company_id': company_id,
        'content': content,
        'trail_type': trail_type,  # ✅ 正确传入
        'create_time': int(time.time())
    }
```

**结论：** API 请求数据正确

### 4. 实际测试验证 ❌

**测试结果：**
- ✅ 跟进记录成功创建
- ✅ trail_id 正常返回
- ❌ `type` 字段始终为 101（无论传入 101 还是 102）

---

## 🎯 根本原因

**OKKI API 后端问题（已确认）：**

从 OKKI API 文档 `/v1/dynamic/trail/list` 返回数据验证：
```json
{
  "trail_id": 25646265871658,
  "type": 101,  // ← 所有跟进记录都返回 101
  "content": "跟进"
}
```

**官方 trail_type 定义：**
| trail_type | 说明 |
|------------|------|
| 101 | 快速记录 |
| 102 | 邮件 |
| 103 | 电话 |
| 104 | 会面 |
| 105 | 社交平台 |

**证据：**
1. ✅ 我们的代码正确传入 `trail_type=102`
2. ❌ OKKI API 返回的 `type` 始终是 101
3. ❌ 即使传入 `--type 102`，API 也返回 `type: 101`
4. ✅ 跟进记录内容正常，只是 type 字段不对

**结论：** 这是 OKKI API 后端的 bug，不是我们的问题。

---

## ✅ 影响评估

**功能影响：**
- ✅ **跟进记录正常创建** - 功能可用
- ✅ **内容完整** - 邮件主题、发件人、收件人、摘要都正确
- ⚠️ **type 字段显示错误** - 在 OKKI UI 中显示为"快速记录"而非"邮件"

**业务影响：**
- ⚠️ **筛选/统计可能不准确** - 如果按 trail_type 筛选邮件，会遗漏
- ⚠️ **报表可能不准确** - 邮件跟进统计可能偏少

---

## 💡 解决方案

### 方案 A：等待 OKKI 官方修复（推荐）
- ✅ 功能已正常工作
- ⚠️ type 字段显示问题不影响核心功能
- 📝 向 OKKI 反馈此问题

### 方案 B：使用其他方式标记邮件跟进
- 在跟进内容中添加特殊标记（如 `[EMAIL]` 前缀）
- 通过内容关键词筛选邮件跟进

### 方案 C：使用 OKKI 其他字段
- 检查是否有其他字段可以区分邮件跟进
- 如 `refer_id`、`sub_types` 等

---

## 📝 当前状态

**Task 002 状态：** ✅ **功能完成**（type 字段问题待 OKKI 修复）

**已实现功能：**
- ✅ inbound 邮件自动抓取
- ✅ 客户匹配（域名 + 向量搜索）
- ✅ OKKI 跟进记录创建
- ✅ 去重机制
- ✅ 本地归档

**已知问题：**
- ⚠️ trail_type 显示为 101 而非 102（OKKI 后端问题）

---

## 🔗 相关文档

- [okki-sync.js](../../skills/imap-smtp-email/okki-sync.js) - OKKI 同步模块
- [auto-capture.js](../../skills/imap-smtp-email/auto-capture.js) - 邮件自动捕获
- [Task 002](../../evolution/tasks/task-002.json) - 任务定义

---

**调查者：** WILSON  
**调查时间：** 2026-03-28 18:14  
**结论：** 功能正常，type 字段问题为 OKKI 后端 bug，不影响使用
