import type { InboundEmail, KeyMetrics, ReplyOption, ReplyStyle } from "@/types/inbox";

const EMAIL_TRANSLATIONS_ZH: Record<string, string> = {
  "email-001": `Wilson 你好，

感谢你 5 月 8 日发来的报价。我们已经和采购团队复核了价格，但目前价格超出了本季度预算。

我们 Q3 推出计划需要 5,000 条 2 米 DisplayPort 线和 8,000 条 1 米 USB-C 线。目标价格是 DisplayPort 每条 USD 2.80，USB-C 每条 USD 1.60。

我们一直在和深圳的一家供应商合作，对方报价略低，但我们更看重你们的 CE/RoHS 认证和交付可靠性。能否重新考虑价格？

我们需要在 5 月 20 日前确定供应商。

此致，
Hans Mueller
高级采购经理
TechKabel GmbH，慕尼黑`,
  "email-002": `Wilson 你好，

我们现在有一个紧急情况。现有 HDMI 供应商刚通知我们，由于生产问题无法完成 6 月订单。我们需要 2,000 条 2 米 HDMI 2.1 线，规格为 48Gbps，并在 6 月 1 日前送到洛杉矶仓库。

标准规格为：48Gbps、4K@120Hz、支持 eARC、尼龙编织外被、镀金接头。我们以前向你们下过订单（PO #AV-2024-089），所以你们应该已有我们的规格记录。

只要供应商真的能交付，预算可以灵活。请确认：
1. 能否满足 6 月 1 日交期？
2. 2,000 条的最佳价格是多少？
3. 是现货还是需要生产？

这件事时间敏感，请在 24 小时内回复。

Sarah Chen
采购副总裁
AV Pro Solutions，洛杉矶`,
  "email-003": `Wilson 先生：

我是 Nippon AV Systems 的田中健二。我们正在为 2026 年 Q4 上市的新 USB4 Gen 3 线缆产品线评估供应商。

我们的要求非常严格：
- USB4 Gen 3x2（40Gbps）认证
- 日本市场 PSE 认证
- 弯折测试：至少 10,000 次
- 工作温度：-20°C 到 70°C
- 包装：单独零售盒，并带二维码

我们有兴趣先下 1,000 条测试订单。如果质量符合标准，年采购量可能超过 50,000 条。

请提供：
1. 技术规格书
2. 测试报告（最好有 USB-IF 认证）
3. 1,000 条样品订单价格
4. 你们的质量控制流程

我们非常重视质量，过去曾因为细小偏差拒绝过供应商。

此致，
田中健二
产品开发经理
Nippon AV Systems Co., Ltd.`,
  "email-004": `Wilson 你好，

我们正在为迪拜一个大型酒店翻新项目采购线缆。项目需要：

- HDMI 2.0 线：3,000 条（1 米、2 米、3 米、5 米多种长度）
- DisplayPort 1.4 线：1,500 条（1 米、2 米）
- 总预算约 USD 25,000

项目时间紧，需要在 6 月 15 日前交付到迪拜。我们可以安排自己的货代从你们工厂提货。

付款方式：我们倾向 30% 定金 + 70% 凭提单副本付款。我们以前和中国供应商合作过，了解流程。

请按这个数量给出你们最好的价格。我们目前正在比较 3 家供应商。

Ahmed Al-Rashid
采购总监
Gulf Tech Solutions，迪拜`,
  "email-005": `Wilson 你好，

我需要反馈上一批订单的质量问题（PO #UK-2026-034，500 条 HDMI 2.1 线）。我们发现约 8% 的线缆（大约 40 条）在接头端有间歇性连接问题。技术人员怀疑应力释放部位压接不到位。

这给我们的终端客户造成了一些尴尬。我们需要解决方案。

话虽如此，我仍然想继续下新订单。我们现在有 800 条 HDMI 2.1 和 400 条 USB-C 3.2 Gen 2 的需求。但在此之前，我需要确认质量问题已经被解决。

请确认：
1. 是否能安排更换 40 条不良品
2. 说明问题原因，以及你们如何修复
3. 提供新订单报价

如果这件事能被专业处理，我愿意继续合作。

James Whitfield
技术总监
ProAV UK Ltd，伦敦`,
};

const POINT_ZH: Record<string, string> = {
  "5,000 pcs DP cables + 8,000 pcs USB-C cables": "5,000 条 DP 线 + 8,000 条 USB-C 线。",
  "Target price: $2.80 DP / $1.60 USB-C": "目标价：DP USD 2.80/条，USB-C USD 1.60/条。",
  "Decision deadline: May 20th": "客户需要在 5 月 20 日前确定供应商。",
  "Competitor offer exists but prefers our certifications": "已有竞品报价，但客户更认可我方认证。",
  "Q3 rollout — repeat orders likely": "Q3 项目上线，后续复购概率较高。",
  "2,000 pcs HDMI 2.1 (2m, 48Gbps) needed urgently": "紧急需要 2,000 条 2 米 HDMI 2.1，48Gbps。",
  "Delivery deadline: June 1 to LA warehouse": "需在 6 月 1 日前送达洛杉矶仓库。",
  "Existing customer — PO #AV-2024-089 on file": "老客户，已有 PO #AV-2024-089 规格记录。",
  "Budget flexible — prioritizing delivery reliability": "预算可灵活，客户优先看交付可靠性。",
  "24-hour reply window requested": "客户要求 24 小时内回复。",
  "USB4 Gen 3x2 (40Gbps) with PSE certification required": "要求 USB4 Gen 3x2（40Gbps）并具备 PSE 认证。",
  "Initial 1,000 pcs test order → 50,000+ pcs annual potential": "先测 1,000 条，若通过质量验证，年采购潜力超过 50,000 条。",
  "Strict quality standards — has rejected suppliers before": "质量标准严格，过去曾拒绝不合格供应商。",
  "Q4 2026 launch timeline": "产品计划 2026 年 Q4 上市。",
  "Needs: spec sheet, test reports, sample pricing, QC process": "需要规格书、测试报告、样品价和质检流程说明。",
  "3,000 pcs HDMI 2.0 + 1,500 pcs DP 1.4 (mixed lengths)": "3,000 条 HDMI 2.0 + 1,500 条 DP 1.4，多种长度。",
  "Total budget ~$25,000": "总预算约 USD 25,000。",
  "Dubai delivery by June 15": "需要 6 月 15 日前交付到迪拜。",
  "30/70 payment terms requested": "客户希望 30% 定金 + 70% 凭提单副本付款。",
  "Comparing 3 suppliers — competitive situation": "客户正在比较 3 家供应商，竞争明确。",
  "8% defect rate (40 pcs) — strain relief crimping issue": "上一单约 8% 不良，约 40 条，疑似接头应力释放压接问题。",
  "PO #UK-2026-034 affected": "受影响订单为 PO #UK-2026-034。",
  "New order ready: 800 pcs HDMI 2.1 + 400 pcs USB-C 3.2": "客户仍有新订单需求：800 条 HDMI 2.1 + 400 条 USB-C 3.2。",
  "Customer willing to continue if handled professionally": "如果处理专业，客户愿意继续合作。",
  "Reputation damage with end clients": "质量问题已影响客户对终端客户的交付声誉。",
};

const STYLE_LABELS: Record<ReplyStyle, { en: string; zh: string }> = {
  steady: { en: "Steady", zh: "稳妥回复" },
  aggressive: { en: "Aggressive", zh: "强势推进" },
  creative: { en: "Creative", zh: "差异化方案" },
};

const STYLE_SUBTITLES: Record<ReplyStyle, { en: string; zh: string }> = {
  steady: { en: "Control risk and protect the relationship.", zh: "控制风险，保护客户关系和利润空间。" },
  aggressive: { en: "Push the deal forward with stronger terms.", zh: "用更强条件推动成交，但需要复核利润和风险。" },
  creative: { en: "Use a differentiated proposal to avoid pure price competition.", zh: "用分阶段、增值服务或合作方案避开单纯比价。" },
};

const STYLE_OUTLINES: Record<ReplyStyle, { en: string[]; zh: string[] }> = {
  steady: {
    en: ["Acknowledge the customer request.", "Protect margin and delivery reliability.", "Offer a controlled concession.", "Ask for clear next confirmation."],
    zh: ["先确认客户诉求和关键限制。", "强调质量、认证和交付可靠性。", "给出可控让步，避免过度承诺。", "明确请客户确认下一步。"],
  },
  aggressive: {
    en: ["Respond quickly and directly.", "Use stronger price, timing, or priority terms.", "Create a clear decision window.", "Keep confirmation checks on risky promises."],
    zh: ["快速直接回应客户。", "用更强的价格、交期或优先排产条件推进。", "设置明确决策窗口。", "高风险承诺必须保留确认流程。"],
  },
  creative: {
    en: ["Reframe the deal away from simple price matching.", "Offer staged delivery, samples, or value-adds.", "Build trust through transparency.", "Position Farreach as a long-term partner."],
    zh: ["把讨论从单纯比价转向总价值。", "提供分阶段交付、样品或增值服务。", "用透明质检、视频验厂等方式建立信任。", "把 Farreach 定位成长期合作伙伴。"],
  },
};

const STYLE_OUTCOMES: Record<ReplyStyle, { en: string; zh: string }> = {
  steady: { en: "Most balanced path: protects trust while keeping the deal moving.", zh: "最稳妥：保护信任，同时继续推进订单。" },
  aggressive: { en: "Best for speed or competitive pressure, but needs margin review.", zh: "适合抢时间或强竞争场景，但需要复核利润。" },
  creative: { en: "Best when the customer needs confidence, differentiation, or a lower-risk path.", zh: "适合需要信任、差异化或低风险推进的客户。" },
};

const METRIC_VALUE_ZH: Record<string, string> = {
  "5% off": "5%",
  "12% off": "12%",
  "8% blended": "综合 8%",
  "0% (rush premium)": "0%（急单溢价）",
  "-8% (rush surcharge)": "-8%（急单加价）",
  "5% vs rush rate": "比急单价低 5%",
  "0% (sample pricing)": "0%（样品价）",
  "10% below market": "低于市场价 10%",
  "5% + volume tiers": "5% + 阶梯价",
  "8% off list": "目录价 8%",
  "14% off list": "目录价 14%",
  "5% off list": "目录价 5%",
  "5% on new order": "新订单 5%",
  "10% on new order + 5% credit": "新订单 10% + 5% 抵扣",
  "7% on new order": "新订单 7%",
  "Free 20-pc sample set": "免费 20 件样品套装",
  "12-month framework agreement": "12 个月框架协议",
  "Co-branding + factory visit invite": "联合品牌 + 邀请验厂",
  "DHL Express, 50% deposit": "DHL 快递，50% 定金",
  "Delivery guarantee + upsell": "交付保障 + 加购方案",
  "Split shipment + customs docs": "分批发货 + 报关资料",
  "30-day quality guarantee": "30 天质量保证",
  "Free 20-pc samples + 2yr price lock": "免费 20 件样品 + 2 年锁价",
  "OEM + Japanese docs": "OEM + 日文资料",
  "Custom hotel labeling": "酒店定制标签",
  "25/75 terms + free labels": "25/75 付款 + 免费标签",
  "Pre-labeled + Arabic labels + testing report": "预贴标 + 阿文标签 + 测试报告",
  "50 pcs replacement + 100% connector test": "补 50 件 + 100% 接头测试",
  "Combined shipment + account QC": "合并发货 + 客户专属 QC",
  "Video QC + premium upgrade replacement": "视频 QC + 升级款替换",
};

const URGENCY_LABELS: Record<string, { en: string; zh: string }> = {
  urgent: { en: "Urgent", zh: "紧急" },
  high: { en: "High", zh: "高优先级" },
  medium: { en: "Normal", zh: "正常" },
  low: { en: "Low", zh: "低优先级" },
};

const INTENT_LABELS: Record<string, { en: string; zh: string }> = {
  inquiry: { en: "Inquiry", zh: "询盘" },
  inquiry_rfq: { en: "RFQ", zh: "询盘/RFQ" },
  technical: { en: "Technical", zh: "技术咨询" },
  order: { en: "Order", zh: "订单" },
  order_confirm: { en: "Order Confirmation", zh: "订单确认" },
  negotiation: { en: "Negotiation", zh: "价格谈判" },
  complaint: { en: "Complaint", zh: "质量投诉" },
  logistics: { en: "Logistics", zh: "物流交付" },
  follow_up: { en: "Follow-up", zh: "跟进" },
  general: { en: "General", zh: "一般邮件" },
  other: { en: "Other", zh: "其他" },
};

const SENTIMENT_LABELS: Record<string, { en: string; zh: string }> = {
  positive: { en: "Positive", zh: "正向" },
  neutral: { en: "Neutral", zh: "中性" },
  negative: { en: "Negative", zh: "负向" },
};

export function chineseEmailTranslation(email: Pick<InboundEmail, "id" | "body_text">) {
  return EMAIL_TRANSLATIONS_ZH[email.id] || "这封邮件暂无本地中文译文。接入翻译模型后，Jaden 会在这里生成完整中文译文。";
}

export function localizedUrgency(value: string | undefined, language: "en" | "zh") {
  const key = value || "medium";
  return URGENCY_LABELS[key]?.[language] || key;
}

export function localizedIntent(value: string | undefined, language: "en" | "zh") {
  const key = value || "other";
  return INTENT_LABELS[key]?.[language] || key;
}

export function localizedSentiment(value: string | undefined, language: "en" | "zh") {
  const key = value || "neutral";
  return SENTIMENT_LABELS[key]?.[language] || key;
}

export function localizedAnalysisPoint(point: string, language: "en" | "zh") {
  if (language !== "zh") return point;
  return POINT_ZH[point] || point;
}

export function localizedReplyTitle(option: Pick<ReplyOption, "style" | "title">, language: "en" | "zh") {
  return STYLE_LABELS[option.style]?.[language] || option.title;
}

export function localizedReplySubtitle(option: Pick<ReplyOption, "style" | "subtitle">, language: "en" | "zh") {
  if (language !== "zh") return option.subtitle;
  return STYLE_SUBTITLES[option.style]?.zh || option.subtitle;
}

export function localizedReplyOutline(option: Pick<ReplyOption, "style" | "outline">, language: "en" | "zh") {
  if (language !== "zh") return option.outline;
  return STYLE_OUTLINES[option.style]?.zh || option.outline;
}

export function localizedExpectedOutcome(option: Pick<ReplyOption, "style" | "expected_outcome">, language: "en" | "zh") {
  if (language !== "zh") return option.expected_outcome;
  return STYLE_OUTCOMES[option.style]?.zh || option.expected_outcome;
}

export function localizedKeyMetricValue(
  metric: keyof KeyMetrics,
  value: string,
  language: "en" | "zh"
) {
  if (language !== "zh") return value;
  if (METRIC_VALUE_ZH[value]) return METRIC_VALUE_ZH[value];
  if (metric === "lead_time") {
    return value
      .replace(/\b(\d+)\s+days?\b/gi, "$1 天")
      .replace(/\bfirst batch\b/gi, "首批")
      .replace(/\bcombined\b/gi, "合并交付")
      .replace(/\bcustom\b/gi, "定制")
      .replace(/\bMay\b/gi, "5 月")
      .replace(/\bJune\b/gi, "6 月");
  }
  return value
    .replace(/\bFree\b/gi, "免费")
    .replace(/\bsamples?\b/gi, "样品")
    .replace(/\bsample set\b/gi, "样品套装")
    .replace(/\bmonths?\b/gi, "个月")
    .replace(/\bframework agreement\b/gi, "框架协议")
    .replace(/\bdelivery guarantee\b/gi, "交付保障")
    .replace(/\bquality guarantee\b/gi, "质量保证");
}
