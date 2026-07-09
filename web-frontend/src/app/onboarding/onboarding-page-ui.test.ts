import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/app/onboarding/JadenosOnboarding.tsx"), "utf8");
const userGuidePath = join(process.cwd(), "src/app/user-guide/page.tsx");

describe("JadenOS onboarding page UI", () => {
  it("presents setup as a non-blocking checklist with quick start and advanced local checks", () => {
    expect(pageSource).toContain("/api/local-gateway");
    expect(pageSource).toContain("/api/local-storage");
    expect(pageSource).toContain("/api/llm/test");
    expect(pageSource).toContain("/api/intake");
    expect(pageSource).toContain("synthesize");
    expect(pageSource).toContain("Quick start");
    expect(pageSource).toContain("Recommended");
    expect(pageSource).toContain("Advanced local");
    expect(pageSource).toContain("Open Follow-up");
    expect(pageSource).toContain("Demo data");
    expect(pageSource).toContain("item.blocking ? \"missing\" : \"optional\"");
    expect(pageSource).not.toContain("Activation Code");
    expect(pageSource).not.toContain("会员激活码");
    expect(pageSource).not.toContain("Save Code");
    expect(pageSource).not.toContain("Access Pass");
    expect(pageSource).not.toContain("访问口令");
    expect(pageSource).toContain("Local only");
    expect(pageSource).toContain("局域网");
    expect(pageSource).toContain("Data directory");
    expect(pageSource).toContain("数据目录");
    expect(pageSource).toContain("Use sample file");
    expect(pageSource).toContain("使用示例文件");
    expect(pageSource).not.toContain("jobId");
    expect(pageSource).not.toContain("workflow");
    expect(pageSource).not.toContain("channel_audit");
  });

  it("keeps the setup guide business-facing instead of terminal-oriented", () => {
    expect(pageSource).not.toContain("OPENCLAW");
    expect(pageSource).not.toContain("OpenClaw");
    expect(pageSource).not.toContain("TERMINAL SETUP");
    expect(pageSource).not.toContain("Setup Terminal");
    expect(pageSource).not.toContain("终端式设置");
    expect(pageSource).not.toContain("$ ");
    expect(pageSource).not.toContain("jadenos status");
    expect(pageSource).not.toContain("upload docs --");
  });

  it("links to the readiness guide so external users can find setup and deployment docs", () => {
    expect(pageSource).toContain("Readiness guide");
    expect(pageSource).toContain("就绪指南");
    expect(pageSource).toContain("/docs/DEPLOYMENT_READINESS.md");
    expect(existsSync(join(process.cwd(), "public/docs/DEPLOYMENT_READINESS.md"))).toBe(true);
  });

  it("links to a business-facing user guide for first-time users", () => {
    expect(pageSource).toContain("User guide");
    expect(pageSource).toContain("使用指南");
    expect(pageSource).toContain("/user-guide");
    expect(existsSync(userGuidePath)).toBe(true);

    const guide = readFileSync(userGuidePath, "utf8");
    for (const required of [
      "Start",
      "Connect mailbox",
      "Import customers",
      "Customer follow-up",
      "Orders",
      "Timeline",
      "Demo data",
      "Review",
    ]) {
      expect(guide).toContain(required);
    }

    for (const forbidden of [
      "jobId",
      "provider",
      "channel_audit",
      "SSA_DATA_ROOT",
      "SSA_ENABLE_REAL",
      "launchctl",
      "systemctl",
      "pm2",
      "/Users/",
      ".ssa",
    ]) {
      expect(guide).not.toContain(forbidden);
    }
  });

  it("marks onboarding complete through the local gateway state file API", () => {
    expect(pageSource).toContain("markOnboardingComplete");
    expect(pageSource).toContain("testUploadCompleted");
    expect(pageSource).toContain("synthesisTestCompleted");
    expect(pageSource).toContain("prev || Boolean");
    expect(pageSource).toContain("router.push(\"/leads\")");
  });
});
