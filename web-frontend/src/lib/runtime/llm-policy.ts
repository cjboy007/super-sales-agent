import type { LlmResult, LlmTask } from "./types";

export type LlmTaskPolicyMode =
  | "real_required"
  | "mock_allowed"
  | "model_forbidden"
  | "fallback_allowed";

export interface LlmTaskPolicy {
  task: LlmTask;
  mode: LlmTaskPolicyMode;
  minConfidenceForAutomation: number;
  lowConfidenceAction: "human_review";
  timeoutMs: number;
  retry: {
    maxAttempts: number;
    retryOnProviderError: boolean;
  };
  fallback: {
    allowMock: boolean;
    surfaceToOperator: boolean;
  };
  budget: {
    maxInputChars: number;
    maxOutputChars: number;
  };
  externalActionPolicy: "model_must_not_claim_or_execute";
}

export interface LlmPolicyEvaluation {
  task: LlmTask;
  mode: LlmTaskPolicyMode;
  mockFallback: boolean;
  requiresHumanReview: boolean;
  automationAllowed: boolean;
  lowConfidenceAction: "human_review";
  externalActionPolicy: "model_must_not_claim_or_execute";
  reasons: string[];
}

const POLICIES: LlmTaskPolicy[] = [
  {
    task: "classify",
    mode: "fallback_allowed",
    minConfidenceForAutomation: 0.7,
    lowConfidenceAction: "human_review",
    timeoutMs: 8000,
    retry: { maxAttempts: 1, retryOnProviderError: false },
    fallback: { allowMock: true, surfaceToOperator: true },
    budget: { maxInputChars: 12000, maxOutputChars: 1200 },
    externalActionPolicy: "model_must_not_claim_or_execute",
  },
  {
    task: "extract",
    mode: "fallback_allowed",
    minConfidenceForAutomation: 0.75,
    lowConfidenceAction: "human_review",
    timeoutMs: 8000,
    retry: { maxAttempts: 1, retryOnProviderError: false },
    fallback: { allowMock: true, surfaceToOperator: true },
    budget: { maxInputChars: 16000, maxOutputChars: 2000 },
    externalActionPolicy: "model_must_not_claim_or_execute",
  },
  {
    task: "draft",
    mode: "fallback_allowed",
    minConfidenceForAutomation: 0.72,
    lowConfidenceAction: "human_review",
    timeoutMs: 12000,
    retry: { maxAttempts: 1, retryOnProviderError: false },
    fallback: { allowMock: true, surfaceToOperator: true },
    budget: { maxInputChars: 18000, maxOutputChars: 4000 },
    externalActionPolicy: "model_must_not_claim_or_execute",
  },
  {
    task: "summarize",
    mode: "mock_allowed",
    minConfidenceForAutomation: 0.65,
    lowConfidenceAction: "human_review",
    timeoutMs: 8000,
    retry: { maxAttempts: 1, retryOnProviderError: false },
    fallback: { allowMock: true, surfaceToOperator: true },
    budget: { maxInputChars: 20000, maxOutputChars: 1800 },
    externalActionPolicy: "model_must_not_claim_or_execute",
  },
  {
    task: "translate",
    mode: "fallback_allowed",
    minConfidenceForAutomation: 0.8,
    lowConfidenceAction: "human_review",
    timeoutMs: 10000,
    retry: { maxAttempts: 1, retryOnProviderError: false },
    fallback: { allowMock: true, surfaceToOperator: true },
    budget: { maxInputChars: 16000, maxOutputChars: 4000 },
    externalActionPolicy: "model_must_not_claim_or_execute",
  },
  {
    task: "recommend",
    mode: "real_required",
    minConfidenceForAutomation: 0.78,
    lowConfidenceAction: "human_review",
    timeoutMs: 12000,
    retry: { maxAttempts: 1, retryOnProviderError: false },
    fallback: { allowMock: false, surfaceToOperator: true },
    budget: { maxInputChars: 18000, maxOutputChars: 2400 },
    externalActionPolicy: "model_must_not_claim_or_execute",
  },
];

export function listLlmTaskPolicies(): LlmTaskPolicy[] {
  return POLICIES.map((policy) => ({
    ...policy,
    retry: { ...policy.retry },
    fallback: { ...policy.fallback },
    budget: { ...policy.budget },
  }));
}

export function getLlmTaskPolicy(task: LlmTask): LlmTaskPolicy {
  const policy = POLICIES.find((item) => item.task === task);
  if (!policy) {
    return {
      task,
      mode: "model_forbidden",
      minConfidenceForAutomation: 1,
      lowConfidenceAction: "human_review",
      timeoutMs: 1000,
      retry: { maxAttempts: 0, retryOnProviderError: false },
      fallback: { allowMock: false, surfaceToOperator: true },
      budget: { maxInputChars: 0, maxOutputChars: 0 },
      externalActionPolicy: "model_must_not_claim_or_execute",
    };
  }
  return listLlmTaskPolicies().find((item) => item.task === task) as LlmTaskPolicy;
}

export function evaluateLlmTaskPolicy(task: LlmTask, result: Pick<LlmResult, "source" | "confidence">): LlmPolicyEvaluation {
  const policy = getLlmTaskPolicy(task);
  const mockFallback = result.source === "mock";
  const reasons: string[] = [];

  if (policy.mode === "model_forbidden") reasons.push("model_forbidden_for_task");
  if (policy.mode === "real_required" && mockFallback) reasons.push("real_model_required");
  if (mockFallback) reasons.push("mock_fallback_visible");
  if (result.confidence < policy.minConfidenceForAutomation) reasons.push("low_confidence");

  const requiresHumanReview = reasons.length > 0;
  return {
    task,
    mode: policy.mode,
    mockFallback,
    requiresHumanReview,
    automationAllowed: !requiresHumanReview,
    lowConfidenceAction: policy.lowConfidenceAction,
    externalActionPolicy: policy.externalActionPolicy,
    reasons,
  };
}

export function annotateLlmResultWithPolicy(task: LlmTask, result: LlmResult): LlmResult {
  const policy = evaluateLlmTaskPolicy(task, result);
  return {
    ...result,
    structured: {
      ...(result.structured || {}),
      policy,
    },
  };
}
