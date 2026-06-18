import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEnv = { ...process.env };
let tempRoot = "";

function writeRawConfig(config: Record<string, unknown>) {
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "config.json"), JSON.stringify(config, null, 2), "utf-8");
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-llm-test-"));
  process.env = { ...originalEnv, SSA_DATA_ROOT: tempRoot };
  delete process.env.SSA_LLM_PROVIDER;
  delete process.env.SSA_LLM_BASE_URL;
  delete process.env.SSA_LLM_MODEL;
  delete process.env.SSA_LLM_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.QWEN_API_KEY;
  delete process.env.ZHIPU_API_KEY;
  delete process.env.GLM_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  delete process.env.KIMI_API_KEY;
  delete process.env.DOUBAO_API_KEY;
  delete process.env.VOLCENGINE_API_KEY;
  delete process.env.ARK_API_KEY;
  delete process.env.QIANFAN_API_KEY;
  delete process.env.BAIDU_API_KEY;
  delete process.env.HUNYUAN_API_KEY;
  delete process.env.TENCENT_HUNYUAN_API_KEY;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  process.env = { ...originalEnv };
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("LLM provider resolution", () => {
  it("uses mock only when no real model is configured", async () => {
    const { getLlmRuntimeStatus } = await import("./llm");

    expect(getLlmRuntimeStatus()).toMatchObject({
      provider: "mock",
      mode: "mock",
      readiness: "mock_fallback",
      configured: false,
      source: "mock",
    });
  });

  it("prefers a configured local OpenAI-compatible endpoint over mock", async () => {
    writeRawConfig({
      llmProvider: "ollama",
      llmBaseUrl: "http://127.0.0.1:11434/v1",
      defaultModel: "qwen2.5:7b",
    });
    const { getLlmRuntimeStatus } = await import("./llm");

    expect(getLlmRuntimeStatus()).toMatchObject({
      provider: "ollama",
      mode: "local",
      readiness: "local_model_ready",
      configured: true,
      source: "provider",
      model: "qwen2.5:7b",
      endpoint: "http://127.0.0.1:11434/v1/chat/completions",
      requiresApiKey: false,
    });
  });

  it("does not choose a hidden default model when the user leaves model name empty", async () => {
    writeRawConfig({
      llmProvider: "ollama",
      llmBaseUrl: "http://127.0.0.1:11434/v1",
      defaultModel: "",
    });
    const { getLlmRuntimeStatus } = await import("./llm");

    expect(getLlmRuntimeStatus()).toMatchObject({
      provider: "mock",
      mode: "mock",
      readiness: "mock_fallback",
      configured: false,
    });
  });

  it("maps China model providers to OpenAI-compatible chat endpoints", async () => {
    writeRawConfig({
      llmProvider: "dashscope",
      llmApiKey: Buffer.from("dashscope-secret", "utf-8").toString("base64"),
      defaultModel: "qwen-plus",
      _encrypted: ["llmApiKey"],
    });
    const { getLlmRuntimeStatus } = await import("./llm");

    expect(getLlmRuntimeStatus()).toMatchObject({
      provider: "dashscope",
      mode: "cloud",
      readiness: "cloud_model_ready",
      configured: true,
      model: "qwen-plus",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      requiresApiKey: true,
    });
  });

  it("uses Coding Plan API base URLs only for explicit Coding Plan providers", async () => {
    writeRawConfig({
      llmProvider: "dashscope-coding-plan",
      llmApiKey: Buffer.from("dashscope-coding-secret", "utf-8").toString("base64"),
      defaultModel: "qwen3-coder-plus",
      _encrypted: ["llmApiKey"],
    });
    const { getLlmRuntimeStatus } = await import("./llm");

    expect(getLlmRuntimeStatus()).toMatchObject({
      provider: "dashscope-coding-plan",
      readiness: "cloud_model_ready",
      model: "qwen3-coder-plus",
      endpoint: "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
      requiresApiKey: true,
    });
  });

  it("keeps Kimi platform API and Kimi Code API separate", async () => {
    writeRawConfig({
      llmProvider: "kimi-code",
      llmApiKey: Buffer.from("kimi-code-secret", "utf-8").toString("base64"),
      defaultModel: "kimi-for-coding",
      _encrypted: ["llmApiKey"],
    });
    const { getLlmRuntimeStatus } = await import("./llm");

    expect(getLlmRuntimeStatus()).toMatchObject({
      provider: "kimi-code",
      endpoint: "https://api.kimi.com/coding/v1/chat/completions",
      model: "kimi-for-coding",
    });
  });
});
