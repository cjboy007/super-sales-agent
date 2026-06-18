import { betaAuthIsConfiguredForRuntime } from "./beta-auth";
import { buildCustomerDirectory } from "./customers";
import { readCustomerActivities } from "./customer-activity";
import type { MailboxReadinessSummary } from "./mailbox-readiness";
import type { RealActionReadinessSummary } from "./real-action-readiness";
import type { SalesRuntime } from "./sales-runtime";
import type { WorkerHealthSummary } from "./worker-health";
import type { WorkerSupervisorSummary } from "./worker-supervisor";

export type BetaReadinessStatus = "ready" | "needs_setup" | "needs_review";

export interface BetaReadinessCheck {
  id: string;
  label: string;
  status: BetaReadinessStatus;
  detail: string;
  action: string;
}

export interface BetaReadinessSummary {
  status: BetaReadinessStatus;
  ready: number;
  total: number;
  checks: BetaReadinessCheck[];
  firstRunGuide: BetaFirstRunGuideItem[];
  updatedAt: string;
}

export interface BetaFirstRunGuideItem {
  id: "start-onboarding" | "seed-demo" | "connect-email" | "import-customers" | "review-crm";
  label: string;
  detail: string;
  href: string;
}

function check(input: BetaReadinessCheck): BetaReadinessCheck {
  return input;
}

function statusFromChecks(checks: BetaReadinessCheck[]): BetaReadinessStatus {
  if (checks.some((item) => item.status === "needs_setup")) return "needs_setup";
  if (checks.some((item) => item.status === "needs_review")) return "needs_review";
  return "ready";
}

function readyCount(checks: BetaReadinessCheck[]): number {
  return checks.filter((item) => item.status === "ready").length;
}

function hasConfiguredRealActionFlag(): boolean {
  return [
    "SSA_ENABLE_REAL_EMAIL_SEND",
    "SSA_ENABLE_REAL_CRM_WRITE",
    "SSA_ENABLE_REAL_FEISHU",
    "SSA_ENABLE_REAL_PAYMENT",
    "SSA_ENABLE_REAL_BANK",
    "SSA_ENABLE_REAL_DOCUMENT_GENERATION",
    "SSA_ENABLE_REAL_DOCUMENT_PREVIEW",
  ].some((flag) => process.env[flag] === "true");
}

function firstRunGuide(): BetaFirstRunGuideItem[] {
  return [
    {
      id: "start-onboarding",
      label: "Start onboarding",
      detail: "Use the guided setup to connect the core sales workspace.",
      href: "/jadenos/onboarding",
    },
    {
      id: "seed-demo",
      label: "Load demo data",
      detail: "Create a sample customer, email activity, and order timeline for first-run evaluation.",
      href: "/leads",
    },
    {
      id: "connect-email",
      label: "Connect work email",
      detail: "Add IMAP and SMTP settings so new messages can enter the customer timeline.",
      href: "/settings",
    },
    {
      id: "import-customers",
      label: "Import customers",
      detail: "Use Intake to add customer lists, product files, and supporting sales material.",
      href: "/intake",
    },
    {
      id: "review-crm",
      label: "Review customer CRM",
      detail: "Open the customer list to inspect contacts, orders, activity timeline, and next actions.",
      href: "/leads",
    },
  ];
}

export function getBetaReadiness(input: {
  runtime: SalesRuntime;
  worker: WorkerHealthSummary;
  supervisor?: WorkerSupervisorSummary;
  mailbox?: MailboxReadinessSummary;
  realActions?: RealActionReadinessSummary;
  pageAccessProtected?: boolean;
  workspaceId?: string;
  now?: string;
}): BetaReadinessSummary {
  const workspaceId = input.workspaceId || "farreach";
  const authConfigured = betaAuthIsConfiguredForRuntime();
  const pageAccessProtected = input.pageAccessProtected ?? authConfigured;
  const accessControlReady = authConfigured && pageAccessProtected;
  const workerStatus = input.worker.status;
  const supervisorStatus = input.supervisor?.status || "needs_setup";
  const mailboxStatus = input.mailbox?.status || "needs_setup";
  const realActionStatus = input.realActions?.status || "needs_setup";
  const directory = buildCustomerDirectory(input.runtime, workspaceId, {
    page: 1,
    pageSize: 20,
  });
  const activities = readCustomerActivities(workspaceId);
  const hasCustomers = directory.total > 0;
  const hasCustomerActivity = activities.some((activity) => activity.kind === "email_received" || activity.kind === "crm_note" || activity.kind === "order_status");
  const hasOrderTimeline = directory.customers.some((customer) =>
    customer.orders.length > 0 &&
    customer.interactions.some((item) => item.type === "Payment" || item.type === "Shipment" || item.type === "After-sales" || item.type === "Refund" || item.type === "Exception")
  );
  const failedWork = input.worker.queue.failed + input.worker.queue.retryable;
  const realActionFlagEnabled = hasConfiguredRealActionFlag();
  const guide = firstRunGuide();

  const checks: BetaReadinessCheck[] = [
    check({
      id: "access-control",
      label: "Beta access control",
      status: accessControlReady ? "ready" : "needs_setup",
      detail: accessControlReady
        ? "External beta access is protected by a server-side access token."
        : authConfigured
          ? "A server-side token exists, but page access protection is not enabled yet."
          : "Local open mode is fine for development, but external beta needs an access token before sharing.",
      action: accessControlReady
        ? "Keep token access scoped to the intended workspaces."
        : authConfigured
          ? "Enable page access protection before inviting external users."
          : "Set a beta access token before inviting external users.",
    }),
    check({
      id: "first-run-guidance",
      label: "First-run guidance",
      status: "ready",
      detail: "External users have a visible path for onboarding, demo data, email setup, customer import, and CRM review.",
      action: "Open onboarding, load demo data, connect email, import customers, then review the customer CRM.",
    }),
    check({
      id: "resident-worker",
      label: "Resident worker",
      status: workerStatus === "ok" ? "ready" : workerStatus === "degraded" ? "needs_review" : "needs_setup",
      detail: workerStatus === "ok"
        ? "A worker heartbeat is visible and the queue is healthy."
        : workerStatus === "degraded"
          ? "The worker is visible, but failed or retryable work needs review."
          : "No healthy resident worker heartbeat is visible yet.",
      action: workerStatus === "ok" ? "Keep the supervisor running and monitor health." : "Start or repair the resident worker before external beta.",
    }),
    check({
      id: "worker-supervisor",
      label: "Worker recovery",
      status: supervisorStatus,
      detail: supervisorStatus === "ready"
        ? "The resident worker has a reviewed recovery setup with restart, stop, start, and health controls."
        : supervisorStatus === "needs_review"
          ? "A worker recovery setup exists, but it is incomplete or does not match this workspace."
          : "No reviewed worker recovery setup is available yet.",
      action: supervisorStatus === "ready"
        ? "Keep the recovery setup installed and verify it after deployment changes."
        : "Generate and install a worker recovery setup before inviting external testers.",
    }),
    check({
      id: "customer-data",
      label: "Customer starting data",
      status: hasCustomers ? "ready" : "needs_setup",
      detail: hasCustomers
        ? "Customer records are available for the CRM experience."
        : "No customer record is visible yet, so first-run users would land on an empty CRM.",
      action: hasCustomers ? "Keep demo or imported customer data available for first-run evaluation." : "Import customer leads or seed the demo workspace.",
    }),
    check({
      id: "mailbox-sync",
      label: "Mailbox sync",
      status: mailboxStatus,
      detail: mailboxStatus === "ready"
        ? input.mailbox?.summary || "Mailbox capture is configured and the worker has recently synced incoming mail into CRM."
        : mailboxStatus === "needs_review"
          ? input.mailbox?.summary || "Mailbox capture is configured, but no recent worker sync result is visible yet."
          : input.mailbox?.summary || "Mailbox capture is not fully configured for incoming customer email.",
      action: mailboxStatus === "ready"
        ? input.mailbox?.nextStep || "Keep monitoring new inbound mail in the customer timeline."
        : mailboxStatus === "needs_review"
          ? input.mailbox?.nextStep || "Run or repair the worker until a fresh inbound mail sync is visible."
          : input.mailbox?.nextStep || "Connect work email and enable automatic capture before external beta.",
    }),
    check({
      id: "customer-activity",
      label: "Customer activity timeline",
      status: hasCustomerActivity ? "ready" : "needs_setup",
      detail: hasCustomerActivity
        ? "Inbound email or CRM activity is present in the customer timeline."
        : "No customer activity is present yet, so email-to-CRM automation is not visible.",
      action: hasCustomerActivity ? "Use the timeline to validate incoming mail behavior." : "Sync inbox mail or seed demo activity before inviting testers.",
    }),
    check({
      id: "order-timeline",
      label: "Order timeline",
      status: hasOrderTimeline ? "ready" : "needs_setup",
      detail: hasOrderTimeline
        ? "Orders and payment or shipment milestones are visible in customer detail."
        : "No order milestone is visible yet, so the order loop is not demonstrable.",
      action: hasOrderTimeline ? "Review customer orders for payment, shipment, and exception coverage." : "Create or seed a quote, PI, payment, shipment, or exception event.",
    }),
    check({
      id: "real-action-safety",
      label: "Real action safety",
      status: realActionFlagEnabled ? "needs_review" : "ready",
      detail: realActionFlagEnabled
        ? "At least one real external action is enabled; confirm the adapter and approval flow before testers use it."
        : "Real external actions are blocked by default.",
      action: realActionFlagEnabled ? "Review enabled real-action gates and approvals before beta." : "Keep real actions disabled until a controlled adapter test is approved.",
    }),
    check({
      id: "real-action-authorization",
      label: "External action authorization",
      status: realActionStatus,
      detail: input.realActions?.summary || "No completed approval and execution record is visible for real external actions yet.",
      action: input.realActions?.nextStep || "Run one controlled approval test for email or CRM, then confirm the execution result is recorded.",
    }),
    check({
      id: "operator-recovery",
      label: "Operator recovery",
      status: failedWork === 0 ? "ready" : "needs_review",
      detail: failedWork === 0
        ? "No failed or retryable work is waiting for review."
        : "Failed or retryable work is waiting for operator review.",
      action: failedWork === 0 ? "Use the operations page for routine monitoring." : "Open operations and retry or resolve failed work.",
    }),
  ];

  return {
    status: statusFromChecks(checks),
    ready: readyCount(checks),
    total: checks.length,
    checks,
    firstRunGuide: guide,
    updatedAt: input.now || new Date().toISOString(),
  };
}
