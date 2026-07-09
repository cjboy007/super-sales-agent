import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

function jsonRequest(method: "POST" | "PUT", body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/config", {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function getRequest(): NextRequest {
  return new NextRequest("http://localhost/api/config");
}

function readRuntimeEvents(): Array<{ type: string; payload: Record<string, unknown> }> {
  const eventsPath = path.join(tempRoot, "companies", "farreach", "events", "events.json");
  return JSON.parse(fs.readFileSync(eventsPath, "utf-8"));
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-config-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/config route", () => {
  it("opens settings without activation tokens", async () => {
    const route = await import("./route");

    const getResponse = await route.GET(getRequest());
    const postResponse = await route.POST(jsonRequest("POST", { defaultModel: "mock" }));
    const getJson = await getResponse.json();
    const postJson = await postResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getJson.success).toBe(true);
    expect(postResponse.status).toBe(200);
    expect(postJson.success).toBe(true);
    expect(postJson.data.defaultModel).toBe("mock");
  });

  it("routes settings through the Sales Runtime, masks secrets, and preserves masked values", async () => {
    const route = await import("./route");

    const firstSave = await route.POST(jsonRequest("POST", {
      deepseekApiKey: "deepseek-secret-4321",
      openrouterApiKey: "sk-openrouter-secret-1234",
      geminiApiKey: "gemini-secret-5678",
      tavilyApiKey: "tavily-secret-9012",
      hunterApiKey: "hunter-secret-1357",
      apolloApiKey: "apollo-secret-2468",
      crmProvider: "hubspot",
      crmApiKey: "hubspot-secret-3579",
      notificationProvider: "slack",
      notificationWebhookUrl: "https://hooks.slack.test/services/secret",
      defaultModel: "gpt-4o-mini",
      smtpHost: "smtp.example.com",
      smtpPort: "465",
      smtpEncryption: "ssl",
      imapHost: "imap.example.com",
      imapPort: "993",
      imapEncryption: "ssl",
      email: "sales@example.com",
      emailPassword: "mail-secret-3456",
      autoCapture: true,
      searchEngine: "tavily",
      searchRegion: "global",
      maxResults: 12,
      searchDepth: "standard",
      autoResearch: {
        leadResearch: true,
        priceMonitor: true,
        trendTracking: false,
        emailVerify: true,
      },
    }));
    const firstJson = await firstSave.json();

    expect(firstJson.success).toBe(true);
    expect(firstJson.data.deepseekApiKey).toBe("deep****4321");
    expect(firstJson.data.openrouterApiKey).toBe("sk-o****1234");
    expect(firstJson.data.hunterApiKey).toBe("hunt****1357");
    expect(firstJson.data.apolloApiKey).toBe("apol****2468");
    expect(firstJson.data.crmApiKey).toBe("hubs****3579");
    expect(firstJson.data.notificationWebhookUrl).toBe("http****cret");
    expect(firstJson.data.emailPassword).toBe("mail****3456");

    const loaded = await (await route.GET(getRequest())).json();
    expect(loaded.data.deepseekApiKey).toBe("deep****4321");
    expect(loaded.data.openrouterApiKey).toBe("sk-o****1234");

    await route.POST(jsonRequest("POST", {
      ...loaded.data,
      defaultModel: "mock",
    }));

    const { readSettings } = await import("@/lib/config-store");
    const settings = readSettings();
    expect(settings.deepseekApiKey).toBe("deepseek-secret-4321");
    expect(settings.openrouterApiKey).toBe("sk-openrouter-secret-1234");
    expect(settings.hunterApiKey).toBe("hunter-secret-1357");
    expect(settings.apolloApiKey).toBe("apollo-secret-2468");
    expect(settings.crmProvider).toBe("hubspot");
    expect(settings.crmApiKey).toBe("hubspot-secret-3579");
    expect(settings.notificationProvider).toBe("slack");
    expect(settings.notificationWebhookUrl).toBe("https://hooks.slack.test/services/secret");
    expect(settings.emailPassword).toBe("mail-secret-3456");
    expect(settings.defaultModel).toBe("mock");

    const events = readRuntimeEvents();
    expect(events[0].type).toBe("config.updated");
    expect(JSON.stringify(events)).not.toContain("deepseek-secret-4321");
    expect(JSON.stringify(events)).not.toContain("sk-openrouter-secret-1234");
    expect(JSON.stringify(events)).not.toContain("hunter-secret-1357");
    expect(JSON.stringify(events)).not.toContain("apollo-secret-2468");
    expect(JSON.stringify(events)).not.toContain("hubspot-secret-3579");
    expect(JSON.stringify(events)).not.toContain("hooks.slack.test");
    expect(JSON.stringify(events)).not.toContain("mail-secret-3456");
  });

  it("imports settings through the Sales Runtime and records an audit event", async () => {
    const route = await import("./route");

    const response = await route.PUT(jsonRequest("PUT", {
      deepseekApiKey: "deepseek-imported-secret-2222",
      openrouterApiKey: "sk-imported-secret-9999",
      hunterApiKey: "hunter-imported-secret-1111",
      defaultModel: "deepseek-v4-pro",
      email: "ops@example.com",
      smtpHost: "smtp.ops.example",
      imapHost: "imap.ops.example",
      autoResearch: {
        leadResearch: false,
      },
    }));
    const json = await response.json();

    expect(json).toEqual({ success: true, message: "配置已导入" });

    const { readSettings } = await import("@/lib/config-store");
    const settings = readSettings();
    expect(settings.deepseekApiKey).toBe("deepseek-imported-secret-2222");
    expect(settings.openrouterApiKey).toBe("sk-imported-secret-9999");
    expect(settings.hunterApiKey).toBe("hunter-imported-secret-1111");
    expect(settings.defaultModel).toBe("deepseek-v4-pro");
    expect(settings.autoResearch.leadResearch).toBe(false);
    expect(settings.autoResearch.emailVerify).toBe(true);

    const events = readRuntimeEvents();
    expect(events[0]).toMatchObject({
      type: "config.imported",
      workspaceId: "farreach",
      payload: {
        llmConfigured: true,
        mailboxConfigured: true,
        emailVerificationConfigured: true,
      },
    });
    expect(JSON.stringify(events)).not.toContain("deepseek-imported-secret-2222");
    expect(JSON.stringify(events)).not.toContain("sk-imported-secret-9999");
    expect(JSON.stringify(events)).not.toContain("hunter-imported-secret-1111");
  });
});
