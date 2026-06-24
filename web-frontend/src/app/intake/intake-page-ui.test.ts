import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/intake/page.tsx"), "utf8");

describe("intake page UI", () => {
  it("does not expose local data paths or internal command ids", () => {
    expect(source).not.toContain("~/.ssa/data");
    expect(source).not.toContain("SSA 数据区");
    expect(source).not.toContain("json.data?.id");
  });

  it("offers document synthesis from the active intake", () => {
    expect(source).toContain("生成归纳");
    expect(source).toContain("Synthesize");
    expect(source).toContain("/synthesize");
  });

  it("queues review through the shared Jaden intake envelope", () => {
    expect(source).toContain('/api/operator-command');
    expect(source).toContain('surface: "intake"');
    expect(source).toContain('mode: "file_intake"');
    expect(source).toContain('target:');
    expect(source).toContain('type: "file"');
  });

  it("shows task-thread visibility after intake review is queued", () => {
    expect(source).toContain("JadenTaskDrawer");
    expect(source).toContain("commandThreadId");
    expect(source).toContain("setTaskDrawerOpen");
    expect(source).toContain("json.data?.commandThreadId");
    expect(source).toContain("View task");
    expect(source).toContain("查看任务");
  });
});
