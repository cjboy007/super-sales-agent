# 🚀 Super Sales Agent — 超级业务员系统

**AI 驱动的全自动销售助手** — 邮件自动处理、报价单生成、客户跟进、订单追踪，一站式销售自动化。

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
documents/          # generated trade documents
quotations/         # generated quotes
intelligence/       # news, market, and competitor signals
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

### 📧 邮件自动处理
- IMAP/SMTP 邮件收发（支持网易企业邮、Gmail 等）
- 智能意图识别（询盘/催货/投诉/技术/合作/垃圾邮件）
- 自动回复生成（基于知识库 + AI）
- OKKI 双向同步（邮件自动写入跟进记录）

### 💰 报价单工作流
- Excel/Word/HTML 多种格式报价单生成
- PDF 自动导出（LibreOffice）
- 一键生成全套报价单
- 客户信息自动填充

### 🎯 客户跟进
- 自动跟进计划生成
- 跟进提醒（Discord/邮件）
- 跟进记录自动同步 OKKI
- 客户分层管理

### 📦 订单与物流
- 订单状态追踪
- 物流信息自动抓取
- 发货提醒
- 异常订单预警

### 📊 销售仪表板
- 销售数据可视化
- 客户转化漏斗
- 业绩统计
- 实时数据更新

### 🤖 自动进化
- Revolution 系统自动开发新 skill
- 审阅 → 执行 → 审核 闭环
- 新 skill 自动打包发布

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
export SSA_LLM_PROVIDER=openai
export OPENAI_API_KEY=your_key
```

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

---

## Skill 列表

### 核心技能（销售自动化）

| Skill | 描述 | ClawHub |
|-------|------|---------|
| `imap-smtp-email` | 邮件收发基础 | ✅ |
| `okki-email-sync` | OKKI 双向同步 | ✅ |
| `email-smart-reply` | 邮件智能回复 | ✅ |
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
export SSA_LLM_PROVIDER=openai
export OPENAI_API_KEY=your_key
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

只有在明确需要真实外部调用时才设置这些变量。

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

## 路线图

### Phase 1 ✅ (已完成)
- [x] 邮件自动处理
- [x] OKKI 双向同步
- [x] 报价单工作流
- [x] Revolution 自动进化系统

### Phase 2 🚧 (进行中)
- [ ] 客户跟进引擎
- [ ] 订单追踪
- [ ] 销售仪表板

### Phase 3 📋 (计划中)
- [ ] 营销活动追踪
- [ ] 审批引擎
- [ ] 售后管理
- [ ] 物流追踪

---

## 许可证

MIT License

---

SSA can be developed with OpenClaw/Hermes, but it runs without them.
