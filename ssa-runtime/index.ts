/**
 * SSA Runtime — standalone runtime layer for Super Sales Agent.
 *
 * SSA depends on: LLM API + SQLite DB + workers + UI.
 * SSA does NOT depend on: OpenClaw, Hermes, PHOENIX, Codex, or any agent framework.
 */

export { loadConfig, getConfig, resetConfig } from "./config";
export type { SSAConfig, RuntimeMode } from "./config";

export { llmCall, MOCK_RESPONSES } from "./llm-provider";
export type { LLMMessage, LLMRequestOptions, LLMResponse } from "./llm-provider";

export {
  requestSideEffect,
  verifyApprovalForSideEffect,
  getSideEffectLog,
  clearSideEffectLog,
} from "./side-effect-gate";
export type {
  SideEffectType,
  SideEffectRequest,
  SideEffectResult,
  ApprovalVerification,
} from "./side-effect-gate";

export { buildCustomerContext } from "./context-builder";
export type { CustomerContext, ContextBundle } from "./context-builder";

export { runPipeline } from "./llm-pipeline";
export type { TaskType, PipelineInput, PipelineOutput } from "./llm-pipeline";

export {
  isOkkiAvailable,
  getOkkiConfig,
  getCompany,
  createTrail,
  matchCustomerByEmail,
} from "./okki-adapter";
export type { OkkiConfig, OkkiCompany, OkkiTrailData, TrailType } from "./okki-adapter";
