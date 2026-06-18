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
});
