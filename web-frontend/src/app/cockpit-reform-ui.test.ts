import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "@/components/ui/app-nav";

const pageSource = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const battleStationDataSource = readFileSync(join(process.cwd(), "src/lib/battle-station-data.ts"), "utf8");
const focusResolverSource = readFileSync(join(process.cwd(), "src/lib/battle-station-focus.ts"), "utf8");
const quickCommandSource = readFileSync(join(process.cwd(), "src/components/battle-station/QuickCommandBar.tsx"), "utf8");
const threadDrawerSource = readFileSync(join(process.cwd(), "src/components/battle-station/JadenTaskDrawer.tsx"), "utf8");

describe("cockpit reform UI", () => {
  it("turns the homepage into a layered business workbench", () => {
    expect(pageSource).toContain("工作台概览");
    expect(pageSource).toContain("待确认事项");
    expect(pageSource).toContain("自动任务进度");
    expect(pageSource).toContain("重点客户");
    expect(pageSource).toContain("近期动态");
    expect(pageSource).toContain("继续处理");
    expect(pageSource).not.toContain("data-cockpit-panel-tab");
  });

  it("keeps the deep review workspace business-facing instead of audit-console flavored", () => {
    expect(battleStationDataSource).toContain('focusPrefix: "Continue:"');
    expect(battleStationDataSource).toContain('approvalGate: "Confirmation Needed"');
    expect(battleStationDataSource).toContain('approveSend: "Confirm & Send"');
    expect(battleStationDataSource).toContain('aiAnalysis: "Deal Review"');
    expect(battleStationDataSource).toContain('draftEditor: "Customer Draft"');
    expect(focusResolverSource).toContain('subjectPrefix: "Needs confirmation"');
    expect(focusResolverSource).toContain('guardrail: "Send boundary"');
    expect(focusResolverSource).not.toContain("JadenOS Workbench");
    expect(focusResolverSource).not.toContain("Guardrail");
    expect(battleStationDataSource).not.toContain("operator reviews the final draft");
    expect(battleStationDataSource).not.toContain("confirmed by operator");
  });

  it("uses full business labels for the Ask Jaden quick links", () => {
    expect(battleStationDataSource).toContain('label: "Pending Review", zhLabel: "待确认"');
    expect(battleStationDataSource).toContain('label: "Customers", zhLabel: "客户"');
    expect(battleStationDataSource).toContain('label: "Email Drafts", zhLabel: "邮件草稿"');
    expect(battleStationDataSource).toContain('label: "Quote Center", zhLabel: "报价中心"');
    expect(battleStationDataSource).not.toContain('label: "Customer Records", zhLabel: "客户档案"');
    expect(battleStationDataSource).not.toContain('label: "Review", href: "/reviews"');
    expect(battleStationDataSource).not.toContain('label: "Drafts", href: "/emails"');
  });

  it("routes the bottom Jaden input through conversational assistant replies first", () => {
    expect(pageSource).toContain('const submitChat = useCallback');
    expect(pageSource).toContain('/api/assistant/query');
    expect(pageSource).toContain('question: trimmed');
    expect(pageSource).toContain('setChatMessages');
    expect(pageSource).toContain('role: "assistant"');
    expect(pageSource).toContain('onSubmit={submitChat}');
    expect(pageSource).not.toContain('onSubmit={submitCommand}');
    expect(pageSource).not.toMatch(/const submitCommand = useCallback[\s\S]*?\/api\/operator-command/);
    expect(quickCommandSource).toContain("messages.map");
    expect(quickCommandSource).toContain('message.role === "assistant"');
    expect(quickCommandSource).toContain('aria-live="polite"');
  });

  it("keeps mission setup as an explicit chat action instead of the default send path", () => {
    expect(pageSource).toContain('const createTaskFromChat = useCallback');
    expect(pageSource).toContain('/api/operator-command');
    expect(pageSource).toContain('surface: "battle-station"');
    expect(pageSource).toContain('mode: "global_command"');
    expect(pageSource).toContain('target:');
    expect(pageSource).toContain('queuedTasks');
    expect(pageSource).toContain('commandThreadId');
    expect(pageSource).toContain('<JadenTaskDrawer');
    expect(pageSource).toContain('onCreateTask={createTaskFromChat}');
    expect(quickCommandSource).toContain("onCreateTask");
    expect(quickCommandSource).toContain("taskAvailable");
  });

  it("shows Jaden task-thread visibility without a full Codex-style chat page", () => {
    expect(quickCommandSource).toContain("onOpenTasks");
    expect(quickCommandSource).toContain("tasksAvailable");
    expect(quickCommandSource).toContain("View tasks");
    expect(threadDrawerSource).toContain('/api/operator-command/threads');
    expect(threadDrawerSource).toContain("planned");
    expect(threadDrawerSource).toContain("queued");
    expect(threadDrawerSource).toContain("running");
    expect(threadDrawerSource).toContain("needs review");
    expect(threadDrawerSource).toContain("done");
    expect(threadDrawerSource).toContain("error");
    expect(threadDrawerSource).not.toContain("Codex");
  });

  it("uses professional SaaS labels for primary navigation", () => {
    expect(APP_NAV_ITEMS.find((item) => item.href === "/")).toMatchObject({
      label: "Workbench",
      zhLabel: "工作台",
    });
    expect(APP_NAV_ITEMS.find((item) => item.href === "/reviews")).toMatchObject({
      label: "Pending Review",
      zhLabel: "待确认",
    });
    expect(APP_NAV_ITEMS.find((item) => item.href === "/agent-status")).toMatchObject({
      label: "Task Progress",
      zhLabel: "任务进度",
    });
    expect(APP_NAV_ITEMS.find((item) => item.href === "/leads")).toMatchObject({
      label: "Customers",
      zhLabel: "客户",
    });
    expect(APP_NAV_ITEMS.map((item) => item.href)).not.toContain("/customers");
  });

  it("keeps user-facing Chinese copy away from geeky or overly internal terms", () => {
    const visibleChineseCopy = `${battleStationDataSource}\n${focusResolverSource}`;
    for (const phrase of [
      "聚焦:",
      "审批关卡",
      "审批闸口",
      "审批闸门",
      "Jaden 后台",
      "后台进度",
      "待我处理",
      "Agent:",
      "驾驶舱",
      "JadenOS 可以",
    ]) {
      expect(visibleChineseCopy).not.toContain(phrase);
    }
  });
});
