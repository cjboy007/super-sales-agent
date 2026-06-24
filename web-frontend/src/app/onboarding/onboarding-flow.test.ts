import { describe, expect, it } from "vitest";
import {
  JADENOS_ONBOARDING_ROUTE,
  getJadenosOnboardingSteps,
  getOnboardingReadiness,
  isConfiguredSecret,
} from "./onboarding-flow";

const baseConfig = {
  gatewayAccessMode: "local" as const,
  gatewayBindHost: "127.0.0.1",
  gatewayPublicHost: "",
  intakeRetentionMode: "keep" as const,
  intakeMaxActiveSessions: 100,
  llmProvider: "",
  llmBaseUrl: "",
  llmApiKey: "",
  deepseekApiKey: "",
  openaiApiKey: "",
  openrouterApiKey: "",
  geminiApiKey: "",
  tavilyApiKey: "",
  hunterApiKey: "",
  apolloApiKey: "",
  crmProvider: "none",
  crmApiKey: "",
  notificationProvider: "none",
  notificationWebhookUrl: "",
  defaultModel: "",
  smtpHost: "",
  smtpPort: "465",
  smtpEncryption: "ssl",
  imapHost: "",
  imapPort: "993",
  imapEncryption: "ssl",
  email: "",
  emailPassword: "",
  autoCapture: true,
  searchEngine: "tavily",
  searchRegion: "global",
  maxResults: 10,
  searchDepth: "standard",
  autoResearch: {
    leadResearch: true,
    priceMonitor: true,
    trendTracking: false,
    emailVerify: true,
  },
};

describe("JadenOS onboarding flow", () => {
  it("uses the JadenOS route with local-gateway first-run actions", () => {
    const steps = getJadenosOnboardingSteps(baseConfig);
    const visibleStepText = steps.map((step) => [
      step.title,
      step.zhTitle,
      step.command,
      step.prompt,
      step.zhPrompt,
    ].join(" ")).join("\n");

    expect(JADENOS_ONBOARDING_ROUTE).toBe("/jadenos/onboarding");
    expect(steps.map((step) => step.id)).toEqual([
      "start",
      "customers",
      "model",
      "email",
      "search",
      "token",
      "access",
      "storage",
      "upload",
      "synthesize",
      "finish",
    ]);
    expect(steps[0]).toMatchObject({ id: "start", command: "Open product" });
    expect(steps.find((step) => step.id === "token")).toMatchObject({
      command: "Save activation code",
      zhTitle: "保存会员激活码",
      group: "advanced",
    });
    expect(visibleStepText).toContain("Activation Code");
    expect(visibleStepText).toContain("会员激活码");
    expect(visibleStepText).not.toContain("访问口令");
    expect(visibleStepText).not.toMatch(/\$\s/);
    expect(visibleStepText).toContain("LAN");
    expect(visibleStepText).toContain("local folder");
    expect(visibleStepText).toContain("test file");
    expect(visibleStepText).toContain("synthesis");
    expect(visibleStepText).toContain("Quick start");
    expect(visibleStepText).toContain("Recommended");
    expect(visibleStepText).toContain("Advanced local");
  });

  it("tracks product-entry readiness separately from optional setup checks", () => {
    const ready = {
      ...baseConfig,
      llmProvider: "ollama",
      llmBaseUrl: "http://127.0.0.1:11434",
    };

    const readiness = getOnboardingReadiness(ready, {
      tokenPresent: true,
      storageKnown: true,
      testUploadCompleted: false,
      synthesisTestCompleted: false,
    });

    expect(readiness.items.find((item) => item.id === "upload")?.blocking).toBe(false);
    expect(readiness.items.find((item) => item.id === "synthesize")?.blocking).toBe(false);
    expect(readiness.allReady).toBe(true);
    expect(readiness.canEnterProduct).toBe(true);
  });

  it("allows first-run completion with mock fallback while keeping model readiness separate", () => {
    const withoutModel = {
      ...baseConfig,
    };

    const readiness = getOnboardingReadiness(withoutModel, {
      tokenPresent: true,
      storageKnown: true,
      testUploadCompleted: false,
      synthesisTestCompleted: false,
    });
    const steps = getJadenosOnboardingSteps(withoutModel, {
      tokenPresent: true,
      storageKnown: true,
      testUploadCompleted: false,
      synthesisTestCompleted: false,
    });

    expect(readiness.items.find((item) => item.id === "model")?.done).toBe(false);
    expect(readiness.allReady).toBe(true);
    expect(steps.find((step) => step.id === "model")).toMatchObject({
      status: "optional",
      group: "recommended",
    });
    expect(steps.find((step) => step.id === "upload")).toMatchObject({
      status: "optional",
      group: "advanced",
    });
    expect(steps.find((step) => step.id === "finish")).toMatchObject({
      status: "done",
    });
  });

  it("preserves masked secrets as configured values", () => {
    expect(isConfiguredSecret("deep****4321")).toBe(true);
    expect(isConfiguredSecret("")).toBe(false);
  });
});
