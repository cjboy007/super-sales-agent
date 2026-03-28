# 客户细分测试方案 (customer-segmentation)

---

## 测试目标

验证客户分类管理的准确性、评分引擎正确性和策略输出有效性。

---

## 模块概述

**核心文件：**
- `skills/customer-segmentation/scripts/customer-data-collector.js` - 数据收集
- `skills/customer-segmentation/scripts/scoring-engine.js` - 评分引擎
- `skills/customer-segmentation/scripts/strategy-output.js` - 策略输出
- `skills/customer-segmentation/scripts/tag-sync.js` - 标签同步

**依赖：**
- OKKI CRM API
- 订单历史数据

---

## 1. 单元测试

### 1.1 数据收集测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-DATA-001 | OKKI 客户数据 | 成功获取 | 数据完整 |
| TC-DATA-002 | 订单历史 | 成功获取 | 订单列表 |
| TC-DATA-003 | 跟进记录 | 成功获取 | 记录完整 |
| TC-DATA-004 | 邮件往来 | 成功获取 | 数量统计 |
| TC-DATA-005 | 数据缺失 | 降级处理 | 部分评分 |

### 1.2 客户评分测试

| 测试用例 | 输入指标 | 预期评分 | 通过标准 |
|---------|---------|---------|---------|
| TC-SCORE-001 | 年采购$500K+ | A 类 (90-100) | 评分准确 |
| TC-SCORE-002 | 年采购$100K-500K | B 类 (70-89) | 评分准确 |
| TC-SCORE-003 | 年采购$10K-100K | C 类 (50-69) | 评分准确 |
| TC-SCORE-004 | 年采购<$10K | D 类 (0-49) | 评分准确 |
| TC-SCORE-005 | 多维度综合 | 加权评分 | 权重正确 |

### 1.3 评分维度测试

| 测试用例 | 维度 | 权重 | 通过标准 |
|---------|------|------|---------|
| TC-DIM-001 | 采购金额 | 40% | 权重正确 |
| TC-DIM-002 | 采购频率 | 20% | 权重正确 |
| TC-DIM-003 | 付款信用 | 20% | 权重正确 |
| TC-DIM-004 | 合作时长 | 10% | 权重正确 |
| TC-DIM-005 | 互动活跃度 | 10% | 权重正确 |

### 1.4 标签同步测试

| 测试用例 | 输入 | 预期结果 | 通过标准 |
|---------|------|---------|---------|
| TC-TAG-001 | 评分更新 | OKKI 标签更新 | 标签同步 |
| TC-TAG-002 | 等级变更 | 通知销售 | 通知发送 |
| TC-TAG-003 | 标签冲突 | 优先级处理 | 规则正确 |
| TC-TAG-004 | 批量同步 | 全部成功 | 无遗漏 |
| TC-TAG-005 | 同步失败 | 重试机制 | 最终一致 |

---

## 2. 集成测试

### 2.1 完整客户细分流程

**测试场景：** 客户数据收集 → 评分 → 分类 → 策略

**测试数据：**
```json
{
  "customer": {
    "customer_id": "okki_12345",
    "company_name": "Acme Corporation"
  },
  "metrics": {
    "annual_revenue": 500000,
    "order_count": 50,
    "avg_order_value": 10000,
    "payment_days_avg": 15,
    "cooperation_months": 24,
    "email_response_rate": 0.85
  }
}
```

**预期流程：**
1. 收集客户数据
2. 计算各维度得分
3. 加权计算总分
4. 确定客户等级
5. 更新 OKKI 标签
6. 生成跟进策略

**通过标准：** 分类准确，策略有效

### 2.2 与定价引擎集成

**测试场景：** 客户等级影响定价

**预期流程：**
1. 客户细分完成
2. 等级同步到 pricing-engine
3. 定价时应用对应折扣
4. 价格准确

**通过标准：** 等级传递正确

### 2.3 与跟进引擎集成

**测试场景：** 不同等级不同跟进策略

**预期流程：**
1. A 类客户 → 每周跟进
2. B 类客户 → 每 2 周跟进
3. C 类客户 → 每月跟进
4. D 类客户 → 每季度跟进

**通过标准：** 策略正确应用

---

## 3. 端到端测试

### 3.1 E2E-001: 新客户评级

**步骤：**
1. 新客户创建
2. 初始评级（D 类）
3. 首单完成后重新评级
4. 更新标签
5. 调整跟进策略

**预期结果：** 评级动态调整

### 3.2 E2E-002: 客户升级流程

**步骤：**
1. C 类客户持续下单
2. 年采购达到 B 类标准
3. 自动升级到 B 类
4. 通知销售
5. 调整折扣和跟进频率

**预期结果：** 升级及时准确

### 3.3 E2E-003: 客户降级预警

**步骤：**
1. B 类客户订单减少
2. 检测到降级风险
3. 发送预警给销售
4. 销售主动跟进
5. 挽回客户

**预期结果：** 预警及时

---

## 4. 边界条件测试

| 测试用例 | 场景 | 预期处理 |
|---------|------|---------|
| TC-BOUND-001 | 数据不完整 | 部分评分 |
| TC-BOUND-002 | 新客户无历史 | 默认 D 类 |
| TC-BOUND-003 | 评分边界值 | 正确分类 |
| TC-BOUND-004 | 多维度冲突 | 加权处理 |
| TC-BOUND-005 | OKKI API 异常 | 本地缓存 |

---

## 5. 性能测试

| 指标 | 目标值 |
|-----|-------|
| 单客户评分 | < 2s |
| 批量评分 (1000 客户) | < 5min |
| 标签同步延迟 | < 1min |
| OKKI API 调用 | 遵守限流 |

---

## 测试数据样例

```json
{
  "customer_segmentation": {
    "customer_id": "okki_12345",
    "company_name": "Acme Corporation",
    "metrics": {
      "annual_revenue": 500000,
      "order_count": 50,
      "avg_order_value": 10000,
      "payment_days_avg": 15,
      "on_time_payment_rate": 0.95,
      "cooperation_months": 24,
      "email_response_rate": 0.85,
      "last_order_date": "2026-03-20"
    },
    "scores": {
      "revenue_score": 95,
      "frequency_score": 85,
      "credit_score": 90,
      "loyalty_score": 80,
      "engagement_score": 85,
      "total_score": 88
    },
    "segment": "A",
    "tags": ["VIP", "High-Value", "Reliable"],
    "strategy": {
      "follow_up_frequency": "weekly",
      "discount_tier": "max",
      "priority": "high",
      "account_manager": "senior"
    }
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
