# Super Sales Agent — 超级业务员系统

**审批门控的销售执行系统** — 统一客户事实、销售草稿、报价准备、客户跟进、订单信号和 side-effect approval。当前定位是 controlled beta / HITL 操作台, 不是无人值守的真实外联销售员。

## Current Capability Boundary

SSA v1 的目标不是承诺“全自动成交”, 而是提供一个可运行、可测试、可审计、可逐步放行的销售执行闭环。

当前已支持:

- 本地 inbox monitor、客户时间线、sales memory、customer detail 和 worker queue。
- `/growth` HITL 增长操作台: prospecting dry-run、product fit、quotation draft、outbound approval request、decision learning、scheduler metrics。
- quotation / PI / email / CRM / payment / bank / price discount 等高风险动作的 side-effect gate。
- 三条核心销售闭环的 dry-run/mock drill: 新邮件到回复审批、RFQ 到报价/PI 审批请求、PI/order 到付款/出货/异常建议。

当前不应声称或默认执行:

- 不自动发送真实客户邮件。
- 不自动写外部 CRM。
- 不自动生成正式 quotation、PI、PDF 或 Excel。
- 不自动改价格、确认付款、读取银行或执行付款相关动作。
- 不启用无人值守 autopilot。

任何真实客户可见动作都必须同时满足: operator review、side-effect decision approval、对应 `SSA_ENABLE_REAL_*` runtime flag、执行/失败记录、workspace scope 校验。

Status details: [docs/SSA_V1_ACCEPTANCE_AUDIT.md](./docs/SSA_V1_ACCEPTANCE_AUDIT.md)

## Runtime Boundary

SSA should remain runnable without OpenClaw, Hermes, PHOENIX, Codex, or any agent framework. Those tools may supervise development, but they are not runtime dependencies.

Keep generated data out of this repo. Runtime data, mailbox scans, intelligence/news files, generated documents, logs, screenshots, and local experiments belong under `~/.ssa`, normally `~/.ssa/data`.

Before and after Hermes/operator work, run:

```bash
scripts/check-repo-boundary.sh
```

Details: [docs/SSA_RUNTIME_BOUNDARY.md](./docs/SSA_RUNTIME_BOUNDARY.md)

### Standalone Inbox Monitor

SSA owns its inbox-monitor runtime. Hermes can call it, but Hermes is optional:

```bash
node scripts/workers/inbox-monitor.mjs --workspace farreach
node scripts/workers/inbox-monitor.mjs --workspace hero-pumps
node scripts/workers/inbox-monitor.mjs --workspace farreach --source himalaya --himalaya-account farreach
```

Hermes-compatible wrappers are available at:

```bash
bash farreach/scripts/inbox-monitor-scan.sh
bash hero-pumps/scripts/inbox-monitor-scan.sh
```

The monitor can run in local-file mode or read-only Himalaya mode. Project wrappers default to Himalaya accounts `farreach` and `heropumps`; set `SSA_INBOX_SOURCE=local` to force local-file mode. The worker writes dedupe state under `~/.ssa/data/companies/<workspace>/inbox/` and records SSA runtime events under `~/.ssa/data/companies/<workspace>/events/`.

### JadenOS Background Worker

SSA owns a lightweight JadenOS scheduler layer. Operator commands are planned into
bounded runtime jobs by `jaden-planner`, persisted in SSA's SQLite runtime queue,
and consumed by `jaden-worker`. This does not require OpenClaw, Hermes, or a web
request lifecycle.

```bash
node scripts/workers/jaden-worker.mjs --workspace farreach --once
node scripts/workers/jaden-worker.mjs --workspace farreach --worker-id jaden-local --max-jobs 5 --max-attempts 3 --interval-ms 5000
node scripts/workers/jaden-worker.mjs --status --worker-id jaden-local

cd web-frontend
npm run worker
npm run worker:status
npm run worker:supervisor
```

For a resident worker, generate a supervisor config instead of hand-copying the
long command:

```bash
node scripts/workers/jaden-worker-supervisor.mjs generate \
  --platform launchd \
  --workspace farreach \
  --worker-id jaden-farreach-1

node scripts/workers/jaden-worker-supervisor.mjs generate --platform systemd --workspace farreach --worker-id jaden-farreach-1
node scripts/workers/jaden-worker-supervisor.mjs generate --platform pm2 --workspace farreach --worker-id jaden-farreach-1
```

The generator writes both the supervisor config and a small command manifest with
start, stop, restart, status, and health-check commands. By default those files
go to `SSA_DATA_ROOT/runtime/supervisors` so generated configs do not capture
local machine paths inside the repo. The configs use an always-restart policy and
the same persistent `SSA_DATA_ROOT` queue as the web runtime. Every worker tick
syncs the inbox into the customer CRM, creates/updates customer records, queues
`company-intel` for new inbound customers, and then consumes queued runtime jobs.
Use `--no-inbox-sync` only for isolated queue tests. All customer-visible actions
still pass through SSA's side-effect approval gate.

### SSA Company Data Layout

Runtime files are owned by SSA, but they do not live inside this repo. Each company gets its own folder:

```bash
~/.ssa/data/companies/farreach/
~/.ssa/data/companies/hero-pumps/
```

Common company subfolders:

```bash
inbox/              # mailbox scan input and monitor state
mail/               # sent logs, drafts, captured send requests
leads/              # imported lead CSV/JSON files
customers/          # canonical customer accounts and CRM activity timeline
documents/          # generated trade documents
quotations/         # generated quotes
intelligence/       # news, market, and competitor signals
intake/             # recent intake sessions and uploads
memory/             # SSA-owned customer memory
approvals/          # approval records and side-effect decisions
events/             # runtime activity events
operator-commands/  # page-aware operator instructions
```

Hermes, OpenClaw, and other operator tools should write company material into those folders when they need SSA to see it. The repo should stay code, templates, docs, tests, and intentional fixtures.

---

## 📖 目录

- [架构概览](#架构概览)
- [核心功能](#核心功能)
- [快速开始](#快速开始)
- [Skill 列表](#skill-列表)
- [配置指南](#配置指南)
- [开发文档](./docs/)

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Super Sales Agent                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  邮件自动处理  │  │  报价单工作流  │  │  客户跟进引擎  │      │
│  │ imap-smtp    │  │ quotation    │  │ follow-up    │      │
│  │ smart-reply  │  │ workflow     │  │ engine       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  OKKI 同步    │  │  订单追踪     │  │  营销追踪     │      │
│  │ okki-sync    │  │ order-tracker│  │ campaign     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  审批引擎     │  │  售后管理     │  │  物流追踪     │      │
│  │ approval     │  │ after-sales  │  │ logistics    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           自动进化系统 (Revolution)                   │  │
│  │  auto-evolution — 自动开发新 skill 的元技能            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**完整架构图：** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## 核心功能

### 📧 邮件与客户时间线
- 本地 mailbox scan / read-only inbox monitor。
- 意图识别、RFQ/订单/异常信号提取和客户时间线写入。
- 基于客户事实和 memory 生成回复草稿。
- 真实发送必须走 side-effect approval gate、收件人校验和显式 runtime flag。

### 💰 报价与 PI 准备
- 基于产品资料、price memory、历史 quotation / PI 和客户上下文生成 draft-only quotation lines。
- 输出成本、售价、毛利参考、assumptions、missing info checklist 和 evidence refs。
- 正式 quotation、PI、PDF、Excel 生成默认关闭, 必须人工确认并审批。

### 🎯 客户开发与跟进
- `/growth` 支持 prospecting dry-run、ICP score、opening angle 和下一步建议。
- 支持 outbound approval request, 只创建审批请求, 不直接外联。
- decision learning 记录人工修改、拒绝原因和 policy suggestion, 不自动放宽高风险动作。

### 📦 订单、付款与异常信号
- 从客户活动中聚合 PI/order、payment、shipment、refund、after-sales 和 exception 信号。
- 为 operator 生成下一步建议和待审批 milestone request。
- 付款、银行、价格调整保持最高风险边界, 默认 blocked。

### 📊 销售仪表板
- 销售数据可视化
- 客户转化漏斗
- 业绩统计
- 实时数据更新

### 🤖 Worker 与运营恢复
- Jaden worker 处理本地队列、heartbeat、失败任务和 retryable work。
- `/agent-status` 展示 worker health、side-effect review queue、失败任务和恢复操作。
- Phase 12 scheduler 当前是 dry-run tick, 不是生产级无人值守 outbound worker。

---

## 快速开始

### 前置条件

- Node.js 18+
- SQLite CLI（本地任务队列使用）
- LLM API Key（可选；只在需要 AI 分析/生成时使用）
- OKKI CRM 账号（可选；默认不写入真实 OKKI）
- 企业邮箱账号（可选；默认不读取/发送真实邮件）

OpenClaw、Hermes、PHOENIX、Codex 都不是 SSA 运行时依赖。它们可以作为开发、监督、定时调用工具存在，但 SSA 本体必须能独立启动。

### 安装

```bash
# 克隆 repo
git clone https://github.com/cjboy007/super-sales-agent.git
cd super-sales-agent

# 安装前端依赖
cd web-frontend
npm install
```

### 配置

1. **配置本地运行数据目录**（可选）
```bash
export SSA_DATA_ROOT="$HOME/.ssa/data"
```

2. **配置 LLM Provider**（可选）
```bash
export SSA_LLM_PROVIDER=deepseek
export DEEPSEEK_API_KEY=your_key
export SSA_LLM_MODEL=deepseek-v4-flash
export HUNTER_API_KEY=your_hunter_key
```

OpenRouter is also supported:

```bash
export SSA_LLM_PROVIDER=openrouter
export OPENROUTER_API_KEY=your_key
export SSA_LLM_MODEL=deepseek/deepseek-v4-flash
```

OpenAI remains available as a fallback:

```bash
export SSA_LLM_PROVIDER=openai
export OPENAI_API_KEY=your_key
export SSA_LLM_MODEL=gpt-4o-mini
```

If `SSA_LLM_PROVIDER` is not set, SSA auto-detects `DEEPSEEK_API_KEY` first, then `OPENAI_API_KEY`, then `OPENROUTER_API_KEY`. Without a supported key it falls back to the local mock LLM.

3. **启动本地 UI**
```bash
npm run dev
```

### 验证

```bash
# 从 repo 根目录运行
node --test scripts/workers/inbox-monitor.test.mjs

# 前端构建
cd web-frontend
npm run build

# 检查是否有运行时文件误入 repo
cd ..
scripts/check-repo-boundary.sh
```

真实 IMAP、SMTP、OKKI、飞书、支付、银行等外部副作用默认关闭。必须有 Wilson 明确授权并设置对应 `SSA_ENABLE_REAL_*` 开关后，适配器才允许执行真实外部调用。

### Runtime File Boundary

SSA does not ship an in-app sign-in system. Keep the app behind your normal
OpenClaw/private network boundary if needed.

Runtime data is kept outside the repo under `SSA_DATA_ROOT`:

```bash
export SSA_DATA_ROOT="$HOME/.ssa/data"
```

Company files live under `~/.ssa/data/companies/<workspace>/`. Intake sessions
and uploads live under each company folder and are retained as a bounded recent
set. Generated previews use temporary folders, and `scripts/check-repo-boundary.sh`
catches accidental runtime files written into the repo.

JadenOS runtime folders such as `.jadenos/manifest`, `.jadenos/cache`, customer
quote archives, generated PI/CI/PL files, and price memory are user data, not
source code. They should be backed up with `SSA_DATA_ROOT`, not committed to the
SSA application repo.

Keep real email, CRM, Feishu, payment, bank, and document side effects unset or
`false` unless the exact adapter has been reviewed and approved through the
side-effect gate.

For public beta, send customer email from the SSA web review flow. Older
orchestrator and batch-send scripts are guarded, but they are not the preferred
operator surface.

Production standalone start:

```bash
cd web-frontend
npm run build
PORT=3000 HOSTNAME=0.0.0.0 npm run start:standalone
```

See [docs/PUBLIC_BETA_READINESS.md](./docs/PUBLIC_BETA_READINESS.md).

---

## Skill 列表

### 核心技能（销售自动化）

| Skill | 描述 | ClawHub |
|-------|------|---------|
| `imap-smtp-email` | 邮件收发基础 | ✅ |
| `okki-email-sync` | OKKI 双向同步 | ✅ |
| `email-smart-reply` | 邮件智能回复 | ✅ |
| `back-research` | 批量公司初筛与适配度评分 | 🔄 |
| `company-intel` | 单客户深度背调、联系人挖掘、邮箱验证 | 🔄 |
| `quotation-workflow` | 报价单工作流 | ✅ |
| `follow-up-engine` | 客户跟进引擎 | ✅ |
| `order-tracker` | 订单追踪 | ✅ |
| `campaign-tracker` | 营销活动追踪 | ✅ |
| `approval-engine` | 审批引擎 | ✅ |
| `after-sales` | 售后管理 | 🔄 |
| `logistics` | 物流管理 | 🔄 |
| `logistics-tracker` | 物流追踪 | 🔄 |
| `pricing-engine` | 定价引擎 | 🔄 |
| `sales-dashboard` | 销售仪表板 | 🔄 |
| `customer-segmentation` | 客户细分 | 🔄 |

### 工具技能（支撑核心）

| Skill | 描述 |
|-------|------|
| `okki` | OKKI CRM 基础 API |
| `product-doc-reader` | 产品文档读取 |
| `pdf-product-catalog` | PDF 产品目录生成 |
| `read-docx` | Word 文档读取 |
| `excel-xlsx` | Excel 处理 |
| `word-docx` | Word 处理 |

### 元技能（自动开发）

| Skill | 描述 |
|-------|------|
| `auto-evolution` | Revolution 自动进化系统 |

**图例：** ✅ 已发布 | 🔄 开发中 | ⏳ 计划中

---

## 配置指南

### SSA Runtime 配置

常用运行时变量：
```bash
export SSA_DATA_ROOT="$HOME/.ssa/data"
export SSA_LLM_PROVIDER=deepseek
export DEEPSEEK_API_KEY=your_key
export SSA_LLM_MODEL=deepseek-v4-flash
```

外部副作用开关默认不设置：
```bash
export SSA_ENABLE_REAL_IMAP=true
export SSA_ENABLE_REAL_EMAIL_SEND=true
export SSA_ENABLE_REAL_CRM_WRITE=true
export SSA_ENABLE_REAL_FEISHU=true
export SSA_ENABLE_REAL_PAYMENT=true
export SSA_ENABLE_REAL_BANK=true
```

只有在明确需要真实外部调用时才设置这些变量。真实客户邮件发送还必须带有已批准的服务端 side-effect 决策记录 ID；浏览器请求体里的人工审批标记不能作为放行依据。
真实冷邮件发送还需要 Hunter 邮箱核验通过；`SSA_ALLOW_UNVERIFIED_EMAIL_SEND=true`
仅作为人工明确接受风险时的紧急覆盖，不应作为 public beta 默认配置。

### OpenClaw / Hermes（可选）

旧 skill 和 agent 工作流可以继续作为开发参考或 operator 工具使用，但不能作为 SSA 运行条件。Hermes 如需监控邮件，应调用 SSA 自己的 wrapper：
```bash
bash farreach/scripts/inbox-monitor-scan.sh
bash hero-pumps/scripts/inbox-monitor-scan.sh
```

---

## 开发文档

- [架构设计](./docs/ARCHITECTURE.md)
- [Skill 开发规范](./docs/SKILL_DEVELOPMENT.md)
- [Revolution 使用指南](./docs/REVOLUTION_GUIDE.md)
- [OKKI 集成文档](./docs/OKKI_INTEGRATION.md)
- [邮件配置指南](./docs/EMAIL_SETUP.md)

---

## 路线图状态

当前路线图以 [docs/SSA_V1_ROADMAP.md](./docs/SSA_V1_ROADMAP.md) 为准。

已完成的本地 v1 能力:

- [x] Runtime boundary、repo boundary 和 side-effect gate。
- [x] Canonical sales world model 最小事实账本、source replay、lifecycle draft + 聚合层。
- [x] Sales tool registry 契约层。
- [x] 三条核心销售闭环 dry-run/mock drill。
- [x] LLM provider / mock fallback / task policy 边界。
- [x] `/growth` HITL console、prospecting dry-run、quotation draft、outbound approval request、decision learning、scheduler metrics。

已收口的高风险项:

- [x] Tool registry 已成为高风险 side-effect 的受控入口; 直接绕过 registry context 的真实动作请求会被 gate 拒绝。
- [x] README 已从“全自动销售助手”收口为“审批门控的销售执行系统”, 并明确真实外联、CRM、正式报价/PI、付款/银行和 autopilot 默认不执行。

仍需收口的高风险项:

- [ ] Sales world model 仍不是强一致订单/付款/会计权威主账本。
- [ ] Phase 12 scheduler 仍是 dry-run tick, 不是生产级无人值守增长 worker。
- [ ] 回复率和误判原因需要真实受控试点数据。

真实外联试点前请先阅读 [docs/SSA_V1_ACCEPTANCE_AUDIT.md](./docs/SSA_V1_ACCEPTANCE_AUDIT.md) 的 Pilot Readiness Gate。

---

## 许可证

MIT License

---

SSA can be developed with OpenClaw/Hermes, but it runs without them.
