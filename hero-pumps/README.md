# 🚀 Hero Pumps Orchestrator

自动开发信发送系统 — 基于 CSV 线索（网页爬虫 + hunter.io）

> **规则文档：** `email-rules.md`（完整发送/跟进/安全规则）  
> **最后更新：** 2026-04-22

## 目录结构

```
hero-pumps/
├── email-rules.md              # 📋 发邮件规则（v1.1）
├── .env                        # SMTP 配置
├── orchestrator/
│   ├── hero-orchestrator.js    # 主调度器
│   └── logs/
├── scripts/
│   ├── smtp-send-batch-v2.js   # 间隔发送脚本
│   └── batch-draft-generator-v2.js
├── config/
│   ├── templates/              # 开发信模板
│   └── signatures/
│       └── signature-jordan.html
├── leads/                      # CSV 线索（已清理，可信）
│   ├── eastern-europe-2026-04-20.csv  (246 行)
│   ├── nordic-west-2026-04-20.csv     (69 行)
│   └── western-europe-2026-04-21.csv  (43 行)
├── campaign-tracker/
│   └── templates/              # 草稿库
└── archive/                    # 旧数据归档（2026-04-22）
    └── 2026-04-22-old-data/    # 不可靠的旧背调/调研/草稿
```

## 发送规则概要

| 规则 | 值 |
|------|------|
| 冷启动（第 1 周） | 5 封/天 |
| 稳定期（第 2 周起） | 10 封/天 |
| 最大限制 | 30 封/天 |
| 发送间隔 | 3-8 分钟随机 |
| 发送窗口 | 欧洲时间 7:00-17:00 |
| 跟进次数 | 3 次后打入冷宫 |
| 冷却期 | 90 天 |
| 竞品 | **不发** |

## 快速开始

```bash
cd hero-pumps/scripts

# 预览模式
node smtp-send-batch-v2.js --dry-run

# 实际发送（默认 5 封）
node smtp-send-batch-v2.js

# 指定数量
node smtp-send-batch-v2.js --limit 10
```

## CSV 数据状态（2026-04-22 清理后）

| 文件 | 原始 | 清理后 | 有邮箱 | 说明 |
|------|------|--------|--------|------|
| 东欧 | 453 | 246 | 246 | 移除 40 竞品 + 51 禁发 + 116 重复 |
| 北欧/西欧 | 87 | 69 | 69 | 移除 18 禁发 |
| 西欧 | 43 | 43 | 5 | 多数还在调研阶段，缺邮箱 |
| **总计** | **583** | **358** | **320** | |

## 签名

**统一使用 Hero Pump 签名：**
- 本地路径：`skills/imap-smtp-email/signatures/signature-hero-jordan.html`
- 🔴 **禁止使用 Farreach 签名**
