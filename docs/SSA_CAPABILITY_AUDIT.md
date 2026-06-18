# SSA Capability Audit - Phase 0

审计日期: 2026-06-18

审计范围: 只执行 `docs/SSA_V1_ROADMAP.md` 的 Phase 0。本文对照当前工作树代码判断能力状态, 不进入 Phase 1, 不修改业务代码。

## 结论

SSA 现在已经不是单纯 demo: 它有独立运行时边界、审批闸门、SQLite 队列、Jaden worker、inbox/customer/documents/CRM/LLM 等本地运行能力, 可以支撑 controlled beta sales cockpit。

但它还不能称为 v1 销售执行系统。主要差距不是 UI 数量, 而是: 销售事实层没有统一成 canonical world model, 真实动作还没有统一 sales tool registry, 多数 workflow 仍偏浅, 三条核心销售闭环缺端到端可验证证据, LLM 治理还停在 provider/fallback 层, repo boundary 当前失败。

## 审计证据

已对照的文档和代码面:

- `README.md`
- `docs/SSA_V1_ROADMAP.md`
- `docs/PUBLIC_BETA_READINESS.md`
- `docs/SSA_RUNTIME_BOUNDARY.md`
- `web-frontend/src/lib/runtime/manifest.ts`
- `web-frontend/src/lib/runtime/workflow.ts`
- `web-frontend/src/lib/runtime/sales-runtime.ts`
- `web-frontend/src/lib/runtime/side-effect-gate.ts`
- `web-frontend/src/lib/runtime/task-queue.ts`
- `web-frontend/src/lib/runtime/jaden-worker.ts`
- `scripts/workers/jaden-worker.mjs`
- `scripts/workers/inbox-monitor.mjs`
- `web-frontend/src/lib/runtime/inbox.ts`
- `web-frontend/src/lib/runtime/email-send.ts`
- `web-frontend/src/lib/runtime/crm-write.ts`
- `web-frontend/src/lib/runtime/documents.ts`
- `web-frontend/src/lib/runtime/customer-activity.ts`
- `web-frontend/src/lib/runtime/customer-memory-ingestor.ts`
- `web-frontend/src/lib/runtime/customers.ts`
- `web-frontend/src/lib/runtime/llm.ts`
- `web-frontend/src/lib/runtime/real-action-readiness.ts`
- `web-frontend/src/app/api/api-route-auth-coverage.test.ts`

额外检查:

- `scripts/check-repo-boundary.sh` 已运行, 当前失败。失败项记录在本文“高风险 / 阻塞项”。
- 当前工作树有大量未提交修改和未跟踪文件。本文判断基于当前工作树, 不是 clean baseline。

## 四象限能力矩阵

### 1. 已实现

| 能力 | 代码证据 | 当前判断 |
| --- | --- | --- |
| SSA 独立运行时边界 | `README.md`, `docs/SSA_RUNTIME_BOUNDARY.md`, `web-frontend/src/lib/runtime/manifest.ts`, `web-frontend/src/lib/ssa-data-paths.ts` | 运行时被定义为不依赖 OpenClaw/Hermes/Codex, 数据根通过 `SSA_DATA_ROOT` 或 `~/.ssa/data` 管理。 |
| Runtime manifest / sales packs / side-effect kinds | `web-frontend/src/lib/runtime/manifest.ts`, `web-frontend/src/lib/runtime/sales-packs.ts`, `web-frontend/src/lib/runtime/types.ts` | runtime 能声明 workflow 类型、sales pack、side-effect 种类和能力状态。 |
| Side-effect approval gate | `web-frontend/src/lib/runtime/side-effect-gate.ts` | 邮件、CRM、IMAP、Feishu、payment、bank、document 等真实动作默认 blocked, 并有 request/approve/reject/retry/executed/failed 记录。 |
| 外部动作 flag 边界 | `web-frontend/src/lib/runtime/side-effect-gate.ts`, `web-frontend/src/lib/runtime/real-action-readiness.ts` | 每类真实动作有独立环境变量, readiness 能汇总 blocked/approved/executed/failed 状态。 |
| SQLite runtime queue | `web-frontend/src/lib/runtime/task-queue.ts` | runtime jobs 持久化到 `runtime/ssa-runtime.db`, 支持 WAL、lease claim、重试、失败、完成。 |
| Jaden worker tick | `web-frontend/src/lib/runtime/jaden-worker.ts`, `scripts/workers/jaden-worker.mjs` | worker 每 tick 同步 inbox、处理队列任务、记录 heartbeat、处理失败重试和 exhausted 状态。 |
| Inbox monitor | `scripts/workers/inbox-monitor.mjs`, `docs/SSA_RUNTIME_BOUNDARY.md` | 支持 local 和 Himalaya read-only 模式, 写入 `~/.ssa/data/companies/<workspace>/inbox` 与 events, 不发送邮件。 |
| Inbox -> customer activity 同步 | `web-frontend/src/lib/runtime/inbox.ts`, `web-frontend/src/lib/runtime/customer-activity.ts` | inbox 列表/详情会同步邮件到客户活动, worker tick 也会把 inbox 活动写入客户 CRM/timeline。 |
| 邮件草稿与真实发送保护 | `web-frontend/src/lib/runtime/inbox.ts`, `web-frontend/src/lib/runtime/email-send.ts` | 草稿可结合客户 memory 和 LLM 生成; 真实发送需要 flag、匹配 approval decision、收件人验证或显式 override。 |
| CRM 写入审批路径 | `web-frontend/src/lib/runtime/crm-write.ts` | CRM write 有 request/execute 分离; execute 要求 approved decision 和 `SSA_ENABLE_REAL_CRM_WRITE=true`, 并记录执行或失败。 |
| Quotation/document 生成审批路径 | `web-frontend/src/lib/runtime/documents.ts` | quotation 文档生成先 request side-effect, flag 未启用或缺 approval 时 blocked; 成功/失败会写 side-effect execution record。 |
| Customer directory 读模型 | `web-frontend/src/lib/runtime/customers.ts`, `web-frontend/src/lib/runtime/customer-activity.ts` | 客户详情能展示联系人、情报、订单/PI/报价、互动、状态解释、下一步建议。 |
| Customer lifecycle status | `web-frontend/src/lib/runtime/customers.ts`, `web-frontend/src/lib/runtime/jaden-worker.ts` | 有自动规则、人工 override、风险/异常/订单活动影响状态, worker 会同步生命周期状态。 |
| Sales memory 与索引 | `web-frontend/src/lib/runtime/sales-memory.ts`, `web-frontend/src/lib/runtime/memory-index.ts`, `web-frontend/src/lib/runtime/customer-memory-ingestor.ts` | 本地 memory ledger、客户上下文、FTS/索引重建等能力存在。 |
| LLM provider readiness 与 mock fallback | `web-frontend/src/lib/runtime/llm.ts`, `web-frontend/src/app/api/health/route.ts` | 支持 DeepSeek/OpenAI/OpenRouter/local/mock 状态, 有 timeout、cache、fallback, 系统提示禁止声称已执行外部动作。 |
| API auth coverage 静态检查 | `web-frontend/src/app/api/api-route-auth-coverage.test.ts` | 除 beta verify 和 health 外, API route 应包含 beta/workspace/admin guard 字符串。当前 API route 数量为 57。 |
| Beta / real-action / worker readiness | `web-frontend/src/lib/runtime/beta-readiness.ts`, `web-frontend/src/lib/runtime/real-action-readiness.ts`, `web-frontend/src/lib/runtime/worker-health.ts` | health/readiness 层能向 operator 暴露访问控制、worker、mailbox、真实动作、失败工作等状态。 |

### 2. 部分实现

| 能力 | 已有部分 | 未闭合部分 |
| --- | --- | --- |
| Canonical sales world model | Customer directory 能拼接 accounts、leads、activities、PI records、quotations、intelligence、pending follow-ups。 | 事实仍分散在多个 JSON/SQLite/文件读模型中, 不是统一事实层; 缺统一 provenance、confidence、TTL、冲突处理和跨域 idempotency。 |
| Sales workflows | `workflow.ts` 能排队并执行 workflow; `company_intel.run` 和 `intake.product_doc.process` 有更具体步骤。 | 多数 workflow 仍是 `classify -> side-effect-gate -> record`, 不是目标理解、拆任务、调工具、校验结果、下一步的完整执行链。 |
| 邮件闭环 | inbox monitor、customer activity、draft reply、approval send、send result 记录都存在。 | 缺从新邮件意图识别到草稿策略、人工/低置信度分流、真实发送、timeline 写回的端到端 drill 证据。 |
| RFQ -> 报价/PI | document generation、quotation scripts、PI records、document manifest 都有代码。 | 缺从邮件/附件 RFQ 自动提取需求、匹配产品/价格/贸易条款、校验金额/银行/收件人/HTML 安全后再出 quote/PI 的统一闭环。 |
| PI/order -> 付款/出货/异常 | inbox monitor 和 customer activity 能从邮件提取付款、出货、退款、售后、异常信号; customer status 会受影响。 | 订单主账本仍不完整, payment/shipment milestone 不是统一事实对象, 状态判断主要来自读模型和启发式提取。 |
| Company intelligence | `company-intel` workflow、dossier、channels、read model 存在。 | 外部搜索/registry/financial provider 依赖配置; 未配置时会降级, 情报完整性不可作为 v1 保证。 |
| Assistant / operator command | assistant router 能识别 side-effect 风险并避免直接执行; operator command 能进 runtime。 | 这不是通用 sales planner; 缺可审计的目标分解、tool selection、失败恢复策略。 |
| LLM 能力 | provider 解析、mock fallback、cache、timeout、health status 已有。 | 缺任务级策略: 哪些任务必须 real model、哪些可 mock、哪些禁止 LLM; 缺预算、评估、低置信度强制转人工规则。 |
| Worker 恢复 | queue lease、retry、health、supervisor 生成脚本存在。 | 外部 beta 仍依赖实际 supervisor/daemon 部署和真实 mailbox 配置; 代码存在不等于运行中。 |
| API 安全 | 静态 coverage test 证明 route 源码包含 guard 字符串。 | 字符串检查不能证明每条 route 的语义权限、workspace scope、admin scope 都正确。 |
| Public beta readiness | readiness checklist 覆盖 auth、worker、mailbox、customer、order timeline、real action。 | readiness 是状态汇总, 依赖实际数据和配置; seeded/demo 数据可能让局部能力看起来已准备好。 |
| Business UI / Battle Station | cockpit、agent-status、approvals、runtime API 等界面和数据面存在。 | roadmap 中的 scheduled playbooks、tool runs、job controls 仍未统一成完整操作面。 |

### 3. 文档存在但代码未闭环

| 文档/目标 | 当前代码状态 | 判断 |
| --- | --- | --- |
| Reusable sales tool registry | manifest 和 roadmap 都明确列为 gap。 | 未落地。真实动作散落在 inbox/email/documents/CRM/company-intel 等模块, 缺统一 tool contract。 |
| Tool input/output/permission/approval/idempotency/failure contract | 部分模块各自实现 approval 和 idempotency。 | 没有统一 schema 和 registry, 无法全局验证每个 tool 的权限和失败行为。 |
| Policy engine: LLM required/optional/forbidden | manifest `nextGaps` 明确列出; LLM 模块只有 provider/fallback 解析。 | 未闭环。 |
| Battle Station controls for runtime jobs/tool runs/scheduled playbooks | manifest `nextGaps` 明确列出。 | 现有 UI/route 能看状态和审批, 但不是完整 playbook/tool run 控制面。 |
| 三条核心销售闭环 A/B/C | 各组成能力存在。 | 缺端到端 dry-run/mock drill 与可测试验收链路。 |
| Canonical sales world model | roadmap Phase 2 才计划落地。 | 当前 customer detail 是读模型聚合, 不是事实模型本体。 |
| Unified product/price/trade term authority | price memory、quotation、PI、trade docs 有局部能力。 | 未统一为产品、报价、价格、贸易条款权威源。 |
| General sales planner | Jaden planner/operator workflow 能排任务。 | 未达到“销售目标 -> 分解动作 -> 选择工具 -> 校验结果 -> 下一步”的通用规划能力。 |
| External CRM/OKKI/Feishu/payment/bank generalized adapters | side-effect kinds 和 flags 已定义。 | 通用适配器和工具注册未闭环; payment/bank 只具备边界声明, 非完整业务能力。 |
| Self-serve account/billing/tenant lifecycle | Public beta docs 偏 controlled beta/self-hosted token/phone trial。 | 对 controlled beta 不是当前阻塞, 但对 self-serve v1 不是闭环能力。 |
| README 中“全自动销售助手”等历史功能表述 | README 仍描述大量 legacy/目标能力。 | 当前 v1 roadmap 已把系统收束到可审计闭环, README 表述高于当前代码闭环状态。 |

### 4. 高风险 / 阻塞项

| 风险/阻塞 | 当前证据 | 影响 |
| --- | --- | --- |
| Repo boundary 当前失败 | `scripts/check-repo-boundary.sh` 失败: `data-api/error.log`, `data-api/output.log`, `data-api/tunnel-error.log`, `data-api/tunnel.log`, `data/intelligence/`, `web-frontend/.next/`, `web-frontend/tsconfig.tsbuildinfo`。 | v1 验收 #1/#2 阻塞。Phase 1 必须处理, 本阶段不清理。 |
| 工作树非常脏 | `git status --short` 显示大量 modified/untracked 文件, 包括 runtime/docs/tests/business 文件。 | 本审计只能代表当前工作树; 不能代表干净主线状态。后续改动前必须区分用户已有改动。 |
| 敏感资料/历史残留风险 | 当前存在 `SECRETS.md`, `PRE-ALPHA-BUG-REPORT.md`, `config/bank-accounts.json` 等敏感命名或业务敏感路径处于工作树内。 | Phase 1 需要只报告和给处理步骤, 不应擅自改 git history; 同时要核查密钥、银行账号、客户数据是否进入 repo。 |
| Trade documents 会在审批前保存 PI record | `generateTradeDocuments()` 中, 若包含 PI, 会先 `savePiRecord()` 再创建 document side-effect request 和 approval check。 | 这不是外发, 但会在审批前改变本地 PI/order 事实, 可能污染 customer/order timeline。 |
| `allowed` 不等于 approved/executed | side-effect gate 在 flag 开启时会创建 `allowed`; 部分 data-read 代码以 allowed 决定是否读取。主要写动作适配器有二次 approval 检查。 | 新增适配器若把 `allowed` 当成“可执行且已审批”, 会绕过人工审批语义。必须统一 tool contract。 |
| Mock fallback 可能被误读为真实智能 | `llm.ts` 无 provider 时返回 mock, confidence 仍可能进入 UI/流程。 | v1 必须强制区分 real provider 与 mock, 不能让 mock 结果支持真实客户动作。 |
| Queue 依赖 sqlite3 子进程 | `task-queue.ts` 每次操作通过 `execFileSync("sqlite3", ...)` 调 CLI。 | 对 controlled beta 可用, 但高并发、长事务、错误隔离和性能成熟度有限。 |
| 多事实存储可能分叉 | accounts、activity、memory、events、documents、PI records、quotations、intelligence 各自写入。 | 同一客户/订单/报价可能出现冲突或重复, 需要 canonical model 收口。 |
| API auth coverage 是静态字符串检查 | `api-route-auth-coverage.test.ts` 只检查源码包含 guard 字符串。 | 不能证明 route 的实际执行路径、workspace scope、admin scope 都正确。 |
| Readiness 可能被 seeded/demo 数据满足 | `beta-readiness` 和 health 汇总看当前状态。 | 外部 beta 需要真实 mailbox worker、supervisor、auth、runtime data root 和真实动作演练, 不能只看本地 seed。 |
| 真实闭环未形成回归门禁 | 目前未见三条核心闭环 A/B/C 的统一测试门禁。 | v1 验收 #6/#7/#8/#9 仍有阻塞。 |

## Phase 0 停止线

本阶段只完成真实状态审计。未执行以下事项:

- 未进入 Phase 1。
- 未清理 repo boundary 失败项。
- 未修改业务代码。
- 未设计或实现 canonical sales world model。
- 未设计或实现 sales tool registry。
- 未运行全量测试、lint 或 build。
