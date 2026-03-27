# Monorepo 整理说明

**日期：** 2026-03-27  
**版本：** 0.1.0

---

## 整理内容

### 已移入 Monorepo 的 Skills (21 个)

#### 核心技能（14 个）
1. `imap-smtp-email` - 邮件收发基础
2. `okki-email-sync` - OKKI 双向同步
3. `email-smart-reply` - 邮件智能回复
4. `quotation-workflow` - 报价单工作流
5. `follow-up-engine` - 客户跟进引擎
6. `order-tracker` - 订单追踪
7. `campaign-tracker` - 营销活动追踪
8. `approval-engine` - 审批引擎
9. `after-sales` - 售后管理
10. `logistics` - 物流管理
11. `logistics-tracker` - 物流追踪
12. `pricing-engine` - 定价引擎
13. `sales-dashboard` - 销售仪表板
14. `customer-segmentation` - 客户细分

#### 工具技能（6 个）
15. `okki` - OKKI CRM 基础 API
16. `product-doc-reader` - 产品文档读取
17. `pdf-product-catalog` - PDF 产品目录生成
18. `read-docx` - Word 文档读取
19. `excel-xlsx` - Excel 处理
20. `word-docx` - Word 处理

#### 元技能（1 个）
21. `auto-evolution` - Revolution 自动进化系统

### 保留在原地的 Skills（独立工具）

以下技能与"超级业务员"核心业务无关，保留在 `skills/` 目录：
- `brave-search` - 搜索工具
- `clawfeed` - 新闻摘要
- `clickup-mcp` - ClickUp 集成
- `copper-price-monitor` - 铜价监控
- `data` - 数据处理
- `finance` - 财务工具
- `gemini-ocr` - OCR 工具
- `image` - 图像处理
- `imagemagick` - ImageMagick
- `inspection` - 检验工具
- `integration-test` - 集成测试
- `multi-search-engine` - 多搜索引擎
- `nano-pdf` - PDF 编辑
- `orders` - 订单工具（与 order-tracker 不同）
- `output` - 输出工具
- `pdf-extract` - PDF 提取
- `playwright` - 浏览器自动化
- `production` - 生产工具
- `sample` - 样品管理
- `sample-manager` - 样品管理器
- `self-improving` - 自我改进
- `skill-vetter` - Skill 评估
- `summarize` - 文本摘要
- `agent-browser` - 浏览器代理
- `find-skills` - Skill 发现
- `gog` - Google Workspace
- `multi-channel-hub` - 多渠道集成
- `proactive-agent-lite` - 主动代理

---

## 目录结构

```
monorepo/super-sales-agent/
├── README.md              ← 主入口文档
├── docs/
│   ├── ARCHITECTURE.md    ← 系统架构设计
│   ├── MONOREPO_SETUP.md  ← 本文件
│   ├── SKILL_DEVELOPMENT.md
│   ├── REVOLUTION_GUIDE.md
│   ├── OKKI_INTEGRATION.md
│   └── EMAIL_SETUP.md
├── skills/
│   ├── auto-evolution/
│   ├── imap-smtp-email/
│   ├── okki-email-sync/
│   ├── email-smart-reply/
│   ├── quotation-workflow/
│   ├── follow-up-engine/
│   ├── order-tracker/
│   ├── campaign-tracker/
│   ├── approval-engine/
│   ├── after-sales/
│   ├── logistics/
│   ├── logistics-tracker/
│   ├── pricing-engine/
│   ├── sales-dashboard/
│   ├── customer-segmentation/
│   ├── okki/
│   ├── product-doc-reader/
│   ├── pdf-product-catalog/
│   ├── read-docx/
│   ├── excel-xlsx/
│   └── word-docx/
└── scripts/
    └── (未来添加工具脚本)
```

---

## 下一步

### 1. Git 初始化

```bash
cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent
git init
git add -A
git commit -m "Initial monorepo structure for Super Sales Agent"
```

### 2. 创建 GitHub Repo

```bash
gh repo create super-sales-agent --public --description "🚀 AI-Driven Sales Automation Platform — email, quotation, follow-up, order tracking" --source . --push
```

### 3. 后续工作

- [ ] 补充每个 skill 的 README.md（如果缺失）
- [ ] 编写 `SKILL_DEVELOPMENT.md` 规范文档
- [ ] 编写 `REVOLUTION_GUIDE.md` 使用指南
- [ ] 编写 `OKKI_INTEGRATION.md` 集成文档
- [ ] 编写 `EMAIL_SETUP.md` 邮箱配置指南
- [ ] 添加 `.gitignore` 和 `LICENSE`
- [ ] 代码审查（你来做）
- [ ] 发布到 ClawHub（批量发布 21 个 skill）

---

## 注意事项

1. **不要删除原 `skills/` 目录** — 等代码审查完成并确认 monorepo 可用后再清理
2. **ClawHub 发布** — 每个 skill 还是独立发布，monorepo 只是 GitHub 组织方式
3. **版本管理** — 建议所有 skill 统一版本号（如 1.0.0），或者各自独立版本

---

## 优势

### 对用户的价值
- **一站式解决方案** — 用户看到一个完整的销售自动化系统，不是零散工具
- **统一文档** — 一个地方了解所有功能
- **清晰的模块关系** — 知道哪些 skill 需要一起用

### 对开发的价值
- **代码审查集中** — 一个 repo 管理所有核心 skill
- **统一规范** — 所有 skill 遵循同样的开发规范
- **协作清晰** — 知道 skill 之间的依赖关系
- **品牌统一** — 所有技能都属于"Super Sales Agent"品牌

### 对 ClawHub 的影响
- **无影响** — ClawHub 不关心 GitHub repo 结构
- 每个 skill 还是独立发布、独立安装
- monorepo 只是源代码的组织方式

---

**整理者：** WILSON 🧠  
**审核者：** Jaden（待审核）
