import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-llm-cache-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("LLM cache", () => {
  it("stores and retrieves a result by task, model, prompt version, and input", async () => {
    const { getLlmCacheEntry, setLlmCacheEntry } = await import("./llm-cache");
    const request = {
      workspaceId: "demo-exporter",
      taskType: "draft",
      modelName: "deepseek-v4-pro",
      promptVersion: "inbox.reply.v1",
      input: "Quote 100 USB-C cables",
    };

    expect(getLlmCacheEntry(request)).toBeNull();
    setLlmCacheEntry(request, {
      provider: "mock",
      source: "mock",
      text: "Draft body",
      confidence: 0.52,
      structured: { task: "draft" },
    });

    const cached = getLlmCacheEntry(request);
    expect(cached).toMatchObject({
      provider: "mock",
      source: "cache",
      text: "Draft body",
      structured: {
        cache: expect.objectContaining({
          hit: true,
          taskType: "draft",
          promptVersion: "inbox.reply.v1",
          modelName: "deepseek-v4-pro",
        }),
      },
    });
  });
});
