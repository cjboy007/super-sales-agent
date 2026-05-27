import type { LlmTask, RuntimeWorkflowType, SalesRuntimeManifest, SideEffectKind } from "./types";
import { listSalesPacks } from "./sales-packs";
import { ssaDataRoot } from "../ssa-data-paths";

export const RUNTIME_WORKFLOWS: RuntimeWorkflowType[] = [
  "lead.import",
  "email.reply",
  "follow_up.plan",
  "quotation.prepare",
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
    positioning: "OpenClaw-shaped operating system primitives narrowed to B2B sales work.",
    runtimeBoundary: {
      standalone: true,
      requiresOpenClaw: false,
      requiresHermes: false,
      dataRoot: ssaDataRoot(),
      sideEffectsBlockedByDefault: true,
    },
    operatorSurfaces: [
      "Battle Station cockpit",
      "Focus approval mode",
      "Secondary sales workstations",
      "Runtime API",
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
        ssaPrimitive: "Runtime jobs",
        status: "partial",
        notes: "Jobs are persisted and auditable; durable scheduling/worker leases are still planned.",
      },
      {
        id: "approval-gates",
        openclawEquivalent: "exec approvals",
        ssaPrimitive: "Side-effect decisions and approval records",
        status: "implemented",
        notes: "Real email, CRM, IMAP, Feishu, payment, bank, and document actions are blocked without explicit flags.",
      },
      {
        id: "sales-memory",
        openclawEquivalent: "workspace memory / context",
        ssaPrimitive: "SSA-owned sales memory",
        status: "implemented",
        notes: "Authoritative SSA records outrank Hermes/OpenClaw suggestions.",
      },
      {
        id: "operator-console",
        openclawEquivalent: "agent supervision UI",
        ssaPrimitive: "Battle Station",
        status: "implemented",
        notes: "Operators can scan risks, approvals, events, and next actions from the cockpit.",
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
      "Runtime events live under runtime/events.json.",
      "Runtime jobs live under runtime/jobs.json.",
      "Side-effect decisions live under runtime/side-effect-decisions.json.",
      "Sales memory lives under memory/<workspace>/records.json.",
    ],
    nextGaps: [
      "Durable SQLite-backed task queue with worker lease/retry semantics.",
      "Sales tool registry for reusable actions such as quote, draft, classify, import, and approve.",
      "Policy engine for when LLM is required, optional, or forbidden.",
      "Worker entrypoints that run without Next.js request lifecycle.",
      "Battle Station controls for runtime jobs, tool runs, and scheduled sales playbooks.",
    ],
  };
}
