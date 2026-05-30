import { describe, expect, it } from "vitest";
import {
  JADENOS_ONBOARDING_ROUTE,
  getJadenosOnboardingSteps,
  getOnboardingReadiness,
  isConfiguredSecret,
} from "./onboarding-flow";

const baseConfig = {
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
  defaultModel: "deepseek-v4-pro",
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
  it("uses the JadenOS route and terminal command", () => {
    const steps = getJadenosOnboardingSteps(baseConfig);

    expect(JADENOS_ONBOARDING_ROUTE).toBe("/jadenos/onboarding");
    expect(steps[0]).toMatchObject({
      id: "identity",
      command: "$ jadenos onboarding",
      title: "Name the workspace",
    });
  });

  it("tracks core readiness without counting optional connectors", () => {
    const ready = {
      ...baseConfig,
      deepseekApiKey: "deepseek-secret",
      email: "sales@example.com",
      emailPassword: "mail-secret",
      imapHost: "imap.example.com",
      smtpHost: "smtp.example.com",
      hunterApiKey: "hunter-secret",
      tavilyApiKey: "tavily-secret",
    };

    const readiness = getOnboardingReadiness(ready);

    expect(readiness.completed).toBe(4);
    expect(readiness.total).toBe(4);
    expect(readiness.allReady).toBe(true);
  });

  it("preserves masked secrets as configured values", () => {
    expect(isConfiguredSecret("deep****4321")).toBe(true);
    expect(isConfiguredSecret("")).toBe(false);
  });
});
