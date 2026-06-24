import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/components/quick-quote/QuickQuotePage.tsx"), "utf8");

describe("quick quote page UI", () => {
  it("keeps export and reference internals out of the external user page", () => {
    expect(pageSource).toContain("PI package is ready");
    expect(pageSource).toContain("Rate reference updated");
    expect(pageSource).not.toContain("packageDir");
    expect(pageSource).not.toContain("commitHash");
    expect(pageSource).not.toContain("reference.exchangeRate.provider");
  });

  it("sends quote edit chat with quick-quote Jaden context", () => {
    expect(pageSource).toContain("/api/documents/quick-quote/modify");
    expect(pageSource).toContain('surface: "quick-quote"');
    expect(pageSource).toContain('mode: "object_edit"');
    expect(pageSource).toContain("target:");
    expect(pageSource).toContain('type: "quote"');
  });

  it("shows task-thread visibility for quick quote Jaden edits", () => {
    expect(pageSource).toContain("JadenTaskDrawer");
    expect(pageSource).toContain("commandThreadId");
    expect(pageSource).toContain("setTaskDrawerOpen");
    expect(pageSource).toContain("json.commandThreadId");
    expect(pageSource).toContain("View task");
    expect(pageSource).toContain("查看任务");
  });
});
