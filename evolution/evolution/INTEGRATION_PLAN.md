# Farreach Electronic 自动业务系统试运行计划

## 1. 评估现状

根据对 `/Users/wilson/.openclaw/workspace/skills/` 目录下各模块脚本目录的检查，我们对所有模块的当前可运行状态进行了评估。

| 模块名称                | 所属层级       | 评估状态       | 备注                                                              |
| :---------------------- | :------------- | :------------- | :---------------------------------------------------------------- |
| **imap-smtp-email**     | 基础设施层     | **可运行**     | `scripts/imap.js`, `scripts/smtp.js` 存在且包含内容。             |
| **okki-sync.js**        | 基础设施层     | **可运行**     | 独立脚本文件存在且包含内容。                                      |
| **Farreach 知识库**     | 基础设施层     | **可运行**     | Obsidian vault 目录结构完整，内容丰富。                           |
| **quotation-workflow**  | 核心业务层     | **可运行**     | `scripts/` 目录存在且包含 `generate-all.sh`, `generate_quotation_html.py` 等关键脚本。 |
| **email-smart-reply**   | 核心业务层     | **可运行**     | `scripts/` 目录存在且包含 `discord-review.js`, `intent-recognition.js` 等脚本。 |
| **follow-up-engine**    | 核心业务层     | **可运行**     | `scripts/` 目录存在且包含 `follow-up-scheduler.js`, `okki-integration.js` 等脚本。 |
| **campaign-tracker**    | 核心业务层     | **可运行**     | `scripts/` 目录存在且包含 `analytics-report.js`, `reply-matcher.js` 等脚本。 |
| **order-tracker**       | 核心业务层     | **可运行**     | `scripts/` 目录存在且包含 `order-dashboard.js`, `update-order-status.js` 等脚本。 |
| **pricing-engine**      | 核心业务层     | **可运行**     | `scripts/` 目录存在且包含 `pricing-engine.js`, `copper-price-adapter.js` 等脚本。 |
| **approval-engine**     | 管理层         | **可运行 (API)** | `src/` 目录包含核心 JS 模块，通过 JS API 调用，有 `test/smoke-test.sh`。无 `scripts/` 目录是预期行为。 |
| **sales-dashboard**     | 管理层         | **可运行**     | `scripts/` 目录存在且包含 `data-collector.js`, `report-generator.js` 等脚本。 |
| **logistics-tracker**   | 管理层         | **可运行**     | `scripts/` 目录存在且包含 `tracking-api.js`, `customer-notify.js` 等脚本。 |
| **multi-channel-hub**   | 管理层         | **可运行**     | `scripts/` 目录存在且包含 `customer-resolver.js`, `intent-router.js` 等脚本。 |
| **sample-manager**      | 管理层         | **可运行**     | `scripts/` 目录存在且包含 `sample-request.js`, `sample-shipping.js` 等脚本。 |
| **customer-segmentation**| 管理层         | **可运行**     | `scripts/` 目录存在且包含 `tag-sync.js`, `scoring-engine.js` 等脚本。 |
| **auto-evolution**      | 元层           | **可运行**     | `scripts/` 目录存在且包含 `pack-skill.js`, `heartbeat-wilson.js` 等脚本。 |
| **improvement-protocol**| 元层           | **框架待补全/概念**| `/Users/wilson/.openclaw/workspace/skills/` 目录下未找到独立模块，可能为 `auto-evolution` 的子功能或概念阶段。 |

**总结：** 除了 `improvement-protocol` 模块未找到独立实现外，所有列出的核心业务及管理模块均已在 `/Users/wilson/.openclaw/workspace/skills/` 目录中找到具体实现（或在 `src/` 目录中找到核心 JS 文件），并包含可执行的脚本或测试入口，表明其均处于“可运行”状态。

## 2. 验证清单 (端到端测试步骤)

### 基础设施层

1.  **imap-smtp-email**
    *   **发送测试邮件:** `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/scripts/smtp.js send --to "test@example.com" --subject "Test" --body "Hello from Farreach"`
    *   **接收测试邮件:** `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/scripts/imap.js check --limit 5` (验证是否能收到邮件)
    *   **自动捕获:** `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/auto-capture.js test`
2.  **okki-sync.js**
    *   **测试连接:** `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/okki-sync.js test`
    *   **手动触发报价单同步:** `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/okki-sync.js quotation '{"dataFile":"/tmp/test_quotation.json","quotationNo":"QT-TEST-001"}'` (需创建 `/tmp/test_quotation.json`)
3.  **Farreach 知识库**
    *   **目录浏览:** `ls -R /Users/wilson/obsidian-vault/Farreach\ 知识库/`
    *   **内容检索:** (模拟智能回复检索) `grep "HDMI 2.1" /Users/wilson/obsidian-vault/Farreach\ 知识库/02-产品目录/HDMI\ 高清线缆.md`

### 核心业务层

4.  **quotation-workflow**
    *   **生成所有格式报价单:** `bash /Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/generate-all.sh /tmp/test_quote_data.json` (需创建 `/tmp/test_quote_data.json` 包含报价数据)
    *   **验证 PDF 输出:** `ls /Users/wilson/.openclaw/workspace/skills/quotation-workflow/output/*.pdf`
5.  **email-smart-reply**
    *   **意图识别:** `node /Users/wilson/.openclaw/workspace/skills/email-smart-reply/scripts/intent-recognition.js "Please send me a quotation for HDMI cables."`
    *   **知识库检索:** `node /Users/wilson/.openclaw/workspace/skills/email-smart-reply/scripts/kb-retrieval.js "HDMI 2.1 features"`
    *   **回复生成:** `node /Users/wilson/.openclaw/workspace/skills/email-smart-reply/scripts/reply-generation.js --intent "quotation_request" --kb_result "HDMI 2.1 supports 8K@60Hz"`
    *   **Discord 审核:** (模拟邮件接收和 Discord 推送) `node /Users/wilson/.openclaw/workspace/skills/email-smart-reply/scripts/discord-review.js --email_uid 123 --reply "Generated reply text"`
6.  **follow-up-engine**
    *   **触发跟进:** `node /Users/wilson/.openclaw/workspace/skills/follow-up-engine/scripts/okki-integration.js trigger_follow_up --company_id 12345 --event_type "email_sent"`
    *   **调度器运行:** `node /Users/wilson/.openclaw/workspace/skills/follow-up-engine/scripts/follow-up-scheduler.js run`
7.  **campaign-tracker**
    *   **开发信归档:** `node /Users/wilson/.openclaw/workspace/skills/campaign-tracker/scripts/archive-sent-records.js --email_id "MSG-001"`
    *   **回复匹配:** `node /Users/wilson/.openclaw/workspace/skills/campaign-tracker/scripts/reply-matcher.js --campaign_id "CAMP-001" --email_content "I am interested."`
    *   **分析报告:** `node /Users/wilson/.openclaw/workspace/skills/campaign-tracker/scripts/analytics-report.js --campaign_id "CAMP-001"`
8.  **order-tracker**
    *   **更新订单状态:** `node /Users/wilson/.openclaw/workspace/skills/order-tracker/scripts/update-order-status.js --order_id "PO-001" --status "Shipped"`
    *   **发送通知:** `node /Users/wilson/.openclaw/workspace/skills/order-tracker/scripts/send-order-notification.js --order_id "PO-001"`
    *   **查看看板:** `node /Users/wilson/.openclaw/workspace/skills/order-tracker/scripts/order-dashboard.js view`
9.  **pricing-engine**
    *   **计算价格:** `node /Users/wilson/.openclaw/workspace/skills/pricing-engine/scripts/pricing-engine.js --product "HDMI 2.1" --quantity 1000 --customer_level "VIP"`
    *   **铜价查询:** `node /Users/wilson/.openclaw/workspace/skills/pricing-engine/scripts/copper-price-adapter.js get_latest`
    *   **汇率查询:** `node /Users/wilson/.openclaw/workspace/skills/pricing-engine/scripts/exchange-rate.js get_latest`

### 管理层

10. **approval-engine**
    *   **创建审批:** `node -e "require('/Users/wilson/.openclaw/workspace/skills/approval-engine/src/approval-engine').createApproval('test-rule', { amount: 15000 }, { submitter: 'test-user' }).then(console.log)"`
    *   **提交审批:** `node -e "require('/Users/wilson/.openclaw/workspace/skills/approval-engine/src/approval-engine').submitApproval('APR-XYZ', 'wilson', 'approved', 'OK').then(console.log)"` (需替换 APR-XYZ 为实际 ID)
    *   **运行冒烟测试:** `bash /Users/wilson/.openclaw/workspace/skills/approval-engine/test/smoke-test.sh`
11. **sales-dashboard**
    *   **数据采集:** `node /Users/wilson/.openclaw/workspace/skills/sales-dashboard/scripts/data-collector.js run`
    *   **生成报告:** `node /Users/wilson/.openclaw/workspace/skills/sales-dashboard/scripts/report-generator.js --period "weekly"`
    *   **Discord 推送:** `node /Users/wilson/.openclaw/workspace/skills/sales-dashboard/scripts/discord-push.js --report_file "/tmp/weekly_report.md"`
12. **logistics-tracker**
    *   **添加追踪:** `node /Users/wilson/.openclaw/workspace/skills/logistics-tracker/scripts/tracking-api.js add --tracking_no "17TRACK-ABC" --order_id "PO-001"`
    *   **更新状态:** `node /Users/wilson/.openclaw/workspace/skills/logistics-tracker/scripts/scheduler.js run` (模拟定时任务更新)
    *   **客户推送:** `node /Users/wilson/.openclaw/workspace/skills/logistics-tracker/scripts/customer-notify.js --tracking_no "17TRACK-ABC"`
13. **multi-channel-hub**
    *   **意图路由:** `node /Users/wilson/.openclaw/workspace/skills/multi-channel-hub/scripts/intent-router.js --message "I need support"`
    *   **客户解析:** `node /Users/wilson/.openclaw/workspace/skills/multi-channel-hub/scripts/customer-resolver.js --contact "customer@example.com"`
14. **sample-manager**
    *   **请求样品:** `node /Users/wilson/.openclaw/workspace/skills/sample-manager/scripts/sample-request.js --product "USB-C" --customer "CustX"`
    *   **追踪寄送:** `node /Users/wilson/.openclaw/workspace/skills/sample-manager/scripts/sample-shipping.js --request_id "SREQ-001" --tracking_no "SF-001"`
    *   **定时任务:** `node /Users/wilson/.openclaw/workspace/skills/sample-manager/scripts/sample-cron.js run`
15. **customer-segmentation**
    *   **数据采集:** `node /Users/wilson/.openclaw/workspace/skills/customer-segmentation/scripts/customer-data-collector.js run`
    *   **客户评分:** `node /Users/wilson/.openclaw/workspace/skills/customer-segmentation/scripts/scoring-engine.js --customer_id 54321`
    *   **自动标签同步:** `node /Users/wilson/.openclaw/workspace/skills/customer-segmentation/scripts/tag-sync.js --customer_id 54321`

### 元层

16. **auto-evolution**
    *   **打包技能:** `node /Users/wilson/.openclaw/workspace/skills/auto-evolution/scripts/pack-skill.js --skill_name "my-new-skill"`
    *   **心跳检测:** `node /Users/wilson/.openclaw/workspace/skills/auto-evolution/scripts/heartbeat-wilson.js` (模拟 Agent 心跳)
17. **improvement-protocol**
    *   (此处为空，因未找到独立模块，需集成到相关流程中或进行开发)

## 3. 分阶段上线计划

### Phase A（立即可测试）

这些模块已经比较成熟，可以独立进行功能测试。

*   **imap-smtp-email**: 核心邮件收发功能。
*   **Farreach 知识库**: 内容的可用性和检索性。
*   **quotation-workflow**: 独立生成报价单。
*   **pricing-engine**: 价格计算的准确性。
*   **sales-dashboard**: 基础数据采集与报告生成。
*   **auto-evolution**: 技能打包等基础运维功能。

**测试目标:** 验证每个模块的基础功能是否按照预期工作，不考虑与其他模块的交互。

### Phase B（需要集成测试）

这些模块通常需要与 Phase A 中的模块或自身进行集成，以验证其端到端工作流。

*   **okki-sync.js**: 与 `imap-smtp-email` (处理邮件关联 OKKI) 和 `quotation-workflow` (生成报价单后同步 OKKI) 集成。
*   **email-smart-reply**: 意图识别、知识库检索、回复生成，需验证与 `Farreach 知识库` 的集成以及邮件处理流程。
*   **follow-up-engine**: 与 `okki-sync.js` (从 OKKI 获取客户状态) 和 `imap-smtp-email` (发送跟进邮件) 集成。
*   **campaign-tracker**: 归档开发信、匹配回复、生成报告，验证其与邮件发送模块的集成。
*   **order-tracker**: 订单状态更新、通知，验证与 `logistics-tracker` (获取物流状态) 及 `imap-smtp-email` (邮件通知) 的集成。
*   **approval-engine**: 审批流程，验证与 `quotation-workflow` (报价审批) 和 `email-smart-reply` (回复审批) 的集成，以及 Discord 通知。
*   **logistics-tracker**: 物流追踪与客户推送，验证与 `order-tracker` (获取订单信息) 和 `multi-channel-hub` (客户通知) 的集成。
*   **multi-channel-hub**: 统一消息处理，验证与 `email-smart-reply` 和 `logistics-tracker` 等模块的消息接入。
*   **sample-manager**: 样品管理，验证与 `imap-smtp-email` (发送样品确认) 和 `logistics-tracker` (样品寄送追踪) 的集成。
*   **customer-segmentation**: 客户分层，验证与 `okki-sync.js` (获取客户数据) 和 `follow-up-engine` (差异化跟进策略) 的集成。

**测试目标:** 验证模块间数据流和功能交互的正确性。

### Phase C（需要外部配置）

这些模块需要外部 API Key 或第三方服务配置才能完全运行。

*   **imap-smtp-email**: 网易企业邮的 IMAP/SMTP 凭证。
*   **okki-sync.js**: OKKI CRM 的 API 凭证。
*   **email-smart-reply**: LLM 服务（如 Gemini API 或本地 Ollama 模型）配置。
*   **pricing-engine**: 铜价/汇率查询的外部 API Key。
*   **logistics-tracker**: 17Track API Key。
*   **approval-engine**: Discord Bot Token 和相关频道 ID。

**测试目标:** 验证所有外部服务连接的可用性，以及数据交换的准确性。

## 4. 工作流编排设计 (明天要做的)

我们将使用 OpenClaw Agent 或自定义的编排脚本来将上述模块串联成一条条自动化业务流程。核心思想是事件驱动和模块化。

**高层设计考虑：**

*   **事件触发:** 例如，新邮件、OKKI CRM 数据更新、定时任务、外部 API Hook。
*   **数据流:** 模块间通过标准化的数据结构进行输入/输出传递。
*   **异常处理:** 利用 `approval-engine` 的异常检测和恢复机制，以及 Discord 通知。
*   **可配置性:** 关键业务逻辑（如审批规则、跟进策略）通过配置而非硬编码实现。
*   **监控与日志:** 所有模块的操作都应有详细日志，并集成到统一的监控仪表盘 (sales-dashboard) 中。

具体的编排脚本和触发机制将在后续详细设计。例如，使用 `process` 工具的 `yieldMs` 和 `background` 模式，结合 `exec` 调用各个模块的脚本或 API。

## 5. 风险评估与降低策略

| 风险点                 | 描述                                                       | 影响程度 | 降低策略                                                              |
| :--------------------- | :--------------------------------------------------------- | :------- | :-------------------------------------------------------------------- |
| **外部 API 稳定性**      | OKKI、17Track、LLM 服务、汇率接口不稳定或限流。            | 高       | 1. 重试机制 (利用 `retry-handler`)。 2. 缓存策略。 3. 备用 API。 4. 熔断机制。|
| **数据一致性问题**     | 多系统（邮件、OKKI、内部系统）数据同步延迟或冲突。         | 高       | 1. 事务性操作设计。 2. 幂等性保证。 3. 冲突解决策略。 4. 定期数据核对。|
| **规则引擎配置错误**     | 审批规则、跟进规则等配置错误导致业务逻辑偏差。             | 中高     | 1. 配置版本管理。 2. 配置单元测试。 3. 配置审核流程。 4. A/B 测试小流量上线。|
| **LLM 回复质量**         | 智能回复不准确、不恰当或遗漏关键信息。                     | 中高     | 1. 人工审核 (Discord 审核机制)。 2. 少量生产数据验证。 3. 用户反馈机制。 4. Prompt Engineering 持续优化。|
| **性能瓶颈**             | 大量请求或复杂计算导致系统响应慢。                         | 中       | 1. 压力测试。 2. 异步处理。 3. 资源扩展。 4. 瓶颈分析和优化。       |
| **安全与权限问题**       | API Key 泄露、系统权限配置不当导致数据泄漏或误操作。       | 高       | 1. 严格权限管理。 2. 凭证加密存储。 3. 最小权限原则。 4. 定期安全审计。|
| **依赖模块故障**         | 某个核心模块（如邮件收发）故障导致整个工作流中断。         | 高       | 1. 模块间解耦。 2. 监控告警。 3. 降级策略。 4. 快速回滚机制。       |
| **日志与追踪不足**       | 出现问题时，难以快速定位和诊断。                           | 中       | 1. 统一日志系统。 2. 分布式追踪。 3. 详细错误信息记录。           |

## 6. 建议的第一个端到端测试场景

**场景描述:** 客户询盘处理自动化

**目标:** 验证从接收询盘邮件到最终处理，并将结果同步到 OKKI CRM 的完整自动化流程。

**详细流程:**

1.  **收到询价邮件 (imap-smtp-email):**
    *   通过 `imap-smtp-email` 模块的 `auto-capture.js` 模拟接收一封包含产品询价的邮件。
    *   `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/auto-capture.js check --unseen`
2.  **邮件意图识别 (email-smart-reply):**
    *   `email-smart-reply` 模块识别邮件意图为 "quotation_request"。
    *   `node /Users/wilson/.openclaw/workspace/skills/email-smart-reply/scripts/intent-recognition.js "Customer asks for HDMI 2.1 quotation"`
3.  **知识库检索 (email-smart-reply + Farreach 知识库):**
    *   `email-smart-reply` 从 `Farreach 知识库` 检索相关产品信息（如 HDMI 2.1 规格、MOQ、交期）。
    *   `node /Users/wilson/.openclaw/workspace/skills/email-smart-reply/scripts/kb-retrieval.js "HDMI 2.1 MOQ and lead time"`
4.  **价格计算 (pricing-engine):**
    *   根据客户询价和检索到的信息，`pricing-engine` 计算初步报价。
    *   `node /Users/wilson/.openclaw/workspace/skills/pricing-engine/scripts/pricing-engine.js --product "HDMI 2.1" --quantity 500 --customer_level "New"`
5.  **报价单生成 (quotation-workflow):**
    *   `quotation-workflow` 根据计算结果生成 HTML 和 PDF 格式的报价单。
    *   `bash /Users/wilson/.openclaw/workspace/skills/quotation-workflow/scripts/generate-all.sh /tmp/e2e_quote_data.json` (提供模拟数据)
6.  **生成回复草稿 (email-smart-reply):**
    *   `email-smart-reply` 结合报价单内容生成邮件回复草稿。
    *   `node /Users/wilson/.openclaw/workspace/skills/email-smart-reply/scripts/reply-generation.js --intent "quotation_request" --kb_result "..." --quotation_file "/path/to/quote.pdf"`
7.  **人工审核 (email-smart-reply + approval-engine):**
    *   生成的回复草稿和报价单推送到 Discord 渠道，由人工进行审核。如果金额超限，`approval-engine` 触发审批流程。
    *   `node /Users/wilson/.openclaw/workspace/skills/email-smart-reply/scripts/discord-review.js --email_uid ... --reply ... --attachments ...`
8.  **发送回复邮件 (imap-smtp-email):**
    *   审核通过后，`imap-smtp-email` 发送包含报价单的回复邮件给客户。
    *   `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/scripts/smtp.js send --to "customer@example.com" --subject "Your Quotation" --body-file "/tmp/final_reply.html" --attach "/path/to/quote.pdf"`
9.  **同步 OKKI CRM (okki-sync.js):**
    *   客户信息、询盘内容、发送的报价单和邮件跟进记录自动同步到 OKKI CRM。
    *   `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/okki-sync.js quotation '{"dataFile":"/tmp/e2e_quote_data.json","quotationNo":"QT-E2E-001"}'` (触发同步)
    *   `node /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/okki-sync.js email '{"emailUid": "...", "direction": "out", "subject": "..."}'` (触发邮件跟进同步)
10. **触发跟进自动化 (follow-up-engine):**
    *   根据客户回复情况，`follow-up-engine` 触发后续的自动化跟进任务。
    *   `node /Users/wilson/.openclaw/workspace/skills/follow-up-engine/scripts/okki-integration.js trigger_follow_up --company_id "OKKI-CID-XYZ" --event_type "quotation_sent"`

**验证点:**
*   所有步骤无缝衔接。
*   数据在模块间正确传递和转换。
*   OKKI CRM 中客户信息和跟进记录正确更新。
*   Discord 审批和通知按预期工作。
*   邮件发送和接收成功。
*   关键决策点（如审批）符合业务规则。
