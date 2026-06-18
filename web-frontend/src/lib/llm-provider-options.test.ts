import { describe, expect, it } from "vitest";
import { defaultBaseUrlForProvider, normalizeLlmProviderId } from "./llm-provider-options";

describe("LLM provider default base URLs", () => {
  it("keeps standard API and Coding Plan endpoints separate", () => {
    expect(defaultBaseUrlForProvider("dashscope")).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(defaultBaseUrlForProvider("dashscope-coding-plan")).toBe("https://coding.dashscope.aliyuncs.com/v1");
    expect(defaultBaseUrlForProvider("moonshot")).toBe("https://api.moonshot.cn/v1");
    expect(defaultBaseUrlForProvider("kimi-code")).toBe("https://api.kimi.com/coding/v1");
    expect(defaultBaseUrlForProvider("zhipu")).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(defaultBaseUrlForProvider("zhipu-coding-plan")).toBe("https://open.bigmodel.cn/api/coding/paas/v4");
    expect(defaultBaseUrlForProvider("doubao")).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(defaultBaseUrlForProvider("doubao-coding-plan")).toBe("https://ark.cn-beijing.volces.com/api/coding/v3");
  });

  it("normalizes common user-facing aliases to the exact provider variant", () => {
    expect(normalizeLlmProviderId("qwen")).toBe("dashscope");
    expect(normalizeLlmProviderId("qwen-coding-plan")).toBe("dashscope-coding-plan");
    expect(normalizeLlmProviderId("kimi")).toBe("moonshot");
    expect(normalizeLlmProviderId("kimi-code")).toBe("kimi-code");
    expect(normalizeLlmProviderId("ark-coding-plan")).toBe("doubao-coding-plan");
  });
});
