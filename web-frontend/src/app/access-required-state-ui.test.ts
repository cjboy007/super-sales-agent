import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const battlePageSource = readFileSync(join(process.cwd(), "src/components/ui/BattlePage.tsx"), "utf8");
const inboxSource = readFileSync(join(process.cwd(), "src/app/inbox/page.tsx"), "utf8");
const quotationsSource = readFileSync(join(process.cwd(), "src/app/quotations/page.tsx"), "utf8");

describe("shared access-required product state", () => {
  it("provides a reusable business-facing access prompt for protected work pages", () => {
    expect(battlePageSource).toContain("AccessRequiredState");
    expect(battlePageSource).toContain("LoadFailedState");
    expect(battlePageSource).toContain("Beta Access Required");
    expect(battlePageSource).toContain("Open Beta Access");
    expect(battlePageSource).toContain("User guide");
    expect(battlePageSource).toContain("使用指南");
    expect(battlePageSource).toContain("/user-guide");
    expect(battlePageSource).toContain("data is hidden for safety");
    expect(battlePageSource).not.toContain("Beta access token is required");
    expect(battlePageSource).not.toContain("Workspace access is not allowed");
    expect(battlePageSource).not.toContain("jobId");
    expect(battlePageSource).not.toContain("provider");
    expect(battlePageSource).not.toContain("channel_audit");
    expect(battlePageSource).not.toContain("backend");
    expect(battlePageSource).not.toContain("worker details");
  });

  it("uses the access prompt and locked metrics on Inbox and Quotations", () => {
    for (const source of [inboxSource, quotationsSource]) {
      expect(source).toContain("AccessRequiredState");
      expect(source).toContain("LoadFailedState");
      expect(source).toContain("status === 401");
      expect(source).toContain("status === 403");
      expect(source).toContain("accessIssue !== \"none\"");
      expect(source).toContain("metricValue");
      expect(source).not.toContain("<EmptyState label={error} />");
    }
  });
});
