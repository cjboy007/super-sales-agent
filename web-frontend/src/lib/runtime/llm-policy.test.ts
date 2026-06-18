import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-llm-policy-test-"));
  process.env = { ...originalEnv, SSA_DATA_ROOT: tempRoot };
  delete process.env.SSA_LLM_PROVIDER;
  delete process.env.SSA_LLM_MODEL;
  delete process.env.SSA_LLM_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  process.env = { ...originalEnv };
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("LLM task policy", () => {
  it("declares task-level model, fallback, budget, timeout, and external action boundaries", async () => {
    const { getLlmTaskPolicy, listLlmTaskPolicies } = await import("./llm-policy");

    expect(listLlmTaskPolicies().map((policy) => policy.task)).toEqual([
      "classify",
      "extract",
      "draft",
      "summarize",
      "translate",
      "recommend",
    ]);
    expect(getLlmTaskPolicy("draft")).toMatchObject({
      mode: "fallback_allowed",
      lowConfidenceAction: "human_review",
      externalActionPolicy: "model_must_not_claim_or_execute",
    });
    expect(listLlmTaskPolicies().every((policy) =>
      policy.timeoutMs > 0 &&
      policy.budget.maxInputChars > 0 &&
      policy.budget.maxOutputChars > 0 &&
      policy.minConfidenceForAutomation > 0 &&
      policy.externalActionPolicy === "model_must_not_claim_or_execute"
    )).toBe(true);
  });

  it("marks mock fallback and low-confidence output as requiring human review", async () => {
    process.env.SSA_LLM_PROVIDER = "mock";
    const { runLlmTask } = await import("./llm");

    const result = await runLlmTask({
      task: "draft",
      workspaceId: "farreach",
      input: "Draft a customer-facing quote reply.",
    });

    expect(result.source).toBe("mock");
    expect(result.structured?.policy).toMatchObject({
      mode: "fallback_allowed",
      mockFallback: true,
      requiresHumanReview: true,
      automationAllowed: false,
      externalActionPolicy: "model_must_not_claim_or_execute",
    });
  });

  it("uses the DeepSeek default model when only a DeepSeek API key is configured", async () => {
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        model: "deepseek-v4-pro",
        choices: [{ message: { content: "Provider response" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { getLlmRuntimeStatus, runLlmTask } = await import("./llm");
    expect(getLlmRuntimeStatus()).toMatchObject({
      provider: "deepseek",
      source: "provider",
      model: "deepseek-v4-pro",
    });

    const result = await runLlmTask({
      task: "classify",
      workspaceId: "farreach",
      input: "Need pricing for 1000 units.",
    });

    expect(result.source).toBe("provider");
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.stringContaining("\"model\":\"deepseek-v4-pro\""),
    }));
  });
});
