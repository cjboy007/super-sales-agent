# 智能回复测试方案 (email-smart-reply)

---

## 测试目标

验证邮件意图识别准确性、回复生成质量和知识库检索有效性。

---

## 模块概述

**核心文件：**
- `skills/imap-smtp-email/intent-recognition.js` - 意图识别
- `skills/imap-smtp-email/reply-generator.js` - 回复生成
- `skills/imap-smtp-email/kb-retrieval.js` - 知识库检索

**依赖：**
- LLM API
- 向量数据库 (LanceDB)
- Obsidian 知识库

---

## 1. 单元测试

### 1.1 意图识别测试

| 测试用例 | 输入邮件 | 预期意图 | 置信度 |
|---------|---------|---------|--------|
| TC-INTENT-001 | "请问这个产品多少钱？" | price_inquiry | > 0.85 |
| TC-INTENT-002 | "我想订购 1000 个" | order_request | > 0.85 |
| TC-INTENT-003 | "样品怎么申请？" | sample_request | > 0.85 |
| TC-INTENT-004 | "付款已安排" | payment_notice | > 0.85 |
| TC-INTENT-005 | "投诉质量问题" | complaint | > 0.85 |
| TC-INTENT-006 | "介绍一下公司" | general_inquiry | > 0.85 |
| TC-INTENT-007 | "合作条件是什么" | partnership | > 0.85 |
| TC-INTENT-008 | "有折扣吗" | discount_request | > 0.85 |

### 1.2 置信度阈值测试

| 测试用例 | 置信度 | 预期处理 | 通过标准 |
|---------|--------|---------|---------|
| TC-CONF-001 | > 0.9 | 自动回复 | 直接发送 |
| TC-CONF-002 | 0.7-0.9 | 审核后发送 | Discord 审核 |
| TC-CONF-003 | < 0.7 | 人工处理 | 通知销售 |
| TC-CONF-004 | 多意图 | 分别处理 | 优先级排序 |
| TC-CONF-005 | 无法识别 | 默认人工 | 安全处理 |

### 1.3 知识库检索测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-KB-001 | 产品询价 | 检索产品文档 | 相关文档 |
| TC-KB-002 | 技术支持 | 检索 FAQ | 答案准确 |
| TC-KB-003 | 公司信息 | 检索关于文档 | 信息完整 |
| TC-KB-004 | 无相关文档 | 返回空 | 不捏造 |
| TC-KB-005 | 多文档匹配 | 排序返回 | 相关性排序 |

### 1.4 回复生成测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-REPLY-001 | 简单询价 | 生成报价回复 | 内容完整 |
| TC-REPLY-002 | 技术问题 | 生成技术回复 | 答案准确 |
| TC-REPLY-003 | 投诉邮件 | 生成道歉回复 | 语气恰当 |
| TC-REPLY-004 | 多语言邮件 | 同语言回复 | 语言一致 |
| TC-REPLY-005 | 含附件请求 | 提示附件 | 附件正确 |

---

## 2. 集成测试

### 2.1 完整智能回复流程

**测试场景：** 收到邮件 → 识别 → 检索 → 生成 → 发送

**测试数据：**
```json
{
  "incoming_email": {
    "from": "customer@example.com",
    "subject": "Product Inquiry",
    "body": "Hi, I'm interested in your wireless headphones. Can you send me a quotation for 500 units?"
  }
}
```

**预期流程：**
1. IMAP 捕获邮件
2. 意图识别 = price_inquiry (0.92)
3. 知识库检索产品文档
4. 生成回复草稿
5. 高置信度 → 自动发送
6. 写入 OKKI 跟进记录

**通过标准：** 回复准确及时

### 2.2 低置信度审核流程

**测试场景：** 置信度不足时人工审核

**预期流程：**
1. 意图识别置信度 = 0.65
2. 发送 Discord 审核请求
3. 销售审核并修改
4. 确认后发送
5. 记录学习数据

**通过标准：** 审核流程完整

### 2.3 多轮对话上下文

**测试场景：** 保持对话上下文

**预期流程：**
1. 第一封邮件询价
2. 回复报价
3. 客户回复还价
4. 识别为同一对话
5. 保持上下文生成回复

**通过标准：** 上下文连贯

---

## 3. 端到端测试

### 3.1 E2E-001: 自动回复询价

**步骤：**
1. 客户发送询价邮件
2. 系统自动识别
3. 检索产品信息
4. 生成报价回复
5. 自动发送
6. 记录跟进

**预期结果：** 全自动处理

### 3.2 E2E-002: 技术问题回复

**步骤：**
1. 客户发送技术问题
2. 检索知识库 FAQ
3. 生成技术回复
4. 发送客户

**预期结果：** 答案准确

### 3.3 E2E-003: 投诉邮件处理

**步骤：**
1. 客户投诉
2. 识别为高优先级
3. 生成道歉回复
4. 通知销售介入
5. 跟进解决

**预期结果：** 投诉妥善处理

---

## 4. 边界条件测试

| 测试用例 | 场景 | 预期处理 |
|---------|------|---------|
| TC-BOUND-001 | 空邮件 | 跳过或标记 |
| TC-BOUND-002 | 纯图片邮件 | 无法处理，通知人工 |
| TC-BOUND-003 | 垃圾邮件 | 识别并过滤 |
| TC-BOUND-004 | 多语言混合 | 主要语言处理 |
| TC-BOUND-005 | 敏感内容 | 人工审核 |

---

## 5. 性能测试

| 指标 | 目标值 |
|-----|-------|
| 意图识别延迟 | < 2s |
| 知识库检索延迟 | < 3s |
| 回复生成延迟 | < 10s |
| 端到端处理 | < 15s |
| 并发处理 | 20 邮件/分钟 |

---

## 测试数据样例

```json
{
  "email": {
    "from": "john@acme.com",
    "to": "sales@farreach.com",
    "subject": "Product Inquiry",
    "body": "Dear Sales Team,\n\nWe are interested in your wireless Bluetooth headphones. Could you please provide:\n1. Unit price for 500 units\n2. Delivery time\n3. Payment terms\n\nBest regards,\nJohn Doe"
  },
  "expected_intent": {
    "primary": "price_inquiry",
    "confidence": 0.92,
    "secondary": ["delivery_inquiry", "payment_terms"]
  },
  "expected_reply": {
    "greeting": "Dear John,",
    "content": "Thank you for your inquiry...",
    "quotation_attached": true,
    "signature": "Best regards,\nSales Team"
  }
}
```

---

## 通过标准汇总

| 测试类型 | 通过率要求 |
|---------|-----------|
| 单元测试 | 100% |
| 集成测试 | 100% |
| 端到端测试 | 100% |
| 边界测试 | > 95% |
| 性能测试 | 满足目标 |

---

**文档版本：** 1.0.0  
**创建日期：** 2026-03-27  
**维护者：** Super Sales Agent QA Team
