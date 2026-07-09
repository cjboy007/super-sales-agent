# Super Sales Agent — 超级业务员系统

**开源的 AI 外贸销售助手（Apache-2.0），采用人工审批门控（human-in-the-loop）架构。**

SSA 覆盖外贸业务员的核心日常工作：收件箱处理、客户档案维护、回复起草、报价准备、客户开发和订单跟踪。AI 负责起草、分析和建议；**所有对客户可见的真实动作（发邮件、发报价、改价格）都必须经过人工审批才会执行**。

克隆即用：无激活码、无注册、无云端依赖。本地运行 `npm run dev` 即可启动，自带合成演示数据和 mock LLM，接入真实模型只需配置一个 API Key。

## 核心能力概览

- **邮件处理**：只读扫描收件箱，对每封邮件做意图识别（询盘 / 订单进展 / 异常 / 一般往来），自动归档到对应客户的活动时间线。
- **客户档案**：每个客户一条完整时间线——邮件往来、历史报价、订单记录、销售记忆，作为后续起草和分析的上下文。
- **回复起草**：基于该客户的历史记录和产品资料生成回信草稿；发送前必须经过审批门，并通过收件人校验。
- **报价准备**：根据产品成本、价格记忆和客户上下文生成草稿级报价行，附毛利参考、假设条件说明和缺失信息清单。
- **客户开发**：对潜在客户做 ICP 适配评分，给出开发信切入角度和下一步建议；外联请求只会进入审批队列，不会直接发出。
- **订单跟踪**：从客户活动中聚合付款、出货、售后和异常信号，生成下一步操作建议。

## 默认安全边界

以下动作默认全部关闭，不会自动执行：

- 向真实客户发送邮件。
- 写入外部 CRM。
- 生成正式报价单、PI、PDF、Excel。
- 任何涉及价格调整、付款确认、银行信息的操作。
- 无人值守自动外联（autopilot）。

每个真实动作的执行需要同时满足五个条件：人工复核、服务端审批决策记录、对应的 `SSA_ENABLE_REAL_*` 环境开关显式开启、执行/失败留痕、workspace 权限校验。默认配置下全部关闭，克隆下来即是一个安全的本地沙盒。

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

The monitor can run in local-file mode or read-only Himalaya mode. Project wrappers default to Himalaya accounts `acme` and `example`; set `SSA_INBOX_SOURCE=local` to force local-file mode. The worker writes dedupe state under `~/.ssa/data/companies/<workspace>/inbox/` and records SSA runtime events under `~/.ssa/data/companies/<workspace>/events/`.

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
- 只读扫描收件箱（本地文件模式或 IMAP 只读模式），不修改邮箱内容。
- 对每封邮件做意图识别，提取询盘（RFQ）、订单进展和异常信号，写入客户活动时间线。
- 基于客户历史和产品资料生成回复草稿；真实发送必须经过审批门、收件人校验和显式开启的运行时开关。

### 💰 报价与 PI 准备
- 基于产品资料、价格记忆、历史报价和客户上下文生成草稿级报价行。
- 输出成本、售价、毛利参考，并明确标注假设条件和缺失信息清单，所有数字附证据来源。
- 正式报价单、PI、PDF、Excel 生成默认关闭，必须人工确认并审批。

### 🎯 客户开发与跟进
- 对潜在客户做 ICP 适配评分，生成开发信切入角度和下一步行动建议。
- 外联动作只创建审批请求，不直接发送。
- 决策学习：记录人工修改和拒绝原因，用于改进后续建议，但不会自动放宽任何高风险动作。

### 📦 订单、付款与异常信号
- 从客户活动中聚合订单、付款、出货、退款、售后和异常信号，还原订单进展全貌。
- 检测到异常时生成提醒和下一步操作建议。
- 付款、银行、价格调整属于最高风险边界，默认全部拦截，界面不提供自动执行入口。

### 📊 销售仪表板与内置助手
- 工作台聚合今日待办、客户动态和邮件进度。
- 内置销售助手基于本地客户、报价、邮件上下文回答问题、检索证据、起草内容；涉及副作用的请求会自动转为审批项。

### 🤖 后台 Worker
- 后台 worker 处理收件箱同步、客户档案更新、任务队列消费和失败重试。
- `/agent-status` 页面展示 worker 健康状态、任务队列、失败任务和恢复操作。

---

## 页面功能地图

| 页面 | 名称 | 功能 |
|------|------|------|
| `/` | 工作台 | 销售驾驶舱：今日待办、客户动态、邮件进度、内置销售助手对话（基于本地客户/报价/邮件上下文回答问题、起草内容、发起后台研究） |
| `/intake` | 资料导入 | 上传产品资料、报价单、客户名单等文件，AI 解析提取产品/价格/客户事实并写入本地记忆 |
| `/reviews` | 待确认 | 人工审批队列：所有真实副作用（发邮件、写 CRM、改价、生成正式单证）在这里等待放行或拒绝 |
| `/growth` | 线索开发 | HITL 增长操作台：prospecting dry-run、ICP 适配评分、开发信角度建议、outbound 审批请求、决策学习 |
| `/leads` | 客户 | 客户列表与跟进：客户档案、活动时间线、销售记忆、生命周期状态 |
| `/emails` | 邮件草稿 | AI 生成的回复/跟进草稿，人工编辑后提交审批 |
| `/inbox` | 邮件复核 | 收件箱视图：意图识别（RFQ/订单/异常）、逐封复核、生成回复 |
| `/quotations` | 报价中心 | 报价与 PI 准备：draft-only 报价行、成本/售价/毛利参考、快速报价工具 |
| `/documents` | 单证中心 | 贸易单证（QT/PI/CI/PL）生成与管理，正式输出需审批 |
| `/intelligence` | 市场洞察 | 客户公司背调、新闻信号、市场与竞品情报聚合 |
| `/agent-status` | 任务进度 | 后台 worker 健康状态、任务队列、失败恢复、副作用审计 |
| `/health` | 健康检查 | 部署就绪面板：LLM 连通、邮箱配置、worker 心跳、数据目录 |
| `/settings` | 设置 | 本地存储、模型供应商、邮件账户、搜索配置 |

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

真实 IMAP、SMTP、OKKI、飞书、支付、银行等外部副作用默认关闭。必须由操作者（deployment owner）明确授权并设置对应 `SSA_ENABLE_REAL_*` 开关后，适配器才允许执行真实外部调用。

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

For shared deployments, send customer email from the SSA web review flow. Older
orchestrator and batch-send scripts are guarded, but they are not the preferred
operator surface.

Production standalone start:

```bash
cd web-frontend
npm run build
PORT=3000 HOSTNAME=0.0.0.0 npm run start:standalone
```

See [docs/DEPLOYMENT_READINESS.md](./docs/DEPLOYMENT_READINESS.md).

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

外部副作用开关默认不设置（即全部关闭）。只有在对应适配器经过审查、且确实需要真实外部调用时，才逐个显式开启：

```bash
# 默认全部 false / 不设置。按需逐个开启，不要批量打开。
export SSA_ENABLE_REAL_IMAP=false
export SSA_ENABLE_REAL_EMAIL_SEND=false
export SSA_ENABLE_REAL_CRM_WRITE=false
export SSA_ENABLE_REAL_FEISHU=false
export SSA_ENABLE_REAL_PAYMENT=false
export SSA_ENABLE_REAL_BANK=false
```
真实客户邮件发送还必须带有已批准的服务端 side-effect 决策记录 ID；浏览器请求体里的人工审批标记不能作为放行依据。
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
- [部署指南](./docs/DEPLOYMENT_READINESS.md)
- [运行时边界](./docs/SSA_RUNTIME_BOUNDARY.md)
- [助手路由设计](./docs/ASSISTANT_ROUTER.md)
- [v1 验收审计](./docs/SSA_V1_ACCEPTANCE_AUDIT.md)

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

Apache License 2.0 — 详见 [LICENSE](./LICENSE)。

本仓库自带的客户、报价、邮件示例数据均为合成数据（synthetic），不包含真实客户信息。

---

SSA can be developed with OpenClaw/Hermes, but it runs without them.
