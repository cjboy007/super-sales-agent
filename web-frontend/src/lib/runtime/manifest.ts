import type { LlmTask, RuntimeWorkflowType, SalesRuntimeManifest, SideEffectKind } from "./types";
import { listSalesPacks } from "./sales-packs";
import { ssaDataRoot } from "../ssa-data-paths";

export const RUNTIME_WORKFLOWS: RuntimeWorkflowType[] = [
  "lead.import",
  "company_intel.run",
  "email.reply",
  "follow_up.plan",
  "quotation.prepare",
  "intake.product_doc.process",
  "operator.command",
  "side_effect.request",
];

export const SIDE_EFFECT_KINDS: SideEffectKind[] = [
  "email.send",
  "crm.write",
  "data.read",
  "imap.fetch",
  "feishu.notify",
  "payment.write",
  "bank.read",
  "document.generate",
  "document.preview",
  "price.discount",
];

export const LLM_TASKS: LlmTask[] = [
  "classify",
  "extract",
  "draft",
  "summarize",
  "translate",
  "recommend",
];

export function getSalesRuntimeManifest(): SalesRuntimeManifest {
  return {
    id: "ssa-sales-os",
    name: "Super Sales Agent Sales OS",
    positioning: "B2B sales workbench primitives for customer development, review, and task progress.",
    runtimeBoundary: {
      standalone: true,
      requiresOpenClaw: false,
      requiresHermes: false,
      dataRoot: ssaDataRoot(),
      sideEffectsBlockedByDefault: true,
    },
    operatorSurfaces: [
      "Workbench",
      "Pending Review",
      "Sales workspaces",
      "Task Progress API",
    ],
    capabilities: [
      {
        id: "sales-packs",
        openclawEquivalent: "skills",
        ssaPrimitive: "Sales packs",
        status: "implemented",
        notes: "Sales packs declare workflows and gated side effects for sales domains.",
      },
      {
        id: "runtime-workflows",
        openclawEquivalent: "agent tasks / cron jobs",
        ssaPrimitive: "Background tasks",
        status: "implemented",
        notes: "Jobs are persisted in SSA-owned SQLite with worker lease metadata, bounded retries, and a standalone Jaden worker entrypoint.",
      },
      {
        id: "approval-gates",
        openclawEquivalent: "exec approvals",
        ssaPrimitive: "Customer-facing action confirmations",
        status: "implemented",
        notes: "Real email, CRM, IMAP, Feishu, payment, bank, and document actions are blocked without explicit flags.",
      },
      {
        id: "sales-memory",
        openclawEquivalent: "workspace memory / context",
        ssaPrimitive: "SSA-owned sales memory",
        status: "implemented",
        notes: "Authoritative SSA records outrank imported or suggested context.",
      },
      {
        id: "operator-console",
        openclawEquivalent: "agent supervision UI",
        ssaPrimitive: "Workbench",
        status: "implemented",
        notes: "Users can scan risks, pending reviews, events, and next actions from the workbench.",
      },
      {
        id: "llm-adapters",
        openclawEquivalent: "model provider runtime",
        ssaPrimitive: "LLM provider adapter",
        status: "partial",
        notes: "Mock and OpenRouter-style provider calls exist; provider registry and budget policy are planned.",
      },
    ],
    salesPacks: listSalesPacks(),
    workflowTypes: RUNTIME_WORKFLOWS,
    sideEffectKinds: SIDE_EFFECT_KINDS,
    llmTasks: LLM_TASKS,
    dataContracts: [
      "SSA_DATA_ROOT stores runtime state outside the repo.",
      "Task events live under companies/<workspace>/events/events.json.",
      "Background tasks live under runtime/ssa-runtime.db.",
      "Side-effect decisions live under companies/<workspace>/approvals/side-effect-decisions.json.",
      "Sales memory lives under companies/<workspace>/memory/records.json.",
    ],
    nextGaps: [
      "Sales tool registry for reusable actions such as quote, draft, classify, import, and confirm.",
      "Policy engine for when LLM is required, optional, or forbidden.",
      "Workbench controls for background tasks, tool runs, and scheduled sales playbooks.",
    ],
  };
}
