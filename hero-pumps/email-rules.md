# Hero Pumps — 发邮件规则 v1.1

> 生效日期：2026-04-22  
> 适用范围：所有 cold email 发送、跟进、回复处理

---

## 1. 联系人筛选规则

### 1.1 优先级分层

| 优先级 | 角色关键词 | 策略 |
|--------|-----------|------|
| P0 | export, sales, purchasing, procurement, sourcing, commercial | 直接发，个性化程度最高 |
| P1 | CEO, managing director, director, head of, VP, chief, founder, owner | 直接发，强调战略价值 |
| P2 | product, engineering, technical, R&D, design | 直接发，强调技术参数 |
| P3 | manager, regional, area, branch | 直接发，中等个性化 |
| P4 | marketing, HR, admin, finance, IT, training | **不发**，除非是该公司唯一联系人 |
| — | 通用邮箱（info@, office@, post@） | 可发，请求转交负责人 |

### 1.2 禁止发送的邮箱前缀

以下邮箱前缀 **一律不发**：
- `rekrutacja@` / `hr@` / `career@` — 招聘
- `racunovodstvo@` / `finance@` / `accounting@` — 财务
- `serwis@` / `service@` / `support@` / `kundendienst@` — 售后
- `newsletter@` — 订阅
- `datarequests@` — 数据请求
- `resurse@` — 人力资源（罗马尼亚语）

### 1.3 去重规则

- 同邮箱只发一次（去重按 email 小写）
- 同公司同一天最多发 **3 封**（不同联系人）
- 同一个人（不同邮箱）优先发职位最高的那个

### 1.4 竞品名单（不发）

以下公司 **完全不发**，已从 CSV 中移除：
- Grundfos / Wilo / Danfoss / Vaillant / Viessmann / Bosch
- NIBE / Purmo / Xylem / Lowara / Belimo / Halton

---

## 2. 发送速率规则

### 2.1 每日配额

| 阶段 | 时间 | 每日上限 | 说明 |
|------|------|----------|------|
| 冷启动 | 第 1-7 天 | 5 封/天 | 测试送达率、退信率 |
| 稳定期 | 第 8 天起 | 10 封/天 | 确认无 spam 投诉后提速 |
| 最大限制 | 永远 | 30 封/天 | 不超过此值 |

### 2.2 发送间隔

- 每封间隔 **3-8 分钟**（随机）
- 发送窗口：**欧洲当地时间 7:00-17:00**
  - 中欧（CEST/BST）：北京时间 13:00-01:00
  - 东欧（EEST）：北京时间 12:00-00:00
  - 北欧/西欧（GMT/BST）：北京时间 14:00-02:00

### 2.3 批次控制

- 每批最多 **5 封**，批次间至少间隔 **30 分钟**
- 失败率 > 10% → 立即停止，检查原因

---

## 3. 邮件内容规则

### 3.1 模板选择逻辑

| 公司类型 | 关键词 | 切入角度 |
|----------|--------|----------|
| 分销商/批发商 | distributor, wholesale, großhandel, supply, trading | 产品线补充、利润空间 |
| 制造商 | manufacturer, producer, factory, boiler, heat pump | OEM 集成、互补产品线 |
| 工程承包商 | contractor, installation, engineering, project, MEP | 项目成本降低 |
| 品牌方 | brand, group, solutions, technology, systems | 品牌互补、系统方案 |

### 3.2 内容规范

**必须包含：**
- 公司名（个性化开头）
- 国家/市场
- 产品核心卖点（ErP EEI ≤ 0.23, TÜV 认证, 30-40% 价格优势）
- 明确的 CTA（同意接收产品单页和报价）

**严禁：**
- "I hope this email finds you well"
- 破折号（— 或 --）
- "不是...而是" 句式
- 空洞恭维（"your prestigious company"）
- 超过 120 词的正文（不含签名）
- 同时推进多个动作

### 3.3 签名

统一使用 Hero Pump 签名（Jaden Yeung），**禁止**使用 Farreach 签名。

---

## 4. 跟进规则

### 4.1 跟进时机

| 阶段 | 间隔 | 内容策略 |
|------|------|----------|
| 第 1 封（cold email） | — | 初次介绍 |
| 第 2 封 | +3 天 | 简短提醒 + 附加价值（案例/认证） |
| 第 3 封 | +7 天 | 不同角度切入（技术/价格/OEM） |
| **→ 打入冷宫** | **+14 天后** | 冷却 90 天 |

### 4.2 停止跟进的条件

满足以下任一条件即停止：
- 客户明确回复（转入回复处理流程）
- **已跟进 3 次无回复**（第 1 封 + 2 封跟进）
- 邮箱退信（bounce）
- 客户要求 unsubscribe

### 4.3 回复处理

| 回复类型 | 动作 |
|----------|------|
| 感兴趣/要资料 | 24 小时内发送产品单页 + 报价 |
| 问价格 | 询问具体型号/数量后报价 |
| 问认证 | 发送 TÜV/CE 证书 |
| 拒绝 | 记录原因，90 天后不跟进 |
| 自动回复（out of office） | 等对方回来后再发 |
| 退信 | 标记无效，不再尝试 |

---

## 5. 数据追踪

### 5.1 必记录字段

每封邮件发送后必须记录：
- `email` — 收件人邮箱
- `company` — 公司名
- `country` — 国家
- `sent_at` — 发送时间
- `subject` — 主题行
- `template_id` — 使用的模板
- `follow_up_count` — 第几封
- `stage` — 当前阶段
- `next_follow_up_at` — 下次跟进时间

### 5.2 状态流转

```
new → cold_email_sent → follow_up_1 → follow_up_2 → follow_up_3 → cold
                                                        ↓
                                                  replied → quoted → sample_sent → ordered
                                                        ↓
                                                  bounced → invalid
```

---

## 6. 安全红线

| 规则 | 说明 |
|------|------|
| 禁止群发 | 每封单独发送，不用 BCC |
| 禁止伪造发件人 | 必须用 sales@heropumps.com |
| 退信率 > 5% | 立即停止，检查邮箱质量 |
| 投诉率 > 1% | 立即停止，审查内容 |
| 每日发送量 | 冷启动 5 封，稳定期 10 封，最大不超过 30 |
| 竞品 | 完全不发 |
