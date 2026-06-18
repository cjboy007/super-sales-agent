# SSA v1 Roadmap

> 北极星文档。定义把 Super Sales Agent 从「controlled beta sales cockpit +
> gated local workflows」推进到「可验证、可恢复、可授权的销售执行系统 v1」的目标、
> 阶段与验收。
>
> **这不是单次任务。** 每次喂给 agent 的应是一个切片(见末尾「分片执行」),
> 每个 Phase 完成后暂停并 review,不要一路冲到底。

## v1 的定义

v1 = 下面「验收标准」10 条全部通过。不做哲学包装:不追求抽象的「全知全能」,
追求一个可运行、可测试、可审计的销售执行闭环。

- 统一认知:销售任务相关的数据、客户、产品、邮件、报价、订单、付款、出货、
  售后、市场情报,拥有统一、及时、可追溯的事实层。
- 授权执行:在授权范围内把销售目标拆成动作,经工具执行,结果写回系统,形成闭环。

## 当前系统已有

- Web cockpit / Battle Station
- 本地 runtime
- Jaden worker
- side-effect approval gate
- sales memory
- customer timeline
- inbox / quotation / documents / intelligence / agent-status 等页面
- beta auth、worker health、real-action readiness 等基础设施

## 当前核心缺口

1. **销售事实层不统一**:客户、联系人、邮件、报价、PI、订单、付款、出货、售后、
   情报未收束为一个 canonical sales world model。
2. **工具能力不统一**:缺 reusable sales tool registry,每个动作缺明确输入、输出、
   权限、审批、幂等、失败处理。
3. **workflow 偏浅**:多数仍是「分类输入 → 创建审批请求 → 记录事件」,
   不是「理解目标 → 拆任务 → 调工具 → 校验结果 → 下一步」。
4. **真实业务闭环未打穿**:邮件到 CRM、询价到报价/PI、PI 到付款/出货,
   需端到端可验证。
5. **模型治理不完整**:缺 LLM provider registry、预算策略、任务级模型使用规则、
   mock/fallback 边界。
6. **发布纪律需收口**:repo boundary、密钥、运行数据、构建产物、日志、测试门禁
   需稳定通过。

## 全局约束(适用于每个 Phase)

- 不要重写整个系统。优先收束现有能力为可运行、可测试、可审计的系统。
- 优先复用现有 runtime、sales-memory、customer-activity、workflow、
  side-effect-gate、documents、inbox、Jaden worker。不要另起孤岛。
- 不要绕过审批闸门。
- 不要把 OpenClaw、Hermes、Codex 变成 SSA runtime 依赖。
- 不要破坏用户已有未提交改动;修改前先 `git status` 和相关 diff。
- 对高风险业务逻辑先加测试,再改实现。
- 对付款、银行、报价金额、邮件发送、CRM 写入相关逻辑保持保守。
- mock/fallback 不能被误报为真实智能可用;低置信度输出必须显示证据不足或转人工。
- 不允许模型声称已发送邮件、改 CRM、改价格、确认付款或执行外部动作。

---

## Phase 0 — 真实状态审计

**做什么**
- 阅读 README、docs/PUBLIC_BETA_READINESS.md、docs/SSA_RUNTIME_BOUNDARY.md、
  runtime manifest、workflow、sales-runtime、side-effect gate、Jaden worker、
  customer timeline、documents、inbox、LLM adapter 相关代码。
- 对照当前代码,不要只相信文档。

**产出** → 写入 `docs/SSA_CAPABILITY_AUDIT.md`,能力矩阵四象限:
- 已实现
- 部分实现
- 文档存在但代码未闭环
- 高风险 / 阻塞项

**停止点**:产出审计后暂停,等待 review,不要自动进入 Phase 1。

---

## Phase 1 — 收口安全与发布边界

**做什么**
- 确保运行数据、日志、情报、构建产物不留在 repo。
- 确保 repo boundary check 可通过。
- 确保真实邮件发送、CRM 写入、文档生成、银行/付款相关动作都必须经过 side-effect gate。
- 不允许把密钥、银行账号、客户敏感运行数据新增进 repo。
- 若发现历史敏感信息残留,**只报告并给处理步骤,不擅自破坏 git history**。

**对应验收**:1, 2, 3, 4

**停止点**:边界收口完成并报告后暂停,等待 review。

---

## Phase 2 — canonical sales world model

**做什么**:设计并落地一个最小可用销售事实模型,覆盖:
workspace、customer/account、contact、email interaction、lead、quotation/RFQ、
PI/order、payment milestone、shipment milestone、after-sales/exception、
customer intelligence、memory record。

- 明确每类事实的来源、置信度、更新时间、idempotency key、客户归属。
- 优先复用现有 customer activity、sales memory、documents、inbox、company-intel。

**对应验收**:8

**停止点**:数据模型定稿后暂停,等待 review,再进入 Phase 3。

---

## Phase 3 — sales tool registry

**做什么**:设计并实现 reusable sales tool registry。每个 tool 至少包含:
id、name、description、input schema、output schema、required permissions、
side-effect kind、approval requirement、idempotency strategy、failure/retry behavior。

**首批工具**:ingest inbound email、update customer CRM、search customer memory、
draft email reply、request email send、generate quotation/PI、
request document generation、queue company intelligence、create follow-up plan、
record payment/shipment/order milestone。

**对应验收**:5

**停止点**:registry 落地后暂停,等待 review。

---

## Phase 4 — 打穿 3 条端到端销售闭环(优先级最高)

只做能验证的闭环。

**闭环 A:新邮件 → 客户时间线 → 回复草稿 → 审批发送**
新邮件进 inbox monitor → 自动匹配或创建客户 → 写入 timeline → 判断意图 →
生成回复草稿 → 高风险或低置信度转人工 → 真实发送走审批 + explicit runtime flag →
结果写回 timeline/events/approvals。

**闭环 B:询价/RFQ → 报价/PI → 审批 → 文档记录**
从邮件或 intake 提取询价 → 匹配客户/产品/价格/贸易条款 → 生成 quote/PI 草稿 →
校验客户/收件人/金额/银行信息/HTML 安全 → 文档生成走审批 →
结果写回 customer/order/document timeline。

**闭环 C:PI/order → 付款/出货/异常 → 客户状态**
PI 或订单进系统 → 识别付款/部分付款/逾期/出货/退款/售后/异常 →
更新 order timeline → 更新 customer lifecycle status → 生成下一步建议 →
需外部动作时进审批。

**对应验收**:6, 7, 8

**停止点**:每条闭环可 dry-run/mock drill 后报告,等待 review 再做下一条。

---

## Phase 5 — LLM 与策略治理

**做什么**
- 明确每类任务的模型策略:必须真实模型 / 可 mock / 禁止模型 / 可 fallback。
- 增加 provider readiness、budget、timeout、retry、fallback 规则。
- mock fallback 不能被误报为真实智能可用。
- 低置信度输出必须显示证据不足或转人工。
- 不允许模型声称已执行外部动作。

**对应验收**:9

**停止点**:策略落地后暂停,等待 review。

---

## Phase 6 — 验证与交付

**必须运行并报告结果**
- `scripts/check-repo-boundary.sh`
- web-frontend 测试
- lint
- build
- 关键 runtime/worker 测试
- 至少 3 条端到端闭环的本地 dry-run 或 mock drill

**对应验收**:全部

---

## 验收标准(v1 达标 = 全过)

| # | 标准 | 主要 Phase |
|---|------|-----------|
| 1 | Repo boundary clean | 1 |
| 2 | 无新增 secrets/runtime/generated artifacts 进 repo | 1 |
| 3 | 所有非公开 API route 有 beta/workspace/admin auth guard | 1 |
| 4 | 真实外部动作默认 blocked | 1 |
| 5 | 每个真实动作都有 side-effect decision、approval、execution/failure record | 3 |
| 6 | 三条核心销售闭环可演示、可测试、可追踪 | 4 |
| 7 | Worker 可恢复,失败任务可在 agent-status/operations 中看到并重试 | 4 |
| 8 | Customer detail 显示客户/联系人/背景/邮件/报价/PI-order/付款-出货-异常/下一步建议 | 2,4 |
| 9 | LLM 状态清楚区分 real provider 与 mock fallback | 5 |
| 10 | 文档更新到 README / PUBLIC_BETA_READINESS / SSA_RUNTIME_BOUNDARY 或对应 runtime docs | 6 |

---

## 最终交付

- 能力差距与完成情况报告。
- 已实现的代码变更。
- 测试和验证结果。
- 未完成但明确剩余的 backlog,按阻塞程度排序。
- 如果仍不能称为 v1 达标,明确说明还差哪几项,不要包装成已完成。

---

## 分片执行(怎么用这份文档)

不要把整份文档当一个 prompt 喂给 agent。每次只给一个切片,例如:

> 读 `docs/SSA_V1_ROADMAP.md`。这次只执行 **Phase 0**:对照代码(不只信文档)
> 产出能力矩阵四象限,写入 `docs/SSA_CAPABILITY_AUDIT.md`。完成后暂停,
> 不要进入 Phase 1。

每个 Phase 完成、review 通过后,再发下一个切片。涉及付款/邮件/CRM 的改动,
务必在 Phase 1 审计后、Phase 2 数据模型定稿后各 review 一次。
