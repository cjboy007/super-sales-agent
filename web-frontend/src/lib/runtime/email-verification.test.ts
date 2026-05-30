import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-email-verification-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  vi.unstubAllGlobals();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("email verification runtime", () => {
  it("fails closed when Hunter is not configured", async () => {
    const { verifyEmailAddress } = await import("./email-verification");

    const result = await verifyEmailAddress({
      workspaceId: "demo-exporter",
      email: "buyer@example.com",
    });

    expect(result).toMatchObject({
      email: "buyer@example.com",
      provider: "hunter",
      status: "unknown",
      score: 0,
      reason: "Hunter API key is not configured.",
    });
    expect(result.checkedAt).toEqual(expect.any(String));
  });

  it("calls Hunter, normalizes a valid result, and caches it per workspace", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: {
        email: "buyer@example.com",
        status: "valid",
        score: 97,
        result: "deliverable",
        regexp: true,
        gibberish: false,
        mx_records: true,
        smtp_server: true,
        smtp_check: true,
        accept_all: false,
        disposable: false,
        webmail: false,
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { writeSettings } = await import("../config-store");
    writeSettings({
      deepseekApiKey: "",
      openaiApiKey: "",
      openrouterApiKey: "",
      geminiApiKey: "",
      tavilyApiKey: "",
      hunterApiKey: "hunter-secret",
      apolloApiKey: "",
      crmProvider: "none",
      crmApiKey: "",
      notificationProvider: "none",
      notificationWebhookUrl: "",
      defaultModel: "mock",
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
    });

    const { verifyEmailAddress } = await import("./email-verification");
    const first = await verifyEmailAddress({ workspaceId: "demo-exporter", email: "BUYER@example.com" });
    const second = await verifyEmailAddress({ workspaceId: "demo-exporter", email: "buyer@example.com" });

    expect(first).toMatchObject({
      email: "buyer@example.com",
      provider: "hunter",
      status: "valid",
      score: 97,
      raw: {
        result: "deliverable",
        smtpCheck: true,
        mxRecords: true,
      },
    });
    expect(second).toMatchObject({ email: "buyer@example.com", status: "valid", score: 97 });
    expect(fetchMock).toHaveBeenCalledOnce();

    const cachePath = path.join(tempRoot, "companies", "demo-exporter", "verification", "email-verifications.json");
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    expect(cached["buyer@example.com"]).toMatchObject({
      provider: "hunter",
      status: "valid",
      score: 97,
    });
  });

  it("normalizes risky and invalid Hunter responses", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: {
        email: "catchall@example.com",
        status: "accept_all",
        score: 56,
        result: "risky",
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { writeSettings } = await import("../config-store");
    writeSettings({
      deepseekApiKey: "",
      openaiApiKey: "",
      openrouterApiKey: "",
      geminiApiKey: "",
      tavilyApiKey: "",
      hunterApiKey: "hunter-secret",
      apolloApiKey: "",
      crmProvider: "none",
      crmApiKey: "",
      notificationProvider: "none",
      notificationWebhookUrl: "",
      defaultModel: "mock",
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
    });

    const { verifyEmailAddress } = await import("./email-verification");
    await expect(verifyEmailAddress({ workspaceId: "demo-exporter", email: "catchall@example.com", forceRefresh: true }))
      .resolves.toMatchObject({ status: "risky", score: 56 });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      data: {
        email: "bad@example.com",
        status: "invalid",
        score: 4,
        result: "undeliverable",
      },
    }), { status: 200 }));

    await expect(verifyEmailAddress({ workspaceId: "demo-exporter", email: "bad@example.com", forceRefresh: true }))
      .resolves.toMatchObject({ status: "invalid", score: 4 });
  });

  it("stores an unknown result when Hunter fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      errors: [{ details: "rate limited" }],
    }), { status: 429 })));

    const { writeSettings } = await import("../config-store");
    writeSettings({
      deepseekApiKey: "",
      openaiApiKey: "",
      openrouterApiKey: "",
      geminiApiKey: "",
      tavilyApiKey: "",
      hunterApiKey: "hunter-secret",
      apolloApiKey: "",
      crmProvider: "none",
      crmApiKey: "",
      notificationProvider: "none",
      notificationWebhookUrl: "",
      defaultModel: "mock",
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
    });

    const { verifyEmailAddress } = await import("./email-verification");
    const result = await verifyEmailAddress({ workspaceId: "demo-exporter", email: "buyer@example.com" });

    expect(result).toMatchObject({
      provider: "hunter",
      status: "unknown",
      score: 0,
      reason: "Hunter verification failed with HTTP 429.",
    });
  });
});
