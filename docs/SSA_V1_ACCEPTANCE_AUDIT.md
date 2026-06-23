# SSA v1 Acceptance Audit

审计日期: 2026-06-23

审计范围: 对照 `docs/SSA_V1_ROADMAP.md`、`docs/SSA_CAPABILITY_AUDIT.md`、当前 Phase 2-12 代码和测试，评估 SSA v1 验收状态与真实外联试点放行条件。本文只做审计与边界整理，不进入新的 Phase，不修改业务代码。

## 结论

SSA 当前已经具备“本地可验证 v1 / controlled dry-run + HITL growth system”的主体能力: 事实层、工具注册表、三条销售闭环 dry-run、LLM 策略、/growth HITL 操作台、Phase 8-12 自主增长链路、side-effect approval gate 和 worker recovery/operations 面都已落地。

但它还不能被描述为“完全自主真实销售员”。真实邮件、外部 CRM、正式报价/PI/文档生成、价格调整、付款/银行相关动作仍应保持默认阻断，只能通过 side-effect gate、人工审批、明确运行时 flag、执行记录和失败/重试记录逐步放行。

对 `farreach` / `hero-pumps` 这两个真实工作区的建议状态: 可作为种子用户做 dry-run、草稿、审批演练和人工确认后的受控试点准备；不应开启无人值守真实外联 autopilot。

## 对照证据

- 路线图与历史审计: `docs/SSA_V1_ROADMAP.md`, `docs/SSA_CAPABILITY_AUDIT.md`, `docs/SSA_V1_COMPLETION_REPORT.md`
- Phase 2-6: `sales-world-model.ts`, `sales-tool-registry.ts`, `sales-loop-drills.ts`, `llm-policy.ts`
- Phase 7-12: `hitl-policy.ts`, `prospecting-loop.ts`, `product-quotation-drafts.ts`, `outbound-approval-pipeline.ts`, `decision-learning.ts`, `growth-scheduler.ts`
- 安全边界: `side-effect-gate.ts`, `real-action-readiness.ts`, `api-route-auth-coverage.test.ts`, `scripts/check-repo-boundary.sh`
- 运营恢复: `task-queue.ts`, `jaden-worker.ts`, `worker-health.ts`, `worker-supervisor.ts`, `/agent-status`, `/api/runtime`
- 增长接口和页面: `/api/growth/**`, `/growth`

## v1 验收矩阵

| # | 验收标准 | 当前判断 | 代码/测试证据 | 剩余风险 |
|---|---|---|---|---|
| 1 | Repo boundary clean | 通过 | `scripts/check-repo-boundary.sh` 重新通过。审计中发现空 `data/intelligence/`，已迁移到 `~/.ssa/tmp/repo-boundary/20260623-acceptance-audit/data-intelligence-empty`。 | 后续 build/test 若生成 `.next`、日志、运行数据，仍需迁移到 `~/.ssa/tmp` 或 `~/.ssa/data`。 |
| 2 | 无新增 secrets/runtime/generated artifacts 进 repo | 通过但需持续守门 | boundary 脚本覆盖 `.next`、日志、运行数据、intelligence、tsbuildinfo 等。增长 API 响应测试覆盖不泄露 `/Users/`、`.ssa`、`SSA_`、secret、payload。 | 工作树仍有大量未提交/未跟踪 Phase 代码；提交前需要人工 review diff。历史敏感文件若已在 git 历史中，只能报告和按流程处理，不能擅自改 history。 |
| 3 | 所有非公开 API route 有 beta/workspace/admin auth guard | 通过静态门禁 | `api-route-auth-coverage.test.ts` 要求非公开 route 包含 `requireWorkspaceAccess`、`requireResolvedWorkspaceAccess`、`requireBetaAuth` 或 `requireAdminBetaAuth`。新增 `/api/growth/**` 使用 `requireResolvedWorkspaceAccess`。 | 该测试是源码静态检查，不等价于形式化权限证明；高风险 route 仍要保留语义级测试。 |
| 4 | 真实外部动作默认 blocked | 通过 | `side-effect-gate.ts` 中 email、CRM、data read、IMAP、Feishu、payment、bank、document、price discount 均需显式 `SSA_ENABLE_REAL_*` flag；Phase 8-12 标记 dry-run/draft-only/not executed。 | flag 被人为打开后仍需 adapter 二次检查 approval，不允许把 `allowed` 误当作“已执行”。 |
| 5 | 每个真实动作都有 side-effect decision、approval、execution/failure record | 通过受控入口 | `sales-tool-registry.ts` 为高风险 side-effect kind 声明 tool contract；`side-effect-gate.ts` 会拒绝未带 registry tool context 的直接请求和 legacy execution record；`SalesRuntime.requestSideEffect()` 作为受控入口自动补齐 registry audit metadata；`sales-tool-registry-enforcement.test.ts` 覆盖直接绕行失败、runtime 路由、legacy execution 阻断和 kind 覆盖。 | registry 已成为 side-effect gate 的强制入口；新增真实 adapter 仍必须通过 code review 确认没有绕过 `SalesRuntime` 或显式 tool context。 |
| 6 | 三条核心销售闭环可演示、可测试、可追踪 | 通过 dry-run/mock drill | `sales-loop-drills.ts` 覆盖 A 邮件到回复审批、B RFQ 到 PI 文档审批请求、C PI/order 到付款/出货/异常建议；Completion Report 记录测试通过。 | 真实外部闭环尚未在真实 mailbox/CRM/document provider 下演练，不能当作无人值守生产闭环。 |
| 7 | Worker 可恢复，失败任务可在 agent-status/operations 中看到并重试 | 通过本地能力 | `task-queue.ts` 支持 lease、failed、requeue；`jaden-worker.ts` 记录 heartbeat、retry/exhausted；`worker-health.ts` 汇总 failed/retryable；`/agent-status` 和 `/api/runtime` 暴露失败任务与 retry。 | 生产级稳定性依赖实际 supervisor 安装、worker 常驻和 mailbox 配置；代码存在不代表宿主机已部署。 |
| 8 | Customer detail 显示客户/联系人/背景/邮件/报价/PI-order/付款-出货-异常/下一步建议 | 通过最小事实账本 + 聚合层 | `sales-fact-ledger.ts` 提供 workspace-scoped canonical fact ledger；`sales-fact-ledger-ingestion.ts` 将本地 customer activity、PI records、price memory、memory records、quotation drafts 接入 ledger，并提供 replay/backfill 与 order/payment lifecycle draft；`sales-world-model.ts` 合并 ledger facts 与现有聚合源。 | 账本已能承接本地事实沉淀、版本和冲突审计，但仍不是强一致订单/付款/会计主账本；银行/财务确认、TTL、权威产品/价格源、正式 order/payment authority 仍是后续增强。 |
| 9 | LLM 状态清楚区分 real provider 与 mock fallback | 通过 | `llm.ts` 暴露 provider readiness；`llm-policy.ts` 标记 task policy、mockFallback、requiresHumanReview、automationAllowed；Health/UI 显示 mock fallback 不代表真实模型可用。 | 多模型预算、评估和 prompt/version 回归仍可增强；真实客户动作不能只靠模型输出自动执行。 |
| 10 | 文档更新到 README / PUBLIC_BETA_READINESS / SSA_RUNTIME_BOUNDARY 或对应 runtime docs | 部分通过 | Roadmap、Capability Audit、Completion Report 与本文记录了 v1 能力边界；Public Beta docs 已覆盖 readiness/agent-status/worker。 | README 可能仍有高于当前真实闭环的历史表述；真实试点前建议再做一次面向用户的“能做/不能做”文案收口。 |

## Growth Track 状态

| Phase | 当前状态 | 判断 |
|---|---|---|
| Phase 7 HITL console | `/growth` 展示 automation mode、HITL policy、review queue、autopilot disabled/not ready。 | 可用于人工监督。 |
| Phase 8 prospecting dry-run | `prospecting-loop.ts` 和 `/api/growth/prospecting/**` 生成候选客户包、证据、ICP、风险、下一步。 | 不真实外联。 |
| Phase 9 product + quotation draft | `product-quotation-drafts.ts` 引用产品/价格/事实层生成 draft-only quotation lines、缺失信息、证据和人工编辑建议。 | 不生成正式报价、PI、PDF、Excel。 |
| Phase 10 outbound approval pipeline | `outbound-approval-pipeline.ts` 将 Phase 9 草稿转为 side-effect review request。 | 只请求审批，不执行。 |
| Phase 11 decision learning | `decision-learning.ts` 记录 approve once、edit then approve、reject、update policy 建议。 | 不自动放宽高风险动作。 |
| Phase 12 scheduler + metrics | `growth-scheduler.ts` 单 tick dry-run，汇总候选、证据、ICP、人工编辑、approve/reject、失败和占位指标。 | 不是常驻无人值守外联 worker。 |

## Pilot Readiness Gate

真实外联受控试点开始前，至少满足以下条件:

| 动作 | 当前默认 | 放行条件 |
|---|---|---|
| 邮件发送 | blocked / review-only | 真实邮箱配置完成；收件人验证通过；side-effect decision 已 approved；`SSA_ENABLE_REAL_EMAIL_SEND=true` 仅在试点窗口开启；发送结果写回 execution record 和客户 timeline。 |
| 外部 CRM 写入 | blocked / review-only | CRM adapter readiness 确认；字段映射和 workspace scope 测试通过；approved decision + `SSA_ENABLE_REAL_CRM_WRITE=true`；失败可重试。 |
| 正式 quotation/PI/PDF/Excel | blocked / draft-only | 产品、成本、MOQ、供应商、交期、HS code、包装、币种、Incoterms、运费、付款条款齐全；银行/公司抬头人工确认；approved document decision + explicit flag。 |
| 价格调整/折扣 | review-only | 毛利、授权边界、历史价格和 policy memory 人工确认；approved decision + `SSA_ENABLE_REAL_PRICE_DISCOUNT=true`。 |
| 付款/银行 | blocked | 仅做只读核验或人工记录；任何 bank/payment 写动作必须保持最高风险审批，不进入自动化。 |
| Autopilot | disabled / not ready | 至少完成多轮真实试点回放、误判分析、回滚策略和人工接管 SLA；当前不放行。 |

## farreach / hero-pumps 试点协议建议

1. 先只选一个工作区作为真实试点，另一个保持 dry-run 对照，避免开发数据、种子用户数据和真实业务动作混在一起。
2. 每天限制 5-10 个候选客户，只允许生成 prospecting packet、product fit、quotation draft 和 approval request。
3. 所有报价相关草稿必须人工补齐 missing info checklist，确认成本、MOQ、交期、贸易条款、付款条款后才能进入正式文档审批。
4. 第一轮真实动作只放行一种动作，建议从“人工确认后的邮件发送”开始，不同时开启 CRM 写入、文档生成和价格调整。
5. 每个真实动作完成后检查四件事: side-effect decision、approval、execution/failure、customer timeline 是否都存在。
6. 每周复盘 Decision Learning 记录，拒绝原因和人工修改点多于通过原因时，不扩大自动化范围。

## 剩余高风险项

- canonical world model 已有最小 canonical fact ledger、source replay 和 order/payment lifecycle draft: 足够做本地事实沉淀、版本和冲突审计，但不足以承担强一致订单/付款/会计主账本。
- Phase 12 scheduler 是 dry-run tick: 没有生产级常驻增长 worker、限流、退避、队列隔离和事故停机机制。
- 回复率和误判原因仍是 placeholder: 只有真实试点后才能形成有效指标。
- README/产品话术需要避免“全自动真实销售员”误导，应定位为“可审计、可审批、可逐步放行的销售执行系统”。

## 已收口高风险项

- 2026-06-23: registry enforcement 已从契约层推进到 side-effect gate 强制入口。所有高风险 kind 需要注册 tool context、idempotency key、operator approval contract 和 failure/retry contract；直接调用底层 gate 创建高风险 request 会失败，legacy decision 不能直接记录 executed/failed。
- 2026-06-23: sales world model 已从纯 read-only 聚合推进到最小 canonical fact ledger。Ledger 写入 `~/.ssa/data/companies/<workspace>/world-model/sales-fact-ledger.json`，保留现有 business source files，支持 idempotency 去重、版本递增、source provenance、workspace isolation 和 deterministic conflict marking；当前仍不作为订单/付款/会计权威主账本。
- 2026-06-23: fact ledger ingestion 已接入本地 customer activity、PI/document records、price memory、memory records 和 Phase 9 quotation drafts；`replayWorkspaceSourcesToFactLedger()` 可安全回放现有本地源且不修改源文件；`deriveOrderPaymentLifecycleDraft()` 会把邮件/活动中的付款信号标为 unverified/review-required，并在冲突时要求人工 review。

## 本次验证

- 已运行 `scripts/check-repo-boundary.sh`。
- 初次失败原因: 空目录 `data/intelligence/` 被识别为运行/情报数据。
- 处理: 迁移到 `~/.ssa/tmp/repo-boundary/20260623-acceptance-audit/data-intelligence-empty`。
- 重新运行: 通过。

## 停止线

本次只完成 v1 acceptance audit 与真实外联试点 readiness 判断。未进入真实外联试点，未开启任何 `SSA_ENABLE_REAL_*` flag，未发送邮件，未写外部 CRM，未生成正式报价/PI/PDF/Excel，未修改业务代码，未 stage/commit。
