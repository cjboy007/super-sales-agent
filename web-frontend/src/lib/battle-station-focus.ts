import type {
  AnalysisBlock,
  ApprovalRequest,
  BattleLanguage,
  DomainAccount,
  EmailMessage,
  FocusCase,
  TimelineEvent,
} from "./battle-station-data";

interface ResolveFocusCaseInput {
  dealId: string;
  language: BattleLanguage;
  accounts: DomainAccount[];
  approvals: ApprovalRequest[];
  events: TimelineEvent[];
  focusCases: Record<string, FocusCase>;
}

const TEXT = {
  en: {
    threadSummary: "Generated from live workbench data",
    subjectPrefix: "Needs confirmation",
    signalSender: "Workbench signal",
    jadenSender: "Jaden",
    generatedNow: "Generated now",
    signalTitle: "Latest signal",
    dealContext: "Deal Context",
    approvalGate: "Confirmation Needed",
    recentSignals: "Recent Signals",
    customer: "Customer",
    deal: "Deal",
    product: "Product",
    value: "Value",
    annualValue: "Annual value",
    confidence: "Confidence",
    risk: "Risk",
    due: "Due",
    recommendation: "Recommendation",
    guardrail: "Send boundary",
    noEvents: "No recent timeline events are attached to this approval yet.",
    draftIntro: "Internal review note",
    nextAction: "Recommended next action",
    approvalLine: "This item is waiting for confirmation before any customer-facing action.",
    approveLine: "Confirm only if the recommendation, risk, and send boundary are acceptable.",
  },
  zh: {
    threadSummary: "由实时工作台数据生成",
    subjectPrefix: "需要复核",
    signalSender: "工作台信号",
    jadenSender: "Jaden",
    generatedNow: "刚刚生成",
    signalTitle: "最新信号",
    dealContext: "交易背景",
    approvalGate: "确认事项",
    recentSignals: "近期信号",
    customer: "客户",
    deal: "交易",
    product: "产品",
    value: "金额",
    annualValue: "年化金额",
    confidence: "置信度",
    risk: "风险",
    due: "截止",
    recommendation: "建议",
    guardrail: "发送边界",
    noEvents: "当前确认事项还没有绑定更多时间线事件。",
    draftIntro: "内部复核记录",
    nextAction: "建议下一步",
    approvalLine: "这条事项正在等待确认，确认前不会执行任何客户可见动作。",
    approveLine: "只有在建议、风险和发送边界都可接受时才确认。",
  },
} as const;

function initialsFor(account: string): string {
  const letters = account
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return letters || "JD";
}

function buildDraft(approval: ApprovalRequest, account: DomainAccount | undefined, language: BattleLanguage): string {
  const text = TEXT[language];
  const lines = [
    `${text.draftIntro}: ${approval.title}`,
    "",
    `${text.customer}: ${approval.account}`,
    `${text.value}: ${approval.value}`,
    `${text.risk}: ${approval.risk}`,
    `${text.due}: ${approval.due}`,
    "",
    `${text.recommendation}: ${approval.recommendation}`,
    `${text.guardrail}: ${approval.guardrail}`,
  ];

  if (account?.nextAction) {
    lines.push("", `${text.nextAction}: ${account.nextAction}`);
  }

  lines.push("", text.approvalLine, text.approveLine);

  return lines.join("\n");
}

function buildMessages(
  approval: ApprovalRequest,
  account: DomainAccount | undefined,
  relatedEvents: TimelineEvent[],
  language: BattleLanguage
): EmailMessage[] {
  const text = TEXT[language];
  const latestEvent = relatedEvents[0];

  return [
    {
      id: `signal-${approval.id}`,
      sender: latestEvent?.account || approval.account || text.signalSender,
      initials: initialsFor(approval.account),
      role: "customer",
      timestamp: latestEvent?.time || text.generatedNow,
      body: [
        latestEvent ? latestEvent.title : text.signalTitle,
        latestEvent?.body || account?.summary || approval.recommendation,
      ],
    },
    {
      id: `jaden-${approval.id}`,
      sender: text.jadenSender,
      initials: "JD",
      role: "ai",
      timestamp: text.generatedNow,
      body: [
        approval.recommendation,
        approval.guardrail,
        account?.nextAction || text.approvalLine,
      ],
    },
  ];
}

function buildAnalysis(
  approval: ApprovalRequest,
  account: DomainAccount | undefined,
  relatedEvents: TimelineEvent[],
  language: BattleLanguage
): AnalysisBlock[] {
  const text = TEXT[language];
  const recentSignalBody = relatedEvents.length > 0
    ? relatedEvents.map((event) => `${event.time} - ${event.title}: ${event.body}`).join("\n\n")
    : text.noEvents;

  return [
    {
      title: text.dealContext,
      rows: [
        [text.customer, approval.account || account?.account || approval.dealId],
        [text.deal, account?.dealCode || approval.dealId],
        [text.product, account?.product || "-"],
        [text.value, approval.value || account?.value || "-", account?.tone],
        [text.annualValue, account?.annualValue || "-"],
        [text.confidence, account ? `${account.confidence}%` : "-"],
        [text.risk, approval.risk || account?.risk || "-", account?.tone],
      ],
    },
    {
      title: text.approvalGate,
      rows: [
        [text.due, approval.due],
        [text.recommendation, approval.recommendation, "pending"],
        [text.guardrail, approval.guardrail, "risk"],
      ],
    },
    {
      title: text.recentSignals,
      body: recentSignalBody,
      tags: Array.from(new Set(relatedEvents.flatMap((event) => event.tags || []))).slice(0, 8),
    },
  ];
}

export function resolveFocusCase({
  dealId,
  language,
  accounts,
  approvals,
  events,
  focusCases,
}: ResolveFocusCaseInput): FocusCase | null {
  const authoredCase = focusCases[dealId];
  if (authoredCase) return authoredCase;

  const approval = approvals.find((item) => item.dealId === dealId);
  if (!approval) return null;

  const account = accounts.find((item) => item.id === dealId);
  const relatedEvents = events.filter((event) => event.dealId === dealId);
  const text = TEXT[language];

  return {
    dealId,
    approvalId: approval.id,
    title: `${approval.account} - ${approval.title}`,
    threadSummary: text.threadSummary,
    subject: `${text.subjectPrefix}: ${approval.title}`,
    draft: buildDraft(approval, account, language),
    messages: buildMessages(approval, account, relatedEvents, language),
    analysis: buildAnalysis(approval, account, relatedEvents, language),
  };
}
