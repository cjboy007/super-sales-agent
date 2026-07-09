# SSA v1 Completion Report

日期: 2026-06-18

范围: 接续 `docs/SSA_V1_ROADMAP.md`，在 Phase 0/1 已完成的基础上执行 Phase 2-6。本文记录本轮完成项、验证结果与剩余风险。

## 完成情况

### Phase 2 - canonical sales world model

已新增最小可用销售事实层:

- `web-frontend/src/lib/runtime/sales-world-model.ts`
- `SalesRuntime.getSalesWorldModel(workspaceId)`

覆盖事实类型:

- workspace
- customer/account
- contact
- email interaction
- lead
- quotation
- RFQ
- PI/order
- payment milestone
- shipment milestone
- after-sales/exception
- customer intelligence
- memory record

每条 canonical fact 均包含:

- `source`
- `confidence`
- `updatedAt`
- `idempotencyKey`
- `provenance`
- `customerId` / `customerName`，能从客户目录补全直接来源事实的客户归属

实现策略: 只读收束现有 customer directory、customer activity、sales memory、quotation、PI records、company intelligence，不迁移或重写原始业务资料。

### Phase 3 - sales tool registry

已新增 reusable sales tool registry:

- `web-frontend/src/lib/runtime/sales-tool-registry.ts`
- `SalesRuntime.listSalesTools()`
- `SalesRuntime.getSalesTool(id)`

首批工具已声明:

- `ingest.inbound_email`
- `crm.update_customer`
- `memory.search_customer`
- `email.draft_reply`
- `email.request_send`
- `document.generate_quotation_pi`
- `document.request_generation`
- `company_intel.queue`
- `follow_up.create_plan`
- `order.record_milestone`

每个 tool 包含:

- id / name / description
- input schema / output schema
- required permissions
- side-effect kind
- approval requirement
- idempotency strategy
- failure/retry behavior

真实 side-effect tool 均要求 operator approval，并绑定到现有 side-effect kind。

### Phase 4 - 三条销售闭环 dry-run/mock drill

已新增:

- `web-frontend/src/lib/runtime/sales-loop-drills.ts`
- `SalesRuntime.runSalesLoopDrill(input)`

已覆盖三条闭环:

- A: 新邮件 -> 客户时间线 -> 回复草稿 -> 邮件发送审批请求
- B: RFQ -> PI 文档生成请求 -> 文档审批 gate -> document/customer facts
- C: PI/order 信号 -> payment/shipment/exception milestone -> 下一步建议 -> payment side-effect gate

这些 drill 默认不执行真实外部动作，只产生本地 trace、side-effect decision 和 canonical facts。

### Phase 5 - LLM task policy / mock boundary

已新增:

- `web-frontend/src/lib/runtime/llm-policy.ts`
- `SalesRuntime.listLlmTaskPolicies()`
- `SalesRuntime.getLlmTaskPolicy(task)`

已覆盖任务:

- classify
- extract
- draft
- summarize
- translate
- recommend

每类任务声明:

- real/mock/fallback 策略
- low-confidence 人工复核规则
- timeout
- retry
- budget
- 外部动作禁止策略

`runLlmTask()` 现在会在结果中附带 `structured.policy`，明确:

- 是否 mock fallback
- 是否需要人工复核
- 是否允许自动化
- 模型不得声称或执行外部动作

同时修正 DeepSeek 自动识别: 只配置 DeepSeek API key 且未显式指定 DeepSeek 模型时，使用当前 hosted 默认 `deepseek-v4-flash`，不会因其他 provider 的默认模型而落回 mock 或串用错误模型。

### Phase 6 - 验证与边界

新增/更新测试:

- `web-frontend/src/lib/runtime/sales-world-model.test.ts`
- `web-frontend/src/lib/runtime/sales-tool-registry.test.ts`
- `web-frontend/src/lib/runtime/sales-loop-drills.test.ts`
- `web-frontend/src/lib/runtime/llm-policy.test.ts`
- `web-frontend/src/app/api/api-route-auth-coverage.test.ts`

API auth coverage 中明确将以下试用入口列为公开 bootstrap route:

- `src/app/api/trial-access/send-code/route.ts`
- `src/app/api/trial-access/verify-code/route.ts`

这两个入口不能先要求既有 session；真实边界由短信验证码、配额、注册开关和 trial session 签发控制。

## 验证结果

已通过:

- `scripts/check-repo-boundary.sh`
- `cd web-frontend && npm test`
  - 106 test files passed
  - 462 tests passed
  - worker/runtime node tests included: 22 passed
- `cd web-frontend && npm run lint`
  - 0 ESLint warnings/errors
- `cd web-frontend && npm run build`
  - Next production build succeeded

说明:

- `npm run build` 会生成 `web-frontend/.next/`。
- build 验证完成后，构建产物已迁移到:
  - `/Users/wilson/.ssa/tmp/repo-boundary/20260618-phase6/web-frontend-.next-build-verification`
- 迁移后 `scripts/check-repo-boundary.sh` 重新通过。

## 验收标准对照

| # | 标准 | 当前状态 |
|---|------|----------|
| 1 | Repo boundary clean | 通过 |
| 2 | 无新增 secrets/runtime/generated artifacts 进 repo | 通过；build 产物已迁移到 `~/.ssa/tmp` |
| 3 | 非公开 API route 有 beta/workspace/admin auth guard | 通过；trial bootstrap routes 已明确列为公开入口 |
| 4 | 真实外部动作默认 blocked | 通过 |
| 5 | 每个真实动作都有 side-effect decision、approval、execution/failure record | registry 已声明；现有 email/document/CRM/payment gate 测试覆盖 |
| 6 | 三条核心销售闭环可演示、可测试、可追踪 | 通过 dry-run/mock drill |
| 7 | Worker 可恢复，失败任务可见并可重试 | 本地 worker/runtime 测试通过 |
| 8 | Customer detail / facts 覆盖客户、联系人、邮件、报价、PI/order、付款、出货、异常、下一步 | canonical facts 层已覆盖 |
| 9 | LLM 状态区分 real provider 与 mock fallback | 通过；LLM policy 写入结果元数据 |
| 10 | 文档更新 | 本报告已记录 v1 runtime 完成情况 |

## 剩余风险

- 本轮完成的是本地可验证 v1 闭环；外部 beta 仍需要真实 mailbox、worker supervisor、LLM provider、真实邮件/文档/CRM 凭据按环境配置后再做一次 operator 演练。
- `sales-tool-registry` 当前是契约层，尚未替换所有 UI/API 调用路径为 registry-driven dispatch。
- canonical sales world model 已补最小 workspace-scoped fact ledger、source replay 和 order/payment lifecycle draft，支持版本化和冲突标记；银行/财务确认、TTL、权威产品/价格源、强一致订单/付款/会计主账本仍是后续增强。
- 付款/银行相关能力仍保持保守边界: 已有 side-effect kind 与 policy gate，但不是完整银行或收款适配器。
