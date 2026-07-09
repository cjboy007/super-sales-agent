import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/app/health/page.tsx"), "utf8");
const agentStatusSource = readFileSync(join(process.cwd(), "src/app/agent-status/page.tsx"), "utf8");

describe("health check page UI", () => {
  it("renders a business-facing health check page from the safe health API", () => {
    expect(pageSource).toContain("Health Check");
    expect(pageSource).toContain("健康检查");
    expect(pageSource).toContain("fetch(\"/api/health\"");
    expect(pageSource).toContain("!json.beta?.readiness");
    expect(pageSource).toContain("scopedResponse = await apiFetch");
    expect(pageSource).toContain("Readiness");
    expect(pageSource).toContain("Automation status");
    expect(pageSource).toContain("Mailbox sync");
    expect(pageSource).toContain("Task recovery");
    expect(pageSource).toContain("Confirmation controls");
    expect(pageSource).toContain("Model readiness");
    expect(pageSource).toContain("模型状态");
    expect(pageSource).toContain("自动任务状态");
    expect(pageSource).toContain("恢复能力");
    expect(pageSource).toContain("确认控制");
    expect(pageSource).not.toContain("Worker heartbeat");
    expect(pageSource).not.toContain("Worker recovery");
    expect(pageSource).not.toContain("Real actions gated");
    expect(pageSource).not.toContain("后台 worker");
    expect(pageSource).not.toContain("Worker 心跳");
  });

  it("shows clear next steps without backend route, command, or environment details", () => {
    expect(pageSource).toContain("readiness?.checks");
    expect(pageSource).toContain("check.action");
    expect(pageSource).toContain("mailbox?.nextStep");
    expect(pageSource).toContain("workerRecovery?.nextStep");
    expect(pageSource).toContain("realActions?.nextStep");
    expect(pageSource).not.toContain("jobId");
    expect(pageSource).not.toContain("workflow");
    expect(pageSource).not.toContain("provider");
    expect(pageSource).not.toContain("channel_audit");
    expect(pageSource).not.toContain("SSA_DATA_ROOT");
    expect(pageSource).not.toContain("SSA_ENABLE_REAL");
    expect(pageSource).not.toContain("launchctl");
    expect(pageSource).not.toContain("systemctl");
    expect(pageSource).not.toContain("pm2 ");
    expect(pageSource).not.toContain("jaden-worker.mjs");
  });

  it("renders the first-run path from readiness so external users can start without developer explanation", () => {
    expect(pageSource).toContain("firstRunGuide");
    expect(pageSource).toContain("First-run path");
    expect(pageSource).toContain("首次体验路径");
    expect(pageSource).toContain("readiness?.firstRunGuide");
    expect(pageSource).toContain("item.href");
    expect(pageSource).toContain("item.label");
    expect(pageSource).toContain("item.detail");
  });

  it("links health checks to the readiness guide without exposing runtime commands", () => {
    expect(pageSource).toContain("Readiness guide");
    expect(pageSource).toContain("就绪指南");
    expect(pageSource).toContain("/docs/DEPLOYMENT_READINESS.md");
  });

  it("links health checks to the user guide without exposing implementation details", () => {
    expect(pageSource).toContain("User guide");
    expect(pageSource).toContain("使用指南");
    expect(pageSource).toContain("/user-guide");
    expect(existsSync(join(process.cwd(), "src/app/user-guide/page.tsx"))).toBe(true);
  });

  it("shows customer action confirmation status as business metrics", () => {
    expect(pageSource).toContain("realActions");
    expect(pageSource).toContain("realActions?.summary");
    expect(pageSource).toContain("realActions?.counts.pendingReview");
    expect(pageSource).toContain("realActions?.counts.executed");
    expect(pageSource).toContain("realActions?.counts.retryable");
    expect(pageSource).toContain("Customer action confirmation");
    expect(pageSource).toContain("客户动作确认");
  });

  it("distinguishes local model, cloud model, and demo mode on the health page", () => {
    expect(pageSource).toContain("modelReadinessLabel");
    expect(pageSource).toContain("local_model_ready");
    expect(pageSource).toContain("cloud_model_ready");
    expect(pageSource).toContain("mock_fallback");
    expect(pageSource).toContain("mockFallbackActive");
    expect(pageSource).toContain("Demo mode");
    expect(pageSource).toContain("演示模式");
    expect(pageSource).not.toContain("Mock fallback");
    expect(pageSource).not.toContain("mock fallback");
  });

  it("is linked from Operations as the dedicated health page", () => {
    expect(agentStatusSource).toContain("href=\"/health\"");
    expect(agentStatusSource).toContain("Health page");
    expect(agentStatusSource).toContain("健康页");
  });
});
