import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/app/agent-status/page.tsx"), "utf8");

describe("agent status page beta readiness UI", () => {
  it("renders a business-facing beta readiness checklist", () => {
    expect(pageSource).toContain("readiness?.checks");
    expect(pageSource).toContain("Beta Readiness");
    expect(pageSource).toContain("内测准备");
    expect(pageSource).toContain("check.action");
  });

  it("links operators to the user guide without exposing setup internals", () => {
    expect(pageSource).toContain("User guide");
    expect(pageSource).toContain("使用指南");
    expect(pageSource).toContain("/user-guide");
    expect(pageSource).toContain("Health page");
    expect(pageSource).toContain("健康页");
    expect(pageSource).not.toContain("SSA_DATA_ROOT");
    expect(pageSource).not.toContain("launchctl");
    expect(pageSource).not.toContain("systemctl");
    expect(pageSource).not.toContain("pm2 ");
  });

  it("offers one-click demo seeding as a real page action instead of exposing the seed API link", () => {
    expect(pageSource).toContain("seedDemo");
    expect(pageSource).toContain("/api/demo/seed");
    expect(pageSource).toContain("method: \"POST\"");
    expect(pageSource).toContain("Demo data is ready");
    expect(pageSource).toContain("item.id === \"seed-demo\"");
    expect(pageSource).toContain("onClick={() => void seedDemo()}");
    expect(pageSource).toContain("href={item.href}");
  });

  it("shows mailbox-to-CRM readiness as business status without hard-coded mailbox details", () => {
    expect(pageSource).toContain("Mail to CRM");
    expect(pageSource).toContain("邮件进入 CRM");
    expect(pageSource).toContain("mailbox?.summary");
    expect(pageSource).toContain("mailbox?.nextStep");
    expect(pageSource).toContain("requiredActions");
    expect(pageSource).toContain("/api/demo/email-crm");
    expect(pageSource).toContain("Run demo email");
    expect(pageSource).toContain("演练一封邮件");
    expect(pageSource).not.toContain("imap.example.com");
    expect(pageSource).not.toContain("sales@example.com");
    expect(pageSource).not.toContain("emailPassword");
  });

  it("shows whether external beta page access is protected", () => {
    expect(pageSource).toContain("pageAccessProtected");
    expect(pageSource).toContain("Access page protected");
    expect(pageSource).toContain("访问页已保护");
    expect(pageSource).toContain("访问页未保护");
  });

  it("does not show raw environment variables or internal runtime terms in readiness copy", () => {
    expect(pageSource).not.toContain("SSA_BETA_AUTH");
    expect(pageSource).not.toContain("SSA_ENABLE_REAL");
    expect(pageSource).not.toContain("jobId");
    expect(pageSource).not.toContain("workflow");
    expect(pageSource).not.toContain("provider");
    expect(pageSource).not.toContain("channel_audit");
  });

  it("uses the beta-aware API client for protected operations page requests", () => {
    expect(pageSource).toContain("useProject");
    expect(pageSource).toContain("apiFetch");
    expect(pageSource).toContain("apiFetch(\"/api/health\"");
    expect(pageSource).toContain("apiFetch(\"/api/runtime?action=failed-jobs&limit=10\"");
    expect(pageSource).toContain("apiFetch(\"/api/demo/seed\"");
    expect(pageSource).toContain("apiFetch(\"/api/demo/email-crm\"");
    expect(pageSource).not.toContain("fetch(\"/api/health");
    expect(pageSource).not.toContain("fetch(\"/api/runtime?action=failed-jobs");
    expect(pageSource).not.toContain("fetch(\"/api/demo/seed");
    expect(pageSource).not.toContain("fetch(\"/api/demo/email-crm");
  });

  it("offers a business-facing task recovery preparation action", () => {
    expect(pageSource).toContain("prepareWorkerRecovery");
    expect(pageSource).toContain("apiFetch(\"/api/worker-supervisor\"");
    expect(pageSource).toContain("method: \"POST\"");
    expect(pageSource).toContain("Task recovery setup is ready");
    expect(pageSource).toContain("Prepare recovery");
    expect(pageSource).toContain("准备恢复方案");
    expect(pageSource).toContain("任务恢复方案已准备好");
    expect(pageSource).not.toContain("workspaceId: \"farreach\"");
    expect(pageSource).not.toContain("workerId: \"jaden-farreach-1\"");
    expect(pageSource).not.toContain("jaden-worker-supervisor.mjs");
    expect(pageSource).not.toContain("launchctl");
    expect(pageSource).not.toContain("systemctl");
    expect(pageSource).not.toContain("pm2 ");
  });

  it("renders task recovery capabilities from health without raw command details", () => {
    expect(pageSource).toContain("workerRecovery");
    expect(pageSource).toContain("workerRecovery?.summary");
    expect(pageSource).toContain("workerRecovery?.nextStep");
    expect(pageSource).toContain("availableActions");
    expect(pageSource).toContain("Task Recovery");
    expect(pageSource).toContain("恢复能力");
    expect(pageSource).not.toContain("workerCommand");
    expect(pageSource).not.toContain("statusCommand");
    expect(pageSource).not.toContain("commands.");
  });

  it("lets operators request task controls without exposing host commands", () => {
    expect(pageSource).toContain("requestWorkerControl");
    expect(pageSource).toContain("action: \"request-control\"");
    expect(pageSource).toContain("control");
    expect(pageSource).toContain("Task control request is ready");
    expect(pageSource).toContain("Start tasks");
    expect(pageSource).toContain("Pause tasks");
    expect(pageSource).toContain("Restart tasks");
    expect(pageSource).toContain("Check task status");
    expect(pageSource).not.toContain("workspaceId: \"farreach\"");
    expect(pageSource).not.toContain("workerId: \"jaden-farreach-1\"");
    expect(pageSource).not.toContain("exec");
    expect(pageSource).not.toContain("child_process");
    expect(pageSource).not.toContain("spawn");
  });

  it("shows recent task control request status without backend identifiers", () => {
    expect(pageSource).toContain("recentRequests");
    expect(pageSource).toContain("Recent task requests");
    expect(pageSource).toContain("最近任务请求");
    expect(pageSource).toContain("request.actionLabel");
    expect(pageSource).toContain("request.requestedAt");
    expect(pageSource).toContain("No task control request has been recorded yet");
    expect(pageSource).toContain("尚未记录任务控制请求");
    expect(pageSource).not.toContain("request.requestId");
    expect(pageSource).not.toContain("request.workerId");
    expect(pageSource).not.toContain("request.workspaceId");
    expect(pageSource).not.toContain("request.control");
  });

  it("surfaces automation activity without exposing worker identifiers", () => {
    expect(pageSource).toContain("activity?:");
    expect(pageSource).toContain("Last Activity");
    expect(pageSource).toContain("最后活动");
    expect(pageSource).toContain("Recent Run");
    expect(pageSource).toContain("最近运行");
    expect(pageSource).toContain("worker?.activity?.lastActivitySummary");
    expect(pageSource).toContain("worker?.activity?.lastRunSummary");
    expect(pageSource).toContain("任务信号正常");
    expect(pageSource).toContain("No task signal");
    expect(pageSource).toContain("当前没有任务告警");
    expect(pageSource).not.toContain("latest: {\\n      workerId");
    expect(pageSource).not.toContain("value={worker?.latest?.workerId");
  });

  it("shows a business-facing customer action review queue with review controls", () => {
    expect(pageSource).toContain("Customer Action Review");
    expect(pageSource).toContain("客户动作复核");
    expect(pageSource).toContain("actionReviews");
    expect(pageSource).toContain("apiFetch(\"/api/runtime?action=side-effects&limit=10\"");
    expect(pageSource).toContain("reviewExternalAction");
    expect(pageSource).toContain("approve-side-effect");
    expect(pageSource).toContain("reject-side-effect");
    expect(pageSource).toContain("retry-side-effect");
    expect(pageSource).toContain("Confirm");
    expect(pageSource).toContain("确认");
    expect(pageSource).toContain("Reject");
    expect(pageSource).toContain("Retry");
    expect(pageSource).toContain("当前没有待复核的客户动作");
    expect(pageSource).not.toContain("Approve");
    expect(pageSource).not.toContain("批准");
    expect(pageSource).not.toContain("review.actionId}</");
    expect(pageSource).not.toContain("review.workspaceId");
    expect(pageSource).not.toContain("review.payload");
    expect(pageSource).not.toContain("review.kind");
  });
});
