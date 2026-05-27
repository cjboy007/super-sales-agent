export type BattleTone = "safe" | "pending" | "risk" | "processing" | "intel" | "neutral";

export type BattleLanguage = "en" | "zh";

export type DealStatus = "active" | "pending" | "risk" | "monitoring" | "won";

export interface DomainAccount {
  id: string;
  account: string;
  location: string;
  dealCode: string;
  product: string;
  value: string;
  annualValue: string;
  status: DealStatus;
  statusLabel: string;
  tone: BattleTone;
  risk: string;
  confidence: number;
  agentStatus: string;
  lastTouch: string;
  nextAction: string;
  summary: string;
  tags: string[];
}

export interface TimelineEvent {
  id: string;
  time: string;
  type: "approval" | "ai" | "alert" | "quote" | "intel" | "completed";
  tone: BattleTone;
  account: string;
  title: string;
  body: string;
  tags: string[];
  dealId?: string;
  approvalId?: string;
}

export interface ApprovalRequest {
  id: string;
  dealId: string;
  account: string;
  title: string;
  value: string;
  risk: string;
  due: string;
  recommendation: string;
  guardrail: string;
}

export interface ActiveAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  tone: BattleTone;
  load: number;
  currentTask: string;
  queue: number;
}

export interface EmailMessage {
  id: string;
  sender: string;
  initials: string;
  role: "customer" | "farreach" | "ai";
  timestamp: string;
  body: string[];
  quote?: Array<[string, string]>;
}

export interface AnalysisBlock {
  title: string;
  rows?: Array<[string, string, BattleTone?]>;
  body?: string;
  tags?: string[];
}

export interface FocusCase {
  dealId: string;
  approvalId: string;
  title: string;
  threadSummary: string;
  subject: string;
  draft: string;
  messages: EmailMessage[];
  analysis: AnalysisBlock[];
}

export interface ModuleLink {
  label: string;
  href: string;
  hotkey: string;
}

export interface BattleStationCopy {
  topBar: {
    title: string;
    activeAgents: (count: number) => string;
    feedReconnecting: string;
    sessionEvents: (count: number) => string;
  };
  language: {
    english: string;
    chinese: string;
  };
  domain: {
    title: string;
    live: string;
    monitoredDomains: (count: number) => string;
    deal: string;
    value: string;
    agent: string;
    confidence: string;
    review: string;
    edit: string;
    reject: string;
  };
  timeline: {
    title: string;
    eventsVisible: (count: number) => string;
    filters: Record<TimelineEvent["type"] | "all", string>;
    eventTypes: Record<TimelineEvent["type"], string>;
    openFocusMode: string;
  };
  commandCenter: {
    title: string;
    meta: string;
    dealValue: string;
    risk: string;
    nextAction: string;
    pendingApprovals: string;
    open: string;
    value: string;
    due: string;
    reviewInFocus: string;
    keyStats: string;
    statLabels: {
      leads: string;
      emails: string;
      quotes: string;
      winRate: string;
    };
    activeAgents: string;
  };
  quickCommand: {
    placeholder: string;
    queue: string;
    queued: string;
  };
  focus: {
    back: string;
    focusPrefix: string;
    humanApprovalRequired: string;
    emailThread: string;
    aiAnalysis: string;
    aiAnalysisMeta: string;
    draftEditor: string;
    draftEditorMeta: string;
    subject: string;
    approvalGate: string;
    blocked: string;
    approvalGateBody: string;
    approveSend: string;
    saveDraft: string;
    regenerate: string;
    reject: string;
    sendGuardrail: string;
    collapsedMessages: string;
  };
  approvalStates: Record<string, string>;
  regeneratedNote: string;
}

export const domainAccounts: DomainAccount[] = [
  {
    id: "te-connectivity",
    account: "TE Connectivity",
    location: "Suzhou / Munich",
    dealCode: "RFQ-2026-0517",
    product: "UL1007, UL1015, 3139 series",
    value: "$2.4M",
    annualValue: "$7.8M ARR potential",
    status: "active",
    statusLabel: "ACTIVE",
    tone: "safe",
    risk: "Low",
    confidence: 72,
    agentStatus: "Negotiating pricing tier",
    lastTouch: "12m ago",
    nextAction: "Send tier-2 quote once copper check completes",
    summary: "47 SKUs matched to Farreach catalog. Margin forecast is above target with volume-tier pricing.",
    tags: ["RFQ", "Catalog match", "Tier 2"],
  },
  {
    id: "amphenol",
    account: "Amphenol Asia",
    location: "Shenzhen",
    dealCode: "PO-88392",
    product: "UL1007 22AWG",
    value: "$847K",
    annualValue: "$3.4M annual run rate",
    status: "pending",
    statusLabel: "PENDING",
    tone: "pending",
    risk: "Medium",
    confidence: 87,
    agentStatus: "Drafted counter-offer",
    lastTouch: "3m ago",
    nextAction: "Wilson approval required before customer-facing send",
    summary: "AI recommends 8% discount plus free shipping on >=100K meter batches with LME review clause.",
    tags: ["Human approval", "Counter-offer", "Pricing"],
  },
  {
    id: "molex",
    account: "Molex Shanghai",
    location: "Shanghai",
    dealCode: "Renewal-0601",
    product: "XH connector cables",
    value: "$1.1M",
    annualValue: "$4.2M renewal",
    status: "risk",
    statusLabel: "AT RISK",
    tone: "risk",
    risk: "High",
    confidence: 34,
    agentStatus: "Competitor quote detected",
    lastTouch: "18m ago",
    nextAction: "Bundle 3139 custom lengths and propose supply continuity credit",
    summary: "JST quote appears 18% below standing price. Procurement signaled review before June renewal.",
    tags: ["Competitor", "Renewal", "Escalate"],
  },
  {
    id: "foxconn",
    account: "Foxconn Precision",
    location: "Kunshan",
    dealCode: "Aurora-7 BOM",
    product: "Wire harness + connectors",
    value: "$340K",
    annualValue: "$1.0M program upside",
    status: "monitoring",
    statusLabel: "MONITORING",
    tone: "processing",
    risk: "Low",
    confidence: 61,
    agentStatus: "Scraping BOM data",
    lastTouch: "45m ago",
    nextAction: "Prepare first-touch outreach for 18 matched SKUs",
    summary: "23 cable and connector line items extracted; 18 map to Farreach SKUs.",
    tags: ["BOM", "Outreach", "New program"],
  },
  {
    id: "luxshare",
    account: "Luxshare ICT",
    location: "Kunshan",
    dealCode: "PO-77531",
    product: "3139 silicone wire",
    value: "$1.2M",
    annualValue: "$2.6M active account",
    status: "won",
    statusLabel: "WON",
    tone: "safe",
    risk: "Closed",
    confidence: 100,
    agentStatus: "Production slot reserved",
    lastTouch: "1h ago",
    nextAction: "Monitor W22-W24 production and shipping docs",
    summary: "AI handled workflow end-to-end after human pricing approval. Delivery ETA 2026-06-15.",
    tags: ["Confirmed PO", "Production", "Documents"],
  },
  {
    id: "market-intel",
    account: "Market Intel",
    location: "Copper / compliance / export",
    dealCode: "INTEL-FEED",
    product: "Pricing and competitor signals",
    value: "+2.3%",
    annualValue: "Margin watch",
    status: "monitoring",
    statusLabel: "FEED",
    tone: "intel",
    risk: "Watch",
    confidence: 78,
    agentStatus: "Tracking copper and REACH movement",
    lastTouch: "live",
    nextAction: "Review UL1015 margin assumptions after LME close",
    summary: "Copper LME +2.3%; Shenzhen cable export volume -5.1% MoM; phthalate draft under review.",
    tags: ["Copper", "REACH", "Export"],
  },
];

export const timelineEvents: TimelineEvent[] = [
  {
    id: "evt-rfq-analysis",
    time: "09:12",
    type: "ai",
    tone: "safe",
    account: "TE Connectivity",
    title: "AI Agent completed RFQ analysis",
    body: "47 SKUs matched to Farreach catalog. Recommended pricing at Tier 2 for >=500K unit lots. Forecast margin: 23.4%.",
    tags: ["UL1007", "UL1015", "3139", "+44"],
    dealId: "te-connectivity",
  },
  {
    id: "evt-amphenol-approval",
    time: "09:09",
    type: "approval",
    tone: "pending",
    account: "Amphenol Asia",
    title: "Approval required: Amphenol counter-offer",
    body: "Customer requested 12% discount. AI generated counter-offer: 8% discount + free shipping on >=100K meter batches. Net margin impact: -3.9pts.",
    tags: ["Human gate", "$847K", "Margin floor"],
    dealId: "amphenol",
    approvalId: "amphenol-counter",
  },
  {
    id: "evt-molex-risk",
    time: "08:54",
    type: "alert",
    tone: "risk",
    account: "Molex Shanghai",
    title: "Competitor alert: JST quote detected",
    body: "JST appears 18% below standing price for XH connector cables. Suggested response: bundle pricing with 3139 custom lengths and continuity terms.",
    tags: ["Competitor", "-18%", "Renewal"],
    dealId: "molex",
  },
  {
    id: "evt-foxconn-bom",
    time: "08:30",
    type: "ai",
    tone: "processing",
    account: "Foxconn Precision",
    title: "BOM scrape complete",
    body: "Extracted 23 cable and connector line items from project Aurora-7. 18 match Farreach SKUs. Outreach draft is being prepared.",
    tags: ["BOM", "18 matches", "$340K"],
    dealId: "foxconn",
  },
  {
    id: "evt-copper",
    time: "08:18",
    type: "intel",
    tone: "intel",
    account: "Market Intel",
    title: "Copper watch moved above threshold",
    body: "LME copper +2.3% intraday. AI recommends reviewing UL1015 and UL3139 quotes above 500K meter volume.",
    tags: ["LME", "Pricing", "Margin"],
    dealId: "market-intel",
  },
  {
    id: "evt-luxshare",
    time: "07:45",
    type: "completed",
    tone: "safe",
    account: "Luxshare ICT",
    title: "Luxshare PO confirmed",
    body: "3139 series, 2.1M meters. Production slot reserved for W22-W24. Shenzhen to Kunshan delivery ETA: 2026-06-15.",
    tags: ["PO confirmed", "$1.2M", "Docs next"],
    dealId: "luxshare",
  },
];

export const approvalRequests: ApprovalRequest[] = [
  {
    id: "amphenol-counter",
    dealId: "amphenol",
    account: "Amphenol Asia",
    title: "Counter-offer and LME clause",
    value: "$847K quarterly PO",
    risk: "Medium margin exposure",
    due: "Now",
    recommendation: "Approve 8% discount at $0.916/m with quarterly LME review.",
    guardrail: "External send is blocked until Wilson approves this draft.",
  },
  {
    id: "molex-retention",
    dealId: "molex",
    account: "Molex Shanghai",
    title: "Renewal retention strategy",
    value: "$4.2M annual renewal",
    risk: "Competitor undercut",
    due: "Today 16:00",
    recommendation: "Ask AI to prepare bundle pricing, then review before sending.",
    guardrail: "No customer-facing message prepared yet.",
  },
  {
    id: "te-tier-two",
    dealId: "te-connectivity",
    account: "TE Connectivity",
    title: "Tier-2 quote release",
    value: "$2.4M RFQ",
    risk: "Low",
    due: "After copper check",
    recommendation: "Approve quote package if LME stays within +3% band.",
    guardrail: "Quote PDFs can be prepared here, but nothing is sent to customers.",
  },
];

export const activeAgents: ActiveAgent[] = [
  {
    id: "pricing-agent",
    name: "Pricing Agent",
    role: "Margin and quote policy",
    status: "active",
    tone: "safe",
    load: 68,
    currentTask: "Recomputing TE tier bands against copper index",
    queue: 4,
  },
  {
    id: "inbox-agent",
    name: "Inbox Agent",
    role: "Email triage and drafts",
    status: "approval-gated",
    tone: "pending",
    load: 42,
    currentTask: "Holding Amphenol counter-offer for Wilson approval",
    queue: 7,
  },
  {
    id: "intel-agent",
    name: "Intel Agent",
    role: "Market and competitor feed",
    status: "watching",
    tone: "intel",
    load: 81,
    currentTask: "Scanning JST, Hengda, copper, REACH signals",
    queue: 11,
  },
  {
    id: "docs-agent",
    name: "Docs Agent",
    role: "Quotations and trade documents",
    status: "processing",
    tone: "processing",
    load: 53,
    currentTask: "Preparing Luxshare delivery document checklist",
    queue: 3,
  },
];

export const focusCases: Record<string, FocusCase> = {
  amphenol: {
    dealId: "amphenol",
    approvalId: "amphenol-counter",
    title: "Amphenol PO-88392 Counter-Offer",
    threadSummary: "8 messages over 3 days",
    subject: "RE: PO-88392 - Revised Pricing & Terms (UL1007 22AWG)",
    draft:
      "Hi Li Wei,\n\nThank you for the feedback on our quotation. We understand the price sensitivity on this volume order and value our 3-year partnership.\n\nWe'd like to propose the following:\n\n- 8% volume discount\n  Unit price: $0.916/m (was $0.996/m)\n  Order total: $778,600\n\n- Free shipping\n  On orders >=100K meters per batch\n  Shenzhen to Amphenol Shenzhen warehouse\n\n- LME-indexed quarterly price review\n  Base copper: $9,600/t\n  +/-$100/t LME movement means +/-0.8% price adjustment\n  This protects both sides from volatility\n\nThis pricing reflects our commitment to long-term partnership while maintaining the quality standards you require: UL certified, RoHS compliant, and 100% spark-tested.\n\nIf this works for you, I'll send the updated PO confirmation today.\n\nBest regards,\nWilson Chen\nFarreach Electronic",
    messages: [
      {
        id: "msg-li-wei",
        sender: "Li Wei - Amphenol Asia",
        initials: "LW",
        role: "customer",
        timestamp: "May 20, 14:23",
        body: [
          "Hi Wilson,",
          "We've received your quote for PO-88392 (UL1007 22AWG, 850,000 meters). The unit price at $0.996/m is above our target. Our previous supplier quoted $0.870/m. Can you reconsider?",
          "This is a quarterly recurring order. We're looking for a long-term partner.",
        ],
      },
      {
        id: "msg-ai-draft",
        sender: "SSA Inbox Agent",
        initials: "AI",
        role: "ai",
        timestamp: "Generated 09:09",
        body: [
          "Proposed 8% volume discount to $0.916/m plus free shipping on >=100K meter batches.",
          "Added copper-indexed quarterly review to protect margin if LME moves outside the agreed band.",
          "Human approval is required before any external customer-facing send.",
        ],
      },
      {
        id: "msg-wilson",
        sender: "Wilson Chen - Farreach",
        initials: "FR",
        role: "farreach",
        timestamp: "May 19, 10:05",
        body: ["Hi Li Wei,", "Attached is our formal quotation for PO-88392:"],
        quote: [
          ["Item", "UL1007 22AWG"],
          ["Qty", "850,000m quarterly"],
          ["Unit Price", "$0.996/m"],
          ["Total", "$846,600"],
          ["Lead Time", "14 days"],
          ["Terms", "Net 60"],
        ],
      },
    ],
    analysis: [
      {
        title: "Deal Context",
        rows: [
          ["Customer", "Amphenol Asia (Shenzhen)"],
          ["Order Value", "$847K quarterly", "safe"],
          ["Annual Run Rate", "~$3.4M", "safe"],
          ["Relationship", "3 years, 12 prior POs"],
          ["Payment History", "On-time, no disputes", "safe"],
        ],
      },
      {
        title: "Price Analysis",
        rows: [
          ["Our quote", "$0.996/m"],
          ["Their target", "$0.870/m (-12.6%)", "risk"],
          ["AI counter-offer", "$0.916/m (-8.0%)", "pending"],
          ["Floor price (cost+8%)", "$0.891/m"],
          ["Margin at counter", "19.2% (-3.9pts)", "pending"],
        ],
      },
      {
        title: "Competitor Intel",
        body:
          "Likely previous supplier: Shenzhen Hengda Cable. Typical pricing is $0.850-$0.890/m for UL1007 22AWG, but 2025 quality notes include two spark-test failures and limited export certification coverage.",
        tags: ["Farreach advantage: UL certified", "100% tested", "Export ready"],
      },
      {
        title: "Recommendation",
        body:
          "Approve the counter-offer with LME clause. The 8% discount stays above floor and the quarterly index review protects future batches. Losing this account risks spillover into other Amphenol plants.",
        tags: ["Confidence 87%", "Risk medium", "Accept threshold >=$0.900/m"],
      },
    ],
  },
};

export const moduleLinks = [
  { label: "Leads", href: "/leads", hotkey: "L" },
  { label: "Inbox", href: "/inbox", hotkey: "I" },
  { label: "Drafts", href: "/emails", hotkey: "E" },
  { label: "Quotes", href: "/quotations", hotkey: "Q" },
  { label: "Docs", href: "/documents", hotkey: "D" },
  { label: "Intel", href: "/intelligence", hotkey: "N" },
  { label: "Settings", href: "/settings", hotkey: "," },
];

export const battleStationI18n: Record<
  BattleLanguage,
  {
    copy: BattleStationCopy;
    domainAccounts: DomainAccount[];
    timelineEvents: TimelineEvent[];
    approvalRequests: ApprovalRequest[];
    activeAgents: ActiveAgent[];
    focusCases: Record<string, FocusCase>;
    moduleLinks: ModuleLink[];
  }
> = {
  en: {
    copy: {
      topBar: {
        title: "SSA Battle Station",
        activeAgents: (count) => `${count} agents active`,
        feedReconnecting: "event feed reconnecting",
        sessionEvents: (count) => `${count} session events`,
      },
      language: {
        english: "EN",
        chinese: "中文",
      },
      domain: {
        title: "Domain Radar",
        live: "LIVE",
        monitoredDomains: (count) => `${count} monitored domains`,
        deal: "Deal",
        value: "Value",
        agent: "Agent:",
        confidence: "Confidence",
        review: "Review",
        edit: "Edit",
        reject: "Reject",
      },
      timeline: {
        title: "Live Timeline",
        eventsVisible: (count) => `${count} events visible`,
        filters: {
          all: "All",
          approval: "Approvals",
          ai: "AI Actions",
          alert: "Alerts",
          quote: "Quotes",
          intel: "Intel",
          completed: "Done",
        },
        eventTypes: {
          approval: "approval",
          ai: "ai",
          alert: "alert",
          quote: "quote",
          intel: "intel",
          completed: "completed",
        },
        openFocusMode: "Open Focus Mode",
      },
      commandCenter: {
        title: "Command Center",
        meta: "Human gates, stats, active agents",
        dealValue: "Deal value",
        risk: "Risk",
        nextAction: "Next action",
        pendingApprovals: "Pending Approvals",
        open: "open",
        value: "Value",
        due: "Due",
        reviewInFocus: "Review in Focus Mode",
        keyStats: "Key Stats",
        statLabels: {
          leads: "Leads",
          emails: "Emails",
          quotes: "Quotes",
          winRate: "Win Rate",
        },
        activeAgents: "Active Agents",
      },
      quickCommand: {
        placeholder: "Tell SSA what to inspect, draft, compare, or hold for approval...",
        queue: "Ask SSA",
        queued: "saved:",
      },
      focus: {
        back: "Back to Battle Station",
        focusPrefix: "Focus:",
        humanApprovalRequired: "human approval required",
        emailThread: "Email Thread",
        aiAnalysis: "AI Deal Analysis",
        aiAnalysisMeta: "pricing, competitor, margin, recommendation",
        draftEditor: "Draft Editor",
        draftEditorMeta: "customer-facing send is locked",
        subject: "Subject",
        approvalGate: "Approval Gate",
        blocked: "blocked",
        approvalGateBody:
          "SSA may draft, score, and recommend. It cannot send this message to Amphenol until Wilson explicitly approves the final draft in this view.",
        approveSend: "Approve & Send",
        saveDraft: "Save Draft",
        regenerate: "Regenerate with AI",
        reject: "Reject",
        sendGuardrail:
          "Human approval is required before any customer-facing send. In safe mode, this records Wilson's decision without sending email.",
        collapsedMessages:
          "5 earlier messages collapsed: initial inquiry, spec sheet, sample request, compliance check, quote handoff",
      },
      approvalStates: {
        "waiting-human": "needs review",
        "needs-strategy": "needs strategy",
        "ready-after-copper": "ready after copper check",
        "approved-by-wilson": "approved by Wilson",
        "draft-saved": "draft saved",
        "ai-regenerated": "rewritten by AI",
        "rejected-by-wilson": "rejected by Wilson",
      },
      regeneratedNote:
        "Wilson note: Rewritten for a firmer partnership tone. Confirm price floor before sending.",
    },
    domainAccounts,
    timelineEvents,
    approvalRequests,
    activeAgents,
    focusCases,
    moduleLinks,
  },
  zh: {
    copy: {
      topBar: {
        title: "SSA 作战指挥台",
        activeAgents: (count) => `${count} 个 Agent 运行中`,
        feedReconnecting: "事件流重连中",
        sessionEvents: (count) => `${count} 条会话事件`,
      },
      language: {
        english: "EN",
        chinese: "中文",
      },
      domain: {
        title: "客户雷达",
        live: "实时",
        monitoredDomains: (count) => `${count} 个监控对象`,
        deal: "项目",
        value: "金额",
        agent: "Agent:",
        confidence: "置信度",
        review: "复核",
        edit: "编辑",
        reject: "拒绝",
      },
      timeline: {
        title: "实时战况",
        eventsVisible: (count) => `${count} 条事件可见`,
        filters: {
          all: "全部",
          approval: "待审批",
          ai: "AI 动作",
          alert: "警报",
          quote: "报价",
          intel: "情报",
          completed: "完成",
        },
        eventTypes: {
          approval: "审批",
          ai: "AI",
          alert: "警报",
          quote: "报价",
          intel: "情报",
          completed: "完成",
        },
        openFocusMode: "进入聚焦模式",
      },
      commandCenter: {
        title: "指挥中心",
        meta: "人工关卡、关键数据、运行中 Agent",
        dealValue: "项目金额",
        risk: "风险",
        nextAction: "下一步动作",
        pendingApprovals: "待审批事项",
        open: "待处理",
        value: "金额",
        due: "截止",
        reviewInFocus: "进入聚焦模式复核",
        keyStats: "关键指标",
        statLabels: {
          leads: "线索",
          emails: "邮件",
          quotes: "报价",
          winRate: "赢单率",
        },
        activeAgents: "运行中 Agent",
      },
      quickCommand: {
        placeholder: "告诉 SSA 要检查、起草、对比，或锁定等待人工审批的事项...",
        queue: "提交给 SSA",
        queued: "已保存:",
      },
      focus: {
        back: "返回作战指挥台",
        focusPrefix: "聚焦:",
        humanApprovalRequired: "需要人工审批",
        emailThread: "邮件线程",
        aiAnalysis: "AI 交易分析",
        aiAnalysisMeta: "价格、竞品、毛利、建议",
        draftEditor: "草稿编辑器",
        draftEditorMeta: "客户可见发送已锁定",
        subject: "主题",
        approvalGate: "审批关卡",
        blocked: "已阻断",
        approvalGateBody:
          "SSA 可以起草、评分和给出建议，但在 Wilson 明确批准最终草稿之前，不能向 Amphenol 发送这封客户可见邮件。",
        approveSend: "批准并发送",
        saveDraft: "保存草稿",
        regenerate: "让 AI 重写",
        reject: "拒绝",
        sendGuardrail: "任何客户可见发送都必须先经过人工审批。本演示只在本地记录审批状态。",
        collapsedMessages: "已折叠 5 封早期邮件：初始询盘、规格书、样品申请、合规检查、报价交接",
      },
      approvalStates: {
        "waiting-human": "等待人工",
        "needs-strategy": "需要策略",
        "ready-after-copper": "铜价确认后可发",
        "approved-by-wilson": "Wilson 已批准",
        "draft-saved": "草稿已保存",
        "ai-regenerated": "AI 已重写",
        "rejected-by-wilson": "Wilson 已拒绝",
      },
      regeneratedNote: "操作备注：已在本地重写为更坚定的合作语气。发送前请再次确认底价。",
    },
    domainAccounts: [
      {
        id: "te-connectivity",
        account: "TE Connectivity",
        location: "苏州 / 慕尼黑",
        dealCode: "RFQ-2026-0517",
        product: "UL1007、UL1015、3139 系列",
        value: "$2.4M",
        annualValue: "$7.8M 年化潜力",
        status: "active",
        statusLabel: "推进中",
        tone: "safe",
        risk: "低",
        confidence: 72,
        agentStatus: "正在谈判阶梯价",
        lastTouch: "12分钟前",
        nextAction: "铜价检查完成后发送二级阶梯报价",
        summary: "47 个 SKU 已匹配 Farreach 目录。按批量阶梯价测算，毛利高于目标线。",
        tags: ["RFQ", "目录匹配", "二级阶梯"],
      },
      {
        id: "amphenol",
        account: "Amphenol Asia",
        location: "深圳",
        dealCode: "PO-88392",
        product: "UL1007 22AWG",
        value: "$847K",
        annualValue: "$3.4M 年化订单",
        status: "pending",
        statusLabel: "待审批",
        tone: "pending",
        risk: "中",
        confidence: 87,
        agentStatus: "已起草还盘",
        lastTouch: "3分钟前",
        nextAction: "客户可见邮件发送前需要 Wilson 审批",
        summary: "AI 建议 8% 折扣，加上 10 万米以上批次免运费，并加入 LME 季度调价条款。",
        tags: ["人工审批", "还盘", "定价"],
      },
      {
        id: "molex",
        account: "Molex Shanghai",
        location: "上海",
        dealCode: "Renewal-0601",
        product: "XH 连接线",
        value: "$1.1M",
        annualValue: "$4.2M 续约",
        status: "risk",
        statusLabel: "高风险",
        tone: "risk",
        risk: "高",
        confidence: 34,
        agentStatus: "检测到竞品报价",
        lastTouch: "18分钟前",
        nextAction: "将 3139 定制线长打包报价，并给出供货连续性补偿",
        summary: "JST 报价疑似比我方现价低 18%。采购团队已在 6 月续约前启动复核。",
        tags: ["竞品", "续约", "升级处理"],
      },
      {
        id: "foxconn",
        account: "Foxconn Precision",
        location: "昆山",
        dealCode: "Aurora-7 BOM",
        product: "线束 + 连接器",
        value: "$340K",
        annualValue: "$1.0M 项目上行",
        status: "monitoring",
        statusLabel: "监控中",
        tone: "processing",
        risk: "低",
        confidence: 61,
        agentStatus: "正在抓取 BOM 数据",
        lastTouch: "45分钟前",
        nextAction: "为 18 个匹配 SKU 准备首封触达邮件",
        summary: "已提取 23 个线缆/连接器行项目，其中 18 个可映射到 Farreach SKU。",
        tags: ["BOM", "触达", "新项目"],
      },
      {
        id: "luxshare",
        account: "Luxshare ICT",
        location: "昆山",
        dealCode: "PO-77531",
        product: "3139 硅胶线",
        value: "$1.2M",
        annualValue: "$2.6M 活跃客户",
        status: "won",
        statusLabel: "已赢单",
        tone: "safe",
        risk: "已关闭",
        confidence: 100,
        agentStatus: "已锁定生产排期",
        lastTouch: "1小时前",
        nextAction: "跟踪 W22-W24 生产与出货单证",
        summary: "AI 在人工价格审批后完成端到端流程。预计 2026-06-15 交付。",
        tags: ["PO 已确认", "生产", "单证"],
      },
      {
        id: "market-intel",
        account: "市场情报",
        location: "铜价 / 合规 / 出口",
        dealCode: "INTEL-FEED",
        product: "价格与竞品信号",
        value: "+2.3%",
        annualValue: "毛利监控",
        status: "monitoring",
        statusLabel: "情报流",
        tone: "intel",
        risk: "关注",
        confidence: 78,
        agentStatus: "跟踪铜价与 REACH 动向",
        lastTouch: "实时",
        nextAction: "LME 收盘后复核 UL1015 毛利假设",
        summary: "LME 铜价 +2.3%；深圳线缆出口量环比 -5.1%；邻苯草案正在复核。",
        tags: ["铜价", "REACH", "出口"],
      },
    ],
    timelineEvents: [
      {
        id: "evt-rfq-analysis",
        time: "09:12",
        type: "ai",
        tone: "safe",
        account: "TE Connectivity",
        title: "AI Agent 完成 RFQ 分析",
        body: "47 个 SKU 已匹配 Farreach 目录。建议对 >=500K 批量采用二级阶梯价。预测毛利：23.4%。",
        tags: ["UL1007", "UL1015", "3139", "+44"],
        dealId: "te-connectivity",
      },
      {
        id: "evt-amphenol-approval",
        time: "09:09",
        type: "approval",
        tone: "pending",
        account: "Amphenol Asia",
        title: "需要审批：Amphenol 还盘",
        body: "客户要求 12% 折扣。AI 已生成还盘：8% 折扣 + >=100K 米批次免运费。净毛利影响：-3.9 个百分点。",
        tags: ["人工关卡", "$847K", "毛利底线"],
        dealId: "amphenol",
        approvalId: "amphenol-counter",
      },
      {
        id: "evt-molex-risk",
        time: "08:54",
        type: "alert",
        tone: "risk",
        account: "Molex Shanghai",
        title: "竞品警报：检测到 JST 报价",
        body: "JST 对 XH 连接线的报价疑似低于我方现价 18%。建议用 3139 定制线长与供货连续性条款做组合回应。",
        tags: ["竞品", "-18%", "续约"],
        dealId: "molex",
      },
      {
        id: "evt-foxconn-bom",
        time: "08:30",
        type: "ai",
        tone: "processing",
        account: "Foxconn Precision",
        title: "BOM 抓取完成",
        body: "已从 Aurora-7 项目提取 23 个线缆/连接器行项目。18 个匹配 Farreach SKU。AI 正在准备触达草稿。",
        tags: ["BOM", "18 个匹配", "$340K"],
        dealId: "foxconn",
      },
      {
        id: "evt-copper",
        time: "08:18",
        type: "intel",
        tone: "intel",
        account: "市场情报",
        title: "铜价监控超过阈值",
        body: "LME 铜价日内 +2.3%。AI 建议复核 500K 米以上 UL1015 与 UL3139 报价。",
        tags: ["LME", "定价", "毛利"],
        dealId: "market-intel",
      },
      {
        id: "evt-luxshare",
        time: "07:45",
        type: "completed",
        tone: "safe",
        account: "Luxshare ICT",
        title: "Luxshare PO 已确认",
        body: "3139 系列，210 万米。W22-W24 生产排期已锁定。深圳至昆山预计交付：2026-06-15。",
        tags: ["PO 已确认", "$1.2M", "下一步单证"],
        dealId: "luxshare",
      },
    ],
    approvalRequests: [
      {
        id: "amphenol-counter",
        dealId: "amphenol",
        account: "Amphenol Asia",
        title: "还盘与 LME 条款",
        value: "$847K 季度 PO",
        risk: "中等毛利风险",
        due: "现在",
        recommendation: "批准 $0.916/m 的 8% 折扣，并加入季度 LME 复核。",
        guardrail: "Wilson 批准前，外发邮件已被阻断。",
      },
      {
        id: "molex-retention",
        dealId: "molex",
        account: "Molex Shanghai",
        title: "续约保留策略",
        value: "$4.2M 年度续约",
        risk: "竞品低价截单",
        due: "今天 16:00",
        recommendation: "让 AI 准备组合报价，发送前人工复核。",
        guardrail: "尚未生成客户可见邮件。",
      },
      {
        id: "te-tier-two",
        dealId: "te-connectivity",
        account: "TE Connectivity",
        title: "二级阶梯报价发布",
        value: "$2.4M RFQ",
        risk: "低",
        due: "铜价检查后",
        recommendation: "如果 LME 保持在 +3% 区间内，批准报价包。",
        guardrail: "报价 PDF 生成仅限本地驾驶舱演示。",
      },
    ],
    activeAgents: [
      {
        id: "pricing-agent",
        name: "定价 Agent",
        role: "毛利与报价策略",
        status: "运行中",
        tone: "safe",
        load: 68,
        currentTask: "按铜价指数重算 TE 阶梯价",
        queue: 4,
      },
      {
        id: "inbox-agent",
        name: "收件箱 Agent",
        role: "邮件分诊与草稿",
        status: "等待审批",
        tone: "pending",
        load: 42,
        currentTask: "暂存 Amphenol 还盘，等待 Wilson 审批",
        queue: 7,
      },
      {
        id: "intel-agent",
        name: "情报 Agent",
        role: "市场与竞品信号",
        status: "监控中",
        tone: "intel",
        load: 81,
        currentTask: "扫描 JST、恒达、铜价、REACH 信号",
        queue: 11,
      },
      {
        id: "docs-agent",
        name: "单证 Agent",
        role: "报价与贸易单证",
        status: "处理中",
        tone: "processing",
        load: 53,
        currentTask: "准备 Luxshare 交付单证清单",
        queue: 3,
      },
    ],
    focusCases: {
      amphenol: {
        dealId: "amphenol",
        approvalId: "amphenol-counter",
        title: "Amphenol PO-88392 还盘审批",
        threadSummary: "3 天内 8 封邮件",
        subject: "RE: PO-88392 - UL1007 22AWG 修订价格与条款",
        draft:
          "李伟您好，\n\n感谢您对报价的反馈。我们理解这批订单对价格非常敏感，也非常重视双方 3 年的合作关系。\n\n我们建议调整为以下方案：\n\n- 8% 批量折扣\n  单价：$0.916/m（原价 $0.996/m）\n  订单总额：$778,600\n\n- 批次免运费\n  单批 >=100K 米适用\n  深圳发至 Amphenol 深圳仓库\n\n- 按 LME 铜价进行季度价格复核\n  基准铜价：$9,600/t\n  LME 每变动 +/-$100/t，价格对应调整 +/-0.8%\n  该条款可保护双方免受原材料波动影响\n\n该方案体现了我们对长期合作的承诺，同时保持您所要求的质量标准：UL 认证、RoHS 合规、100% 火花测试。\n\n如果该方案可行，我今天会发送更新后的 PO 确认文件。\n\n祝好，\nWilson Chen\nFarreach Electronic",
        messages: [
          {
            id: "msg-li-wei",
            sender: "李伟 - Amphenol Asia",
            initials: "LW",
            role: "customer",
            timestamp: "5月20日 14:23",
            body: [
              "Wilson 你好，",
              "我们已收到 PO-88392（UL1007 22AWG，850,000 米）的报价。$0.996/m 的单价高于我们的目标价。之前供应商报价为 $0.870/m，能否重新考虑？",
              "这是季度复购订单，我们希望寻找长期合作伙伴。",
            ],
          },
          {
            id: "msg-ai-draft",
            sender: "SSA 收件箱 Agent",
            initials: "AI",
            role: "ai",
            timestamp: "09:09 生成",
            body: [
              "建议 8% 批量折扣至 $0.916/m，并对 >=100K 米批次免运费。",
              "加入铜价指数季度复核条款，用于在 LME 超出约定区间时保护毛利。",
              "任何客户可见发送都必须先经过人工审批。",
            ],
          },
          {
            id: "msg-wilson",
            sender: "Wilson Chen - Farreach",
            initials: "FR",
            role: "farreach",
            timestamp: "5月19日 10:05",
            body: ["李伟您好，", "附件是我们针对 PO-88392 的正式报价："],
            quote: [
              ["品项", "UL1007 22AWG"],
              ["数量", "850,000m 季度采购"],
              ["单价", "$0.996/m"],
              ["总额", "$846,600"],
              ["交期", "14 天"],
              ["账期", "Net 60"],
            ],
          },
        ],
        analysis: [
          {
            title: "交易背景",
            rows: [
              ["客户", "Amphenol Asia（深圳）"],
              ["订单金额", "$847K 季度订单", "safe"],
              ["年化金额", "~$3.4M", "safe"],
              ["合作关系", "3 年，12 个历史 PO"],
              ["付款记录", "准时付款，无争议", "safe"],
            ],
          },
          {
            title: "价格分析",
            rows: [
              ["我方报价", "$0.996/m"],
              ["客户目标价", "$0.870/m (-12.6%)", "risk"],
              ["AI 还盘价", "$0.916/m (-8.0%)", "pending"],
              ["底价 (成本+8%)", "$0.891/m"],
              ["还盘后毛利", "19.2% (-3.9pts)", "pending"],
            ],
          },
          {
            title: "竞品情报",
            body:
              "可能的前供应商：深圳恒达电缆。UL1007 22AWG 常见报价区间为 $0.850-$0.890/m，但 2025 年质量记录中有两次火花测试失败，出口认证覆盖也有限。",
            tags: ["Farreach 优势：UL 认证", "100% 测试", "出口就绪"],
          },
          {
            title: "建议",
            body:
              "批准带 LME 条款的还盘。8% 折扣仍高于底价，季度指数复核可以保护后续批次毛利。若失去该客户，可能影响 Amphenol 其他工厂的合作机会。",
            tags: ["置信度 87%", "中等风险", "接受阈值 >=$0.900/m"],
          },
        ],
      },
    },
    moduleLinks: [
      { label: "线索", href: "/leads", hotkey: "L" },
      { label: "收件箱", href: "/inbox", hotkey: "I" },
      { label: "草稿", href: "/emails", hotkey: "E" },
      { label: "报价", href: "/quotations", hotkey: "Q" },
      { label: "单证", href: "/documents", hotkey: "D" },
      { label: "情报", href: "/intelligence", hotkey: "N" },
      { label: "设置", href: "/settings", hotkey: "," },
    ],
  },
};
