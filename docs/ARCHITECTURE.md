# 系统架构设计

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Super Sales Agent                                │
│                    AI-Driven Sales Automation Platform                   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
        ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
        │   用户交互层       │ │   协调控制层       │ │   数据存储层       │
        │  User Interface   │ │  Coordination     │ │  Data Storage     │
        ├───────────────────┤ ├───────────────────┤ ├───────────────────┤
        │ • Discord Bot     │ │ • OpenClaw Agent  │ │ • OKKI CRM         │
        │ • Email Client    │ │ • Revolution      │ │ • Email (IMAP)     │
        │ • Web Dashboard   │ │ • Cron/Heartbeat  │ │ • Local Files      │
        │ • CLI Tools       │ │ • Event Triggers  │ │ • Vector DB        │
        └───────────────────┘ └───────────────────┘ └───────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │                        业务技能层 (Skills)                       │
        │                     Business Logic Layer                        │
        ├─────────────────────────────────────────────────────────────────┤
        │                                                                  │
        │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
        │  │  邮件处理   │ │  报价单     │ │  客户跟进   │ │  订单追踪   │   │
        │  │ Email      │ │ Quotation  │ │ Follow-up  │ │ Order      │   │
        │  │ Processing │ │ Workflow   │ │ Engine     │ │ Tracker    │   │
        │  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
        │                                                                  │
        │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
        │  │  OKKI 同步   │ │  智能回复   │ │  营销追踪   │ │  审批引擎   │   │
        │  │ OKKI Sync  │ │ Smart      │ │ Campaign   │ │ Approval   │   │
        │  │            │ │ Reply      │ │ Tracker    │ │ Engine     │   │
        │  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
        │                                                                  │
        │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
        │  │  售后管理   │ │  物流追踪   │ │  定价引擎   │ │  客户细分   │   │
        │  │ After-sales│ │ Logistics  │ │ Pricing    │ │ Customer   │   │
        │  │            │ │ Tracker    │ │ Engine     │ │ Segmentation│  │
        │  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
        │                                                                  │
        └─────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
        ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
        │   工具技能层       │ │   元技能层         │ │   外部系统         │
        │  Utility Skills   │ │  Meta-Skills      │ │  External Systems │
        ├───────────────────┤ ├───────────────────┤ ├───────────────────┤
        │ • okki (API)      │ │ • auto-evolution  │ │ • OKKI CRM API    │
        │ • excel-xlsx      │ │   (Revolution)    │ │ • Email Servers   │
        │ • word-docx       │ │                   │ │ • Discord API     │
        │ • read-docx       │ │                   │ │ • GitHub API      │
        │ • pdf-product-    │ │                   │ │ • ClawHub         │
        │   catalog         │ │                   │ │                   │
        └───────────────────┘ └───────────────────┘ └───────────────────┘
```

---

## 数据流

### 邮件处理流程

```
外部邮件
  │
  ▼
IMAP Server (imaphz.qiye.163.com)
  │
  ▼
imap-smtp-email (auto-capture.js)
  │
  ├─→ 下载附件 → 本地存储
  ├─→ 提取正文 → 向量检索
  │
  ▼
email-smart-reply (intent-recognition.js)
  │
  ├─→ 意图识别 (6 类)
  ├─→ 知识库检索 (Obsidian)
  │
  ▼
email-smart-reply (reply-generation.js)
  │
  ├─→ 生成回复草稿
  ├─→ 低置信度 → 人工审核 (Discord)
  │
  ▼
imap-smtp-email (smtp.js)
  │
  ├─→ 发送邮件
  ├─→ 写入 OKKI 跟进记录 (trail_type=102)
  │
  ▼
okki-email-sync (okki-sync.js)
  │
  └─→ 客户匹配 (域名 + 向量检索)
      └─→ 去重 (/tmp/okki-sync-processed.json)
```

### 报价单生成流程

```
销售数据 (JSON/Excel)
  │
  ▼
quotation-workflow (generate-all.sh)
  │
  ├─→ generate_quotation_excel.py → .xlsx
  ├─→ generate_quotation_word.py  → .docx
  ├─→ generate_quotation_html.py  → .html
  │                                   │
  │                                   ▼
  │                            convert-to-pdf.sh
  │                                   │
  │                                   ▼
  └──────────────────────────────→ .pdf
                                    │
                                    ▼
                              发送邮件附件
                                    │
                                    ▼
                              写入 OKKI 跟进记录 (trail_type=101)
```

### Revolution 自动进化流程

```
任务创建 (evolution/tasks/task-XXX.json)
  │
  ▼
heartbeat-coordinator.js (每 5 分钟)
  │
  ├─ 扫描任务 → 选择优先级最高的
  │
  ▼
Phase 1: Spawn Reviewer (Sonnet/GPT-4o)
  │
  ├─ 审阅计划
  ├─ 生成执行指令
  │
  ▼
Phase 2: Spawn Executor (Qwen/Haiku)
  │
  ├─ 按指令实现 subtask
  ├─ 运行验证测试
  │
  ▼
Phase 3: Spawn Auditor (Sonnet/GPT-4o)
  │
  ├─ 验收结果
  ├─ 决定 pass/retry
  │
  ▼
所有 subtasks 完成 → completed
  │
  ▼
pack-skill.js
  │
  ├─ 生成 SKILL.md + README.md
  ├─ 归档到 evolution/archive/
  │
  ▼
clawhub publish (可选)
  │
  └─→ 发布到 ClawHub
```

---

## 模块依赖关系

```
┌──────────────────────────────────────────────────────────────┐
│                        核心技能                               │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  imap-smtp-email                                              │
│    ├─→ okki-email-sync (可选)                                │
│    └─→ email-smart-reply (可选)                              │
│                                                               │
│  okki-email-sync                                              │
│    ├─→ okki (必需)                                           │
│    └─→ imap-smtp-email (必需)                                │
│                                                               │
│  email-smart-reply                                            │
│    ├─→ imap-smtp-email (必需)                                │
│    └─→ okki-email-sync (可选)                                │
│                                                               │
│  quotation-workflow                                           │
│    ├─→ excel-xlsx (可选)                                     │
│    ├─→ word-docx (可选)                                      │
│    └─→ okki-email-sync (可选 - 写入跟进记录)                  │
│                                                               │
│  follow-up-engine                                             │
│    ├─→ okki (必需)                                           │
│    └─→ okki-email-sync (可选)                                │
│                                                               │
│  order-tracker                                                │
│    ├─→ okki (必需)                                           │
│    └─→ logistics-tracker (可选)                              │
│                                                               │
│  auto-evolution (独立 - 元技能)                                │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 部署架构

### 单机部署（推荐）

```
Mac Mini / 笔记本 / VPS
  │
  ├─ OpenClaw Gateway
  │   ├─ Agent: wilson (coordinator)
  │   ├─ Agent: oracle (可选)
  │   └─ Agent: warden (监控)
  │
  ├─ Cron Jobs
  │   ├─ evolution-coordinator (每 5 分钟)
  │   ├─ evolution-monitor (每 10 分钟)
  │   └─ daily-backup (每天 1:00)
  │
  ├─ Workspace
  │   ├─ skills/ (所有 skill)
  │   ├─ evolution/tasks/ (活跃任务)
  │   ├─ mail-archive/ (邮件归档)
  │   └─ obsidian-vault/ (知识库)
  │
  └─ External Services
      ├─ OKKI CRM API
      ├─ Email (IMAP/SMTP)
      └─ Discord Bot
```

### 高可用部署（未来）

```
┌─────────────┐     ┌─────────────┐
│  Gateway 1  │     │  Gateway 2  │
│  (Active)   │◄───►│  (Standby)  │
└─────────────┘     └─────────────┘
       │                   │
       └────────┬──────────┘
                │
       ┌────────▼────────┐
       │  Shared Storage │
       │  (PostgreSQL +  │
       │   Redis)        │
       └─────────────────┘
```

---

## 安全设计

### 数据隔离

- 敏感配置（API Key、密码）→ `.env` 文件，不提交到 Git
- 邮件归档 → 本地存储，加密可选
- OKKI 数据 → 仅通过官方 API 访问

### 权限控制

- OpenClaw exec 审批 → `exec-approvals.json` 白名单
- Discord Bot → 最小权限原则
- OKKI API → 只读/读写分离（未来）

### 审计日志

- 所有邮件发送 → 归档到 `mail-archive/`
- OKKI 跟进记录写入 → trail 记录
- Revolution 任务执行 → `evolution/logs/`

---

## 扩展性

### 添加新技能

1. 在 `skills/` 目录创建新 skill
2. 遵循 [SKILL_DEVELOPMENT.md](./SKILL_DEVELOPMENT.md) 规范
3. 通过 Revolution 自动开发（推荐）或手动开发
4. 测试通过后发布到 ClawHub

### 添加新 Agent

1. 在 `~/.openclaw/agents/` 创建新 agent 配置
2. 配置模型和心跳
3. 通过 Revolution 分配任务

### 集成新系统

1. 创建对应的工具 skill（如 `salesforce-sync`）
2. 实现数据同步逻辑
3. 在核心技能中调用

---

## 性能优化

### 向量检索

- 使用 LanceDB（本地）而非云端 API
- Ollama `nomic-embed-text`（768 维）
- 索引缓存，避免重复 embedding

### 邮件处理

- IMAP IDLE 模式（实时推送）
- 批量处理（每 30 分钟检查一次）
- 去重机制（UID + 已处理记录）

### Revolution

- 任务拆分（一个 subtask 一次迭代）
- 模型分级（强模型用于审阅/审核，便宜模型用于执行）
- 并发控制（lock 文件防止重复执行）

---

**文档版本：** 1.0.0  
**最后更新：** 2026-03-27
