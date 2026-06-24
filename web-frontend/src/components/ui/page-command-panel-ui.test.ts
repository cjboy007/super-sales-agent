import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/components/ui/PageCommandPanel.tsx"), "utf8");

describe("PageCommandPanel UI", () => {
  it("shows a business-facing receipt instead of internal command ids", () => {
    expect(source).not.toContain("json.data?.id");
    expect(source).not.toContain("cmd-");
    expect(source).toContain("queuedTasks");
    expect(source).toMatch(/saved for review/i);
  });

  it("sends explicit Jaden surface, mode, and target through the shared pipeline", () => {
    expect(source).toContain("surface?:");
    expect(source).toContain("mode?:");
    expect(source).toContain("target?:");
    expect(source).toContain("surface: surface");
    expect(source).toContain("mode: mode");
    expect(source).toContain("target: target");
  });

  it("lets page-level Jaden inputs open the shared task-thread drawer", () => {
    expect(source).toContain("JadenTaskDrawer");
    expect(source).toContain("commandThreadId");
    expect(source).toContain("setTaskDrawerOpen");
    expect(source).toContain("json.data?.commandThreadId");
    expect(source).toContain("View task");
    expect(source).toContain("查看任务");
  });
});
