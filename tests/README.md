# Super Sales Agent 测试方案总览

---

## 文档索引

| 模块编号 | 模块名称 | 测试文档 | 核心功能 |
|---------|---------|---------|---------|
| 01 | 邮件处理 | [01-imap-smtp-email-test-plan.md](./01-imap-smtp-email-test-plan.md) | IMAP/SMTP 自动收发、附件下载 |
| 02 | 报价单工作流 | [02-quotation-workflow-test-plan.md](./02-quotation-workflow-test-plan.md) | Excel/Word/HTML/PDF生成 |
| 03 | 形式发票 | [03-pi-workflow-test-plan.md](./03-pi-workflow-test-plan.md) | PI 文档生成 |
| 04 | 样品单 | [04-sample-workflow-test-plan.md](./04-sample-workflow-test-plan.md) | 寄样申请单生成 |
| 05 | 收款通知 | [05-payment-notice-workflow-test-plan.md](./05-payment-notice-workflow-test-plan.md) | 付款提醒文档生成 |
| 06 | 客户跟进引擎 | [06-follow-up-engine-test-plan.md](./06-follow-up-engine-test-plan.md) | 自动化跟进提醒 |
| 07 | 订单追踪 | [07-order-tracker-test-plan.md](./07-order-tracker-test-plan.md) | 订单状态监控 |
| 08 | 售后管理 | [08-after-sales-test-plan.md](./08-after-sales-test-plan.md) | 售后服务流程 |
| 09 | 物流追踪 | [09-logistics-tracker-test-plan.md](./09-logistics-tracker-test-plan.md) | 物流状态查询 |
| 10 | 定价引擎 | [10-pricing-engine-test-plan.md](./10-pricing-engine-test-plan.md) | 智能定价策略 |
| 11 | 客户细分 | [11-customer-segmentation-test-plan.md](./11-customer-segmentation-test-plan.md) | 客户分类管理 |
| 12 | 智能回复 | [12-email-smart-reply-test-plan.md](./12-email-smart-reply-test-plan.md) | 邮件意图识别 + 自动回复 |
| 13 | OKKI 同步 | [13-okki-email-sync-test-plan.md](./13-okki-email-sync-test-plan.md) | 客户数据/跟进记录双向同步 |
| 14 | Revolution 自动进化 | [14-auto-evolution-test-plan.md](./14-auto-evolution-test-plan.md) | 系统自我迭代升级 |

---

## 测试类型说明

### 1. 单元测试 (Unit Tests)
- **目标：** 验证函数/方法级别的正确性
- **位置：** `skills/{module}/tests/unit/`
- **工具：** Jest (JS), pytest (Python)
- **覆盖率要求：** > 80%

### 2. 集成测试 (Integration Tests)
- **目标：** 验证模块间交互正确性
- **位置：** `skills/{module}/tests/integration/`
- **工具：** 自定义测试脚本
- **重点：** 数据流、API 调用、状态同步

### 3. 端到端测试 (E2E Tests)
- **目标：** 验证完整业务流程
- **位置：** `tests/e2e/`
- **工具：** 自定义 E2E 框架
- **重点：** 用户场景、全流程自动化

### 4. 边界条件测试 (Boundary Tests)
- **目标：** 验证异常输入和极端值处理
- **位置：** 各模块测试文件中
- **重点：** 错误处理、降级策略、安全边界

### 5. 性能测试 (Performance Tests)
- **目标：** 验证响应时间和并发能力
- **位置：** `tests/performance/`
- **工具：** k6, Apache Bench
- **指标：** 延迟、吞吐量、资源消耗

---

## 测试环境要求

### 基础环境
```bash
# Node.js
node >= 18.0.0
npm >= 9.0.0

# Python
python3 >= 3.8
pip >= 22.0

# 其他工具
git >= 2.30
google-chrome (PDF 导出)
```

### 依赖服务
```yaml
OKKI CRM:
  - API Key 配置
  - 沙箱环境

Email:
  - IMAP 测试账号
  - SMTP 测试账号

LLM:
  - 多模型 API Key (Sonnet/GPT-4o/Qwen/Haiku)

Database:
  - LanceDB (向量检索)
```

### 测试数据
```
tests/fixtures/
├── customers/          # 客户数据
├── products/           # 产品数据
├── orders/             # 订单数据
├── emails/             # 邮件样本
└── templates/          # 文档模板
```

---

## 测试执行流程

### 1. 本地开发测试
```bash
# 单元测试
npm test -- skills/{module}/tests/unit/
pytest skills/{module}/tests/unit/

# 集成测试
npm run test:integration -- skills/{module}/tests/integration/

# 代码检查
npm run lint
npm run typecheck
```

### 2. CI/CD 测试
```yaml
# GitHub Actions 示例
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run unit tests
        run: npm test
      - name: Run integration tests
        run: npm run test:integration
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### 3. 预发布测试
```bash
# 完整 E2E 测试
npm run test:e2e

# 性能测试
npm run test:perf

# 安全扫描
npm run security-scan
```

---

## 测试通过标准

### 整体标准
| 测试类型 | 通过率要求 | 阻塞发布 |
|---------|-----------|---------|
| 单元测试 | 100% | 是 |
| 集成测试 | 100% | 是 |
| E2E 测试 | > 95% | 是 |
| 边界测试 | > 95% | 否 |
| 性能测试 | 满足目标 | 否 |

### 代码质量
| 指标 | 要求 |
|-----|------|
| 代码覆盖率 | > 80% |
| 重复代码 | < 5% |
| 技术债务 | A 级 |
| 安全漏洞 | 0 高危 |

---

## 测试数据管理

### 数据隔离
- **测试环境：** 独立数据库
- **测试账号：** 专用测试邮箱/OKKI 账号
- **测试客户：** 标记为测试数据

### 数据清理
```bash
# 每次测试后清理
npm run test:cleanup

# 定期清理 (Cron)
0 2 * * * cd /path && npm run test:cleanup
```

### 数据生成
```bash
# 生成测试数据
npm run test:fixtures:generate

# 重置测试数据
npm run test:fixtures:reset
```

---

## 缺陷管理流程

```
发现缺陷
    │
    ▼
记录到 Issue Tracker
    │
    ▼
分配优先级 (P0-P3)
    │
    ▼
开发修复
    │
    ▼
回归测试
    │
    ▼
验证关闭
```

### 优先级定义
| 优先级 | 响应时间 | 修复时间 | 示例 |
|-------|---------|---------|------|
| P0 | 1 小时 | 24 小时 | 系统崩溃、数据丢失 |
| P1 | 4 小时 | 3 天 | 核心功能失效 |
| P2 | 1 天 | 1 周 | 非核心功能问题 |
| P3 | 1 周 | 2 周 | 优化建议、UI 问题 |

---

## 测试报告

### 日报
- 测试执行数量
- 通过率统计
- 新增缺陷
- 阻塞问题

### 周报
- 整体质量趋势
- 覆盖率变化
- 缺陷分析
- 改进建议

### 发布报告
- 测试总结
- 已知问题
- 风险评估
- 发布建议

---

## 持续改进

### 测试优化
1. 定期回顾测试用例
2. 补充遗漏场景
3. 优化测试数据
4. 提升自动化率

### 工具改进
1. 引入新测试工具
2. 优化测试框架
3. 提升执行速度
4. 改善报告展示

### 流程优化
1. 简化测试流程
2. 减少手动操作
3. 提升反馈速度
4. 加强质量门禁

---

## 附录

### A. 测试用例模板
```markdown
## 测试用例 ID: TC-XXX-001

**测试目标：** [描述]

**前置条件：**
- [条件 1]
- [条件 2]

**测试步骤：**
1. [步骤 1]
2. [步骤 2]

**预期结果：**
- [结果 1]
- [结果 2]

**通过标准：**
- [标准 1]
- [标准 2]
```

### B. 缺陷报告模板
```markdown
## 缺陷 ID: BUG-XXX

**标题：** [简短描述]

**严重程度：** [Critical/Major/Minor]

**优先级：** [P0-P3]

**复现步骤：**
1. [步骤 1]
2. [步骤 2]

**预期行为：** [描述]

**实际行为：** [描述]

**环境信息：**
- OS: [ ]
- Node: [ ]
- Python: [ ]

**附件：** [截图/日志]
```

---

**文档版本：** 1.0.0  
**创建日期：** 2026-03-27  
**维护者：** Super Sales Agent QA Team  
**最后更新：** 2026-03-27
