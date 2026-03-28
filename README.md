# 🚀 Super Sales Agent — 超级业务员系统

**AI 驱动的全自动销售助手** — 邮件自动处理、报价单生成、客户跟进、订单追踪，一站式销售自动化。

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

- [OpenClaw](https://github.com/openclaw/openclaw) v0.5+
- Node.js 18+
- OKKI CRM 账号（可选）
- 企业邮箱账号（可选）

### 安装

```bash
# 克隆 repo
git clone https://github.com/cjboy007/super-sales-agent.git
cd super-sales-agent

# 安装核心 skill（通过 ClawHub）
clawhub install auto-evolution
clawhub install imap-smtp-email
clawhub install okki-email-sync
clawhub install email-smart-reply
clawhub install quotation-workflow

# 或直接从本地加载
cp -r skills/* ~/.openclaw/workspace/skills/
```

### 配置

1. **配置邮箱**（`skills/imap-smtp-email/.env`）
```bash
IMAP_HOST=imaphz.qiye.163.com
IMAP_PORT=993
SMTP_HOST=smtphz.qiye.163.com
SMTP_PORT=465
EMAIL=your-email
PASSWORD=your_password
```

2. **配置 OKKI**（`skills/okki/.env`）
```bash
OKKI_API_KEY=your_api_key
OKKI_ORG_ID=your_org_id
```

3. **启动 Revolution**（可选 - 自动开发）
```bash
# 配置 coordinator heartbeat
openclaw cron add --agent wilson \
  --name "evolution-coordinator" \
  --every 5m \
  --session isolated \
  --message "Evolution heartbeat: scan and process tasks."
```

### 验证

```bash
# 测试邮件连接
cd skills/imap-smtp-email
node scripts/imap.js check --limit 5

# 测试 OKKI 同步
cd skills/okki-email-sync
node okki-sync.js test

# 生成示例报价单
cd skills/quotation-workflow
bash scripts/generate-all.sh examples/customer.json QT-TEST-001
```

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

### OpenClaw 配置

在 `~/.openclaw/config.json` 中添加：
```json
{
  "agents": {
    "wilson": {
      "model": "bailian/qwen3.5-plus",
      "heartbeat": "skills/auto-evolution/scripts/heartbeat-coordinator.js"
    }
  }
}
```

### 环境变量

所有技能共享的环境变量：
```bash
export OPENCLAW_WORKSPACE=/Users/wilson/.openclaw/workspace
export EVOLUTION_TASKS_DIR=$OPENCLAW_WORKSPACE/evolution/tasks
export EVOLUTION_SKILLS_DIR=$OPENCLAW_WORKSPACE/skills
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

**Built with [OpenClaw](https://openclaw.ai) 🐾**
